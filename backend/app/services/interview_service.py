from uuid import UUID
from sqlalchemy.orm import Session

from app.models.session import InterviewSession
from app.models.question import Question


def get_main_question(
    db: Session,
    question: Question
) -> Question:
    if question.parent_question_id is None:
        return question

    main_question = (
        db.query(Question)
        .filter(
            Question.id == question.parent_question_id,
            Question.session_id == question.session_id,
        )
        .first()
    )

    if main_question is None:
        raise ValueError("Main question not found")

    return main_question


def get_main_question_number(
    db: Session,
    question: Question
) -> int:
    main_question = get_main_question(db=db, question=question)

    return (
        db.query(Question)
        .filter(
            Question.session_id == main_question.session_id,
            Question.parent_question_id.is_(None),
            Question.question_order <= main_question.question_order,
        )
        .count()
    )


def get_current_question(
    db: Session,
    session_id: UUID
) -> Question:

    session = (
        db.query(InterviewSession)
        .filter(
            InterviewSession.id == session_id
        )
        .first()
    )

    if session is None:
        raise ValueError("Interview session not found")

    question = (
        db.query(Question)
        .filter(
            Question.session_id == session_id,
            Question.question_order == session.current_question
        )
        .first()
    )

    if question is None:
        raise ValueError("Current question not found")

    return question


def move_to_next_question(
    db: Session,
    session_id: UUID
) -> Question | None:

    session = (
        db.query(InterviewSession)
        .filter(
            InterviewSession.id == session_id
        )
        .first()
    )

    if session is None:
        raise ValueError("Interview session not found")

    # Find the next question based on the current question order
    next_order = session.current_question + 1

    next_question = (
        db.query(Question)
        .filter(
            Question.session_id == session_id,
            Question.question_order == next_order
        )
        .first()
    )

    # No next question means the interview is complete.
    if next_question is None:
        return None

    # Move session to the next question.
    session.current_question = next_order

    # Do not commit here.
    # The caller should commit the complete transaction
    # containing answer + score + feedback + session update.

    return next_question


def is_interview_complete(
    db: Session,
    session_id: UUID
) -> bool:

    session = (
        db.query(InterviewSession)
        .filter(
            InterviewSession.id == session_id
        )
        .first()
    )

    if session is None:
        raise ValueError("Interview session not found")

    question_count = (
        db.query(Question)
        .filter(
            Question.session_id == session_id
        )
        .count()
    )

    return session.current_question >= question_count