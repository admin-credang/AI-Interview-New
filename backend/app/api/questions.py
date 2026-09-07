from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.api.auth.dependencies import get_current_user

from app.models.user import User
from app.models.interview import Interview
from app.models.session import InterviewSession
from app.models.interview_config import InterviewConfiguration
from app.models.question import Question

from app.schemas.question import QuestionResponse

from app.services.question_generator import generate_questions


router = APIRouter(
    prefix="/interviews",
    tags=["Questions"]
)


@router.post(
    "/{interview_id}/sessions/{session_id}/questions",
    response_model=list[QuestionResponse],
    status_code=status.HTTP_201_CREATED
)
def generate_session_questions(
    interview_id: UUID,
    session_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # 1. Only candidates can generate questions for their session
    if current_user.role != "candidate":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only candidates can generate interview questions"
        )

    # 2. Check interview exists
    interview = (
        db.query(Interview)
        .filter(
            Interview.id == interview_id
        )
        .first()
    )

    if interview is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview not found"
        )

    # 3. Check session belongs to this interview and candidate
    session = (
        db.query(InterviewSession)
        .filter(
            InterviewSession.id == session_id,
            InterviewSession.interview_id == interview_id,
            InterviewSession.candidate_id == current_user.id
        )
        .first()
    )

    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview session not found"
        )

    # 4. Session must be active
    if session.status != "in_progress":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Interview session is not active"
        )

    # 5. Check whether questions already exist
    existing_questions = (
        db.query(Question)
        .filter(
            Question.session_id == session_id
        )
        .order_by(
            Question.question_order.asc()
        )
        .all()
    )

    if existing_questions:
        return existing_questions

    # 6. Get interview configuration
    configuration = (
        db.query(InterviewConfiguration)
        .filter(
            InterviewConfiguration.interview_id == interview_id
        )
        .first()
    )

    if configuration is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview configuration not found"
        )

    # 7. Generate questions using GPT-4.1
    try:
        generated_questions = generate_questions(
            interview_title=interview.title,
            interview_description=interview.description,
            difficulty=configuration.difficulty,
            knowledge_expectation=configuration.knowledge_expectation,
            construct_from_answers=configuration.construct_from_answers,
            extra_config=configuration.extra_config
        )

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Question generation failed: {str(e)}"
        )

    # 8. Validate GPT output
    if not generated_questions:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No questions were generated"
        )

    # 9. Save questions to database
    questions = []

    for index, item in enumerate(generated_questions, start=1):
        question = Question(
            session_id=session_id,
            question=item["question"],
            category=item["category"],
            difficulty=item["difficulty"],
            type=item["type"],
            question_order=index
        )

        db.add(question)
        questions.append(question)

    db.commit()

    # 10. Refresh database objects
    for question in questions:
        db.refresh(question)

    return questions