from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class SessionCreate(BaseModel):
    interview_id: UUID
    candidate_id: UUID


class SessionResponse(BaseModel):
    id: UUID
    interview_id: UUID
    candidate_id: UUID
    started_at: datetime | None = None
    ended_at: datetime | None = None
    status: str
    current_question: int

    model_config = {
        "from_attributes": True
    }