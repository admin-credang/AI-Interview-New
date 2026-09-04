import uuid

from sqlalchemy import Integer, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class InterviewQuestion(Base):
    __tablename__ = "interview_questions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=__import__(
            "sqlalchemy"
        ).func.gen_random_uuid()
    )

    interview_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("interviews.id", ondelete="CASCADE"),
        nullable=False
    )

    question_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("questions.id", ondelete="CASCADE"),
        nullable=False
    )

    question_order: Mapped[int] = mapped_column(
        Integer,
        nullable=False
    )

    __table_args__ = (
        UniqueConstraint(
            "interview_id",
            "question_id",
            name="unique_interview_question"
        ),
        UniqueConstraint(
            "interview_id",
            "question_order",
            name="unique_interview_question_order"
        ),
    )