from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.session import InterviewSession
from app.models.question import Question
from app.models.answer import Answer
from app.models.interview_config import InterviewConfiguration
from app.models.score import Score
from app.models.feedback import Feedback

from app.schemas.answer import AnswerCreate
from app.schemas.evaluation import (
    EvaluationResponse,
    NextQuestionResponse,
)

from app.services.evaluation_service import evaluate_answer
from app.services.interview_service import (
    get_main_question,
    get_main_question_number,
    move_to_next_question,
)
import time

MAX_FOLLOW_UPS = 2


def process_answer(
    db: Session,
    answer_data: AnswerCreate,
    candidate_id: UUID,
) -> EvaluationResponse:
    """
    Process a candidate's interview answer.

    This function contains the core answer-processing business logic
    and can be called from:

    1. Normal REST API -> /answers
    2. Dialogflow CX webhook -> /dialogflow/webhook

    The candidate_id is supplied by the caller so that the same
    business logic can be reused by both entry points.
    """

    try:
        # =========================================================
        # 1. Find interview session belonging to this candidate
        # =========================================================

        session = (
            db.query(InterviewSession)
            .filter(
                InterviewSession.id == answer_data.session_id,
                InterviewSession.candidate_id == candidate_id,
            )
            .first()
        )

        if session is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Interview session not found",
            )

        # =========================================================
        # 2. Make sure interview is active
        # =========================================================

        if session.status != "in_progress":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Interview session is not active",
            )

        # =========================================================
        # 3. Find question
        # =========================================================

        question = (
            db.query(Question)
            .filter(
                Question.id == answer_data.question_id,
                Question.session_id == answer_data.session_id,
            )
            .first()
        )

        if question is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Question not found for this session",
            )

        # =========================================================
        # 4. Make sure submitted question is current question
        # =========================================================

        if question.question_order != session.current_question:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This is not the current interview question",
            )

        # =========================================================
        # 5. Validate answer
        # =========================================================

        if not answer_data.answer_text and not answer_data.audio_url:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Either answer_text or audio_url must be provided",
            )

        # =========================================================
        # 6. Prevent duplicate answer
        # =========================================================

        existing_answer = (
            db.query(Answer)
            .filter(
                Answer.session_id == answer_data.session_id,
                Answer.question_id == answer_data.question_id,
            )
            .first()
        )

        if existing_answer:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This question has already been answered",
            )

        # =========================================================
        # 7. Get interview configuration
        # =========================================================

        configuration = (
            db.query(InterviewConfiguration)
            .filter(
                InterviewConfiguration.interview_id
                == session.interview_id
            )
            .first()
        )

        if configuration is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Interview configuration not found",
            )

        # =========================================================
        # 8. Answer text is required for GPT evaluation
        # =========================================================

        if not answer_data.answer_text:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Answer text is required for evaluation",
            )

        # =========================================================
        # 9. Evaluate answer using GPT-4.1
        # =========================================================

        evaluation_start = time.time()

        evaluation = evaluate_answer(
           question=question.question,
           answer=answer_data.answer_text,
           difficulty=configuration.difficulty,
           knowledge_expectation=configuration.knowledge_expectation,
        )

        evaluation_time = time.time() - evaluation_start

        print(f"⏱️ GPT evaluation time: {evaluation_time:.2f} seconds")

        # =========================================================
        # 10. Save answer
        # =========================================================

        answer = Answer(
            session_id=answer_data.session_id,
            question_id=answer_data.question_id,
            answer_text=answer_data.answer_text,
            audio_url=answer_data.audio_url,
        )

        db.add(answer)
        db.flush()

        # =========================================================
        # 11. Save score
        # =========================================================

        score = Score(
            answer_id=answer.id,
            relevance=evaluation["relevance"],
            accuracy=evaluation["accuracy"],
            technical_knowledge=evaluation["technical_knowledge"],
            completeness=evaluation["completeness"],
            communication=evaluation["communication"],
            overall_score=evaluation["overall_score"],
        )

        db.add(score)

        # =========================================================
        # 12. Save feedback
        # =========================================================

        feedback = Feedback(
            answer_id=answer.id,
            feedback_text=evaluation["feedback_text"],
            follow_up_required=evaluation["follow_up_required"],
            follow_up_question=evaluation.get("follow_up_question"),
        )

        db.add(feedback)

        # =========================================================
        # 13. Determine next action
        # =========================================================

        next_action = "complete"
        next_question_response = None

        # =========================================================
        # CASE A: Follow-up required
        # =========================================================

        if evaluation["follow_up_required"]:

            # -----------------------------------------------------
            # Count follow-ups belonging to the original main question
            # -----------------------------------------------------

            main_question = get_main_question(db=db, question=question)
            follow_up_count = (
                db.query(Question)
                .filter(
                    Question.session_id == session.id,
                    Question.parent_question_id == main_question.id,
                    Question.type == "follow_up",
                )
                .count()
            )

            # -----------------------------------------------------
            # Maximum follow-ups reached
            # -----------------------------------------------------

            if follow_up_count >= MAX_FOLLOW_UPS:

                next_question = move_to_next_question(
                    db=db,
                    session_id=session.id,
                )

                if next_question is not None:

                    next_action = "next_question"

                    next_question_response = NextQuestionResponse(
                        id=next_question.id,
                        question=next_question.question,
                        category=next_question.category,
                        difficulty=next_question.difficulty,
                        type=next_question.type,
                        question_order=get_main_question_number(
                            db=db,
                            question=next_question,
                        ),
                    )

                else:

                    session.status = "completed"
                    session.ended_at = datetime.now(timezone.utc)

                    next_action = "complete"

            # -----------------------------------------------------
            # Create follow-up question
            # -----------------------------------------------------

            else:

                follow_up_question_text = evaluation.get(
                    "follow_up_question"
                )

                if not follow_up_question_text:

                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail=(
                            "Follow-up was required but no follow-up "
                            "question was generated"
                        ),
                    )

                # -------------------------------------------------
                # Shift future questions
                # -------------------------------------------------

                future_questions = (
                    db.query(Question)
                    .filter(
                        Question.session_id == session.id,
                        Question.question_order
                        > question.question_order,
                    )
                    .order_by(
                        Question.question_order.asc()
                    )
                    .all()
                )

                # Temporarily make orders negative to avoid
                # unique-order conflicts while shifting.
                for existing_question in future_questions:
                    existing_question.question_order = (
                        -existing_question.question_order
                    )

                db.flush()

                # Move future questions one position forward.
                for existing_question in future_questions:
                    existing_question.question_order = (
                        abs(existing_question.question_order) + 1
                    )

                db.flush()

                # -------------------------------------------------
                # Create follow-up question
                # -------------------------------------------------

                follow_up_question = Question(
                    session_id=session.id,
                    parent_question_id=main_question.id,
                    question=follow_up_question_text,
                    category=question.category,
                    difficulty=question.difficulty,
                    type="follow_up",
                    question_order=question.question_order + 1,
                )

                db.add(follow_up_question)
                db.flush()

                # Make follow-up the current question.
                session.current_question = (
                    question.question_order + 1
                )

                next_action = "follow_up"

                next_question_response = NextQuestionResponse(
                    id=follow_up_question.id,
                    question=follow_up_question.question,
                    category=follow_up_question.category,
                    difficulty=follow_up_question.difficulty,
                    type=follow_up_question.type,
                    question_order=get_main_question_number(
                        db=db,
                        question=follow_up_question,
                    ),
                )

        # =========================================================
        # CASE B: No follow-up -> move to next question
        # =========================================================

        else:

            next_question = move_to_next_question(
                db=db,
                session_id=session.id,
            )

            if next_question is not None:

                next_action = "next_question"

                next_question_response = NextQuestionResponse(
                    id=next_question.id,
                    question=next_question.question,
                    category=next_question.category,
                    difficulty=next_question.difficulty,
                    type=next_question.type,
                    question_order=get_main_question_number(
                        db=db,
                        question=next_question,
                    ),
                )

            # =====================================================
            # CASE C: No next question -> complete interview
            # =====================================================

            else:

                session.status = "completed"
                session.ended_at = datetime.now(timezone.utc)

                next_action = "complete"

        # =========================================================
        # 14. Commit everything together
        # =========================================================

        db.commit()

        # =========================================================
        # 15. Refresh answer
        # =========================================================

        db.refresh(answer)

        # =========================================================
        # 16. Return evaluation + next action
        # =========================================================

        return EvaluationResponse(
            answer_id=answer.id,

            relevance=evaluation["relevance"],
            accuracy=evaluation["accuracy"],
            technical_knowledge=evaluation["technical_knowledge"],
            completeness=evaluation["completeness"],
            communication=evaluation["communication"],
            overall_score=evaluation["overall_score"],

            feedback_text=evaluation["feedback_text"],
            follow_up_required=evaluation["follow_up_required"],
            follow_up_question=evaluation.get(
                "follow_up_question"
            ),

            next_action=next_action,
            next_question=next_question_response,
        )

    # =============================================================
    # HTTP errors
    # =============================================================

    except HTTPException:
        db.rollback()
        raise

    # =============================================================
    # Unexpected errors
    # =============================================================

    except Exception as e:

        db.rollback()

        print("❌ PROCESS ANSWER ERROR:")
        print(str(e))

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process interview answer",
        )