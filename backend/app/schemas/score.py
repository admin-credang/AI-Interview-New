from uuid import UUID

from pydantic import BaseModel, Field


class ScoreCreate(BaseModel):
    answer_id: UUID

    relevance: float | None = Field(
        None,
        ge=0,
        le=100
    )

    accuracy: float | None = Field(
        None,
        ge=0,
        le=100
    )

    technical_knowledge: float | None = Field(
        None,
        ge=0,
        le=100
    )

    completeness: float | None = Field(
        None,
        ge=0,
        le=100
    )

    communication: float | None = Field(
        None,
        ge=0,
        le=100
    )

    overall_score: float | None = Field(
        None,
        ge=0,
        le=100
    )


class ScoreResponse(ScoreCreate):
    id: UUID

    model_config = {
        "from_attributes": True
    }