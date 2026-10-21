"""
HIRING API

Interviewer / admin side
    GET  /hiring/interviews                       interviews + monitoring + job settings
    POST /hiring/interviews/{id}/status           open / close for new candidates
    POST /hiring/interviews/{id}/invite           e-mail personal invitations
                                                  (role fixed + interview ID)
    GET  /hiring/analytics                        funnel, score spread, per-interview stats
    PUT  /hiring/interviews/{id}/settings         change monitoring + job details
    GET  /hiring/candidates                       every candidate who attended
    GET  /hiring/candidates/{session_id}          profile + analysis + monitoring
    POST /hiring/candidates/{session_id}/decision select / reject / hold (+ e-mail)

Candidate side (own session only, never sees scores)
    POST /hiring/invitations/{code}/open          check interview ID -> interview
    POST /hiring/sessions/{session_id}/submitted  "thanks" e-mail after completion
    GET  /hiring/sessions/{session_id}/status     under review / selected / not selected
    POST /hiring/sessions/{session_id}/monitoring-event
    POST /hiring/sessions/{session_id}/gaze-summary   (write only, interviewer reads it)
"""

import re
from urllib.parse import urlparse
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Query,
    Response,
    status,
)
from pydantic import BaseModel, Field
from sqlalchemy import Text, cast, func
from sqlalchemy.orm import Session

from app.api.auth.auth import create_access_token, get_current_user
from app.services.gaze_analysis_service import build_gaze_report
from app.database import SessionLocal, get_db
from app.models.answer import Answer
from app.models.feedback import Feedback
from app.models.interview import Interview
from app.models.interview_configuration import (
    InterviewConfiguration,
)
from app.models.question import Question
from app.models.report import Report
from app.models.score import Score
from app.models.session import InterviewSession
from app.models.session_review import SessionReview
from app.models.user import User
from app.config import settings
from app import features
from app.services import mailbox as mailbox_service
from app.services.email_service import (
    build_interviewer_report_email,
    build_invite_email,
    build_rejected_email,
    build_selected_email,
    send_email,
)
from app.services.report_service import generate_interview_report
from app.services.pdf_report_service import (
    build_report_pdf_for_session,
    candidate_feedback_for_session,
)
from app.services.interview_policy import (
    follow_up_policy,
    format_code,
    invitation_for,
    invitations as invitation_records,
    mask_email,
    new_invite_code,
)


router = APIRouter(
    prefix="/hiring",
    tags=["Hiring"],
)


# =========================================================
# SMALL HELPERS
# =========================================================

def _is_recruiter(user: User) -> bool:
    return user.role in {"interviewer", "admin"}


def _require_recruiter(user: User) -> None:
    if not _is_recruiter(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only interviewers can use this endpoint",
        )


def _num(value):
    return float(value) if value is not None else None


def _iso(value):
    return value.isoformat() if value else None


def _duration_seconds(session: InterviewSession):
    if session.started_at and session.ended_at:
        return max(
            0,
            int(
                (
                    session.ended_at - session.started_at
                ).total_seconds()
            ),
        )
    return None


def _policy(configuration) -> dict:
    """
    Monitoring rules the interviewer chose.

    enabled = False  -> no camera, no face, no eye, no phone.
    enabled = True   -> camera is required AND face, eye / gaze and phone
                        detection all run (they are not separate options).
    """

    # ONE switch: face, eye / gaze and phone detection always follow it.
    return features.monitoring_policy(configuration)


def _job(configuration) -> dict:
    extra = (
        (configuration.extra_config or {})
        if configuration
        else {}
    )

    job = extra.get("job") or {}

    return {
        "role": job.get("role") or "",
        "company": job.get("company") or "",
        "location": job.get("location") or "",
        "employment_type": job.get("employment_type") or "",
        "experience": job.get("experience") or "",
        "skills": job.get("skills") or [],
        "responsibilities": job.get("responsibilities") or "",
    }


def _interviewer(configuration, fallback_user) -> dict:
    """
    Interviewer shown to candidates (name in the e-mail, reply-to) and
    who receives the finished-interview report.
    Saved per interview in Client Settings; defaults to the account
    that created the interview.
    """

    saved = ((configuration.extra_config or {}) if configuration else {}).get(
        "interviewer"
    ) or {}

    # module "Interviewer name & email" switched OFF -> account that made it
    if not features.is_on(configuration, "custom_interviewer"):
        saved = {}

    name = (saved.get("name") or "").strip()
    email = (saved.get("email") or "").strip()

    final_email = email or (getattr(fallback_user, "email", "") or "")

    return {
        "name": name or (getattr(fallback_user, "name", "") or ""),
        "email": final_email,
        # True = candidate mails are sent FROM this interviewer's own mailbox
        "mailbox_connected": bool(
            mailbox_service.gmail_account(fallback_user)
            or (
                saved
                and mailbox_service.account_from_config(
                    configuration, final_email
                )
            )
        ),
    }


def _mail_identity(configuration, fallback_user) -> dict:
    """What a candidate-facing mail needs: sender name, reply-to, mailbox."""

    iv = _interviewer(configuration, fallback_user)
    job = _job(configuration)
    company = job["company"] or settings.company_name

    # 1) Gmail OAuth of the logged-in interviewer (From = their login Gmail)
    account = mailbox_service.gmail_account(fallback_user)

    # 2) older App Password mailbox
    if account is None and features.is_on(configuration, "custom_interviewer"):
        account = mailbox_service.account_from_config(
            configuration, iv["email"]
        )

    # Gmail OAuth: ask Gmail to send "From" the interviewer's own address
    # (works when it is a verified "Send mail as" address; otherwise Gmail
    # keeps the connected address, so the mail is never lost)
    if account and account.get("type") == "gmail_oauth" and iv["email"]:
        account = {**account, "from_email": iv["email"]}

    return {
        # candidate sees the interviewer's name: "Priya (Acme)"
        "from_name": (
            f"{iv['name']} ({company})" if iv["name"] else company
        ),
        "reply_to": iv["email"],
        "mailbox": account,
    }


def _get_configuration(db: Session, interview_id):
    return (
        db.query(InterviewConfiguration)
        .filter(
            InterviewConfiguration.interview_id == interview_id
        )
        .first()
    )


def _get_or_create_review(
    db: Session,
    session_id,
) -> SessionReview:

    review = (
        db.query(SessionReview)
        .filter(SessionReview.session_id == session_id)
        .first()
    )

    if review is None:
        review = SessionReview(
            session_id=session_id,
            decision="pending",
        )
        db.add(review)
        db.flush()

    return review


def _session_for_recruiter(
    db: Session,
    user: User,
    session_id: UUID,
):
    session = (
        db.query(InterviewSession)
        .filter(InterviewSession.id == session_id)
        .first()
    )

    if session is None:
        raise HTTPException(
            status_code=404,
            detail="Interview session not found",
        )

    interview = (
        db.query(Interview)
        .filter(Interview.id == session.interview_id)
        .first()
    )

    if interview is None:
        raise HTTPException(
            status_code=404,
            detail="Interview not found",
        )

    if (
        user.role != "admin"
        and interview.created_by != user.id
    ):
        raise HTTPException(
            status_code=403,
            detail="This candidate belongs to another interviewer",
        )

    return session, interview


def _own_session(
    db: Session,
    user: User,
    session_id: UUID,
) -> InterviewSession:

    session = (
        db.query(InterviewSession)
        .filter(InterviewSession.id == session_id)
        .first()
    )

    if session is None:
        raise HTTPException(
            status_code=404,
            detail="Interview session not found",
        )

    if (
        user.role != "candidate"
        or session.candidate_id != user.id
    ):
        raise HTTPException(
            status_code=403,
            detail="You can only access your own interview",
        )

    return session


def _public_decision(review) -> str:
    """
    What the CANDIDATE is allowed to see.
    """

    if review is None:
        return "under_review"

    if review.decision == "selected":
        return "selected"

    if review.decision == "rejected":
        return "not_selected"

    return "under_review"


