from decimal import Decimal
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.session import InterviewSession
from app.models.answer import Answer
from app.models.score import Score
from app.models.feedback import Feedback
from app.models.report import Report


def generate_interview_report(
    db: Session,
    session_id: UUID
) -> Report:

    session = (
        db.query(InterviewSession)
        .filter(
            InterviewSession.id == session_id
        )
        .first()
    )

    if session is None:
        raise ValueError("Interview session not found")

    answers = (
        db.query(Answer)
        .filter(
            Answer.session_id == session_id
        )
        .all()
    )

    if not answers:
        raise ValueError("No answers found for this interview")

    scores = []

    for answer in answers:

        score = (
            db.query(Score)
            .filter(
                Score.answer_id == answer.id
            )
            .first()
        )

        if score and score.overall_score is not None:
            scores.append(float(score.overall_score))

    if not scores:
        raise ValueError("No scores found for this interview")

    overall_score = round(
        sum(scores) / len(scores),
        2
    )

    feedback_items = []

    for answer in answers:

        feedback = (
            db.query(Feedback)
            .filter(
                Feedback.answer_id == answer.id
            )
            .first()
        )

        if feedback:
            feedback_items.append(
                feedback.feedback_text
            )

    summary = (
        f"The candidate completed the interview with an "
        f"overall score of {overall_score}/10 across "
        f"{len(answers)} answered questions. "
    )

    if feedback_items:
        summary += (
            "The evaluation indicates that the candidate "
            "demonstrated relevant knowledge and communication "
            "skills, with individual areas for improvement "
            "identified in the answer feedback."
        )

    existing_report = (
        db.query(Report)
        .filter(
            Report.session_id == session_id
        )
        .first()
    )

    if existing_report:

        existing_report.overall_score = Decimal(
            str(overall_score)
        )

        existing_report.summary = summary

        db.commit()
        db.refresh(existing_report)

        return existing_report

    report = Report(
        session_id=session_id,
        overall_score=Decimal(
            str(overall_score)
        ),
        summary=summary
    )

    db.add(report)

    db.commit()
    db.refresh(report)

    return report