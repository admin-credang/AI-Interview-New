"""Build the compact, two-page candidate interview evaluation PDF."""

from collections import Counter
from datetime import datetime
from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    KeepInFrame,
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from sqlalchemy.orm import Session

from app.models.answer import Answer
from app.models.feedback import Feedback
from app.models.interview import Interview
from app.models.interview_configuration import InterviewConfiguration
from app.models.question import Question
from app.models.score import Score
from app.models.session import InterviewSession
from app.models.session_review import SessionReview
from app.models.user import User
from app.services.gaze_analysis_service import build_gaze_report
from app.services.report_service import generate_interview_report


# =========================================================
# CONSTANTS
# =========================================================

SKILL_LABELS = {
    "relevance": "Relevance",
    "accuracy": "Accuracy",
    "technical_knowledge": "Technical knowledge",
    "completeness": "Completeness",
    "communication": "Communication",
}

EVENT_LABELS = {
    "camera_denied": "Camera access denied",
    "camera_unavailable": "Camera unavailable",
    "monitoring_started": "Monitoring started",
    "face_not_found": "Face not visible",
    "multiple_faces": "Multiple faces detected",
    "looking_away": "Looking away from the screen",
    "looking_down": "Looking down (eyeball movement)",
    "phone_detected": "Mobile phone visible on camera",
    "repeated_looking_down": "Repeatedly looking down (possible phone or notes)",
    "no_face_detected": "No face in front of the camera",
    "multiple_faces_detected": "More than one person in view",
    "candidate_left_interview_page": "Left the interview page",
    "eyes_closed": "Eyes closed for a long time",
    "tab_left": "Left the interview tab",
}

# events that are information, not a flag
INFO_EVENTS = {"monitoring_started"}


def _num(value):
    return float(value) if value is not None else None


def _avg(values):
    values = [v for v in values if v is not None]
    return round(sum(values) / len(values), 2) if values else None


def _dt(value):
    return value.strftime("%d %b %Y, %H:%M") if value else "-"


def _duration(session):
    if session.started_at and session.ended_at:
        total = int((session.ended_at - session.started_at).total_seconds())
        return f"{total // 60} min {total % 60} sec"
    return "-"


def _display_datetime(value, date_only=False):
    if not value:
        return "Unavailable"
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (AttributeError, TypeError, ValueError):
        return "Unavailable"
    pattern = "%d %b %Y" if date_only else "%d %b %Y, %H:%M UTC"
    if not date_only and parsed.tzinfo is None:
        return parsed.strftime("%d %b %Y, %H:%M")
    return parsed.strftime(pattern)


def _score_text(value, suffix=""):
    try:
        return f"{float(value):.2f}{suffix}"
    except (TypeError, ValueError):
        return "Unavailable"


def _rating_text(score):
    if score is None:
        return "Unavailable"
    if score <= 20:
        return "Very poor"
    if score <= 40:
        return "Poor"
    if score <= 60:
        return "Average"
    if score <= 80:
        return "Good"
    if score <= 90:
        return "Very good"
    return "Excellent"


# =========================================================
# COLLECT DATA  (own queries; no import from api/hiring.py)
# =========================================================