# =========================================================
# BACKGROUND E-MAIL TASKS
# (own DB session - the request session is already closed)
# =========================================================

def _send_decision_email_task(
    review_id,
    to_email: str,
    subject: str,
    body: str,
    from_name: str | None = None,
    reply_to: str | None = None,
    mailbox: dict | None = None,
) -> None:

    sent, state = send_email(
        to_email,
        subject,
        body,
        from_name=from_name,
        reply_to=reply_to,
        mailbox=mailbox,
    )

    db = SessionLocal()

    try:

        review = (
            db.query(SessionReview)
            .filter(SessionReview.id == review_id)
            .first()
        )

        if review is not None:
            review.notification_status = state
            review.notified_at = (
                datetime.now(timezone.utc) if sent else None
            )
            db.commit()

    except Exception as exc:
        print(f"Could not save notification status: {exc}")
        db.rollback()

    finally:
        db.close()



def notify_interviewer_task(session_id) -> None:
    """
    Make sure the report exists, then e-mail the INTERVIEWER a short
    summary with a link to the full report page.
    Own DB session: the request session is already closed.
    """

    db = SessionLocal()

    try:

        session = (
            db.query(InterviewSession)
            .filter(InterviewSession.id == session_id)
            .first()
        )

        if session is None:
            return

        interview = (
            db.query(Interview)
            .filter(Interview.id == session.interview_id)
            .first()
        )

        candidate = (
            db.query(User)
            .filter(User.id == session.candidate_id)
            .first()
        )

        interviewer = (
            db.query(User)
            .filter(User.id == interview.created_by)
            .first()
            if interview
            else None
        )

        if not (interview and candidate and interviewer):
            return

        report = (
            db.query(Report)
            .filter(Report.session_id == session.id)
            .first()
        )

        if report is None and session.status == "completed":

            try:
                report = generate_interview_report(
                    db=db,
                    session_id=session.id,
                )
                db.commit()

            except Exception as exc:
                db.rollback()
                print(f"Report generation failed: {exc}")
                report = None

        review = (
            db.query(SessionReview)
            .filter(SessionReview.session_id == session.id)
            .first()
        )

        events = (review.proctoring_events or []) if review else []

        reason = review.termination_reason if review else None

        configuration = _get_configuration(db, interview.id)

        # module "Report e-mail to interviewer" is OFF -> report is still
        # generated above, only the mail is skipped
        if not features.is_on(configuration, "email_report"):
            return

        iv = _interviewer(configuration, interviewer)

        subject, text = build_interviewer_report_email(
            iv["name"],
            candidate.name,
            candidate.email,
            _job(configuration)["role"] or interview.title,
            (
                "Stopped by monitoring"
                if session.status == "terminated"
                else "Completed"
            ),
            (
                _num(report.overall_score)
                if report is not None
                else None
            ),
            len(events),
            reason,
            (
                f"{settings.frontend_url.rstrip('/')}"
                f"/dashboard/candidates/{session.id}"
            ),
        )

        # PDF report (bullet points + feedback + improvement analysis)
        attachments = []

        if features.is_on(configuration, "email_report_pdf"):
            try:
                pdf_bytes, pdf_name = build_report_pdf_for_session(
                    db, session.id
                )
                attachments.append((pdf_name, pdf_bytes, "application/pdf"))

            except Exception as exc:
                print(f"PDF report could not be built: {exc}")

        send_email(
            iv["email"] or interviewer.email,
            subject,
            text,
            attachments=attachments,
        )

    except Exception as exc:
        print(f"Could not notify interviewer: {exc}")

    finally:
        db.close()


# =========================================================
# SCHEMAS
# =========================================================

class ProctoringSettings(BaseModel):
    enabled: bool = False
    face: bool = True
    eye: bool = True
    phone: bool = False


class FollowUpSettings(BaseModel):
    enabled: bool = True
    count: int = Field(2, ge=1, le=5)


class JobDetails(BaseModel):
    role: str | None = Field(None, max_length=120)
    company: str | None = Field(None, max_length=120)
    location: str | None = Field(None, max_length=120)
    employment_type: str | None = Field(None, max_length=60)
    experience: str | None = Field(None, max_length=60)
    skills: list[str] = Field(default_factory=list, max_length=30)
    responsibilities: str | None = Field(None, max_length=3000)


class InterviewerSettings(BaseModel):
    name: str = Field("", max_length=100)
    email: str = Field("", max_length=254)
    # interviewer's own mailbox (App Password) - candidate mails are then
    # sent FROM their address. Empty = keep what is saved.
    mail_password: str | None = Field(None, max_length=200)
    mail_host: str | None = Field(None, max_length=120)
    # True = forget the saved mailbox
    disconnect_mailbox: bool = False


class InterviewSettingsUpdate(BaseModel):
    proctoring: ProctoringSettings | None = None
    job: JobDetails | None = None
    follow_ups: FollowUpSettings | None = None
    # interview-level switch for resume-based questions (default ON)
    resume_questions: bool | None = None
    # who the candidates see as the interviewer + who gets the report
    interviewer: InterviewerSettings | None = None
    # up to 5 questions every candidate gets at the END of the interview
    compulsory_questions: list[str] | None = Field(None, max_length=20)


class StatusRequest(BaseModel):
    open: bool


class CandidateIn(BaseModel):
    """One candidate added from Client Settings."""

    name: str | None = Field(None, max_length=120)
    email: str = Field(..., max_length=254)
    phone: str | None = Field(None, max_length=30)


class InviteRequest(BaseModel):
    # plain e-mail list (old UI) and/or full candidates (name + phone)
    emails: list[str] = Field(default_factory=list, max_length=50)
    candidates: list[CandidateIn] = Field(
        default_factory=list, max_length=50
    )

    # False = only save the candidate (status "Pending"); the
    # interviewer sends the mail later with the row's "Send email"
    send_email: bool = True

    # The role the interviewer fixed for these candidates. It is sent
    # in the e-mail and is the ONLY role they can open.
    role: str | None = Field(None, max_length=120)


class DecisionRequest(BaseModel):
    decision: Literal[
        "selected",
        "rejected",
        "on_hold",
        "pending",
    ]
    note: str | None = Field(None, max_length=2000)
    send_email: bool = True


class MonitoringEventRequest(BaseModel):
    type: Literal[
        "camera_denied",
        "camera_unavailable",
        "monitoring_started",
        "face_not_found",
        "multiple_faces",
        "looking_away",
        "looking_down",
        "phone_detected",
        "eyes_closed",
        "tab_left",
    ]
    detail: str | None = Field(None, max_length=200)


# =========================================================
# INVITATION ROWS (interviewer view: who got which ID / role)
# =========================================================

def _users_by_email(db: Session, emails: set[str]) -> dict:

    if not emails:
        return {}

    return {
        (u.email or "").strip().lower(): u
        for u in db.query(User)
        .filter(func.lower(User.email).in_(list(emails)))
        .all()
    }


def _all_invited_emails(configurations) -> set[str]:

    emails: set[str] = set()

    for configuration in configurations:

        extra = (configuration.extra_config or {}) if configuration else {}

        emails.update(invitation_records(configuration).keys())
        emails.update(
            str(e).strip().lower()
            for e in (extra.get("invited") or [])
            if e
        )

    return emails


