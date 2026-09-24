from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
)
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User

from app.schemas.answer import AnswerCreate
from app.schemas.evaluation import EvaluationResponse

from app.api.auth.dependencies import get_current_user
from app.services.answer_service import process_answer


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
    """
    Submit a candidate answer for evaluation.

    Authentication and candidate authorization are handled here.
    The actual interview-answer business logic is handled by
    answer_service.process_answer() so it can also be reused
    by the Dialogflow CX webhook.
    """

    if current_user.role != "candidate":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only candidates can submit answers"
        )

    return process_answer(
        db=db,
        answer_data=answer_data,
        candidate_id=current_user.id
    )