def collect_report_data(db: Session, session_id) -> dict:
    session = (
        db.query(InterviewSession)
        .filter(InterviewSession.id == session_id)
        .first()
    )
    if session is None:
        raise ValueError("Interview session not found")

    report = generate_interview_report(db, session_id)
    interview = (
        db.query(Interview)
        .filter(Interview.id == session.interview_id)
        .first()
    )
    candidate = (
        db.query(User)
        .filter(User.id == session.candidate_id)
        .first()
    )
    configuration = (
        db.query(InterviewConfiguration)
        .filter(InterviewConfiguration.interview_id == session.interview_id)
        .first()
    )
    review = (
        db.query(SessionReview)
        .filter(SessionReview.session_id == session_id)
        .first()
    )
    reviewer = (
        db.query(User)
        .filter(User.id == review.decided_by)
        .first()
        if review and review.decided_by
        else None
    )

    questions = (
        db.query(Question)
        .filter(Question.session_id == session_id)
        .all()
    )
    answers = (
        db.query(Answer)
        .filter(Answer.session_id == session_id)
        .order_by(Answer.answered_at.asc(), Answer.id.asc())
        .all()
    )
    answer_by_question = {}
    for answer in answers:
        answer_by_question[answer.question_id] = answer

    answer_ids = [answer.id for answer in answer_by_question.values()]
    scores = (
        db.query(Score)
        .filter(Score.answer_id.in_(answer_ids))
        .all()
        if answer_ids
        else []
    )
    feedbacks = (
        db.query(Feedback)
        .filter(Feedback.answer_id.in_(answer_ids))
        .all()
        if answer_ids
        else []
    )
    score_by_answer = {score.answer_id: score for score in scores}
    feedback_by_answer = {item.answer_id: item for item in feedbacks}

    mains = sorted(
        (question for question in questions if question.parent_question_id is None),
        key=lambda question: question.question_order,
    )
    children = {}
    for question in questions:
        if question.parent_question_id is not None:
            children.setdefault(question.parent_question_id, []).append(question)

    ordered_questions = []
    for main in mains:
        ordered_questions.append(main)
        ordered_questions.extend(
            sorted(
                children.get(main.id, []),
                key=lambda question: question.created_at,
            )
        )

    criteria = (
        "relevance",
        "accuracy",
        "technical_knowledge",
        "completeness",
        "communication",
    )
    skill_values = {criterion: [] for criterion in criteria}
    qa = []
    for question in ordered_questions:
        answer = answer_by_question.get(question.id)
        score = score_by_answer.get(answer.id) if answer else None
        feedback = feedback_by_answer.get(answer.id) if answer else None
        score_data = (
            {
                **{
                    criterion: _num(getattr(score, criterion))
                    for criterion in criteria
                },
                "overall_score": _num(score.overall_score),
            }
            if score
            else {}
        )
        if score:
            for criterion in criteria:
                value = score_data[criterion]
                if value is not None:
                    skill_values[criterion].append(value)

        qa.append(
            {
                "question_id": str(question.id),
                "order": question.question_order,
                "is_follow_up": question.parent_question_id is not None,
                "question": question.question,
                "answer": answer.answer_text if answer else None,
                "scores": score_data,
                "overall": score_data.get("overall_score"),
                "feedback": feedback.feedback_text if feedback else None,
                "explanation": feedback.feedback_text if feedback else None,
                "evidence": [],
                "risk_observations": [],
            }
        )

    skills = {
        criterion: _avg(values)
        for criterion, values in skill_values.items()
    }
    competencies = [
        {
            "criterion": criterion,
            "name": SKILL_LABELS[criterion],
            "score": score,
            "weight": None,
            "rating": _rating_text(score),
            "weighted_contribution": None,
        }
        for criterion, score in skills.items()
        if score is not None
    ]
    events = review.proctoring_events or [] if review else []
    job = (
        (configuration.extra_config or {}).get("job") or {}
        if configuration
        else {}
    )
    candidate_name = candidate.name if candidate else None
    candidate_email = candidate.email if candidate else None
    started_at = session.started_at.isoformat() if session.started_at else None
    decision = review.decision if review else "pending"
    canonical = {
        "score": {
            "overall": _num(report.overall_score),
            "formula": (
                "The stored report score uses the existing report workflow "
                "and its latest scored answer per main question."
            ),
            "competencies": competencies,
        },
        "recommendation": {},
        "strengths": [],
        "concerns": [],
        "communication": {
            "note": "Communication is represented by the saved answer scores."
        },
        "monitoring": {
            "events": events,
            "event_note": "Monitoring events are observations, not proof of misconduct.",
            "termination_reason": review.termination_reason if review else None,
        },
        "human_review": {
            "status": "reviewed" if review and review.decided_at else "pending",
            "decision": decision,
            "reviewer": reviewer.name if reviewer else None,
            "decided_at": review.decided_at.isoformat()
            if review and review.decided_at
            else None,
            "note": review.decision_note if review else None,
            "ai_decision_disagreement": None,
        },
        "disclaimer": (
            "Saved evaluation scores and feedback are shown as recorded. "
            "Monitoring indicators are observational and require human review."
        ),
    }

    return {
        "candidate_name": candidate_name or "Unavailable",
        "candidate_email": candidate_email or "Unavailable",
        "interview_title": interview.title if interview else "Interview",
        "role": job.get("role") or "Unavailable",
        "company": job.get("company") or "Unavailable",
        "location": job.get("location") or "Unavailable",
        "status": session.status or "unknown",
        "started_at": started_at or "-",
        "interview_date": _display_datetime(started_at, date_only=True),
        "duration": _duration(session),
        "overall_score": _num(report.overall_score),
        "summary": report.summary,
        "skills": skills,
        "competencies": competencies,
        "qa": qa,
        "events": events,
        "gaze": build_gaze_report(review.gaze_metrics) if review else None,
        "terminated_reason": review.termination_reason if review else None,
        "decision": decision,
        "canonical": canonical,
    }


# =========================================================
# ANALYSIS  (bullet points)
# =========================================================

