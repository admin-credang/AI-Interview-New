from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.session import InterviewSession
from app.models.question import Question
from app.models.answer import Answer


# =========================================================
# GET MAIN QUESTION
# =========================================================

def get_main_question(
    db: Session,
    question: Question,
) -> Question:
    """
    Return the main/root question.

    If the supplied question is already a main question,
    return it directly.

    If it is a follow-up question,
    resolve and return its parent main question.
    """

    # -----------------------------------------------------
    # Already a main question
    # -----------------------------------------------------

    if question.parent_question_id is None:
        return question

    # -----------------------------------------------------
    # Follow-up -> parent/main question
    # -----------------------------------------------------

    main_question = (
        db.query(Question)
        .filter(
            Question.id == question.parent_question_id,

            Question.session_id
            == question.session_id,

            Question.parent_question_id.is_(None),
        )
        .first()
    )

    if main_question is None:

        raise ValueError(
            "Main question not found for the current question."
        )

    return main_question


# =========================================================
# GET MAIN QUESTION NUMBER
# =========================================================

def get_main_question_number(
    db: Session,
    question: Question,
) -> int:
    """
    Return the 1-based position of the main question.

    Follow-up questions do not affect numbering.
    """

    main_question = get_main_question(
        db=db,
        question=question,
    )

    question_number = (
        db.query(Question)
        .filter(
            Question.session_id
            == main_question.session_id,

            Question.parent_question_id.is_(None),

            Question.question_order
            <= main_question.question_order,
        )
        .count()
    )

    return int(question_number)


# =========================================================
# GET CURRENT MAIN QUESTION
# =========================================================

def get_current_question(
    db: Session,
    session_id: UUID,
) -> Optional[Question]:
    """
    Return the current MAIN question.

    Follow-up questions are intentionally excluded.

    IMPORTANT:
    This function only READS the current pointer.
    It never advances the interview.
    """

    # -----------------------------------------------------
    # Find session
    # -----------------------------------------------------

    session = (
        db.query(InterviewSession)
        .filter(
            InterviewSession.id == session_id
        )
        .first()
    )

    if session is None:

        raise ValueError(
            "Interview session not found."
        )

    # -----------------------------------------------------
    # Current question number
    # -----------------------------------------------------

    current_question_number = (
        session.current_question or 1
    )

    current_question_number = max(
        1,
        int(current_question_number),
    )

    # -----------------------------------------------------
    # Find MAIN question only
    # -----------------------------------------------------

    question = (
        db.query(Question)
        .filter(
            Question.session_id == session_id,

            Question.parent_question_id.is_(None),

            Question.question_order
            == current_question_number,
        )
        .first()
    )

    return question


# =========================================================
# MOVE TO NEXT MAIN QUESTION
# =========================================================

def move_to_next_question(
    db: Session,
    session_id: UUID,
) -> Optional[Question]:
    """
    Move the interview pointer to the next MAIN question.

    Follow-up questions NEVER modify current_question.

    IMPORTANT:
    This function assumes that the current question has
    already been successfully answered.

    The answer_service controls whether this function
    should be called.
    """

    # -----------------------------------------------------
    # Find session
    # -----------------------------------------------------

    session = (
        db.query(InterviewSession)
        .filter(
            InterviewSession.id == session_id
        )
        .first()
    )

    if session is None:

        raise ValueError(
            "Interview session not found."
        )

    # -----------------------------------------------------
    # Current question number
    # -----------------------------------------------------

    current_order = (
        session.current_question or 1
    )

    current_order = max(
        1,
        int(current_order),
    )

    # =====================================================
    # SAFETY:
    # Current pointer must refer to a MAIN question.
    # =====================================================

    current_main_question = (
        db.query(Question)
        .filter(
            Question.session_id == session_id,

            Question.parent_question_id.is_(None),

            Question.question_order
            == current_order,
        )
        .first()
    )

    if current_main_question is None:

        # No current main question exists.
        #
        # Do NOT randomly jump to another question.
        return None

    # -----------------------------------------------------
    # IMPORTANT:
    # Verify current main question was answered.
    #
    # This prevents accidental:
    #
    # Q1
    # ↓
    # move_to_next_question()
    # ↓
    # Q2
    #
    # without an answer.
    # -----------------------------------------------------

    current_answer = (
        db.query(Answer)
        .filter(
            Answer.session_id == session_id,

            Answer.question_id
            == current_main_question.id,
        )
        .first()
    )

    if current_answer is None:

        # Candidate has NOT answered the current
        # main question.
        #
        # NEVER advance.

        print()
        print("=" * 70)
        print("QUESTION POINTER PROTECTION")
        print("=" * 70)

        print(
            "Current main question is unanswered."
        )

        print(
            f"Current question order: "
            f"{current_order}"
        )

        print(
            "Interview will NOT advance."
        )

        print("=" * 70)

        return current_main_question

    # -----------------------------------------------------
    # Next main question number
    # -----------------------------------------------------

    next_order = current_order + 1

    # -----------------------------------------------------
    # Find NEXT MAIN question
    # -----------------------------------------------------

    next_question = (
        db.query(Question)
        .filter(
            Question.session_id == session_id,

            # IMPORTANT:
            # Follow-ups are never returned here.
            Question.parent_question_id.is_(None),

            Question.question_order == next_order,
        )
        .first()
    )

    # -----------------------------------------------------
    # No next main question
    # -----------------------------------------------------

    if next_question is None:

        # -------------------------------------------------
        # Move pointer beyond final question.
        #
        # Example:
        #
        # Q5 completed
        # current_question = 5
        #
        # next_order = 6
        #
        # No Q6 exists.
        #
        # Setting pointer to 6 allows
        # is_interview_complete() to return True.
        # -------------------------------------------------

        session.current_question = next_order

        return None

    # -----------------------------------------------------
    # Safety:
    # Never return a follow-up.
    # -----------------------------------------------------

    if next_question.parent_question_id is not None:

        raise ValueError(
            "Invalid next question: "
            "follow-up question cannot be used "
            "as the next main question."
        )

    # -----------------------------------------------------
    # Move session pointer
    # -----------------------------------------------------

    session.current_question = (
        next_question.question_order
    )

    # -----------------------------------------------------
    # DO NOT COMMIT HERE
    #
    # process_answer() owns the transaction.
    # -----------------------------------------------------

    return next_question


