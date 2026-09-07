from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID

from app.database import get_db
from app.models.user import User
from app.models.session import InterviewSession
from app.models.question import Question
from app.models.answer import Answer
from app.models.interview_config import InterviewConfiguration
from app.models.score import Score
from app.models.feedback import Feedback

from app.schemas.answer import AnswerCreate
from app.schemas.evaluation import (
    EvaluationResponse,
    NextQuestionResponse
)

from app.api.auth.dependencies import get_current_user
from app.services.evaluation_service import evaluate_answer
from app.services.interview_service import move_to_next_question


MAX_FOLLOW_UPS = 2

router = APIRouter(
    prefix="/answers",
    tags=["Answers"]
)


@router.post(
    "",
    response_model=EvaluationResponse,
    status_code=status.HTTP_201_CREATED
)
def submit_answer(
    answer_data: AnswerCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    print("🔥🔥🔥 NEW SUBMIT_ANSWER FUNCTION CALLED 🔥🔥🔥")

    try:

        # ---------------------------------------------------------
        # 1. Only candidates can submit answers
        # ---------------------------------------------------------

        if current_user.role != "candidate":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only candidates can submit answers"
            )

        # ---------------------------------------------------------
        # 2. Find interview session
        # ---------------------------------------------------------

        session = (
            db.query(InterviewSession)
            .filter(
                InterviewSession.id == answer_data.session_id,
                InterviewSession.candidate_id == current_user.id
            )
            .first()
        )

        if session is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Interview session not found"
            )

        # ---------------------------------------------------------
        # 3. Make sure interview is active
        # ---------------------------------------------------------

        if session.status != "in_progress":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Interview session is not active"
            )

        # ---------------------------------------------------------
        # 4. Find question
        # ---------------------------------------------------------

        question = (
            db.query(Question)
            .filter(
                Question.id == answer_data.question_id,
                Question.session_id == answer_data.session_id
            )
            .first()
        )

        if question is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Question not found for this session"
            )

        # ---------------------------------------------------------
        # 5. Make sure submitted question is current question
        # ---------------------------------------------------------

        if question.question_order != session.current_question:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This is not the current interview question"
            )

        # ---------------------------------------------------------
        # 6. Validate answer
        # ---------------------------------------------------------

        if not answer_data.answer_text and not answer_data.audio_url:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Either answer_text or audio_url must be provided"
            )

        # ---------------------------------------------------------
        # 7. Prevent duplicate answer
        # ---------------------------------------------------------

        existing_answer = (
            db.query(Answer)
            .filter(
                Answer.session_id == answer_data.session_id,
                Answer.question_id == answer_data.question_id
            )
            .first()
        )

        if existing_answer:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This question has already been answered"
            )

        # ---------------------------------------------------------
        # 8. Get interview configuration
        # ---------------------------------------------------------

        configuration = (
            db.query(InterviewConfiguration)
            .filter(
                InterviewConfiguration.interview_id == session.interview_id
            )
            .first()
        )

        if configuration is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Interview configuration not found"
            )

        # ---------------------------------------------------------
        # 9. Answer text is required for GPT evaluation
        # ---------------------------------------------------------

        if not answer_data.answer_text:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Answer text is required for evaluation"
            )

        # ---------------------------------------------------------
        # 10. Evaluate answer using GPT-4.1
        # ---------------------------------------------------------

        evaluation = evaluate_answer(
            question=question.question,
            answer=answer_data.answer_text,
            difficulty=configuration.difficulty,
            knowledge_expectation=configuration.knowledge_expectation
        )

        # ---------------------------------------------------------
        # 11. Save answer
        # ---------------------------------------------------------

        answer = Answer(
            session_id=answer_data.session_id,
            question_id=answer_data.question_id,
            answer_text=answer_data.answer_text,
            audio_url=answer_data.audio_url
        )

        db.add(answer)
        db.flush()

        # ---------------------------------------------------------
        # 12. Save score
        # ---------------------------------------------------------

        score = Score(
            answer_id=answer.id,
            relevance=evaluation["relevance"],
            accuracy=evaluation["accuracy"],
            technical_knowledge=evaluation["technical_knowledge"],
            completeness=evaluation["completeness"],
            communication=evaluation["communication"],
            overall_score=evaluation["overall_score"]
        )

        db.add(score)

        # ---------------------------------------------------------
        # 13. Save feedback
        # ---------------------------------------------------------

        feedback = Feedback(
            answer_id=answer.id,
            feedback_text=evaluation["feedback_text"],
            follow_up_required=evaluation["follow_up_required"],
            follow_up_question=evaluation.get("follow_up_question")
        )

        db.add(feedback)

        # ---------------------------------------------------------
        # 14. Decide next action
        # ---------------------------------------------------------

        next_action = "complete"
        next_question_response = None

        # =========================================================
        # CASE A: Follow-up required
        # =========================================================

        if evaluation["follow_up_required"]:

            # -----------------------------------------------------
            # Count consecutive follow-ups before current question
            # -----------------------------------------------------

            follow_up_count = 0
            previous_order = question.question_order - 1

            while previous_order > 0:

                previous_question = (
                    db.query(Question)
                    .filter(
                        Question.session_id == session.id,
                        Question.question_order == previous_order
                    )
                    .first()
                )

                if previous_question is None:
                    break

                if previous_question.type != "follow_up":
                    break

                previous_answer = (
                    db.query(Answer)
                    .filter(
                        Answer.session_id == session.id,
                        Answer.question_id == previous_question.id
                    )
                    .first()
                )

                if previous_answer is None:
                    break

                follow_up_count += 1
                previous_order -= 1

            # -----------------------------------------------------
            # Maximum follow-ups reached
            # -----------------------------------------------------

            if follow_up_count >= MAX_FOLLOW_UPS:

                next_question = move_to_next_question(
                    db=db,
                    session_id=session.id
                )

                if next_question is not None:

                    next_action = "next_question"

                    next_question_response = NextQuestionResponse(
                        id=next_question.id,
                        question=next_question.question,
                        category=next_question.category,
                        difficulty=next_question.difficulty,
                        type=next_question.type,
                        question_order=next_question.question_order
                    )

                else:

                    session.status = "completed"
                    session.ended_at = datetime.now(timezone.utc)

                    next_action = "complete"

            # -----------------------------------------------------
            # Follow-up limit not reached → create follow-up
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
                        )
                    )

                # -------------------------------------------------
                # Shift future questions
                # -------------------------------------------------

                future_questions = (
                    db.query(Question)
                    .filter(
                        Question.session_id == session.id,
                        Question.question_order > question.question_order
                    )
                    .order_by(
                        Question.question_order.asc()
                    )
                    .all()
                )

                for existing_question in future_questions:
                    existing_question.question_order = (
                        -existing_question.question_order
                    )

                db.flush()

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
                    question=follow_up_question_text,
                    category=question.category,
                    difficulty=question.difficulty,
                    type="follow_up",
                    question_order=question.question_order + 1
                )

                db.add(follow_up_question)
                db.flush()

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
                    question_order=follow_up_question.question_order
                )

        # =========================================================
        # CASE B: No follow-up → move to next question
        # =========================================================

        else:

            next_question = move_to_next_question(
                db=db,
                session_id=session.id
            )

            if next_question is not None:

                next_action = "next_question"

                next_question_response = NextQuestionResponse(
                    id=next_question.id,
                    question=next_question.question,
                    category=next_question.category,
                    difficulty=next_question.difficulty,
                    type=next_question.type,
                    question_order=next_question.question_order
                )

            # -----------------------------------------------------
            # CASE C: No next question → interview complete
            # -----------------------------------------------------

            else:

                session.status = "completed"
                session.ended_at = datetime.now(timezone.utc)

                next_action = "complete"

        # ---------------------------------------------------------
        # 15. Commit EVERYTHING together
        # ---------------------------------------------------------

        db.commit()

        # ---------------------------------------------------------
        # 16. Refresh answer
        # ---------------------------------------------------------

        db.refresh(answer)

        # ---------------------------------------------------------
        # 17. Return evaluation + next action
        # ---------------------------------------------------------

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
            next_question=next_question_response
        )

    except HTTPException:
        db.rollback()
        raise

    except Exception as e:
        db.rollback()

        print("❌ SUBMIT ANSWER ERROR:")
        print(str(e))

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process interview answer"
        )