def analyse(data: dict) -> dict:
    canonical = data.get("canonical") or {}
    strengths = [
        (
            f"{item['competency']} ({item['score']:.0f}/100): "
            + "; ".join(
                f'“{entry["quote"]}” — {entry["explanation"]}'
                for entry in item.get("evidence", [])
            )
        )
        for item in canonical.get("strengths", [])
    ]
    improve = [
        (
            f"{item['competency']} ({item['score']:.0f}/100): "
            + "; ".join(
                f'“{entry["quote"]}” — {entry["explanation"]}'
                for entry in item.get("evidence", [])
            )
        )
        for item in canonical.get("concerns", [])
    ]
    improvement_actions = []
    tips = {
        "relevance": "Answer the question's central point first, then keep supporting details directly relevant.",
        "accuracy": "Verify the claim in the quoted answer and explain the facts or conditions that support it.",
        "technical_knowledge": "Expand the quoted technical point with a correct implementation step and its trade-off.",
        "completeness": "Use the quoted point as a starting point and cover the missing steps or edge cases identified in the answer feedback.",
        "communication": "Organize the explanation in a clear sequence and define the key terms used in the response.",
    }
    recommended_criteria = set()
    for concern in canonical.get("concerns", []):
        for evidence in concern.get("evidence", []):
            criterion = evidence.get("criterion")
            action_key = (concern.get("competency"), criterion)
            if action_key in recommended_criteria:
                continue
            quote = evidence.get("quote")
            action = tips.get(criterion)
            if quote and action:
                improvement_actions.append(
                    f'{concern["competency"]}: use “{quote}” as the focus; {action}'
                )
                recommended_criteria.add(action_key)

    if not improvement_actions:
        improvement_actions.append(
            "Insufficient evidence is available to make a specific, evidence-based improvement recommendation."
        )

    events = data.get("events") or []
    counts = Counter(e.get("type") for e in events if e.get("type"))

    monitoring = [
        f"{EVENT_LABELS.get(t, t)}: {n} time(s)"
        for t, n in counts.most_common()
        if t not in INFO_EVENTS
    ]
    monitoring.extend(
        f"{EVENT_LABELS.get(event.get('type'), event.get('type'))} "
        f"at {event.get('at') or 'time unavailable'}"
        for event in events
        if event.get("type") not in INFO_EVENTS
    )

    if data.get("terminated_reason"):
        monitoring.insert(
            0,
            f"Interview was STOPPED by monitoring: "
            f"{EVENT_LABELS.get(data['terminated_reason'], data['terminated_reason'])}",
        )

    if not monitoring:
        monitoring.append("No monitoring events were recorded.")

    if not strengths:
        strengths.append("No evidence-backed strengths were identified.")
    if not improve:
        improve.append("No evidence-backed concerns were identified.")

    return {
        "strengths": strengths,
        "improve": improve,
        "how": improvement_actions,
        "monitoring": monitoring,
    }


# =========================================================
# FEEDBACK WRITTEN TO THE CANDIDATE
# =========================================================

def build_candidate_feedback(data: dict) -> dict:
    """
    Strengths, weak points and what to improve - written to the
    candidate ("you ..."). No scores and no monitoring details.
    Shown to the interviewer and sent in the result e-mail.
    """

    skills = {
        key: value
        for key, value in (data.get("skills") or {}).items()
        if value is not None
    }

    empty = {
        "available": False,
        "strengths": [],
        "weaknesses": [],
        "improvements": [],
        "answer_notes": [],
    }

    if not skills:
        return empty

    analysis = analyse(data)
    strengths = analysis["strengths"]
    weaknesses = analysis["improve"]
    improvements = analysis["how"]

    notes = [
        {
            "question": item["question"],
            "feedback": str(item["feedback"]).strip(),
        }
        for item in data.get("qa", [])
        if item.get("feedback") and str(item["feedback"]).strip()
    ]

    return {
        "available": True,
        "strengths": strengths,
        "weaknesses": weaknesses,
        "improvements": improvements,
        "answer_notes": notes,
    }


def candidate_feedback_for_session(db: Session, session_id) -> dict:
    return build_candidate_feedback(collect_report_data(db, session_id))


# =========================================================
# PDF
# =========================================================

INK = colors.HexColor("#1F1B3A")
ACCENT = colors.HexColor("#6D3BEA")
MUTED = colors.HexColor("#6B6785")
LINE = colors.HexColor("#E6E3F0")
GAZE_PINK = colors.HexColor("#DB2777")

_LEVEL_COLOR = {
    "LOW": colors.HexColor("#16A34A"),
    "MEDIUM": colors.HexColor("#D97706"),
    "HIGH": colors.HexColor("#DC2626"),
}


