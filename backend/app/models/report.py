import uuid
from decimal import Decimal
from datetime import datetime
from sqlalchemy import Text, Numeric, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid()
    )

    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sessions.id", ondelete="CASCADE"),
        nullable=False,
        unique=True
    )

    overall_score: Mapped[Decimal | None] = mapped_column(
        Numeric(5, 2),
        nullable=True
    )

    summary: Mapped[str | None] = mapped_column(
        Text,
        nullable=True
    )

    report_url: Mapped[str | None] = mapped_column(
        Text,
        nullable=True
    )

    created_at: Mapped[datetime]= mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )