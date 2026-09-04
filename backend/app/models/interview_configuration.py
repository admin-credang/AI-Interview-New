import uuid
from datetime import datetime

from sqlalchemy import Boolean, String, DateTime, ForeignKey, JSON, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class InterviewConfiguration(Base):
    __tablename__ = "interview_configurations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid()
    )

    interview_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("interviews.id", ondelete="CASCADE"),
        nullable=False
    )

    candidate_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True
    )

    construct_questions_from_answers: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False
    )

    difficulty: Mapped[str] = mapped_column(
        String(20),
        nullable=False
    )

    knowledge_expectation: Mapped[str] = mapped_column(
        String(20),
        nullable=False
    )

    extra_config: Mapped[dict | None] = mapped_column(
        JSON,
        nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )