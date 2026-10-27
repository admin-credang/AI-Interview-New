import logging
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    UploadFile,
    status,
)
from sqlalchemy.orm import Session

from app.api.auth.dependencies import get_current_user
from app.database import get_db
from app.models.interview import Interview
from app.models.interview_configuration import InterviewConfiguration
from app.models.user import User
from app.services.interview_policy import (
    NOT_INVITED_MESSAGE,
    candidate_can_access,
    owns_interview,
)
from app.services.transcription_service import (
    MAX_AUDIO_BYTES,
    transcribe_answer_audio,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/interviews",
    tags=["Interview Transcription"],
)


@router.post("/{interview_id}/transcribe")
def transcribe_interview_answer(
    interview_id: UUID,
    audio: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    interview = (
        db.query(Interview).filter(Interview.id == interview_id).first()
    )

    if interview is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview not found",
        )

    configuration = (
        db.query(InterviewConfiguration)
        .filter(InterviewConfiguration.interview_id == interview_id)
        .first()
    )

    if current_user.role in {"interviewer", "admin"}:
        if not owns_interview(current_user, interview):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this interview",
            )
    elif current_user.role == "candidate":
        if not candidate_can_access(
            db, interview_id, current_user, configuration
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=NOT_INVITED_MESSAGE,
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot transcribe interview answers",
        )

    data = audio.file.read(MAX_AUDIO_BYTES + 1)

    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Answer recording is too long",
        )

    try:
        text = transcribe_answer_audio(
            data, audio.content_type, audio.filename
        )
    except Exception:
        logger.exception("Answer transcription failed")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Transcription is temporarily unavailable",
        )

    return {"text": text}
