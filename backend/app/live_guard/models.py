"""Live Interview Guard - its own tables (no existing table is changed)."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, LargeBinary, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class LiveGuardInterview(Base):
    """A live interview on Google Meet / Zoom / Teams watched by the Live Interview Guard tool."""

    __tablename__ = "live_guard_interviews"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )

    candidate_name: Mapped[str] = mapped_column(String(200), nullable=False)
    candidate_email: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str | None] = mapped_column(String(200), nullable=True)

    platform: Mapped[str] = mapped_column(String(20), nullable=False, default="meet")  # meet | zoom | teams
    meeting_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_min: Mapped[int] = mapped_column(Integer, nullable=False, default=45)
    calendar_event_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # secret part of the candidate's check-page link (candidates do not log in)
    candidate_token: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    invite_status: Mapped[str | None] = mapped_column(Text, nullable=True)

    # latest instruction for the candidate page: {"type": "calibrate"|"challenge", "code", "at", "seq"}
    command: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    command_seq: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    candidate_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # report uploaded automatically by the tool
    report_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    report_pdf: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    report_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    final_status: Mapped[str | None] = mapped_column(String(60), nullable=True)
    report_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class LiveGuardGoogleAccount(Base):
    """The interviewer's Google Calendar connection for this feature only (separate from the Gmail connection)."""

    __tablename__ = "live_guard_google_accounts"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True,
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    refresh_token_enc: Mapped[str] = mapped_column(Text, nullable=False)
    connected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


TABLES = (LiveGuardInterview.__table__, LiveGuardGoogleAccount.__table__)
