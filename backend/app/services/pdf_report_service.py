"""Build the candidate interview report PDF (interviewer copy)."""

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


# =========================================================
# PDF CONTENT (skill-based summary shown in the interviewer PDF)
# =========================================================

STRONG_FROM = 70
WEAK_BELOW = 60

IMPROVE_TIPS = {
    "communication": (
        "Speak in short, clear sentences and avoid long pauses or fillers.",
        "Practise explaining technical ideas aloud with a concrete example.",
    ),
    "accuracy": (
        "Revise the core concepts and verify definitions before the interview.",
        "Say clearly when unsure instead of guessing a wrong fact.",
    ),
    "completeness": (
        "Use a simple structure: context, approach, example, result.",
        "Cover edge cases, failures and alternatives in each answer.",
    ),
    "technical_knowledge": (
        "Practise hands-on projects using the required stack end to end.",
        "Study real-world trade-offs (why this tool / design, not just what).",
    ),
    "relevance": (
        "Answer exactly what is asked first, then add detail.",
        "Avoid drifting to nearby topics; keep each answer on the question.",
    ),
}


def _fmt_score(value) -> str:
    """74.2 -> '74.2', 80.0 -> '80'."""
    return f"{round(float(value), 1):g}"


def _fmt_started(value) -> str:
    if not value or value == "-":
        return "-"
    try:
        return datetime.fromisoformat(
            str(value).replace("Z", "+00:00")
        ).strftime("%d %b %Y, %H:%M")
    except ValueError:
        return str(value)


def _skill_summary(skills: dict) -> dict:
    """Strengths / areas to improve / how to improve from the skill scores."""

    scored = [
        (key, float(value))
        for key, value in (skills or {}).items()
        if value is not None and key in SKILL_LABELS
    ]

    strengths = [
        f"{SKILL_LABELS[key]} is strong ({value:.0f}/100)."
        for key, value in sorted(scored, key=lambda item: -item[1])
        if value >= STRONG_FROM
    ]
    if not strengths and scored:
        key, value = max(scored, key=lambda item: item[1])
        strengths = [f"Best area: {SKILL_LABELS[key]} ({value:.0f}/100)."]

    weak = [
        (key, value)
        for key, value in sorted(scored, key=lambda item: item[1])
        if value < WEAK_BELOW
    ]
    improve = [
        f"{SKILL_LABELS[key]} needs work ({value:.0f}/100)."
        for key, value in weak
    ]
    how = [
        f"{SKILL_LABELS[key]}: {tip}"
        for key, _value in weak
        for tip in IMPROVE_TIPS.get(key, ())
    ]

    return {"strengths": strengths, "improve": improve, "how": how}


def _monitoring_lines(data: dict) -> list:
    events = data.get("events") or []
    counts = Counter(
        event.get("type")
        for event in events
        if event.get("type") and event.get("type") not in INFO_EVENTS
    )

    lines = [
        f"{EVENT_LABELS.get(kind, kind)}: {count} time(s)"
        for kind, count in counts.most_common()
    ]

    reason = data.get("terminated_reason")
    if reason:
        lines.insert(
            0,
            "Interview was STOPPED by monitoring: "
            f"{EVENT_LABELS.get(reason, reason)}",
        )

    return lines or ["No monitoring events were recorded."]


