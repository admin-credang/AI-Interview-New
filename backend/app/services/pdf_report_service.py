"""
Candidate interview report as a PDF (bullet points).

Sections:
  1. Candidate + interview details
  2. Overall result
  3. Skill scores
  4. Strengths                (bullets)
  5. Areas to improve         (bullets)
  6. How to improve           (bullets, per weak skill)
  7. Question-by-question     (answer score + AI feedback bullets)
  8. Monitoring summary       (face / eye / phone / tab flags)
  9. Eye movement detection   (per-question answer check, interviewer only)

Used by:
  - notify_interviewer_task  -> attached to the e-mail sent to the interviewer
  - GET /hiring/candidates/{session_id}/report.pdf -> download button
"""

from collections import Counter
from datetime import datetime
from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    KeepTogether,
    ListFlowable,
    ListItem,
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
from app.models.question import Question
from app.models.report import Report
from app.models.score import Score
from app.models.session import InterviewSession
from app.models.session_review import SessionReview
from app.models.user import User
from app.services.gaze_analysis_service import build_gaze_report


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

# What the candidate should do to improve each skill
IMPROVE_TIPS = {
    "relevance": [
        "Answer exactly what is asked first, then add detail.",
        "Avoid drifting to nearby topics; keep each answer on the question.",
    ],
    "accuracy": [
        "Revise the core concepts and verify definitions before the interview.",
        "Say clearly when unsure instead of guessing a wrong fact.",
    ],
    "technical_knowledge": [
        "Practise hands-on projects using the required stack end to end.",
        "Study real-world trade-offs (why this tool / design, not just what).",
    ],
    "completeness": [
        "Use a simple structure: context, approach, example, result.",
        "Cover edge cases, failures and alternatives in each answer.",
    ],
    "communication": [
        "Speak in short, clear sentences and avoid long pauses or fillers.",
        "Practise explaining technical ideas aloud with a concrete example.",
    ],
}

STRONG_AT = 70.0   # score >= this  -> strength
WEAK_BELOW = 55.0  # score <  this  -> needs improvement

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

    interview = (
        db.query(Interview)
        .filter(Interview.id == session.interview_id)
        .first()
    )

    candidate = (
        db.query(User).filter(User.id == session.candidate_id).first()
    )

    report = (
        db.query(Report).filter(Report.session_id == session.id).first()
    )

    review = (
        db.query(SessionReview)
        .filter(SessionReview.session_id == session.id)
        .first()
    )

    questions = (
        db.query(Question).filter(Question.session_id == session.id).all()
    )

    answers = (
        db.query(Answer)
        .filter(Answer.session_id == session.id)
        .order_by(Answer.answered_at.asc())
        .all()
    )

    answer_by_question = {a.question_id: a for a in answers}
    answer_ids = [a.id for a in answers]

    scores, feedbacks = {}, {}

    if answer_ids:
        scores = {
            s.answer_id: s
            for s in db.query(Score).filter(Score.answer_id.in_(answer_ids))
        }
        feedbacks = {
            f.answer_id: f
            for f in db.query(Feedback).filter(
                Feedback.answer_id.in_(answer_ids)
            )
        }

    mains = sorted(
        [q for q in questions if q.parent_question_id is None],
        key=lambda q: q.question_order,
    )

    children = {}
    for q in questions:
        if q.parent_question_id is not None:
            children.setdefault(q.parent_question_id, []).append(q)

    ordered = []
    for main in mains:
        ordered.append(main)
        ordered.extend(
            sorted(children.get(main.id, []), key=lambda q: q.created_at)
        )

    qa = []
    totals = {key: [] for key in SKILL_LABELS}

    for q in ordered:
        a = answer_by_question.get(q.id)
        s = scores.get(a.id) if a else None
        f = feedbacks.get(a.id) if a else None

        if s is not None:
            for key in totals:
                totals[key].append(_num(getattr(s, key)))

        qa.append(
            {
                "question": q.question,
                "is_follow_up": q.parent_question_id is not None,
                "answer": a.answer_text if a else None,
                "overall": _num(s.overall_score) if s else None,
                "feedback": f.feedback_text if f else None,
            }
        )

    skills = {key: _avg(values) for key, values in totals.items()}

    events = (review.proctoring_events or []) if review else []

    return {
        "candidate_name": candidate.name if candidate else "Unknown",
        "candidate_email": candidate.email if candidate else "-",
        "interview_title": interview.title if interview else "Interview",
        "status": session.status,
        "started_at": _dt(session.started_at),
        "duration": _duration(session),
        "overall_score": _num(report.overall_score) if report else None,
        "summary": report.summary if report else None,
        "skills": skills,
        "qa": qa,
        "events": events,
        "gaze": build_gaze_report(review.gaze_metrics) if review else None,
        "terminated_reason": review.termination_reason if review else None,
        "decision": review.decision if review else "pending",
    }


