"""
HIRING API

Interviewer / admin side
    GET  /hiring/interviews                       interviews + monitoring + job settings
    POST /hiring/interviews/{id}/status           open / close for new candidates
    POST /hiring/interviews/{id}/invite           e-mail invitation links
    GET  /hiring/analytics                        funnel, score spread, per-interview stats
    PUT  /hiring/interviews/{id}/settings         change monitoring + job details
    GET  /hiring/candidates                       every candidate who attended
    GET  /hiring/candidates/{session_id}          profile + analysis + monitoring
    POST /hiring/candidates/{session_id}/decision select / reject / hold (+ e-mail)

Candidate side (own session only, never sees scores)
    POST /hiring/sessions/{session_id}/submitted  "thanks" e-mail after completion
    GET  /hiring/sessions/{session_id}/status     under review / selected / not selected
    POST /hiring/sessions/{session_id}/monitoring-event
"""

import re
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    status,
)
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.auth.auth import get_current_user
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
from app.services.email_service import (
    build_ack_email,
    build_interviewer_report_email,
    build_invite_email,
    build_rejected_email,
    build_selected_email,
    send_email,
)
from app.services.report_service import generate_interview_report
from app.services.interview_policy import follow_up_policy


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

    enabled = False  -> no camera, no face, no eye. Interview works normally.
    enabled = True   -> camera is required, plus face and/or eye as chosen.
    """

    extra = (
        (configuration.extra_config or {})
        if configuration
        else {}
    )

    raw = extra.get("proctoring") or {}

    enabled = bool(raw.get("enabled", False))

    return {
        "enabled": enabled,
        "face": enabled and bool(raw.get("face", True)),
        "eye": enabled and bool(raw.get("eye", True)),
    }


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
) -> None:

    sent, state = send_email(to_email, subject, body)

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


def _send_ack_email_task(
    review_id,
    to_email: str,
    subject: str,
    body: str,
) -> None:

    sent, _state = send_email(to_email, subject, body)

    if not sent:
        return

    db = SessionLocal()

    try:

        review = (
            db.query(SessionReview)
            .filter(SessionReview.id == review_id)
            .first()
        )

        if review is not None:
            review.ack_sent_at = datetime.now(timezone.utc)
            db.commit()

    except Exception as exc:
        print(f"Could not save ack status: {exc}")
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

        subject, text = build_interviewer_report_email(
            interviewer.name,
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

        send_email(interviewer.email, subject, text)

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


class InterviewSettingsUpdate(BaseModel):
    proctoring: ProctoringSettings | None = None
    job: JobDetails | None = None
    follow_ups: FollowUpSettings | None = None


class StatusRequest(BaseModel):
    open: bool


class InviteRequest(BaseModel):
    emails: list[str] = Field(..., min_length=1, max_length=50)


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
        "eyes_closed",
        "tab_left",
    ]
    detail: str | None = Field(None, max_length=200)


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
                "invited_count": len(extra.get("invited") or []),
                "has_configuration": configuration is not None,
                "question_count": extra.get("question_count"),
                "proctoring": _policy(configuration),
                "follow_ups": follow_up_policy(configuration),
                "job": _job(configuration),
                "candidates_total": len(sessions),
                "candidates_completed": len(completed),
                "pending_review": len(pending),
            }
        )

    return {"interviews": result}


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
        extra["proctoring"] = body.proctoring.model_dump()

    if body.follow_ups is not None:
        extra["follow_ups"] = body.follow_ups.model_dump()

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


def _send_invite_task(
    emails: list[str],
    subject: str,
    body: str,
) -> None:

    for address in emails:
        send_email(address, subject, body)


@router.post("/interviews/{interview_id}/invite")
def invite_candidates(
    interview_id: UUID,
    body: InviteRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    _require_recruiter(current_user)

    interview = _owned_interview(db, current_user, interview_id)

    configuration = _get_configuration(db, interview_id)

    valid = []
    invalid = []

    for raw in body.emails:
        address = (raw or "").strip().lower()
        if not address:
            continue
        if _EMAIL_RE.match(address):
            if address not in valid:
                valid.append(address)
        elif address not in invalid:
            invalid.append(address)

    if not valid:
        raise HTTPException(
            422, "Enter at least one valid email address"
        )

    link = (
        f"{settings.frontend_url.rstrip('/')}"
        f"/interviews/{interview.id}"
    )

    job = _job(configuration)

    subject, text = build_invite_email(
        job["role"] or interview.title,
        link,
        _policy(configuration)["enabled"],
        company=job["company"] or None,
        duration=interview.duration,
        question_count=(
            (configuration.extra_config or {}).get("question_count")
            if configuration
            else None
        ),
    )

    background_tasks.add_task(
        _send_invite_task,
        valid,
        subject,
        text,
    )

    # remember who was invited
    if configuration is not None:
        extra = dict(configuration.extra_config or {})
        invited = set(extra.get("invited") or [])
        invited.update(valid)
        extra["invited"] = sorted(invited)
        configuration.extra_config = extra

    db.commit()

    return {
        "success": True,
        "queued": len(valid),
        "invalid": invalid,
        "link": link,
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

    if has_answers and (
        report is None or session.status == "completed"
    ):
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

    for h_session, h_interview in history_query.all():
        h_report = (
            db.query(Report)
            .filter(Report.session_id == h_session.id)
            .first()
        )
        h_review = (
            db.query(SessionReview)
            .filter(SessionReview.session_id == h_session.id)
            .first()
        )
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
        },
        "analysis": {
            "overall_score": (
                _num(report.overall_score) if report else None
            ),
            "summary": report.summary if report else None,
            "skills": skills,
            "questions": qa,
        },
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

    wants_email = (
        body.send_email
        and body.decision in {"selected", "rejected"}
        and candidate is not None
    )

    # Do not e-mail twice for the same decision
    if (
        wants_email
        and previous_decision == body.decision
        and already_notified
    ):
        wants_email = False
        email_state = "already_sent"

    if wants_email:

        if body.decision == "selected":
            subject, text = build_selected_email(
                candidate.name,
                interview.title,
                review.decision_note,
            )
        else:
            subject, text = build_rejected_email(
                candidate.name,
                interview.title,
            )

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
    Sends the "thanks - we will call you if selected, otherwise
    you will get an e-mail" message once.
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

        subject, text = build_ack_email(
            current_user.name,
            interview.title if interview else "your interview",
        )

        review_id = review.id
        to_email = current_user.email

        db.commit()

        background_tasks.add_task(
            _send_ack_email_task,
            review_id,
            to_email,
            subject,
            text,
        )

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
