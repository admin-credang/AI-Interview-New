from uuid import UUID

from pydantic import BaseModel


class FeedbackCreate(BaseModel):
    answer_id: UUID
    feedback_text: str
    follow_up_required: bool = False
    follow_up_question: str | None = None


class FeedbackResponse(FeedbackCreate):
    id: UUID

    model_config = {
        "from_attributes": True
    }