# =========================================================
# ANALYSIS  (bullet points)
# =========================================================

def analyse(data: dict) -> dict:
    skills = {k: v for k, v in data["skills"].items() if v is not None}

    strengths = [
        f"{SKILL_LABELS[k]} is strong ({v:.0f}/100)."
        for k, v in sorted(skills.items(), key=lambda kv: -kv[1])
        if v >= STRONG_AT
    ]

    weak = [
        (k, v)
        for k, v in sorted(skills.items(), key=lambda kv: kv[1])
        if v < WEAK_BELOW
    ]

    improve = [
        f"{SKILL_LABELS[k]} needs work ({v:.0f}/100)." for k, v in weak
    ]

    how = []
    for k, _v in weak:
        for tip in IMPROVE_TIPS[k]:
            how.append(f"{SKILL_LABELS[k]}: {tip}")

    if not strengths and skills:
        best_key = max(skills, key=skills.get)
        strengths.append(
            f"Best area: {SKILL_LABELS[best_key]} "
            f"({skills[best_key]:.0f}/100)."
        )

    if not improve and skills:
        low_key = min(skills, key=skills.get)
        improve.append(
            f"Lowest area: {SKILL_LABELS[low_key]} "
            f"({skills[low_key]:.0f}/100) - keep refining it."
        )
        how.extend(
            f"{SKILL_LABELS[low_key]}: {tip}"
            for tip in IMPROVE_TIPS[low_key]
        )

    counts = Counter(
        e.get("type") for e in data["events"] if e.get("type")
    )

    monitoring = [
        f"{EVENT_LABELS.get(t, t)}: {n} time(s)"
        for t, n in counts.most_common()
        if t not in INFO_EVENTS
    ]

    if data["terminated_reason"]:
        monitoring.insert(
            0,
            f"Interview was STOPPED by monitoring: "
            f"{EVENT_LABELS.get(data['terminated_reason'], data['terminated_reason'])}",
        )

    if not monitoring:
        monitoring.append("No face / eye / tab flags were recorded.")

    return {
        "strengths": strengths or ["Not enough scored answers yet."],
        "improve": improve or ["Not enough scored answers yet."],
        "how": how or ["Not enough scored answers yet."],
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

    skills = {k: v for k, v in data["skills"].items() if v is not None}

    empty = {
        "available": False,
        "strengths": [],
        "weaknesses": [],
        "improvements": [],
        "answer_notes": [],
    }

    if not skills:
        return empty

    strong = [
        k for k, v in sorted(skills.items(), key=lambda kv: -kv[1])
        if v >= STRONG_AT
    ]

    weak = [
        k for k, v in sorted(skills.items(), key=lambda kv: kv[1])
        if v < WEAK_BELOW
    ]

    strengths = [
        f"{SKILL_LABELS[k]}: your answers showed this clearly."
        for k in strong
    ]

    weaknesses = [
        f"{SKILL_LABELS[k]}: this needs more work."
        for k in weak
    ]

    improvements = []

    for k in weak:
        for tip in IMPROVE_TIPS[k]:
            improvements.append(f"{SKILL_LABELS[k]}: {tip}")

    if not strengths:
        best = max(skills, key=skills.get)
        strengths.append(
            f"{SKILL_LABELS[best]}: this was your best area in the interview."
        )

    if not weaknesses:
        low = min(skills, key=skills.get)
        weaknesses.append(
            f"{SKILL_LABELS[low]}: this is the area with the most room to grow."
        )
        for tip in IMPROVE_TIPS[low]:
            improvements.append(f"{SKILL_LABELS[low]}: {tip}")

    notes = [
        {
            "question": item["question"],
            "feedback": str(item["feedback"]).strip(),
        }
        for item in data["qa"]
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


def _styles():
    base = getSampleStyleSheet()

    return {
        "title": ParagraphStyle(
            "title", parent=base["Title"], fontSize=20,
            textColor=INK, alignment=TA_LEFT, spaceAfter=2,
        ),
        "sub": ParagraphStyle(
            "sub", parent=base["Normal"], fontSize=9.5,
            textColor=MUTED, spaceAfter=10,
        ),
        "h2": ParagraphStyle(
            "h2", parent=base["Heading2"], fontSize=13,
            textColor=ACCENT, spaceBefore=12, spaceAfter=5,
        ),
        "body": ParagraphStyle(
            "body", parent=base["Normal"], fontSize=10,
            leading=14, textColor=INK,
        ),
        "small": ParagraphStyle(
            "small", parent=base["Normal"], fontSize=9,
            leading=12, textColor=MUTED,
        ),
        "q": ParagraphStyle(
            "q", parent=base["Normal"], fontSize=10.5,
            leading=14, textColor=INK, fontName="Helvetica-Bold",
        ),
    }


def _bullets(items, style):
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


GAZE_PINK = colors.HexColor("#DB2777")

_LEVEL_COLOR = {
    "HIGH": colors.HexColor("#DC2626"),
    "MEDIUM": colors.HexColor("#F59E0B"),
    "LOW": colors.HexColor("#10B981"),
}


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

    buffer = BytesIO()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=f"Interview report - {data['candidate_name']}",
    )

    story = [
        Paragraph("Candidate Interview Report", st["title"]),
        Paragraph(
            f"{escape(data['interview_title'])} &nbsp;|&nbsp; "
            f"generated {datetime.now().strftime('%d %b %Y, %H:%M')}",
            st["sub"],
        ),
    ]

    # ---------- details ----------
    score = data["overall_score"]
    score_text = f"{score:.1f} / 100" if score is not None else "Not scored"

    status_text = (
        "Stopped by monitoring"
        if data["status"] == "terminated"
        else data["status"].replace("_", " ").title()
    )

    details = Table(
        [
            ["Candidate", escape(data["candidate_name"])],
            ["Email", escape(data["candidate_email"])],
            ["Started", data["started_at"]],
            ["Duration", data["duration"]],
            ["Status", escape(status_text)],
            ["Overall score", score_text],
        ],
        colWidths=[35 * mm, 135 * mm],
    )
    details.setStyle(
        TableStyle(
            [
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("TEXTCOLOR", (0, 0), (0, -1), MUTED),
                ("TEXTCOLOR", (1, 0), (1, -1), INK),
                ("FONTNAME", (1, 5), (1, 5), "Helvetica-Bold"),
                ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story += [details]

    if data["summary"]:
        story += [
            Spacer(1, 6),
            Paragraph(escape(data["summary"]), st["body"]),
        ]

    # ---------- skills ----------
    skill_rows = [["Skill", "Score"]]
    for key, label in SKILL_LABELS.items():
        value = data["skills"].get(key)
        skill_rows.append(
            [label, f"{value:.0f} / 100" if value is not None else "-"]
        )

    skill_table = Table(skill_rows, colWidths=[85 * mm, 40 * mm])
    skill_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), INK),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("GRID", (0, 0), (-1, -1), 0.4, LINE),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )

    story += [Paragraph("Skill scores", st["h2"]), skill_table]

    # ---------- bullet sections ----------
    for title, key in (
        ("Strengths", "strengths"),
        ("Areas to improve", "improve"),
        ("How to improve", "how"),
        ("Monitoring summary (face / eye detection)", "monitoring"),
    ):
        story += [
            KeepTogether(
                [
                    Paragraph(title, st["h2"]),
                    _bullets(ana[key], st["body"]),
                ]
            )
        ]

    # ---------- eye movement (interviewer only) ----------
    story += _gaze_story(data.get("gaze"), st)

    # ---------- question by question ----------
    story += [Paragraph("Question-by-question feedback", st["h2"])]

    if not data["qa"]:
        story += [Paragraph("No questions were recorded.", st["body"])]

    for index, item in enumerate(data["qa"], start=1):
        label = "Follow-up" if item["is_follow_up"] else f"Q{index}"
        score_part = (
            f" &nbsp;<font color='#6D3BEA'>[{item['overall']:.0f}/100]</font>"
            if item["overall"] is not None
            else ""
        )

        block = [
            Paragraph(
                f"{label}: {escape(item['question'])}{score_part}",
                st["q"],
            ),
            Spacer(1, 2),
        ]

        answer = (item["answer"] or "").strip()
        if len(answer) > 500:
            answer = answer[:500].rstrip() + "..."

        bullets = [f"Answer: {answer or 'Not answered'}"]

        if item["feedback"]:
            bullets.append(f"Feedback: {item['feedback']}")

        block += [_bullets(bullets, st["small"]), Spacer(1, 8)]

        story.append(KeepTogether(block))

    doc.build(story)

    return buffer.getvalue()


def build_report_pdf_for_session(db: Session, session_id) -> tuple[bytes, str]:
    """Returns (pdf_bytes, filename)."""

    data = collect_report_data(db, session_id)
    pdf = build_report_pdf(data)

    safe = "".join(
        c if c.isalnum() else "_" for c in data["candidate_name"]
    ).strip("_") or "candidate"

    return pdf, f"interview_report_{safe}.pdf"