# =========================================================
# CHECK INTERVIEW COMPLETION
# =========================================================

def is_interview_complete(
    db: Session,
    session_id: UUID,
) -> bool:
    """
    Determine whether all generated MAIN questions
    have been completed.

    Follow-up questions do not affect main question count.
    """

    # -----------------------------------------------------
    # Find session
    # -----------------------------------------------------

    session = (
        db.query(InterviewSession)
        .filter(
            InterviewSession.id == session_id
        )
        .first()
    )

    if session is None:

        raise ValueError(
            "Interview session not found."
        )

    # -----------------------------------------------------
    # Count MAIN questions only
    # -----------------------------------------------------

    question_count = (
        db.query(Question)
        .filter(
            Question.session_id == session_id,

            Question.parent_question_id.is_(None),
        )
        .count()
    )

    # -----------------------------------------------------
    # No questions generated
    # -----------------------------------------------------

    if question_count == 0:
        return False

    # -----------------------------------------------------
    # Current main question pointer
    # -----------------------------------------------------

    current_question = (
        session.current_question or 1
    )

    current_question = max(
        1,
        int(current_question),
    )

    # -----------------------------------------------------
    # Completed when pointer is beyond last main question.
    #
    # Example:
    #
    # Total = 5
    # current_question = 6
    #
    # => completed
    # -----------------------------------------------------

    return current_question > question_count


# =========================================================
# GET TOTAL MAIN QUESTIONS
# =========================================================

def get_total_main_questions(
    db: Session,
    session_id: UUID,
) -> int:
    """
    Return total number of MAIN questions.

    Follow-up questions are excluded.
    """

    return int(
        db.query(Question)
        .filter(
            Question.session_id == session_id,

            Question.parent_question_id.is_(None),
        )
        .count()
    )


# =========================================================
# GET QUESTION BY ORDER
# =========================================================

def get_question_by_order(
    db: Session,
    session_id: UUID,
    question_order: int,
) -> Optional[Question]:
    """
    Return a MAIN question by its question order.
    """

    if question_order < 1:
        return None

    return (
        db.query(Question)
        .filter(
            Question.session_id == session_id,

            Question.parent_question_id.is_(None),

            Question.question_order
            == question_order,
        )
        .first()
    )


# =========================================================
# GET CURRENT QUESTION NUMBER
# =========================================================

def get_current_question_number(
    db: Session,
    session_id: UUID,
) -> int:
    """
    Return the current MAIN question number.
    """

    session = (
        db.query(InterviewSession)
        .filter(
            InterviewSession.id == session_id
        )
        .first()
    )

    if session is None:

        raise ValueError(
            "Interview session not found."
        )

    current_question = (
        session.current_question or 1
    )

    current_question = max(
        1,
        int(current_question),
    )

    return current_question