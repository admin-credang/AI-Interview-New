from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ReportCreate(BaseModel):
    session_id: UUID
    overall_score: float | None = Field(None, ge=0, le=100)
    summary: str | None = None
    report_url: str | None = None


class ReportResponse(ReportCreate):
    id: UUID
    created_at: datetime

    model_config = {
        "from_attributes": True
    }