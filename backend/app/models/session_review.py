import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, JSON, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class SessionReview(Base):
    """
    Hiring-side data for one interview session.

    One row per session. Created lazily the first time the
    monitoring system logs something, the candidate submits, or
    the interviewer takes a decision.

    This is a NEW table, so no existing table is altered.
    It is created automatically at startup (see main.py).
    """

    __tablename__ = "session_reviews"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )

    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sessions.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    # pending | selected | rejected | on_hold
    decision: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="pending",
    )

    decision_note: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    decided_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    decided_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Result e-mail (selected / rejected)
    notification_status: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    notified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # "Thanks for attending" e-mail sent right after completion
    ack_sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Monitoring
    termination_reason: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    proctoring_events: Mapped[list | None] = mapped_column(
        JSON,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
