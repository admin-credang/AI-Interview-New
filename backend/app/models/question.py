import uuid
from datetime import datetime

from sqlalchemy import (
    String,
    Text,
    DateTime,
    Integer,
    ForeignKey,
    func
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid()
    )

    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sessions.id", ondelete="CASCADE"),
        nullable=False
    )

    question: Mapped[str] = mapped_column(
        Text,
        nullable=False
    )

    category: Mapped[str] = mapped_column(
        String(100),
        nullable=False
    )

    difficulty: Mapped[str] = mapped_column(
        String(20),
        nullable=False
    )

    type: Mapped[str] = mapped_column(
        String(30),
        nullable=False
    )

    question_order: Mapped[int] = mapped_column(
        Integer,
        nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )