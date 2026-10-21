"""
Company introduction endpoints.

    POST /interviews/{id}/company-intro/generate   interviewer: URL -> draft text (NOT saved)
    PUT  /interviews/{id}/company-intro            interviewer: save the reviewed text
    GET  /interviews/{id}/company-intro            interviewer: read what is saved
    GET  /interviews/{id}/company-intro/voice      candidate:   approved text, to be SPOKEN only

The introduction lives in InterviewConfiguration.extra_config["company_intro"]
(same place as the other per-interview settings, so no migration is needed):

    {"source_url": "...", "text": "...", "approved": true, "updated_at": "..."}

The AI is called only from /generate (during configuration). Candidates only
ever read the saved text, and only after the interviewer approved it.
"""

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app import features
from app.api.auth.dependencies import get_current_user
from app.database import get_db
from app.models.interview import Interview
from app.models.interview_configuration import InterviewConfiguration
from app.models.user import User
from app.services.company_intro_service import (
    MAX_INTRO_CHARS,
    CompanyIntroError,
    build_intro_from_url,
    clean_intro_text,
    validate_public_url,
)
from app.services.interview_policy import (
    NOT_INVITED_MESSAGE,
    candidate_can_access,
    invited_role,
    is_recruiter,
    owns_interview,
)


router = APIRouter(
    prefix="/interviews",
    tags=["Company Introduction"],
)


# =========================================================
# SCHEMAS
# =========================================================

class GenerateIntroRequest(BaseModel):
    url: str = Field(..., max_length=2048)
    role: str | None = Field(None, max_length=120)
    company: str | None = Field(None, max_length=120)
    # the rest of the Job Details form - the AI uses all of it
    location: str | None = Field(None, max_length=120)
    experience: str | None = Field(None, max_length=60)
    skills: list[str] = Field(default_factory=list, max_length=30)
    responsibilities: str | None = Field(None, max_length=3000)


class SaveIntroRequest(BaseModel):
    # Empty text = remove the introduction.
    text: str = Field("", max_length=MAX_INTRO_CHARS * 2)
    source_url: str | None = Field(None, max_length=2048)
    approved: bool = True


# =========================================================
# HELPERS
# =========================================================

def _owned_interview(
    db: Session, interview_id: UUID, user: User
) -> Interview:

    if not is_recruiter(user):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Only interviewers and admins can manage the company introduction",
        )

    interview = (
        db.query(Interview).filter(Interview.id == interview_id).first()
    )

    if interview is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Interview not found")

    if not owns_interview(user, interview):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "You can only manage your own interviews",
        )

    return interview


def _configuration(db: Session, interview_id: UUID):
    return (
        db.query(InterviewConfiguration)
        .filter(InterviewConfiguration.interview_id == interview_id)
        .first()
    )


def _intro(configuration) -> dict:
    extra = (configuration.extra_config or {}) if configuration else {}
    raw = extra.get("company_intro") or {}

    return {
        "source_url": raw.get("source_url") or "",
        "text": raw.get("text") or "",
        "approved": bool(raw.get("approved", False)) and bool(raw.get("text")),
        "updated_at": raw.get("updated_at"),
    }


# =========================================================
# GENERATE  (draft only - nothing is saved)
# =========================================================

@router.post("/{interview_id}/company-intro/generate")
def generate_intro(
    interview_id: UUID,
    body: GenerateIntroRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    interview = _owned_interview(db, interview_id, current_user)

    # Role for the intro: what the interviewer typed in Job Details,
    # else the saved job role, else the interview title.
    configuration = _configuration(db, interview_id)
    saved_job = (
        ((configuration.extra_config or {}).get("job") or {})
        if configuration
        else {}
    )

    role = (
        (body.role or "").strip()
        or str(saved_job.get("role") or "").strip()
        or (interview.title or "").strip()
    )

    company = (
        (body.company or "").strip()
        or str(saved_job.get("company") or "").strip()
    )

    # Job details: what is typed in the form now, else what is saved.
    def _pick(typed, key):
        return (typed or "").strip() or str(saved_job.get(key) or "").strip()

    skills = [
        s.strip() for s in (body.skills or []) if s and s.strip()
    ] or [
        str(s).strip() for s in (saved_job.get("skills") or []) if str(s).strip()
    ]

    job_details = {
        "location": _pick(body.location, "location"),
        "experience": _pick(body.experience, "experience"),
        "skills": skills[:30],
        "responsibilities": _pick(body.responsibilities, "responsibilities")[:2000],
    }

    try:
        # cheap URL check first so a bad link never reaches the network code
        validate_public_url(body.url)

        final_url, text = build_intro_from_url(
            body.url,
            role,
            company,
            (interview.description or "").strip()[:1200],
            job_details,
        )

    except CompanyIntroError as exc:
        # 422 + manual_entry: the page shows the message and lets the
        # interviewer type the introduction by hand.
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "message": str(exc),
                "manual_entry": True,
            },
        )

    return {
        "text": text,
        "source_url": final_url,
        "approved": False,
    }


# =========================================================
# SAVE  (interviewer reviewed / edited it)
# =========================================================

@router.put("/{interview_id}/company-intro")
def save_intro(
    interview_id: UUID,
    body: SaveIntroRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _owned_interview(db, interview_id, current_user)

    configuration = _configuration(db, interview_id)

    if configuration is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            "Configure the interview first, then add the company introduction",
        )

    extra = dict(configuration.extra_config or {})
    text = clean_intro_text(body.text)

    if not text:
        extra.pop("company_intro", None)

    else:
        source_url = (body.source_url or "").strip()

        if source_url:
            try:
                validate_public_url(source_url)
            except CompanyIntroError:
                # keep the text, just do not store a bad link
                source_url = ""

        extra["company_intro"] = {
            "source_url": source_url,
            "text": text,
            "approved": bool(body.approved),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

    # new dict object so SQLAlchemy sees the JSON column as changed
    configuration.extra_config = extra

    db.commit()
    db.refresh(configuration)

    return {"success": True, **_intro(configuration)}


# =========================================================
# READ  (interviewer)
# =========================================================

@router.get("/{interview_id}/company-intro")
def get_intro(
    interview_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _owned_interview(db, interview_id, current_user)

    return _intro(_configuration(db, interview_id))


# =========================================================
# CANDIDATE: approved text, to be spoken (never displayed)
# =========================================================

@router.get("/{interview_id}/company-intro/voice")
def get_intro_for_voice(
    interview_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    configuration = _configuration(db, interview_id)

    if current_user.role == "candidate":
        if not candidate_can_access(
            db, interview_id, current_user, configuration
        ):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN, NOT_INVITED_MESSAGE
            )
    else:
        _owned_interview(db, interview_id, current_user)

    intro = _intro(configuration)

    # module "Company introduction" OFF -> interview starts without it
    if not features.is_on(configuration, "company_intro"):
        return {"available": False, "text": ""}

    if not intro["approved"]:
        # nothing approved -> the interview simply starts without it
        return {"available": False, "text": ""}

    # role to mention: the one fixed in this candidate's invitation,
    # else the job role the interviewer typed, else the interview title
    extra = (configuration.extra_config or {}) if configuration else {}
    role = ""

    if current_user.role == "candidate":
        role = invited_role(configuration, current_user)

    if not role:
        role = str((extra.get("job") or {}).get("role") or "").strip()

    if not role:
        interview = (
            db.query(Interview)
            .filter(Interview.id == interview_id)
            .first()
        )
        role = (interview.title if interview else "") or ""

    return {
        "available": True,
        "text": intro["text"],
        "role": role,
    }
