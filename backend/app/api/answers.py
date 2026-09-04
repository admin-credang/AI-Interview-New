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
    # ---------------------------------------------------------
    # 1. Only candidates can submit answers
    # ---------------------------------------------------------

    if current_user.role != "candidate":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only candidates can submit answers"
        )

    # ---------------------------------------------------------
    # 2. Find the interview session
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
    # 4. Find the question
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
    # 5. Validate answer
    # ---------------------------------------------------------

    if not answer_data.answer_text and not answer_data.audio_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either answer_text or audio_url must be provided"
        )

    # ---------------------------------------------------------
    # 6. Prevent duplicate answer
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
    # 7. Save candidate answer
    # ---------------------------------------------------------

    answer = Answer(
        session_id=answer_data.session_id,
        question_id=answer_data.question_id,
        answer_text=answer_data.answer_text,
        audio_url=answer_data.audio_url
    )

    db.add(answer)
    db.commit()
    db.refresh(answer)

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
    # 9. Evaluate answer using GPT-4.1
    # ---------------------------------------------------------

    if not answer.answer_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Answer text is required for evaluation"
        )

    evaluation = evaluate_answer(
        question=question.question,
        answer=answer.answer_text,
        difficulty=configuration.difficulty,
        knowledge_expectation=configuration.knowledge_expectation
    )

    # ---------------------------------------------------------
    # 10. Save score
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
    # 11. Save feedback
    # ---------------------------------------------------------

    feedback = Feedback(
        answer_id=answer.id,
        feedback_text=evaluation["feedback_text"],
        follow_up_required=evaluation["follow_up_required"],
        follow_up_question=evaluation.get("follow_up_question")
    )

    db.add(feedback)

    # ---------------------------------------------------------
    # 12. Decide what happens next
    # ---------------------------------------------------------

    next_action = "complete"
    next_question_response = None

    # ---------------------------------------------------------
    # CASE A: GPT requires a follow-up question
    # ---------------------------------------------------------

    if evaluation["follow_up_required"]:

        next_action = "follow_up"

        # Follow-up is currently returned directly by GPT.
        # It is not yet stored as a Question.
        next_question_response = None

    # ---------------------------------------------------------
    # CASE B: No follow-up → move to next question
    # ---------------------------------------------------------

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

            from datetime import datetime, timezone

            session.ended_at = datetime.now(timezone.utc)

            next_action = "complete"

    # ---------------------------------------------------------
    # 13. Save all changes
    # ---------------------------------------------------------

    db.commit()

    # ---------------------------------------------------------
    # 14. Return evaluation + next action
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
        follow_up_question=evaluation.get("follow_up_question"),

        next_action=next_action,
        next_question=next_question_response
    )