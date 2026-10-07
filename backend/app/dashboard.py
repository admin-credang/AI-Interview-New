from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy import Text, and_, cast, func, or_, select
from sqlalchemy.orm import Session

from app.database import SessionLocal, get_db
from app.api.auth.auth import get_current_user

from app.models.user import User
from app.models.interview import Interview
from app.models.session import InterviewSession
from app.models.report import Report
from app.models.session_review import SessionReview
from app.models.interview_configuration import InterviewConfiguration

from app.services.interview_policy import (
    follow_up_policy,
    invitation_for,
    is_invited,
)
from app.services.report_service import generate_interview_report


router = APIRouter(
    prefix="/dashboard",
    tags=["Dashboard"],
)


# =========================================================
# BACKGROUND: create reports that are still missing
#
# This used to run INSIDE the GET /dashboard request (one extra
# query + one report generation per completed interview), which
# is what made every page feel slow. It now runs after the
# response has been sent.
# =========================================================

def _generate_missing_reports(session_ids: list) -> None:

    for session_id in session_ids:

        db = SessionLocal()

        try:
            generate_interview_report(db=db, session_id=session_id)
            db.commit()

        except Exception as exc:
            db.rollback()
            print(f"Could not generate report for {session_id}: {exc}")

        finally:
            db.close()


def _iso(value):
    return value.isoformat() if value else None


# =========================================================
# GET /dashboard
# =========================================================

