from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class AnswerCreate(BaseModel):
    session_id: UUID
    question_id: UUID
    answer_text: str | None = None
    audio_url: str | None = None


class AnswerResponse(AnswerCreate):
    id: UUID
    answered_at: datetime

    model_config = {
        "from_attributes": True
    }