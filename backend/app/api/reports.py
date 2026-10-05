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

    # Evaluation reports are for the hiring team only.
    # Candidates are told the result by call / e-mail.
    if current_user.role == "candidate":
        raise HTTPException(
            status_code=403,
            detail=(
                "Interview reports are shared by the "
                "hiring team only"
            )
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