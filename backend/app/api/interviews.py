from uuid import UUID
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.api.auth.dependencies import get_current_user

from app.models.user import User
from app.models.interview import Interview
from app.models.session import InterviewSession

from app.schemas.session import SessionCreate, SessionResponse


router = APIRouter(
    prefix="/interviews",
    tags=["Interviews"]
)


# =========================
# CREATE INTERVIEW SESSION
# =========================

@router.post(
    "/{interview_id}/sessions",
    response_model=SessionResponse,
    status_code=status.HTTP_201_CREATED
)
def create_session(
    interview_id: UUID,
    session_data: SessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    # 1. Only candidates can start an interview
    if current_user.role != "candidate":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only candidates can start interview sessions"
        )

    # 2. Check interview exists
    interview = (
        db.query(Interview)
        .filter(
            Interview.id == interview_id
        )
        .first()
    )

    if interview is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview not found"
        )

    # 3. Make sure candidate_id matches logged-in user
    if session_data.candidate_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only create a session for yourself"
        )

    # 4. Check if candidate already has an active session
    
        return existing_session

    # 5. Create new session
    session = InterviewSession(
        interview_id=interview_id,
        candidate_id=current_user.id,
        started_at=datetime.now(timezone.utc),
        status="in_progress",
        current_question=1
    )

    db.add(session)
    db.commit()
    db.refresh(session)

    return session