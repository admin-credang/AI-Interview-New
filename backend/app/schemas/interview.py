from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class InterviewBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    duration: int = Field(..., gt=0)


class InterviewCreate(InterviewBase):
    pass


class InterviewResponse(InterviewBase):
    id: UUID
    created_by: UUID
    status: str
    created_at: datetime

    model_config = {
        "from_attributes": True
    }

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