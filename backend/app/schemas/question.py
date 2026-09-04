from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class QuestionResponse(BaseModel):
    id: UUID
    session_id: UUID
    question: str
    category: str
    difficulty: str
    type: str
    question_order: int
    created_at: datetime

    model_config = {
        "from_attributes": True
    }