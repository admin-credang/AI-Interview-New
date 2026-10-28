"""
Resume of an invited candidate (interviewer side).

    POST   /hiring/interviews/{id}/resume   {email, filename, content_base64}
    PATCH  /hiring/interviews/{id}/resume   {email, enabled}   (ON / OFF)
    DELETE /hiring/interviews/{id}/resume?email=...

The file is sent as base64 inside JSON (no extra multipart package needed).
Only the extracted text is stored, inside the candidate's invitation record:

    extra_config["invitations"][email]["resume"] =
        {"filename": "...", "text": "...", "chars": 1234, "uploaded_at": "..."}

When this candidate starts the interview, the AI uses that text to ask
resume-based questions. Candidates never receive their resume text back.
"""

import base64
import binascii
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app import features
from app.api.auth.auth import get_current_user
from app.api.hiring import (
    _all_invited_emails,
    _get_configuration,
    _invitation_rows,
    _owned_interview,
    _require_recruiter,
    _users_by_email,
)
from app.database import get_db
from app.models.session import InterviewSession
from app.models.user import User
from app.services.interview_policy import invitations as invitation_records
from app.services.resume_service import (
    MAX_FILE_BYTES,
    ResumeError,
    clean_filename,
    extract_resume_text,
)


router = APIRouter(
    prefix="/hiring",
    tags=["Candidate Resume"],
)

# base64 is ~4/3 the size of the file
_MAX_B64_CHARS = int(MAX_FILE_BYTES * 4 / 3) + 1024


class ResumeToggle(BaseModel):
    email: str = Field(..., max_length=254)
    enabled: bool


class ResumeUpload(BaseModel):
    email: str = Field(..., max_length=254)
    filename: str | None = Field(None, max_length=255)
    content_base64: str = Field(
        ..., min_length=1, max_length=_MAX_B64_CHARS
    )


def _rows(db: Session, interview_id, configuration):
    sessions = (
        db.query(InterviewSession)
        .filter(InterviewSession.interview_id == interview_id)
        .all()
    )

    return _invitation_rows(
        configuration,
        sessions,
        _users_by_email(db, _all_invited_emails([configuration])),
    )


def _record_for(configuration, email: str) -> str:
    address = (email or "").strip().lower()

    if address not in invitation_records(configuration):
        raise HTTPException(
            404,
            "That candidate is not invited yet. Invite them first, then "
            "upload their resume.",
        )

    return address


@router.post("/interviews/{interview_id}/resume")
def upload_resume(
    interview_id: UUID,
    body: ResumeUpload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_recruiter(current_user)
    _owned_interview(db, current_user, interview_id)

    configuration = _get_configuration(db, interview_id)

    if configuration is None:
        raise HTTPException(
            400, "Configure the interview first, then add resumes"
        )

    address = _record_for(configuration, body.email)

    try:
        data = base64.b64decode(body.content_base64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(422, "The uploaded file could not be read.")

    try:
        text = extract_resume_text(data)
    except ResumeError as exc:
        raise HTTPException(422, str(exc))

    extra = dict(configuration.extra_config or {})
    records = dict(extra.get("invitations") or {})
    record = dict(records.get(address) or {})

    record["resume"] = {
        "filename": clean_filename(body.filename),
        "text": text,
        "chars": len(text),
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }

    records[address] = record
    extra["invitations"] = records
    configuration.extra_config = extra

    db.commit()
    db.refresh(configuration)

    rows = _rows(db, interview_id, configuration)
    row = next((r for r in rows if r["email"] == address), {})

    return {
        "success": True,
        "email": address,
        "filename": record["resume"]["filename"],
        # questions are made once, when the candidate starts
        "note": (
            "This candidate already started, so their questions were "
            "already created and will not use this resume."
            if row.get("status") in {"started", "completed", "ended"}
            else (
                "Resume saved, but resume questions are switched OFF for "
                "this interview. Turn the Resume questions switch ON in "
                "Features to use it."
                if not features.is_on(configuration, "resume_questions")
                else None
            )
        ),
        "invitations": rows,
    }


@router.patch("/interviews/{interview_id}/resume")
def toggle_resume_questions(
    interview_id: UUID,
    body: ResumeToggle,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Switch resume-based questions ON/OFF for one candidate.

    OFF keeps the uploaded resume but the AI will not use it, so the
    candidate gets normal questions. Only affects interviews the
    candidate has not started yet.
    """

    _require_recruiter(current_user)
    _owned_interview(db, current_user, interview_id)

    configuration = _get_configuration(db, interview_id)

    if configuration is None:
        raise HTTPException(404, "Interview configuration not found")

    address = _record_for(configuration, body.email)

    extra = dict(configuration.extra_config or {})
    records = dict(extra.get("invitations") or {})
    record = dict(records.get(address) or {})

    if body.enabled and not (record.get("resume") or {}).get("text"):
        raise HTTPException(
            400, "Upload this candidate's resume first, then switch it ON."
        )

    record["resume_questions"] = bool(body.enabled)

    records[address] = record
    extra["invitations"] = records
    configuration.extra_config = extra

    db.commit()
    db.refresh(configuration)

    rows = _rows(db, interview_id, configuration)
    row = next((r for r in rows if r["email"] == address), {})

    return {
        "success": True,
        "email": address,
        "enabled": bool(body.enabled),
        "note": (
            "This candidate already started, so their questions were "
            "already created and will not change."
            if row.get("status") in {"started", "completed", "ended"}
            else None
        ),
        "invitations": rows,
    }


@router.delete("/interviews/{interview_id}/resume")
def delete_resume(
    interview_id: UUID,
    email: str = Query(..., max_length=254),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_recruiter(current_user)
    _owned_interview(db, current_user, interview_id)

    configuration = _get_configuration(db, interview_id)

    if configuration is None:
        raise HTTPException(404, "Interview configuration not found")

    address = _record_for(configuration, email)

    extra = dict(configuration.extra_config or {})
    records = dict(extra.get("invitations") or {})
    record = dict(records.get(address) or {})
    record.pop("resume", None)
    record.pop("resume_questions", None)

    records[address] = record
    extra["invitations"] = records
    configuration.extra_config = extra

    db.commit()
    db.refresh(configuration)

    return {
        "success": True,
        "invitations": _rows(db, interview_id, configuration),
    }
