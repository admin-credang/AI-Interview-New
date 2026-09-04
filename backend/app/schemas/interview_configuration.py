from datetime import datetime
from uuid import UUID
from typing import Literal

from pydantic import BaseModel


class InterviewConfigurationBase(BaseModel):
    construct_from_answers: bool = True

    difficulty: Literal[
        "easy",
        "medium",
        "hard"
    ]

    knowledge_expectation: Literal[
        "basic",
        "intermediate",
        "deep"
    ]

    extra_config: dict | None = None


class InterviewConfigurationCreate(InterviewConfigurationBase):
    pass


class InterviewConfigurationUpdate(BaseModel):
    construct_from_answers: bool | None = None

    difficulty: Literal[
        "easy",
        "medium",
        "hard"
    ] | None = None

    knowledge_expectation: Literal[
        "basic",
        "intermediate",
        "deep"
    ] | None = None

    extra_config: dict | None = None


class InterviewConfigurationResponse(InterviewConfigurationBase):
    id: UUID
    interview_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = {
        "from_attributes": True
    }