from uuid import UUID

from pydantic import BaseModel, Field


class NextQuestionResponse(BaseModel):
    id: UUID
    question: str
    category: str
    difficulty: str
    type: str
    question_order: int


class EvaluationResponse(BaseModel):
    answer_id: UUID

    relevance: float = Field(..., ge=0, le=10)
    accuracy: float = Field(..., ge=0, le=10)
    technical_knowledge: float = Field(..., ge=0, le=10)
    completeness: float = Field(..., ge=0, le=10)
    communication: float = Field(..., ge=0, le=10)
    overall_score: float = Field(..., ge=0, le=10)

    feedback_text: str
    follow_up_required: bool
    follow_up_question: str | None = None

    next_action: str
    next_question: NextQuestionResponse | None = None