def _invitation_rows(
    configuration,
    sessions: list,
    users_by_email: dict,
) -> list[dict]:
    """
    status: sent -> opened (clicked the link / entered the ID)
            -> started -> completed / ended
    """

    extra = (configuration.extra_config or {}) if configuration else {}

    records = invitation_records(configuration)

    # old invitations (before personal IDs existed) have no record
    for email in extra.get("invited") or []:
        records.setdefault(str(email).strip().lower(), {})

    latest_session = {}

    for s in sorted(
        sessions,
        key=lambda x: x.started_at.timestamp() if x.started_at else 0,
    ):
        latest_session[s.candidate_id] = s

    rows = []

    for email, record in records.items():

        user = users_by_email.get(email)
        session = latest_session.get(user.id) if user else None

        if session is not None and session.status == "completed":
            state = "completed"
        elif session is not None and session.status == "terminated":
            state = "ended"
        elif session is not None:
            state = "started"
        elif record.get("opened_at"):
            state = "opened"
        else:
            state = "sent"

        # mail delivery: pending -> sent / failed
        # (old invitations had no tracking -> treated as sent)
        mail_status = record.get("mail_status") or "sent"

        rows.append(
            {
                "email": email,
                "name": record.get("name") or (user.name if user else None),
                "phone": record.get("phone") or "",
                "mail_status": mail_status,
                "mail_error": record.get("mail_error"),
                "role": record.get("role") or "",
                "code": record.get("code"),
                # the personal link - used when the e-mail module is OFF
                "link": (
                    f"{settings.frontend_url.rstrip('/')}/invite/{record['code']}"
                    if record.get("code")
                    else None
                ),
                "status": state,
                "invited_at": record.get("invited_at"),
                "opened_at": record.get("opened_at"),
                # never the resume text - only that one exists
                "has_resume": bool((record.get("resume") or {}).get("text")),
                "resume_name": (record.get("resume") or {}).get("filename"),
                # interviewer's ON/OFF switch (default ON)
                "resume_questions": record.get("resume_questions") is not False,
            }
        )

    rows.sort(key=lambda r: r["invited_at"] or "", reverse=True)

    return rows


# =========================================================
# INTERVIEWER: INTERVIEW LIST + SETTINGS
# =========================================================