def build_report_pdf(data: dict) -> bytes:
    """Candidate Interview Report - the interviewer PDF."""

    st = _styles()
    base = getSampleStyleSheet()

    bullet = ParagraphStyle(
        "pdf-bullet", parent=st["body"], fontSize=9.5, leading=13.5,
    )
    detail = ParagraphStyle(
        "pdf-detail", parent=st["body"], fontSize=8.5, leading=11.5,
        textColor=MUTED,
    )
    cell = ParagraphStyle(
        "pdf-cell", parent=base["Normal"], fontSize=9, leading=11.5,
        textColor=INK,
    )
    cell_label = ParagraphStyle(
        "pdf-cell-label", parent=cell, textColor=MUTED,
    )
    cell_head = ParagraphStyle(
        "pdf-cell-head", parent=cell, textColor=colors.white,
    )
    question_style = ParagraphStyle(
        "pdf-question", parent=st["q"], fontSize=10, leading=12.5,
        spaceBefore=8,
    )

    skills = data.get("skills") or {}
    summary = _skill_summary(skills)
    questions = data.get("qa") or []
    score = data.get("overall_score")

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=18 * mm,
        title=f"Interview report - {data.get('candidate_name') or 'Candidate'}",
    )

    def para(value, style=cell):
        return Paragraph(escape(str(value)), style)

    def bullets(items, style=bullet):
        return ListFlowable(
            [ListItem(para(item, style), leftIndent=14) for item in items],
            bulletType="bullet",
            start="•",
            leftIndent=14,
            bulletFontSize=9,
        )

    # ---------- title + details ----------

    role = data.get("role")
    if not role or role == "Unavailable":
        role = data.get("interview_title") or "Interview"
    generated = datetime.now().strftime("%d %b %Y, %H:%M")

    story = [
        Paragraph("Candidate Interview Report", st["title"]),
        Paragraph(f"{escape(str(role))} &nbsp;|&nbsp; generated {generated}", st["sub"]),
    ]

    status = str(data.get("status") or "Unavailable").replace("_", " ").title()
    score_text = (
        f"<b>{_fmt_score(score)} / 100</b>" if score is not None else "Unavailable"
    )
    details = Table(
        [
            [para("Candidate", cell_label), para(data.get("candidate_name") or "Unavailable")],
            [para("Email", cell_label), para(data.get("candidate_email") or "Unavailable")],
            [para("Started", cell_label), para(_fmt_started(data.get("started_at")))],
            [para("Duration", cell_label), para(data.get("duration") or "-")],
            [para("Status", cell_label), para(status)],
            [para("Overall score", cell_label), Paragraph(score_text, cell)],
        ],
        colWidths=[34 * mm, 134 * mm],
    )
    details.setStyle(
        TableStyle(
            [
                ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(details)

    main_scored = [
        item for item in questions
        if not item.get("is_follow_up") and item.get("overall") is not None
    ]
    main_count = len(main_scored) or sum(
        1 for item in questions if not item.get("is_follow_up")
    )
    if score is not None:
        story += [
            Spacer(1, 4),
            Paragraph(
                f"Weighted interview score: {float(score):.2f}/100 "
                f"across {main_count} main questions.",
                st["body"],
            ),
        ]

    # ---------- skill scores ----------

    story.append(Paragraph("Skill scores", st["h2"]))
    skill_rows = [[para("Skill", cell_head), para("Score", cell_head)]]
    for key, label in SKILL_LABELS.items():
        value = skills.get(key)
        skill_rows.append([
            para(label),
            para(f"{float(value):.0f} / 100" if value is not None else "-"),
        ])
    skill_table = Table(skill_rows, colWidths=[86 * mm, 39 * mm], hAlign="CENTER")
    skill_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), INK),
                ("GRID", (0, 0), (-1, -1), 0.4, LINE),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(skill_table)

    # ---------- strengths / improve ----------

    for title, items in (
        ("Strengths", summary["strengths"]),
        ("Areas to improve", summary["improve"]),
        ("How to improve", summary["how"]),
    ):
        if not items:
            continue
        story += [Paragraph(title, st["h2"]), bullets(items)]

    # ---------- monitoring + eye movement (page 2) ----------

    story += [
        PageBreak(),
        Paragraph("Monitoring summary (face / eye detection)", st["h2"]),
        bullets(_monitoring_lines(data)),
    ]
    story += _gaze_story(data.get("gaze"), st)

    # ---------- question-by-question feedback ----------

    story.append(Paragraph("Question-by-question feedback", st["h2"]))
    answered = [
        item for item in questions if (item.get("answer") or "").strip()
    ]
    if not answered:
        story.append(para("No answered questions were recorded.", detail))

    for index, item in enumerate(answered, start=1):
        label = (
            "Follow-up"
            if item.get("is_follow_up")
            else f"Q{item.get('order') or index}"
        )
        overall = item.get("overall")
        score_tag = (
            f" &nbsp;<font color='{ACCENT.hexval().replace('0x', '#')}'>"
            f"[{float(overall):.0f}/100]</font>"
            if overall is not None
            else ""
        )
        story.append(
            Paragraph(
                f"{label}: {escape(str(item.get('question') or 'Question unavailable'))}"
                f"{score_tag}",
                question_style,
            )
        )
        lines = [f"Answer: {' '.join(str(item['answer']).split())}"]
        feedback = " ".join(str(item.get("feedback") or "").split())
        if feedback:
            lines.append(f"Feedback: {feedback}")
        story.append(bullets(lines, detail))

    doc.build(story)
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