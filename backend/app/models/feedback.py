import uuid

from sqlalchemy import Text, Boolean, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Feedback(Base):
    __tablename__ = "feedback"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid()
    )

    answer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("answers.id", ondelete="CASCADE"),
        nullable=False,
        unique=True
    )

    feedback_text: Mapped[str] = mapped_column(
        Text,
        nullable=False
    )

    follow_up_required: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False
    )

    follow_up_question: Mapped[str | None] = mapped_column(
        Text,
        nullable=True
    )