@router.get("")
def get_dashboard(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user_id = current_user.id

    # =====================================================
    # INTERVIEWER DASHBOARD
    # =====================================================

    if current_user.role == "interviewer":

        total_interviews = (
            db.query(func.count(Interview.id))
            .filter(Interview.created_by == user_id)
            .scalar()
            or 0
        )

        completed_interviews = (
            db.query(func.count(InterviewSession.id))
            .join(
                Interview,
                Interview.id == InterviewSession.interview_id,
            )
            .filter(
                Interview.created_by == user_id,
                InterviewSession.status == "completed",
            )
            .scalar()
            or 0
        )

        # completed sessions that have no report yet (one query)
        missing_report_ids = [
            row[0]
            for row in (
                db.query(InterviewSession.id)
                .join(
                    Interview,
                    Interview.id == InterviewSession.interview_id,
                )
                .outerjoin(
                    Report,
                    Report.session_id == InterviewSession.id,
                )
                .filter(
                    Interview.created_by == user_id,
                    InterviewSession.status == "completed",
                    Report.session_id.is_(None),
                )
                .all()
            )
        ]

        if missing_report_ids:
            background_tasks.add_task(
                _generate_missing_reports,
                missing_report_ids,
            )

        average_score = (
            db.query(func.avg(Report.overall_score))
            .join(
                InterviewSession,
                InterviewSession.id == Report.session_id,
            )
            .join(
                Interview,
                Interview.id == InterviewSession.interview_id,
            )
            .filter(Interview.created_by == user_id)
            .scalar()
        )

        interviews = (
            db.query(Interview)
            .filter(Interview.created_by == user_id)
            .order_by(Interview.created_at.desc())
            .all()
        )

        return {
            "role": current_user.role,

            "user": {
                "id": str(current_user.id),
                "name": current_user.name,
                "email": current_user.email,
            },

            "stats": {
                "total_interviews": total_interviews,
                "completed_interviews": completed_interviews,
                "average_score": (
                    round(float(average_score), 2)
                    if average_score is not None
                    else None
                ),
            },

            "interviews": [
                {
                    "id": str(i.id),
                    "title": i.title,
                    "description": i.description,
                    "duration": i.duration,
                    "status": i.status,
                    "created_at": _iso(i.created_at),
                }
                for i in interviews
            ],
        }

    # =====================================================
    # CANDIDATE DASHBOARD
    #
    # A candidate sees ONLY
    #   - interviews the interviewer invited this e-mail to
    #   - interviews the candidate already started / finished
    # Nothing else is visible to them.
    # =====================================================

    email = (current_user.email or "").strip().lower()

    own_interview_ids = select(
        InterviewSession.interview_id
    ).where(InterviewSession.candidate_id == user_id)

    # cheap SQL pre-filter (superset); the exact check is below
    maybe_invited_ids = select(
        InterviewConfiguration.interview_id
    ).where(
        cast(InterviewConfiguration.extra_config, Text).ilike(
            f"%{email}%"
        )
    )

    candidate_interviews = (
        db.query(Interview)
        .filter(
            or_(
                Interview.id.in_(own_interview_ids),
                and_(
                    Interview.status.in_(["draft", "active"]),
                    Interview.id.in_(maybe_invited_ids),
                ),
            )
        )
        .order_by(Interview.created_at.desc())
        .all()
    )

    interview_ids = [i.id for i in candidate_interviews]

    # ---- all of this candidate's sessions (one query) ----

    sessions = (
        db.query(InterviewSession)
        .filter(InterviewSession.candidate_id == user_id)
        .order_by(InterviewSession.started_at.desc().nullslast())
        .all()
    )

    latest_session = {}

    for s in sessions:
        latest_session.setdefault(s.interview_id, s)

    total_interviews = len(sessions)

    completed_interviews = sum(
        1 for s in sessions if s.status == "completed"
    )

    # ---- configs + decisions (one query each) ----

    configs = {}

    if interview_ids:
        configs = {
            cfg.interview_id: cfg
            for cfg in db.query(InterviewConfiguration)
            .filter(
                InterviewConfiguration.interview_id.in_(interview_ids)
            )
            .all()
        }

    reviews = {}

    if sessions:
        reviews = {
            rev.session_id: rev
            for rev in db.query(SessionReview)
            .filter(
                SessionReview.session_id.in_([s.id for s in sessions])
            )
            .all()
        }

    available_interview_list = []

    for interview in candidate_interviews:

        existing_session = latest_session.get(interview.id)
        cfg = configs.get(interview.id)

        # exact invite check (people with a session always pass)
        if existing_session is None and not is_invited(cfg, current_user):
            continue

        extra = (cfg.extra_config or {}) if cfg else {}
        job = extra.get("job") or {}
        proctoring = extra.get("proctoring") or {}
        follow_ups = follow_up_policy(cfg)

        # The role the interviewer FIXED for this candidate in the
        # invitation e-mail. The candidate sees only this role.
        invitation = invitation_for(cfg, current_user) or {}
        assigned_role = (
            invitation.get("role") or job.get("role") or ""
        )

        session_data = None

        if existing_session is not None:

            session_data = {
                "id": str(existing_session.id),
                "status": existing_session.status,
                "current_question": existing_session.current_question,
                "started_at": _iso(existing_session.started_at),
                "ended_at": _iso(existing_session.ended_at),
            }

            review = reviews.get(existing_session.id)

            if review is not None and review.decision == "selected":
                session_data["result"] = "selected"
            elif review is not None and review.decision == "rejected":
                session_data["result"] = "not_selected"
            else:
                session_data["result"] = "under_review"

        available_interview_list.append(
            {
                "id": str(interview.id),
                "title": interview.title,
                "description": interview.description,
                "duration": interview.duration,
                "status": interview.status,
                "created_at": _iso(interview.created_at),
                "session": session_data,
                "invitation_code": invitation.get("code"),
                "job": {
                    "role": assigned_role,
                    "company": job.get("company") or "",
                    "location": job.get("location") or "",
                    "employment_type": job.get("employment_type") or "",
                    "experience": job.get("experience") or "",
                    "skills": job.get("skills") or [],
                    "responsibilities": job.get("responsibilities") or "",
                },
                "monitoring_required": bool(
                    proctoring.get("enabled", False)
                ),
                "follow_ups_enabled": follow_ups["enabled"],
                "question_count": extra.get("question_count"),
            }
        )

    return {
        "role": current_user.role,

        "user": {
            "id": str(current_user.id),
            "name": current_user.name,
            "email": current_user.email,
        },

        "stats": {
            "total_interviews": total_interviews,
            "completed_interviews": completed_interviews,
            # candidates never see scores
            "average_score": None,
        },

        "available_interviews": available_interview_list,
    }
