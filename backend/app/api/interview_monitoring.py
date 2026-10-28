from datetime import datetime, timezone
from uuid import UUID

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    status,
)
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.api.auth.dependencies import get_current_user
from app.models.interview import Interview
from app.models.user import User
from app.models.session import InterviewSession
from app.models.session_review import SessionReview


router = APIRouter(
    prefix="/interview-monitoring",
    tags=["Interview Monitoring"],
)


# =========================================================
# REQUEST SCHEMA
# =========================================================

class TerminateInterviewRequest(BaseModel):
    session_id: UUID
    reason: str


# =========================================================
# TERMINATE INTERVIEW
# =========================================================

@router.post("/terminate")
def terminate_interview(
    request: TerminateInterviewRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    interview_session = (
        db.query(InterviewSession)
        .filter(
            InterviewSession.id == request.session_id
        )
        .first()
    )

    if not interview_session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview session not found",
        )

    if current_user.role == "candidate":
        if interview_session.candidate_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This is not your interview session",
            )
    elif current_user.role in {"interviewer", "admin"}:
        interview = (
            db.query(Interview)
            .filter(Interview.id == interview_session.interview_id)
            .first()
        )
        if interview is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Interview not found",
            )
        if (
            current_user.role != "admin"
            and interview.created_by != current_user.id
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not own this interview",
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot terminate interview sessions",
        )

    # Already terminated
    if interview_session.status == "terminated":
        return {
            "success": True,
            "session_id": str(interview_session.id),
            "status": "terminated",
            "reason": request.reason,
            "message": "Interview was already terminated",
        }

    # =====================================================
    # TERMINATE SESSION
    # =====================================================

    interview_session.status = "terminated"
    interview_session.ended_at = datetime.now(timezone.utc)

    review = (
        db.query(SessionReview)
        .filter(
            SessionReview.session_id == interview_session.id
        )
        .first()
    )

    if review is None:
        review = SessionReview(
            session_id=interview_session.id,
            decision="pending",
        )
        db.add(review)

    review.termination_reason = (request.reason or "")[:255]

    db.commit()
    db.refresh(interview_session)

    # tell the interviewer why the interview was stopped
    from app.api.hiring import notify_interviewer_task

    background_tasks.add_task(
        notify_interviewer_task,
        interview_session.id,
    )

    return {
        "success": True,
        "session_id": str(interview_session.id),
        "status": interview_session.status,
        "reason": request.reason,
        "ended_at": (
            interview_session.ended_at.isoformat()
            if interview_session.ended_at
            else None
        ),
        "message": "Interview terminated successfully",
    }