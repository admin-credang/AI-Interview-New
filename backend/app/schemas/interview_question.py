from uuid import UUID

from pydantic import BaseModel, Field


class InterviewQuestionCreate(BaseModel):
    interview_id: UUID
    question_id: UUID
    question_order: int = Field(..., gt=0)


class InterviewQuestionResponse(InterviewQuestionCreate):
    id: UUID

    model_config = {
        "from_attributes": True
    }