def _styles():
    base = getSampleStyleSheet()

    return {
        "title": ParagraphStyle(
            "report-title", parent=base["Title"], fontName="Helvetica-Bold",
            fontSize=22, leading=26, textColor=INK, alignment=TA_LEFT,
            spaceAfter=4,
        ),
        "sub": ParagraphStyle(
            "report-subtitle", parent=base["Normal"], fontSize=9.5,
            leading=13, textColor=MUTED, spaceAfter=12,
        ),
        "h2": ParagraphStyle(
            "report-section", parent=base["Heading2"], fontName="Helvetica-Bold",
            fontSize=13, leading=16, textColor=ACCENT, spaceBefore=13,
            spaceAfter=6, keepWithNext=True,
        ),
        "body": ParagraphStyle(
            "report-body", parent=base["Normal"], fontSize=9.5,
            leading=13.5, textColor=INK, wordWrap="CJK",
        ),
        "small": ParagraphStyle(
            "report-small", parent=base["Normal"], fontSize=8.5,
            leading=11.5, textColor=MUTED, wordWrap="CJK",
        ),
        "label": ParagraphStyle(
            "report-label", parent=base["Normal"], fontName="Helvetica-Bold",
            fontSize=8.5, leading=11, textColor=MUTED,
        ),
        "table_header": ParagraphStyle(
            "report-table-header", parent=base["Normal"],
            fontName="Helvetica-Bold", fontSize=8, leading=10,
            textColor=colors.white,
        ),
        "q": ParagraphStyle(
            "report-question", parent=base["Normal"],
            fontName="Helvetica-Bold", fontSize=10, leading=13,
            textColor=INK, spaceAfter=2, keepWithNext=True,
        ),
        "score": ParagraphStyle(
            "report-score", parent=base["Normal"],
            fontName="Helvetica-Bold", fontSize=24, leading=27,
            textColor=ACCENT, alignment=TA_RIGHT,
        ),
    }


def _bullets(items, style):
    if not items:
        items = ["Unavailable"]
    return ListFlowable(
        [
            ListItem(Paragraph(escape(str(i)), style), leftIndent=14)
            for i in items
        ],
        bulletType="bullet",
        start="\u2022",
        leftIndent=14,
        bulletFontSize=9,
    )


def _paragraph(value, style):
    return Paragraph(escape(str(value or "Unavailable")), style)


def _excerpt(value, limit):
    text = " ".join(str(value or "").split())
    if len(text) <= limit:
        return text or "Unavailable"
    return f"{text[:limit - 1].rstrip()}…"


def _report_section(title, styles):
    return Paragraph(escape(title), styles["h2"])


def _draw_page(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.5)
    canvas.line(18 * mm, 13 * mm, A4[0] - 18 * mm, 13 * mm)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(18 * mm, 8.5 * mm, "Confidential · Interview evaluation")
    canvas.drawRightString(A4[0] - 18 * mm, 8.5 * mm, f"Page {doc.page}")
    canvas.restoreState()


