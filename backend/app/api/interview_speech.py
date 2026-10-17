
from uuid import UUID
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from fastapi.responses import Response
from google.cloud import texttospeech
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.interview import Interview
from app.models.interview_configuration import InterviewConfiguration
from app.models.user import User
from app.api.auth.dependencies import get_current_user
from app.services.interview_policy import (
    NOT_INVITED_MESSAGE,
    candidate_can_access,
    owns_interview,
)
from app.services.interview_voice import (
    ALLOWED_VOICES,
    DEFAULT_VOICE,
    get_voice_language_code,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/interviews",
    tags=["Interview Speech"],
)

class SpeechRequest(BaseModel):
    text: str = Field(min_length=1, max_length=3000)


@router.post("/{interview_id}/speech")
def generate_interview_speech(
    interview_id: UUID,
    request: SpeechRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    interview = (
        db.query(Interview)
        .filter(Interview.id == interview_id)
        .first()
    )

    if interview is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview not found",
        )

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
            detail="Interview configuration not found",
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
            detail="You cannot access interview speech",
        )

    extra = configuration.extra_config or {}
    voice_name = extra.get("voice_name", DEFAULT_VOICE)

    if not isinstance(voice_name, str) or voice_name not in ALLOWED_VOICES:
        voice_name = DEFAULT_VOICE

    try:
        client = texttospeech.TextToSpeechClient()

        synthesis_input = texttospeech.SynthesisInput(
            text=request.text.strip()
        )

        voice = texttospeech.VoiceSelectionParams(
            language_code=get_voice_language_code(voice_name),
            name=voice_name,
        )

        audio_config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3,
        )

        result = client.synthesize_speech(
            input=synthesis_input,
            voice=voice,
            audio_config=audio_config,
        )

        return Response(
            content=result.audio_content,
            media_type="audio/mpeg",
            headers={"Cache-Control": "no-store"},
        )

    except Exception:
        logger.exception("Google Text-to-Speech request failed")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Interview speech is temporarily unavailable",
        )