@router.get("/interviews")
def list_my_interviews(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    _require_recruiter(current_user)

    query = db.query(Interview)

    if current_user.role != "admin":
        query = query.filter(
            Interview.created_by == current_user.id
        )

    interviews = query.order_by(
        Interview.created_at.desc()
    ).all()

    ids = [i.id for i in interviews]

    configs = {}
    sessions_by_interview = {}
    reviews = {}

    if ids:

        configs = {
            c.interview_id: c
            for c in db.query(InterviewConfiguration)
            .filter(InterviewConfiguration.interview_id.in_(ids))
            .all()
        }

        for s in (
            db.query(InterviewSession)
            .filter(InterviewSession.interview_id.in_(ids))
            .all()
        ):
            sessions_by_interview.setdefault(
                s.interview_id, []
            ).append(s)

        all_session_ids = [
            s.id
            for lst in sessions_by_interview.values()
            for s in lst
        ]

        if all_session_ids:
            reviews = {
                r.session_id: r
                for r in db.query(SessionReview)
                .filter(
                    SessionReview.session_id.in_(all_session_ids)
                )
                .all()
            }

    result = []

    users_by_email = _users_by_email(
        db, _all_invited_emails(configs.values())
    )

    creators = {
        u.id: u
        for u in db.query(User)
        .filter(User.id.in_(list({i.created_by for i in interviews})))
        .all()
    } if interviews else {}

    for interview in interviews:

        configuration = configs.get(interview.id)
        sessions = sessions_by_interview.get(interview.id, [])

        completed = [
            s for s in sessions if s.status == "completed"
        ]

        pending = [
            s
            for s in completed
            if (
                reviews.get(s.id) is None
                or reviews[s.id].decision
                in {"pending", "on_hold"}
            )
        ]

        extra = (
            (configuration.extra_config or {})
            if configuration
            else {}
        )

        result.append(
            {
                "id": str(interview.id),
                "title": interview.title,
                "description": interview.description,
                "duration": interview.duration,
                "status": interview.status,
                "created_at": _iso(interview.created_at),
                "accepting": interview.status != "closed",
                "invited_count": len(
                    set(extra.get("invited") or [])
                    | set(invitation_records(configuration).keys())
                ),
                "invitations": _invitation_rows(
                    configuration, sessions, users_by_email
                ),
                "has_configuration": configuration is not None,
                "question_count": extra.get("question_count"),
                "proctoring": _policy(configuration),
                "follow_ups": follow_up_policy(configuration),
                "compulsory_questions": features.clean_compulsory(
                    extra.get("compulsory_questions")
                ),
                "resume_questions_enabled": extra.get("resume_questions_enabled") is not False,
                "job": _job(configuration),
                "features": features.resolve(configuration),
                "interviewer": _interviewer(
                    configuration,
                    creators.get(interview.created_by) or current_user,
                ),
                "candidates_total": len(sessions),
                "candidates_completed": len(completed),
                "pending_review": len(pending),
            }
        )

    return {
        "interviews": result,
        "feature_catalog": features.catalog(),
        "feature_groups": features.groups(),
    }


class FeaturesUpdate(BaseModel):
    # {"email_invite": false, "company_intro": true, ...}
    features: dict[str, bool] = Field(default_factory=dict)


@router.put("/interviews/{interview_id}/features")
def update_interview_features(
    interview_id: UUID,
    body: FeaturesUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Switch feature modules ON / OFF for ONE interview."""

    _require_recruiter(current_user)
    _owned_interview(db, current_user, interview_id)

    configuration = _get_configuration(db, interview_id)

    if configuration is None:
        raise HTTPException(
            404, "Configure the interview first, then change its modules"
        )

    unknown = [k for k in body.features if k not in features.BY_KEY]

    if unknown:
        raise HTTPException(422, f"Unknown module: {', '.join(unknown)}")

    configuration.extra_config = features.apply(
        configuration.extra_config or {}, body.features
    )

    db.commit()
    db.refresh(configuration)

    return {
        "success": True,
        "features": features.resolve(configuration),
        "proctoring": _policy(configuration),
        "follow_ups": follow_up_policy(configuration),
        "resume_questions_enabled": features.is_on(
            configuration, "resume_questions"
        ),
    }


@router.put("/interviews/{interview_id}/settings")
def update_interview_settings(
    interview_id: UUID,
    body: InterviewSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    _require_recruiter(current_user)

    interview = (
        db.query(Interview)
        .filter(Interview.id == interview_id)
        .first()
    )

    if interview is None:
        raise HTTPException(404, "Interview not found")

    if (
        current_user.role != "admin"
        and interview.created_by != current_user.id
    ):
        raise HTTPException(
            403, "You can only change your own interviews"
        )

    configuration = _get_configuration(db, interview_id)

    if configuration is None:
        raise HTTPException(
            404,
            "Configure the interview first, then change its settings",
        )

    # Merge into extra_config (keep categories, question_count ...)
    extra = dict(configuration.extra_config or {})

    if body.proctoring is not None:
        extra["proctoring"] = features.monitoring_flags(
            body.proctoring.enabled
        )

    if body.compulsory_questions is not None:
        extra["compulsory_questions"] = features.clean_compulsory(
            body.compulsory_questions
        )

    if body.follow_ups is not None:
        extra["follow_ups"] = body.follow_ups.model_dump()

    if body.resume_questions is not None:
        extra["resume_questions_enabled"] = bool(body.resume_questions)

    if body.interviewer is not None:
        iv_name = body.interviewer.name.strip()
        iv_email = body.interviewer.email.strip().lower()

        if iv_email and not _EMAIL_RE.match(iv_email):
            raise HTTPException(422, "Enter a valid interviewer email address")

        previous = dict(extra.get("interviewer") or {})
        saved_iv = {"name": iv_name, "email": iv_email}

        # keep the connected mailbox only while the address is unchanged
        old_box = previous.get("mailbox") or {}

        if (
            old_box
            and not body.interviewer.disconnect_mailbox
            and (old_box.get("for_email") or "").lower() == iv_email
        ):
            saved_iv["mailbox"] = old_box

        new_password = (body.interviewer.mail_password or "").strip()

        if new_password:
            if not iv_email:
                raise HTTPException(
                    422, "Enter the interviewer email before the mailbox password"
                )

            try:
                connection = mailbox_service.verify(
                    iv_email, new_password, body.interviewer.mail_host
                )
                saved_iv["mailbox"] = {
                    **connection,
                    "for_email": iv_email,
                    "password_enc": mailbox_service.encrypt(
                        mailbox_service.clean_password(
                            new_password, connection["host"]
                        )
                    ),
                }
            except mailbox_service.MailboxError as exc:
                raise HTTPException(422, str(exc))

        extra["interviewer"] = saved_iv

    if body.job is not None:
        job = body.job.model_dump()
        job["skills"] = [
            s.strip()
            for s in job.get("skills", [])
            if s and s.strip()
        ]
        extra["job"] = job

    configuration.extra_config = extra

    db.commit()
    db.refresh(configuration)

    return {
        "success": True,
        "proctoring": _policy(configuration),
        "job": _job(configuration),
        "follow_ups": follow_up_policy(configuration),
        "resume_questions_enabled": (
            (configuration.extra_config or {}).get("resume_questions_enabled")
            is not False
        ),
        "interviewer": _interviewer(configuration, current_user),
        "compulsory_questions": features.clean_compulsory(
            (configuration.extra_config or {}).get("compulsory_questions")
        ),
    }


# =========================================================
# INTERVIEWER: OPEN / CLOSE + INVITE
# =========================================================

def _owned_interview(
    db: Session,
    user: User,
    interview_id: UUID,
) -> Interview:

    interview = (
        db.query(Interview)
        .filter(Interview.id == interview_id)
        .first()
    )

    if interview is None:
        raise HTTPException(404, "Interview not found")

    if (
        user.role != "admin"
        and interview.created_by != user.id
    ):
        raise HTTPException(
            403, "You can only change your own interviews"
        )

    return interview


@router.post("/interviews/{interview_id}/status")
def set_interview_status(
    interview_id: UUID,
    body: StatusRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Close an interview so no NEW candidate can start it
    (people who already started or finished are not affected),
    or open it again.
    """

    _require_recruiter(current_user)

    interview = _owned_interview(db, current_user, interview_id)

    interview.status = "active" if body.open else "closed"

    db.commit()

    return {
        "success": True,
        "accepting": interview.status != "closed",
    }


_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


_PHONE_RE = re.compile(r"^\+?\d{7,15}$")


def _clean_phone(raw: str | None) -> str | None:
    """'+91 98765-43210' -> '+919876543210'. None when invalid."""

    value = re.sub(r"[\s().-]", "", (raw or "").strip())

    return value if _PHONE_RE.match(value) else None


def _send_invite_task(
    messages: list[tuple[str, str, str]],
    from_name: str | None,
    reply_to: str | None,
    interview_id: UUID | None = None,
    mailbox: dict | None = None,
) -> None:
    """
    messages = [(to_email, subject, body), ...] - one per candidate.

    After each mail the result is written back to the invitation
    (mail_status = sent / failed) so Client Settings can show it.
    """

    for address, subject, body in messages:
        ok, info = send_email(
            address,
            subject,
            body,
            from_name=from_name,
            reply_to=reply_to,
            mailbox=mailbox,
        )

        if interview_id is None:
            continue

        db = SessionLocal()

        try:
            configuration = _get_configuration(db, interview_id)

            if configuration is None:
                continue

            extra = dict(configuration.extra_config or {})
            records = dict(extra.get("invitations") or {})
            record = dict(records.get(address) or {})

            record["mail_status"] = "sent" if ok else "failed"
            record["mail_error"] = None if ok else info
            record["mail_checked_at"] = datetime.now(
                timezone.utc
            ).isoformat()

            records[address] = record
            extra["invitations"] = records
            configuration.extra_config = extra

            db.commit()

        except Exception as exc:  # never break the other mails
            db.rollback()
            print(f"INVITE STATUS UPDATE FAILED: {exc}")

        finally:
            db.close()


def _local_link_warning(base: str) -> str | None:
    """The e-mail link only opens on THIS computer when it points to localhost."""

    host = (urlparse(base).hostname or "").lower()

    if (
        host in ("localhost", "127.0.0.1", "::1", "0.0.0.0")
        or host.startswith(("192.168.", "10.", "172.16.", "172.17."))
    ):
        return (
            f"The interview link in the e-mail points to {base}, so it "
            "opens only on this computer. Set FRONTEND_URL in the backend "
            ".env to your public (https) site address, then invite again."
        )

    return None


@router.post("/interviews/{interview_id}/invite")
def invite_candidates(
    interview_id: UUID,
    body: InviteRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Invite candidates for ONE fixed role.

    Every candidate gets their own e-mail with
      * a personal Interview ID  (INV-XXXX-XXXX)
      * a link that opens the interview straight away
    and can open only this interview.
    """

    _require_recruiter(current_user)

    interview = _owned_interview(db, current_user, interview_id)

    configuration = _get_configuration(db, interview_id)

    if configuration is None:
        raise HTTPException(
            400,
            "Configure the interview first, then invite candidates",
        )

    valid = []
    invalid = []
    details: dict[str, dict] = {}

    entries = [
        CandidateIn(email=e) for e in body.emails
    ] + list(body.candidates)

    for entry in entries:
        address = (entry.email or "").strip().lower()
        if not address:
            continue
        if _EMAIL_RE.match(address):
            if address not in valid:
                valid.append(address)

            phone = None
            if (entry.phone or "").strip():
                phone = _clean_phone(entry.phone)
                if phone is None:
                    raise HTTPException(
                        422,
                        f"Phone number for {address} is not valid "
                        "(use 7 to 15 digits, e.g. +919876543210).",
                    )

            details[address] = {
                "name": (entry.name or "").strip() or None,
                "phone": phone,
            }
        elif address not in invalid:
            invalid.append(address)

    if not valid:
        raise HTTPException(
            422, "Enter at least one valid email address"
        )

    job = _job(configuration)
    policy = _policy(configuration)

    extra = dict(configuration.extra_config or {})

    role = (
        (body.role or "").strip()
        or job["role"]
        or interview.title
    )

    company = job["company"] or settings.company_name

    now = datetime.now(timezone.utc).isoformat()

    records = dict(extra.get("invitations") or {})
    used_codes = {
        (r or {}).get("code") for r in records.values()
    }

    base = settings.frontend_url.rstrip("/")

    interviewer = _interviewer(configuration, current_user)
    identity = _mail_identity(configuration, current_user)

    # module "Invitation e-mail": OFF = nothing is mailed, link is shared by hand
    email_on = features.is_on(configuration, "email_invite")
    send_now = bool(body.send_email and email_on)

    messages = []

    for address in valid:

        record = dict(records.get(address) or {})

        # same person invited again -> same ID (just re-sent)
        if not record.get("code"):
            record["code"] = new_invite_code(used_codes)
            used_codes.add(record["code"])
            record["invited_at"] = now

        record["email"] = address
        record["role"] = role
        if send_now:
            record["last_sent_at"] = now
        record["invited_by"] = str(current_user.id)

        # name + phone are kept together with the e-mail
        info = details.get(address) or {}
        if info.get("name"):
            record["name"] = info["name"]
        if info.get("phone"):
            record["phone"] = info["phone"]

        if send_now:
            # becomes "sent" / "failed" once the mail is delivered
            record["mail_status"] = "pending"
            record["mail_error"] = None
        elif body.send_email and not email_on:
            # module OFF: the interviewer shares the link manually
            record["mail_status"] = "manual"
            record["mail_error"] = None
        elif not record.get("mail_status"):
            # saved only - not e-mailed yet (shown as "Pending")
            record["mail_status"] = "draft"

        records[address] = record

        subject, text = build_invite_email(
            role,
            f"{base}/invite/{record['code']}",
            policy["enabled"],
            company=company,
            duration=interview.duration,
            question_count=extra.get("question_count"),
            access_code=record["code"],
            interviewer_name=interviewer["name"],
            interviewer_email=interviewer["email"],
            candidate_email=address,
            candidate_name=record.get("name"),
        )

        if send_now:
            messages.append((address, subject, text))

    extra["invitations"] = records

    # keep the old list in sync (older code reads it)
    extra["invited"] = sorted(
        set(extra.get("invited") or []) | set(valid)
    )

    configuration.extra_config = extra

    db.commit()

    background_tasks.add_task(
        _send_invite_task,
        messages,
        identity["from_name"],
        identity["reply_to"] or current_user.email,
        interview_id,
        identity["mailbox"],
    )

    sessions = (
        db.query(InterviewSession)
        .filter(InterviewSession.interview_id == interview_id)
        .all()
    )

    link_warning = _local_link_warning(base)

    if link_warning:
        print(f"INVITE LINK WARNING: {link_warning}")

    return {
        "success": True,
        "queued": len(valid),
        "email_sent": send_now,
        "link_warning": link_warning,
        "invalid": invalid,
        "role": role,
        "link": f"{base}/interviews/{interview.id}",
        "invitations": _invitation_rows(
            configuration,
            sessions,
            _users_by_email(db, _all_invited_emails([configuration])),
        ),
    }


@router.delete("/interviews/{interview_id}/invitations")
def remove_invitation(
    interview_id: UUID,
    email: str = Query(..., max_length=254),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Remove one candidate from THIS interview's invited list
    (the trash button in Interview Controls > Candidates).

    The invitation (ID, resume, mail status) is deleted, so that ID
    stops working. Interview sessions that already exist are NOT touched -
    their answers and reports stay on the Candidates page.
    """

    _require_recruiter(current_user)
    _owned_interview(db, current_user, interview_id)

    configuration = _get_configuration(db, interview_id)

    if configuration is None:
        raise HTTPException(404, "Interview configuration not found")

    address = (email or "").strip().lower()

    extra = dict(configuration.extra_config or {})
    records = dict(extra.get("invitations") or {})
    legacy = [str(e).strip().lower() for e in (extra.get("invited") or []) if e]

    if address not in {str(k).strip().lower() for k in records} and address not in legacy:
        raise HTTPException(404, "That candidate is not on this interview.")

    extra["invitations"] = {
        k: v for k, v in records.items()
        if str(k).strip().lower() != address
    }
    extra["invited"] = [e for e in legacy if e != address]

    configuration.extra_config = extra

    db.commit()
    db.refresh(configuration)

    sessions = (
        db.query(InterviewSession)
        .filter(InterviewSession.interview_id == interview_id)
        .all()
    )

    return {
        "success": True,
        "invitations": _invitation_rows(
            configuration,
            sessions,
            _users_by_email(db, _all_invited_emails([configuration])),
        ),
    }


# =========================================================
# CANDIDATE: OPEN AN INVITATION WITH THE INTERVIEW ID
# =========================================================

@router.post("/invitations/{code}/open")
def open_invitation(
    code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Called when the candidate clicks the e-mail button (/invite/<ID>)
    or types the ID on the dashboard.

    The ID only works for the e-mail address it was issued to.
    Returns the ONE interview the candidate may open.
    """

    if current_user.role != "candidate":
        raise HTTPException(
            403,
            "Interview links are for candidate accounts. "
            "Please log in with the candidate account.",
        )

    canonical = format_code(code)

    if canonical is None:
        raise HTTPException(
            404,
            "This Interview ID is not valid. "
            "Check the ID in your invitation email.",
        )

    candidates = (
        db.query(InterviewConfiguration)
        .filter(
            cast(InterviewConfiguration.extra_config, Text).like(
                f"%{canonical}%"
            )
        )
        .all()
    )

    configuration = None
    record = None

    for item in candidates:
        for rec in invitation_records(item).values():
            if rec.get("code") == canonical:
                configuration, record = item, rec
                break
        if configuration is not None:
            break

    if configuration is None:
        raise HTTPException(
            404,
            "This Interview ID was not found. "
            "Check the ID in your invitation email.",
        )

    invited_email = (record.get("email") or "").strip().lower()

    # the ID belongs to ONE e-mail address
    if invited_email != (current_user.email or "").strip().lower():
        raise HTTPException(
            403,
            f"This Interview ID was issued to {mask_email(invited_email)}. "
            "Please log in with that email address.",
        )

    interview = (
        db.query(Interview)
        .filter(Interview.id == configuration.interview_id)
        .first()
    )

    if interview is None:
        raise HTTPException(404, "This interview no longer exists.")

    has_session = (
        db.query(InterviewSession.id)
        .filter(
            InterviewSession.interview_id == interview.id,
            InterviewSession.candidate_id == current_user.id,
        )
        .first()
        is not None
    )

    if interview.status == "closed" and not has_session:
        raise HTTPException(
            400,
            "This interview is no longer accepting candidates.",
        )

    if not record.get("opened_at"):

        extra = dict(configuration.extra_config or {})
        records = dict(extra.get("invitations") or {})

        updated = dict(records.get(invited_email) or {})
        updated["opened_at"] = datetime.now(timezone.utc).isoformat()
        records[invited_email] = updated

        extra["invitations"] = records
        configuration.extra_config = extra

        db.commit()

    job = _job(configuration)

    return {
        "interview_id": str(interview.id),
        "title": interview.title,
        "role": record.get("role") or job["role"] or interview.title,
        "company": job["company"] or settings.company_name,
    }


# =========================================================
# CANDIDATE: ENTER WITH THE EMAIL LINK (no login, no password)
# =========================================================

def _find_invitation(db: Session, canonical: str):
    """(configuration, record) that owns this Interview ID, or (None, None)."""

    rows = (
        db.query(InterviewConfiguration)
        .filter(
            cast(InterviewConfiguration.extra_config, Text).like(
                f"%{canonical}%"
            )
        )
        .all()
    )

    for item in rows:
        for rec in invitation_records(item).values():
            if rec.get("code") == canonical:
                return item, rec

    return None, None


@router.post("/invitations/{code}/enter")
def enter_with_invitation(
    code: str,
    db: Session = Depends(get_db),
):
    """
    Public. The candidate clicks the button in the e-mail
    (/invite/<ID>) and this signs them in as the invited address.

    * The Interview ID is the key - it was e-mailed only to that
      candidate, so there is no login or password.
    * Interviewer / admin accounts can never be entered this way.
    * The candidate account is created automatically on first use.
    """

    canonical = format_code(code)

    if canonical is None:
        raise HTTPException(
            404,
            "This Interview ID is not valid. "
            "Check the ID in your invitation email.",
        )

    configuration, record = _find_invitation(db, canonical)

    if configuration is None:
        raise HTTPException(
            404,
            "This Interview ID was not found. "
            "Check the ID in your invitation email.",
        )

    # module "Open from e-mail without login" is OFF -> normal login
    if not features.is_on(configuration, "passwordless_link"):
        raise HTTPException(403, "LOGIN_REQUIRED")

    invited_email = (record.get("email") or "").strip().lower()

    if not invited_email:
        raise HTTPException(404, "This invitation is not valid.")

    interview = (
        db.query(Interview)
        .filter(Interview.id == configuration.interview_id)
        .first()
    )

    if interview is None:
        raise HTTPException(404, "This interview no longer exists.")

    user = (
        db.query(User)
        .filter(func.lower(User.email) == invited_email)
        .first()
    )

    if user is not None and user.role != "candidate":
        raise HTTPException(
            403,
            "This email belongs to an interviewer account, so it cannot "
            "be used as a candidate.",
        )

    has_session = (
        user is not None
        and db.query(InterviewSession.id)
        .filter(
            InterviewSession.interview_id == interview.id,
            InterviewSession.candidate_id == user.id,
        )
        .first()
        is not None
    )

    if interview.status == "closed" and not has_session:
        raise HTTPException(
            400,
            "This interview is no longer accepting candidates.",
        )

    if user is None:
        user = User(
            name=(
                (record.get("name") or invited_email.split("@")[0])
                or "Candidate"
            )[:100],
            email=invited_email,
            password_hash=None,
            role="candidate",
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    if not record.get("opened_at"):

        extra = dict(configuration.extra_config or {})
        records = dict(extra.get("invitations") or {})

        updated = dict(records.get(invited_email) or {})
        updated["opened_at"] = datetime.now(timezone.utc).isoformat()
        records[invited_email] = updated

        extra["invitations"] = records
        configuration.extra_config = extra

        db.commit()

    job = _job(configuration)

    return {
        "access_token": create_access_token(str(user.id)),
        "token_type": "bearer",
        "user": {
            "id": str(user.id),
            "name": user.name,
            "email": user.email,
            "role": user.role,
        },
        "interview_id": str(interview.id),
        "title": interview.title,
        "role": record.get("role") or job["role"] or interview.title,
        "company": job["company"] or settings.company_name,
    }


# =========================================================
# INTERVIEWER: CANDIDATE LIST
# =========================================================

@router.get("/candidates")
def list_candidates(
    interview_id: UUID | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    _require_recruiter(current_user)

    # "View candidates" on one interview -> only that interview
    scope = None

    if interview_id:

        scoped = _owned_interview(db, current_user, interview_id)
        scoped_config = _get_configuration(db, interview_id)

        scope = {
            "id": str(scoped.id),
            "title": scoped.title,
            "role": _job(scoped_config)["role"] or scoped.title,
            "invited": len(
                set(invitation_records(scoped_config).keys())
                | {
                    str(e).strip().lower()
                    for e in (
                        (scoped_config.extra_config or {}).get("invited")
                        or []
                    )
                }
                if scoped_config
                else []
            ),
        }

    query = (
        db.query(InterviewSession, Interview, User)
        .join(
            Interview,
            Interview.id == InterviewSession.interview_id,
        )
        .join(
            User,
            User.id == InterviewSession.candidate_id,
        )
    )

    if current_user.role != "admin":
        query = query.filter(
            Interview.created_by == current_user.id
        )

    if interview_id:
        query = query.filter(Interview.id == interview_id)

    rows = query.order_by(
        InterviewSession.started_at.desc().nullslast()
    ).all()

    # One candidate + one interview = ONE row, however many times
    # the candidate resumed / reopened it. Keep the most useful
    # session: completed > stopped > in progress, then the newest.
    def _started_ts(session):
        return session.started_at.timestamp() if session.started_at else 0

    def _rank(session):
        order = {"completed": 0, "terminated": 1}
        return (order.get(session.status, 2), -_started_ts(session))

    best = {}

    for row in rows:
        key = (row[2].id, row[1].id)
        kept = best.get(key)

        if kept is None or _rank(row[0]) < _rank(kept[0]):
            best[key] = row

    rows = sorted(
        best.values(),
        key=lambda row: _started_ts(row[0]),
        reverse=True,
    )

    session_ids = [s.id for s, _i, _u in rows]
    interview_ids = list({i.id for _s, i, _u in rows})

    reviews = {}
    reports = {}
    configs = {}

    if session_ids:

        reviews = {
            r.session_id: r
            for r in db.query(SessionReview)
            .filter(SessionReview.session_id.in_(session_ids))
            .all()
        }

        reports = {
            r.session_id: r
            for r in db.query(Report)
            .filter(Report.session_id.in_(session_ids))
            .all()
        }

        configs = {
            c.interview_id: c
            for c in db.query(InterviewConfiguration)
            .filter(
                InterviewConfiguration.interview_id.in_(
                    interview_ids
                )
            )
            .all()
        }

    candidates = []

    summary = {
        "total": 0,
        "completed": 0,
        "pending_review": 0,
        "selected": 0,
        "rejected": 0,
        "flagged": 0,
    }

    for session, interview, candidate in rows:

        review = reviews.get(session.id)
        report = reports.get(session.id)
        policy = _policy(configs.get(interview.id))

        decision = review.decision if review else "pending"

        events = (review.proctoring_events or []) if review else []

        terminated_reason = (
            review.termination_reason if review else None
        )

        flagged = bool(
            terminated_reason
            or session.status == "terminated"
            or events
        )

        summary["total"] += 1

        if session.status == "completed":
            summary["completed"] += 1

            if decision in {"pending", "on_hold"}:
                summary["pending_review"] += 1

        if decision == "selected":
            summary["selected"] += 1

        if decision == "rejected":
            summary["rejected"] += 1

        if flagged:
            summary["flagged"] += 1

        candidates.append(
            {
                "session_id": str(session.id),
                "interview_id": str(interview.id),
                "interview_title": interview.title,
                "role": (
                    (
                        invitation_for(
                            configs.get(interview.id), candidate
                        )
                        or {}
                    ).get("role")
                    or _job(configs.get(interview.id))["role"]
                    or interview.title
                ),
                "candidate": {
                    "id": str(candidate.id),
                    "name": candidate.name,
                    "email": candidate.email,
                },
                "session_status": session.status,
                "started_at": _iso(session.started_at),
                "ended_at": _iso(session.ended_at),
                "duration_seconds": _duration_seconds(session),
                "score": (
                    _num(report.overall_score)
                    if report
                    else None
                ),
                "decision": decision,
                "notification_status": (
                    review.notification_status if review else None
                ),
                "proctoring": {
                    "required": policy["enabled"],
                    "face": policy["face"],
                    "eye": policy["eye"],
                    "terminated_reason": terminated_reason,
                    "event_count": len(events),
                    "flagged": flagged,
                },
            }
        )

    return {
        "summary": summary,
        "candidates": candidates,
        "interview": scope,
    }


# =========================================================
# INTERVIEWER: ANALYTICS
# =========================================================

@router.get("/analytics")
def hiring_analytics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    _require_recruiter(current_user)

    data = list_candidates(
        interview_id=None,
        db=db,
        current_user=current_user,
    )

    rows = data["candidates"]
    summary = data["summary"]

    scores = [
        r["score"] for r in rows if r["score"] is not None
    ]

    durations = [
        r["duration_seconds"]
        for r in rows
        if r["duration_seconds"] is not None
        and r["session_status"] == "completed"
    ]

    buckets = [
        {"label": "0-39", "min": 0, "max": 39.99, "count": 0},
        {"label": "40-59", "min": 40, "max": 59.99, "count": 0},
        {"label": "60-79", "min": 60, "max": 79.99, "count": 0},
        {"label": "80-100", "min": 80, "max": 100, "count": 0},
    ]

    for s in scores:
        for b in buckets:
            if b["min"] <= s <= b["max"]:
                b["count"] += 1
                break

    decisions = {
        "pending": 0,
        "on_hold": 0,
        "selected": 0,
        "rejected": 0,
    }

    per = {}

    for r in rows:

        decisions[r["decision"]] = (
            decisions.get(r["decision"], 0) + 1
        )

        item = per.setdefault(
            r["interview_id"],
            {
                "id": r["interview_id"],
                "title": r["interview_title"],
                "attended": 0,
                "completed": 0,
                "selected": 0,
                "rejected": 0,
                "flagged": 0,
                "scores": [],
            },
        )

        item["attended"] += 1

        if r["session_status"] == "completed":
            item["completed"] += 1

        if r["decision"] == "selected":
            item["selected"] += 1

        if r["decision"] == "rejected":
            item["rejected"] += 1

        if r["proctoring"]["flagged"]:
            item["flagged"] += 1

        if r["score"] is not None:
            item["scores"].append(r["score"])

    per_interview = []

    for item in per.values():
        sc = item.pop("scores")
        item["avg_score"] = (
            round(sum(sc) / len(sc), 1) if sc else None
        )
        per_interview.append(item)

    per_interview.sort(key=lambda x: -x["attended"])

    top = sorted(
        [r for r in rows if r["score"] is not None],
        key=lambda r: -r["score"],
    )[:5]

    return {
        "funnel": {
            "attended": summary["total"],
            "completed": summary["completed"],
            "reviewed": decisions["selected"]
            + decisions["rejected"],
            "selected": decisions["selected"],
            "rejected": decisions["rejected"],
        },
        "decisions": decisions,
        "score_buckets": [
            {"label": b["label"], "count": b["count"]}
            for b in buckets
        ],
        "avg_score": (
            round(sum(scores) / len(scores), 1) if scores else None
        ),
        "avg_duration_seconds": (
            int(sum(durations) / len(durations))
            if durations
            else None
        ),
        "flagged": summary["flagged"],
        "pending_review": summary["pending_review"],
        "per_interview": per_interview,
        "top_candidates": [
            {
                "session_id": r["session_id"],
                "name": r["candidate"]["name"],
                "interview_title": r["interview_title"],
                "score": r["score"],
                "decision": r["decision"],
            }
            for r in top
        ],
    }


# =========================================================
# INTERVIEWER: CANDIDATE DETAIL
# =========================================================

@router.get("/candidates/{session_id}")
def get_candidate_detail(
    session_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    _require_recruiter(current_user)

    session, interview = _session_for_recruiter(
        db, current_user, session_id
    )

    candidate = (
        db.query(User)
        .filter(User.id == session.candidate_id)
        .first()
    )

    configuration = _get_configuration(db, interview.id)
    extra = (
        (configuration.extra_config or {})
        if configuration
        else {}
    )

    review = (
        db.query(SessionReview)
        .filter(SessionReview.session_id == session.id)
        .first()
    )

    # -----------------------------------------------------
    # REPORT (generate if the interview is finished)
    # -----------------------------------------------------

    report = (
        db.query(Report)
        .filter(Report.session_id == session.id)
        .first()
    )

    has_answers = (
        db.query(Answer.id)
        .filter(Answer.session_id == session.id)
        .first()
        is not None
    )

    candidate_feedback = None

    # Build it once. Rebuilding on every page open was the main
    # reason this page felt slow.
    if has_answers and report is None:
        try:
            report = generate_interview_report(
                db=db,
                session_id=session.id,
            )
            db.commit()
        except Exception as exc:
            db.rollback()
            print(f"Report generation skipped: {exc}")
            report = (
                db.query(Report)
                .filter(Report.session_id == session.id)
                .first()
            )

    # -----------------------------------------------------
    # FEEDBACK THE CANDIDATE GETS (strengths / weak / improve)
    # -----------------------------------------------------

    if has_answers:
        try:
            candidate_feedback = candidate_feedback_for_session(
                db, session.id
            )
        except Exception as exc:
            print(f"Candidate feedback skipped: {exc}")
            candidate_feedback = None

    # -----------------------------------------------------
    # QUESTIONS + ANSWERS + SCORES
    # -----------------------------------------------------

    questions = (
        db.query(Question)
        .filter(Question.session_id == session.id)
        .all()
    )

    answers = (
        db.query(Answer)
        .filter(Answer.session_id == session.id)
        .order_by(Answer.answered_at.asc())
        .all()
    )

    answer_by_question = {}
    for a in answers:
        answer_by_question[a.question_id] = a

    answer_ids = [a.id for a in answers]

    scores = {}
    feedbacks = {}

    if answer_ids:
        scores = {
            s.answer_id: s
            for s in db.query(Score)
            .filter(Score.answer_id.in_(answer_ids))
            .all()
        }
        feedbacks = {
            f.answer_id: f
            for f in db.query(Feedback)
            .filter(Feedback.answer_id.in_(answer_ids))
            .all()
        }

    mains = sorted(
        [q for q in questions if q.parent_question_id is None],
        key=lambda q: q.question_order,
    )

    children = {}
    for q in questions:
        if q.parent_question_id is not None:
            children.setdefault(q.parent_question_id, []).append(q)

    ordered = []
    for main in mains:
        ordered.append(main)
        ordered.extend(
            sorted(
                children.get(main.id, []),
                key=lambda q: q.created_at,
            )
        )

    qa = []
    totals = {
        "relevance": [],
        "accuracy": [],
        "technical_knowledge": [],
        "completeness": [],
        "communication": [],
    }

    for q in ordered:

        a = answer_by_question.get(q.id)
        s = scores.get(a.id) if a else None
        f = feedbacks.get(a.id) if a else None

        if s is not None:
            for key in totals:
                value = _num(getattr(s, key))
                if value is not None:
                    totals[key].append(value)

        qa.append(
            {
                "question_id": str(q.id),
                "order": q.question_order,
                "is_follow_up": q.parent_question_id is not None,
                "category": q.category,
                "type": q.type,
                "question": q.question,
                "answer": a.answer_text if a else None,
                "scores": (
                    {
                        "relevance": _num(s.relevance),
                        "accuracy": _num(s.accuracy),
                        "technical_knowledge": _num(
                            s.technical_knowledge
                        ),
                        "completeness": _num(s.completeness),
                        "communication": _num(s.communication),
                        "overall": _num(s.overall_score),
                    }
                    if s
                    else None
                ),
                "feedback": f.feedback_text if f else None,
            }
        )

    skills = {
        key: (
            round(sum(values) / len(values), 2)
            if values
            else None
        )
        for key, values in totals.items()
    }

    # -----------------------------------------------------
    # CANDIDATE HISTORY (this interviewer's interviews)
    # -----------------------------------------------------

    history_query = (
        db.query(InterviewSession, Interview)
        .join(
            Interview,
            Interview.id == InterviewSession.interview_id,
        )
        .filter(
            InterviewSession.candidate_id == session.candidate_id,
            InterviewSession.id != session.id,
        )
    )

    if current_user.role != "admin":
        history_query = history_query.filter(
            Interview.created_by == current_user.id
        )

    history = []

    history_rows = history_query.all()

    if history_rows:

        h_ids = [h_session.id for h_session, _i in history_rows]

        h_reports = {
            r.session_id: r
            for r in db.query(Report)
            .filter(Report.session_id.in_(h_ids))
            .all()
        }

        h_reviews = {
            r.session_id: r
            for r in db.query(SessionReview)
            .filter(SessionReview.session_id.in_(h_ids))
            .all()
        }

        for h_session, h_interview in history_rows:

            h_report = h_reports.get(h_session.id)
            h_review = h_reviews.get(h_session.id)

            history.append(
                {
                    "session_id": str(h_session.id),
                    "interview_title": h_interview.title,
                    "status": h_session.status,
                    "score": (
                        _num(h_report.overall_score)
                        if h_report
                        else None
                    ),
                    "decision": (
                        h_review.decision if h_review else "pending"
                    ),
                }
            )

    policy = _policy(configuration)

    return {
        "session": {
            "id": str(session.id),
            "status": session.status,
            "started_at": _iso(session.started_at),
            "ended_at": _iso(session.ended_at),
            "duration_seconds": _duration_seconds(session),
            "current_question": session.current_question,
        },
        "candidate": {
            "id": str(candidate.id) if candidate else None,
            "name": candidate.name if candidate else "Unknown",
            "email": candidate.email if candidate else None,
            "joined_at": (
                _iso(candidate.created_at) if candidate else None
            ),
        },
        "interview": {
            "id": str(interview.id),
            "title": interview.title,
            "description": interview.description,
            "duration": interview.duration,
            "status": interview.status,
            "difficulty": (
                configuration.difficulty if configuration else None
            ),
            "knowledge_expectation": (
                configuration.knowledge_expectation
                if configuration
                else None
            ),
            "categories": extra.get("categories") or [],
            "question_count": extra.get("question_count"),
            "job": _job(configuration),
            "assigned_role": (
                (
                    invitation_for(configuration, candidate) or {}
                ).get("role")
                if candidate
                else None
            )
            or _job(configuration)["role"]
            or interview.title,
        },
        "analysis": {
            "overall_score": (
                _num(report.overall_score) if report else None
            ),
            "summary": report.summary if report else None,
            "skills": skills,
            "questions": qa,
        },
        "candidate_feedback": candidate_feedback,
        "features": features.simple(configuration),
        "monitoring": {
            "required": policy["enabled"],
            "face": policy["face"],
            "eye": policy["eye"],
            "terminated_reason": (
                review.termination_reason if review else None
            ),
            "events": (
                (review.proctoring_events or []) if review else []
            ),
            # interviewer-only; None when nothing was measured
            "gaze": (
                build_gaze_report(review.gaze_metrics)
                if review and policy["eye"]
                else None
            ),
        },
        "review": {
            "decision": review.decision if review else "pending",
            "note": review.decision_note if review else None,
            "decided_at": (
                _iso(review.decided_at) if review else None
            ),
            "notification_status": (
                review.notification_status if review else None
            ),
            "notified_at": (
                _iso(review.notified_at) if review else None
            ),
            "ack_sent_at": (
                _iso(review.ack_sent_at) if review else None
            ),
        },
        "history": history,
    }


# =========================================================
# INTERVIEWER: DOWNLOAD REPORT AS PDF
# =========================================================

@router.get("/candidates/{session_id}/report.pdf")
def download_candidate_report_pdf(
    session_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_recruiter(current_user)

    session, _interview = _session_for_recruiter(
        db, current_user, session_id
    )

    # build the report row once if answers exist but it is missing
    has_report = (
        db.query(Report.id)
        .filter(Report.session_id == session.id)
        .first()
        is not None
    )

    if not has_report:
        try:
            generate_interview_report(db=db, session_id=session.id)
            db.commit()
        except Exception as exc:
            db.rollback()
            print(f"Report generation skipped: {exc}")

    try:
        pdf_bytes, pdf_name = build_report_pdf_for_session(db, session.id)

    except Exception as exc:
        print(f"PDF report failed: {exc}")
        raise HTTPException(
            status_code=500,
            detail="Could not build the PDF report",
        )

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{pdf_name}"'
        },
    )


# =========================================================
# INTERVIEWER: DECISION (+ result e-mail)
# =========================================================

@router.post("/candidates/{session_id}/decision")
def set_decision(
    session_id: UUID,
    body: DecisionRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    _require_recruiter(current_user)

    session, interview = _session_for_recruiter(
        db, current_user, session_id
    )

    candidate = (
        db.query(User)
        .filter(User.id == session.candidate_id)
        .first()
    )

    review = _get_or_create_review(db, session.id)

    previous_decision = review.decision
    already_notified = review.notified_at is not None

    review.decision = body.decision
    review.decision_note = (body.note or "").strip() or None
    review.decided_by = current_user.id
    review.decided_at = datetime.now(timezone.utc)

    email_state = "not_sent"

    decision_config = _get_configuration(db, interview.id)

    wants_email = (
        body.send_email
        and body.decision in {"selected", "rejected"}
        and candidate is not None
    )

    # module "Selected / rejected e-mail" is OFF -> decision saved, no mail
    if wants_email and not features.is_on(decision_config, "email_decision"):
        wants_email = False
        email_state = "module_off"

    # Do not e-mail twice for the same decision
    if (
        wants_email
        and previous_decision == body.decision
        and already_notified
    ):
        wants_email = False
        email_state = "already_sent"

    if wants_email:

        # strengths / weak points / how to improve for the candidate
        feedback = None

        if features.is_on(decision_config, "email_decision_feedback"):
            try:
                feedback = candidate_feedback_for_session(db, session.id)
            except Exception as exc:
                print(f"Candidate feedback skipped: {exc}")
                feedback = None

        if body.decision == "selected":
            subject, text = build_selected_email(
                candidate.name,
                interview.title,
                review.decision_note,
                feedback,
            )
        else:
            subject, text = build_rejected_email(
                candidate.name,
                interview.title,
                feedback,
            )

        identity = _mail_identity(decision_config, current_user)

        review.notification_status = "queued"
        review.notified_at = None

        email_state = "queued"

        review_id = review.id
        to_email = candidate.email

        db.commit()

        background_tasks.add_task(
            _send_decision_email_task,
            review_id,
            to_email,
            subject,
            text,
            identity["from_name"],
            identity["reply_to"],
            identity["mailbox"],
        )

    else:
        db.commit()

    return {
        "success": True,
        "decision": body.decision,
        "email": email_state,
    }


# =========================================================
# CANDIDATE: CONTACT / SUBMITTED / STATUS / EVENTS
# =========================================================

@router.post("/sessions/{session_id}/submitted")
def interview_submitted(
    session_id: UUID,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Called by the candidate screen right after the interview ends.
    Tells the interviewer the report is ready (once). There is no
    "thank you, we received your interview" mail to the candidate.
    """

    session = _own_session(db, current_user, session_id)

    interview = (
        db.query(Interview)
        .filter(Interview.id == session.interview_id)
        .first()
    )

    review = _get_or_create_review(db, session.id)

    if session.status == "completed" and review.ack_sent_at is None:

        # tell the interviewer the report is ready
        background_tasks.add_task(
            notify_interviewer_task,
            session.id,
        )

        # remembers that the report mail was handled, so it is never
        # repeated when the candidate screen calls this again
        review.ack_sent_at = datetime.now(timezone.utc)
        db.commit()

    else:
        db.commit()

    return {
        "success": True,
        "message": (
            "Your interview was submitted. If you are selected, "
            "our team will contact you. Otherwise you will "
            "receive an email."
        ),
    }


@router.get("/sessions/{session_id}/status")
def candidate_status(
    session_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Candidate-safe view: no score, no analysis.
    """

    session = _own_session(db, current_user, session_id)

    interview = (
        db.query(Interview)
        .filter(Interview.id == session.interview_id)
        .first()
    )

    review = (
        db.query(SessionReview)
        .filter(SessionReview.session_id == session.id)
        .first()
    )

    return {
        "session_status": session.status,
        "result": _public_decision(review),
        "interview": {
            "id": str(interview.id) if interview else None,
            "title": interview.title if interview else None,
            "description": (
                interview.description if interview else None
            ),
        },
    }


@router.post("/sessions/{session_id}/monitoring-event")
def monitoring_event(
    session_id: UUID,
    body: MonitoringEventRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    session = _own_session(db, current_user, session_id)

    review = _get_or_create_review(db, session.id)

    events = list(review.proctoring_events or [])

    if len(events) >= 200:
        db.commit()
        return {"success": True, "stored": False}

    events.append(
        {
            "type": body.type,
            "detail": body.detail,
            "at": datetime.now(timezone.utc).isoformat(),
        }
    )

    review.proctoring_events = events

    db.commit()

    return {"success": True, "stored": True}


# =========================================================
# CANDIDATE BROWSER -> PER-QUESTION GAZE NUMBERS
# (write only. The candidate never gets these back.)
# =========================================================

class GazeSummaryRequest(BaseModel):
    question: int = Field(..., ge=1, le=100)
    answer_ms: int = Field(..., ge=0, le=1_800_000)
    on_screen_ms: int = Field(..., ge=0, le=1_800_000)
    side_ms: int = Field(0, ge=0, le=1_800_000)
    down_ms: int = Field(0, ge=0, le=1_800_000)
    phone_ms: int = Field(0, ge=0, le=1_800_000)
    glances: int = Field(0, ge=0, le=1000)
    sweeps: int = Field(0, ge=0, le=1000)


@router.post("/sessions/{session_id}/gaze-summary")
def gaze_summary(
    session_id: UUID,
    body: GazeSummaryRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    session = _own_session(db, current_user, session_id)

    review = _get_or_create_review(db, session.id)

    items = list(review.gaze_metrics or [])

    entry = body.model_dump()

    # clean obvious nonsense from the browser
    entry["on_screen_ms"] = min(entry["on_screen_ms"], entry["answer_ms"])
    entry["side_ms"] = min(entry["side_ms"], entry["answer_ms"])
    entry["down_ms"] = min(entry["down_ms"], entry["answer_ms"])
    entry["phone_ms"] = min(entry["phone_ms"], entry["answer_ms"])

    for index, old in enumerate(items):
        if old.get("question") == body.question:
            # the browser sends running totals; keep the biggest one
            if entry["answer_ms"] >= (old.get("answer_ms") or 0):
                items[index] = entry
            break
    else:
        items.append(entry)

    # reassign so the JSON column is saved
    review.gaze_metrics = items

    db.commit()

    return {"success": True}