def _gaze_story(gaze: dict, st: dict) -> list:
    """
    "Eye Movement Detection (AI-Assisted Answer Check)".
    Interviewer PDF only. Returns [] when nothing was measured.
    """

    if not gaze:
        return []

    base = getSampleStyleSheet()

    cell = ParagraphStyle(
        "gz_cell", parent=base["Normal"], fontSize=8.5, leading=11,
        textColor=INK,
    )
    head = ParagraphStyle(
        "gz_head", parent=cell, textColor=colors.white,
        fontName="Helvetica-Bold",
    )
    note = ParagraphStyle(
        "gz_note", parent=cell, fontSize=7.5, textColor=MUTED,
    )

    banner = Table(
        [[Paragraph(
            "Eye Movement Detection (AI-Assisted Answer Check)",
            ParagraphStyle(
                "gz_banner", parent=head, fontSize=11, leading=14,
            ),
        )]],
        colWidths=[174 * mm],
    )
    banner.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), GAZE_PINK),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )

    story = [Spacer(1, 10), banner, Spacer(1, 6)]

    summary = gaze.get("summary")

    if not summary:
        story.append(
            Paragraph(
                "Not enough answer time to assess "
                "(every answer was shorter than 3 seconds).",
                st["small"],
            )
        )
        return story

    def level_color(label):
        return _LEVEL_COLOR.get(str(label).upper(), INK)

    gaze_pct = summary["gaze_pct"]
    gaze_color = (
        _LEVEL_COLOR["LOW"] if gaze_pct >= 90
        else _LEVEL_COLOR["MEDIUM"] if gaze_pct >= 75
        else _LEVEL_COLOR["HIGH"]
    )

    stats = [
        ("Gaze on screen", f"{gaze_pct}%", "Of answer time", gaze_color),
        ("Off-screen glances", str(summary["glances"]),
         "Total, all questions", colors.HexColor("#2563EB")),
        ("Reading pattern",
         f"{summary['reading_flagged']} / {summary['reading_total']}",
         summary["reading_note"],
         _LEVEL_COLOR["HIGH"] if summary["reading_flagged"]
         else _LEVEL_COLOR["LOW"]),
        ("Second-screen risk", f"{summary['second_screen_pct']}%",
         summary["second_screen_label"],
         level_color(summary["second_screen_label"])),
        ("AI-answer risk", summary["ai_answer_risk"],
         summary["ai_answer_note"],
         level_color(summary["ai_answer_risk"])),
    ]

    def big(text, color):
        return Paragraph(
            f"<font color='{color.hexval().replace('0x', '#')}'>"
            f"<b>{escape(str(text))}</b></font>",
            ParagraphStyle(
                "gz_big", parent=cell, fontSize=15, leading=18,
            ),
        )

    stat_table = Table(
        [
            [Paragraph(escape(label), cell) for label, *_ in stats],
            [big(value, color) for _l, value, _n, color in stats],
            [Paragraph(escape(str(n)), note) for _l, _v, n, _c in stats],
        ],
        colWidths=[34.8 * mm] * 5,
    )

    style = [
        ("BOX", (0, 0), (-1, -1), 0.4, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]

    for col, (_l, _v, _n, color) in enumerate(stats):
        style.append(("LINEABOVE", (col, 0), (col, 0), 2.5, color))

    stat_table.setStyle(TableStyle(style))

    story += [stat_table, Spacer(1, 8)]

    rows = [[
        Paragraph("#", head),
        Paragraph("Gaze on screen", head),
        Paragraph("Off-screen glances", head),
        Paragraph("Reading pattern", head),
        Paragraph("Observation", head),
        Paragraph("AI risk", head),
    ]]

    risk_styles = []

    for index, q in enumerate(gaze["questions"], start=1):
        assessed = q["assessed"]

        rows.append([
            Paragraph(f"<b>Q{q['question']}</b>", cell),
            Paragraph(f"{q['gaze_pct']}%" if assessed else "-", cell),
            Paragraph(str(q["glances"]) if assessed else "-", cell),
            Paragraph(
                ("<font color='#DC2626'><b>Yes</b></font>"
                 if q["reading"] else "No") if assessed else "-",
                cell,
            ),
            Paragraph(escape(q["observation"]), cell),
            Paragraph(
                f"<b>{q['risk']}</b>" if assessed else "-",
                ParagraphStyle(
                    "gz_risk", parent=head, alignment=1,
                ) if assessed else cell,
            ),
        ])

        if assessed:
            risk_styles.append(
                ("BACKGROUND", (5, index), (5, index),
                 _LEVEL_COLOR.get(q["risk"], INK))
            )

    q_table = Table(
        rows,
        colWidths=[10 * mm, 20 * mm, 22 * mm, 22 * mm, 80 * mm, 20 * mm],
        repeatRows=1,
    )
    q_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), GAZE_PINK),
                ("GRID", (0, 0), (-1, -1), 0.4, LINE),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
            + risk_styles
        )
    )

    story += [
        q_table,
        Spacer(1, 4),
        Paragraph(
            "Indicators from the webcam, not proof. Lighting, glasses and "
            "camera position affect them. Review the answers before "
            "deciding. For the interviewer only.",
            st["small"],
        ),
    ]

    return story


