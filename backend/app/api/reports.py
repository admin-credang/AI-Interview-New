from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.api.auth.dependencies import get_current_user

from app.models.user import User
from app.models.session import InterviewSession

from app.schemas.report import ReportResponse

from app.services.report_service import generate_interview_report


router = APIRouter(
    prefix="/sessions",
    tags=["Reports"]
)


@router.get(
    "/{session_id}/report",
    response_model=ReportResponse
)
def get_interview_report(
    session_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    session = (
        db.query(InterviewSession)
        .filter(
            InterviewSession.id == session_id
        )
        .first()
    )

    if session is None:
        raise HTTPException(
            status_code=404,
            detail="Interview session not found"
        )

    # Candidate can only access their own report
    if (
        current_user.role == "candidate"
        and session.candidate_id != current_user.id
    ):
        raise HTTPException(
            status_code=403,
            detail="You can only access your own report"
        )

    try:

        report = generate_interview_report(
            db=db,
            session_id=session_id
        )

        return report

    except ValueError as e:

        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    except Exception as e:

        print("❌ REPORT GENERATION ERROR:")
        print(str(e))

        raise HTTPException(
            status_code=500,
            detail="Failed to generate interview report"
        )