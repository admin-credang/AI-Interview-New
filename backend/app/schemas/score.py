from uuid import UUID

from pydantic import BaseModel, Field


class ScoreCreate(BaseModel):
    answer_id: UUID
    relevance: float | None = Field(None, ge=0, le=10)
    accuracy: float | None = Field(None, ge=0, le=10)
    technical_knowledge: float | None = Field(None, ge=0, le=10)
    completeness: float | None = Field(None, ge=0, le=10)
    communication: float | None = Field(None, ge=0, le=10)
    overall_score: float | None = Field(None, ge=0, le=10)


class ScoreResponse(ScoreCreate):
    id: UUID

    model_config = {
        "from_attributes": True
    }