def build_report_pdf(data: dict) -> bytes:
    st = _styles()
    ana = analyse(data)
    canonical = data.get("canonical") or {}
    score_data = canonical.get("score") or {}
    recommendation = canonical.get("recommendation") or {}
    human_review = canonical.get("human_review") or {}
    monitoring = canonical.get("monitoring") or {}
    competencies = data.get("competencies") or []
    questions = data.get("qa") or []
    events = data.get("events") or []

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=13 * mm,
        bottomMargin=17 * mm,
        title=f"Interview report - {data.get('candidate_name') or 'Candidate'}",
    )

    body_style = ParagraphStyle(
        "report-compact-body",
        parent=st["body"],
        fontSize=8.2,
        leading=10,
        spaceAfter=0,
    )
    small_style = ParagraphStyle(
        "report-compact-small",
        parent=st["small"],
        fontSize=7.7,
        leading=9.2,
        spaceAfter=0,
    )
    header_style = ParagraphStyle(
        "report-compact-header",
        parent=st["table_header"],
        fontSize=7.7,
        leading=9,
    )
    section_style = ParagraphStyle(
        "report-compact-section",
        parent=st["h2"],
        fontSize=11.5,
        leading=13,
        spaceBefore=5,
        spaceAfter=3,
    )

    def paragraph(value, style=body_style, limit=None):
        text = _excerpt(value, limit) if limit else str(value or "Unavailable")
        return Paragraph(escape(text), style)

    def section(title):
        return _report_section(title, {"h2": section_style})

    def compact_table(rows, widths, header=True):
        table = Table(rows, colWidths=widths, repeatRows=1 if header else 0)
        commands = [
            ("GRID", (0, 0), (-1, -1), 0.35, LINE),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8F7FB")]),
        ]
        if header:
            commands.append(("BACKGROUND", (0, 0), (-1, 0), INK))
        table.setStyle(TableStyle(commands))
        return table

    def limited_items(items, limit):
        items = list(items or [])
        return items[:limit], max(0, len(items) - limit)

    score = data.get("overall_score")
    score_text = f"{float(score):.2f} / 100" if score is not None else "Unavailable"
    status_text = str(data.get("status") or "Unavailable").replace("_", " ").title()
    human_decision = human_review.get("decision") or data.get("decision")
    ai_recommendation = recommendation.get("recommendation")
    reviewer_note = human_review.get("note")
    if reviewer_note is None or not str(reviewer_note).strip():
        reviewer_note = "No reviewer note recorded"
    disagreement = bool(human_review.get("ai_decision_disagreement"))

    page_one = [
        Paragraph("Candidate Interview Evaluation", st["title"]),
        Paragraph(
            f"{escape(str(data.get('interview_title') or 'Interview'))} &nbsp;|&nbsp; "
            f"{datetime.now().strftime('%d %b %Y')}",
            st["sub"],
        ),
        section("Evaluation summary"),
    ]

    details = [
        [
            paragraph("Candidate", st["label"]),
            paragraph(
                f"{data.get('candidate_name') or 'Unavailable'} · "
                f"{data.get('candidate_email') or 'Email unavailable'}",
                body_style,
                100,
            ),
            paragraph("Overall score", st["label"]),
            paragraph(score_text, st["score"]),
        ],
        [
            paragraph("Role / company", st["label"]),
            paragraph(
                f"{data.get('role') or 'Unavailable'} · "
                f"{data.get('company') or 'Unavailable'} · "
                f"{data.get('location') or 'Location unavailable'}",
                body_style,
                120,
            ),
            paragraph("Interview date", st["label"]),
            paragraph(data.get("interview_date"), body_style),
        ],
        [
            paragraph("Interview", st["label"]),
            paragraph(data.get("interview_title"), body_style, 80),
            paragraph("Status / duration", st["label"]),
            paragraph(f"{status_text} · {data.get('duration') or 'Unavailable'}", body_style, 70),
        ],
        [
            paragraph("Human review", st["label"]),
            paragraph(human_review.get("status"), body_style),
            paragraph("Final decision", st["label"]),
            paragraph(str(human_decision or "Unavailable").replace("_", " "), body_style),
        ],
    ]
    page_one.append(
        compact_table(
            details,
            [25 * mm, 62 * mm, 29 * mm, 58 * mm],
            header=False,
        )
    )

    page_one.append(section("Competency scores"))
    skill_rows = [[
        paragraph("Competency", header_style),
        paragraph("Weight", header_style),
        paragraph("Score / 100", header_style),
        paragraph("Rating", header_style),
        paragraph("Contribution", header_style),
    ]]
    for item in competencies:
        skill_rows.append([
            paragraph(item.get("name"), body_style, 40),
            paragraph(_score_text(item.get("weight"), "%"), body_style),
            paragraph(_score_text(item.get("score")), body_style),
            paragraph(item.get("rating") or _rating_text(item.get("score")), body_style),
            paragraph(_score_text(item.get("weighted_contribution")), body_style),
        ])
    if not competencies:
        skill_rows.append([
            paragraph("Competency scores unavailable.", body_style),
            paragraph("Unavailable", body_style),
            paragraph("Unavailable", body_style),
            paragraph("Unavailable", body_style),
            paragraph("Unavailable", body_style),
        ])
    page_one.append(
        compact_table(
            skill_rows,
            [57 * mm, 24 * mm, 30 * mm, 32 * mm, 31 * mm],
        )
    )
    weights_complete = bool(competencies) and all(
        item.get("weight") is not None for item in competencies
    )
    contributions_complete = bool(competencies) and all(
        item.get("weighted_contribution") is not None
        for item in competencies
    )
    page_one.append(
        paragraph(
            f"{_excerpt(score_data.get('formula') or 'Overall score is the sum of competency averages multiplied by configured weights.', 240)} "
            f"Weights: {_score_text(sum(item['weight'] for item in competencies), '%') if weights_complete else 'Unavailable'}; "
            f"contributions: {_score_text(sum(item['weighted_contribution'] for item in competencies)) if contributions_complete else 'Unavailable'}.",
            small_style,
            450,
        )
    )

    page_one.append(section("AI recommendation and human decision"))
    recommendation_rows = [[
        paragraph("AI recommendation", st["label"]),
        paragraph(
            str(ai_recommendation).replace("_", " ")
            if ai_recommendation
            else recommendation.get("rationale") or "Unavailable",
            body_style,
            70,
        ),
        paragraph("Human decision", st["label"]),
        paragraph(str(human_decision or "Unavailable").replace("_", " "), body_style),
    ]]
    page_one.append(
        compact_table(
            recommendation_rows,
            [29 * mm, 59 * mm, 29 * mm, 57 * mm],
            header=False,
        )
    )
    page_one.append(
        paragraph(
            recommendation.get("rationale") or "AI recommendation reason unavailable.",
            small_style,
            230,
        )
    )
    if disagreement:
        page_one.append(
            paragraph(
                "AI and human decisions differ; neither is automatically treated as incorrect.",
                body_style,
                150,
            )
        )

    strengths = ana["strengths"]
    concerns = ana["improve"]
    improvement = ana["how"]
    page_one.append(section("Strengths and areas to improve"))
    page_one.append(
        compact_table(
            [
                [
                    paragraph("Evidence-backed strengths", header_style),
                    paragraph("Areas for improvement", header_style),
                ],
                [
                    paragraph("; ".join(strengths[:2]), small_style, 230),
                    paragraph("; ".join(concerns[:2]), small_style, 230),
                ],
                [
                    paragraph("Actionable guidance", st["label"]),
                    paragraph("; ".join(improvement[:2]), small_style, 230),
                ],
            ],
            [90 * mm, 90 * mm],
            header=False,
        )
    )

    page_one.append(section("Question-by-question scores and feedback"))
    question_rows = [[
        paragraph("Question", header_style),
        paragraph("Score", header_style),
        paragraph("Assessment feedback", header_style),
    ]]
    shown_questions, omitted_questions = limited_items(questions, 9)
    for index, item in enumerate(shown_questions, start=1):
        label = "Follow-up" if item.get("is_follow_up") else f"Q{item.get('order') or index}"
        if not (item.get("answer") or "").strip():
            label += " · unanswered"
        question_rows.append([
            paragraph(
                f"{label}: {item.get('question') or 'Question unavailable'}",
                small_style,
                115,
            ),
            paragraph(_score_text(item.get("overall")), small_style),
            paragraph(item.get("feedback"), small_style, 125),
        ])
    if not question_rows[1:]:
        question_rows.append([
            paragraph("No questions recorded.", small_style),
            paragraph("Unavailable", small_style),
            paragraph("Feedback unavailable.", small_style),
        ])
    page_one.append(
        compact_table(question_rows, [74 * mm, 22 * mm, 78 * mm])
    )
    if omitted_questions:
        page_one.append(
            paragraph(
                f"{omitted_questions} additional question(s) are available in the full report data.",
                small_style,
            )
        )

    page_two = [
        Paragraph("Supporting details", st["title"]),
        Paragraph("Answer excerpts, monitoring summary, and human review", st["sub"]),
        section("Answer excerpts and assessment evidence"),
    ]
    evidence_rows = [[
        paragraph("Question / candidate answer excerpt", header_style),
        paragraph("Assessment evidence", header_style),
    ]]
    answered_questions = [item for item in questions if (item.get("answer") or "").strip()]
    shown_answers, omitted_answers = limited_items(answered_questions, 6)
    for item in shown_answers:
        evidence = (item.get("evidence") or [])[:1]
        answer_excerpt = _excerpt(item.get("answer"), 180)
        if len(str(item.get("answer") or "")) > 180:
            answer_excerpt += " (excerpt)"
        question_label = item.get("question") or "Question unavailable"
        evidence_text = (
            f"{evidence[0].get('criterion') or 'Evidence'}: "
            f'“{_excerpt(evidence[0].get("quote"), 100)}” — '
            f"{_excerpt(evidence[0].get('explanation'), 100)}"
            if evidence
            else "No structured supporting evidence recorded."
        )
        evidence_rows.append([
            Paragraph(
                f"<b>{escape(_excerpt(question_label, 90))}</b>"
                f"<br/><br/>Answer: {escape(answer_excerpt)}",
                small_style,
            ),
            paragraph(evidence_text, small_style, 220),
        ])
    if not shown_answers:
        evidence_rows.append([
            paragraph("No answered questions are available.", small_style),
            paragraph("No structured supporting evidence recorded.", small_style),
        ])
    page_two.append(
        compact_table(evidence_rows, [108 * mm, 66 * mm])
    )
    if omitted_answers:
        page_two.append(
            paragraph(
                f"{omitted_answers} additional answer(s) remain available in the application report.",
                small_style,
            )
        )

    page_two.append(section("Monitoring observations"))
    event_counts = Counter(
        event.get("type")
        for event in events
        if event.get("type") and event.get("type") not in INFO_EVENTS
    )
    monitoring_rows = [[
        paragraph("Observation type", header_style),
        paragraph("Count", header_style),
        paragraph("Question-linked", header_style),
        paragraph("Latest timestamp", header_style),
    ]]
    for event_type, count in event_counts.most_common(6):
        type_events = [event for event in events if event.get("type") == event_type]
        timestamps = sorted(
            event.get("at")
            for event in type_events
            if isinstance(event.get("at"), str)
        )
        linked_count = sum(bool(event.get("question_id")) for event in type_events)
        monitoring_rows.append([
            paragraph(
                EVENT_LABELS.get(event_type, event_type.replace("_", " ")),
                small_style,
                60,
            ),
            paragraph(str(count), small_style),
            paragraph(str(linked_count), small_style),
            paragraph(
                _display_datetime(timestamps[-1]) if timestamps else "Unavailable",
                small_style,
            ),
        ])
    if not event_counts:
        monitoring_rows.append([
            paragraph("No monitoring events recorded.", small_style),
            paragraph("0", small_style),
            paragraph("0", small_style),
            paragraph("Unavailable", small_style),
        ])
    page_two.append(
        compact_table(
            monitoring_rows,
            [62 * mm, 22 * mm, 36 * mm, 52 * mm],
        )
    )
    if len(event_counts) > 6:
        page_two.append(
            paragraph(
                f"{len(event_counts) - 6} additional monitoring event type(s) are omitted from this summary.",
                small_style,
            )
        )
    if data.get("terminated_reason"):
        reason = data["terminated_reason"]
        page_two.append(
            paragraph(
                f"Session termination signal: {EVENT_LABELS.get(reason, reason.replace('_', ' '))}.",
                small_style,
            )
        )
    monitoring_note = (
        "Eye/face events are observation signals for human review, not proof of misconduct. "
        "Identity verification, voice identity, and direct second-screen activity are not "
        "available."
    )
    if data.get("gaze"):
        monitoring_note += (
            " Gaze-derived estimates are included below and should be interpreted as signals."
        )
    else:
        monitoring_note += (
            " Numerical gaze direction, off-screen duration, and reading-pattern metrics "
            "are not available."
        )
    page_two.append(paragraph(monitoring_note, small_style, 350))

    if data.get("gaze"):
        page_two.append(section("Eye-movement analysis"))
        page_two.extend(_gaze_story(data["gaze"], st))

    unanswered_followups = [
        item for item in questions
        if item.get("is_follow_up") and not (item.get("answer") or "").strip()
    ]
    page_two.append(section("Unanswered follow-ups and next-round questions"))
    followup_lines = [
        f"Unanswered follow-up: {_excerpt(item.get('question'), 120)}"
        for item in unanswered_followups[:3]
    ]
    if len(unanswered_followups) > 3:
        followup_lines.append(
            f"{len(unanswered_followups) - 3} additional unanswered follow-up(s) omitted."
        )
    if not followup_lines:
        followup_lines.append("No unanswered follow-up questions.")
    next_round = recommendation.get("next_round_questions") or []
    followup_lines.extend(
        f"Next round: {_excerpt(question, 150)}"
        for question in next_round[:3]
    )
    if not next_round:
        followup_lines.append("No evidence-based next-round questions available.")
    page_two.append(_bullets(followup_lines, small_style))

    page_two.append(section("Human review details"))
    reviewer = human_review.get("reviewer") or "Unavailable"
    decision_time = _display_datetime(human_review.get("decided_at"))
    review_detail = (
        f"Reviewer: {_excerpt(reviewer, 80)} · "
        f"Decision time: {decision_time} · "
        f"Reviewer note: {_excerpt(reviewer_note, 260)}"
    )
    page_two.append(paragraph(review_detail, body_style, 430))
    page_two.append(
        paragraph(
            canonical.get("disclaimer")
            or "AI-generated information supports and does not replace human review.",
            small_style,
            260,
        )
    )

    story = [
        KeepInFrame(doc.width, doc.height, page_one, mode="shrink"),
        PageBreak(),
        KeepInFrame(doc.width, doc.height, page_two, mode="shrink"),
    ]
    doc.build(story, onFirstPage=_draw_page, onLaterPages=_draw_page)
    return buffer.getvalue()


def build_report_pdf_for_session(db: Session, session_id) -> tuple[bytes, str]:
    """Returns (pdf_bytes, filename)."""

    data = collect_report_data(db, session_id)
    pdf = build_report_pdf(data)

    safe = "".join(
        c if c.isascii() and c.isalnum() else "_"
        for c in data["candidate_name"]
    ).strip("_") or "candidate"

    return pdf, f"interview_report_{safe}.pdf"