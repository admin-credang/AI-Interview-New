from uuid import UUID
from datetime import datetime, timezone
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app import features
from app.database import get_db
from app.api.auth.dependencies import get_current_user

from app.models.user import User
from app.models.interview import Interview
from app.models.session import InterviewSession
from app.models.interview_configuration import InterviewConfiguration
from app.models.question import Question

from app.schemas.interview import (
    InterviewCreate,
    InterviewResponse,
)

from app.schemas.session import (
    SessionCreate,
    SessionResponse,
)

from app.services.question_service import (
    append_compulsory_questions,
    generate_questions,
)
from app.services.resume_service import resume_text_for
from app.services.interview_policy import (
    NOT_INVITED_MESSAGE,
    candidate_can_access,
    follow_up_policy,
    invited_role,
    owns_interview,
)
from app.services.warmup_service import generate_warmup_response


router = APIRouter(
    prefix="/interviews",
    tags=["Interviews"],
)

logger = logging.getLogger(__name__)


class WarmupReplyRequest(BaseModel):
    session_id: UUID
    answer: str = Field(min_length=1, max_length=400)


@router.post("/{interview_id}/warmup-response")
def create_warmup_response(
    interview_id: UUID,
    request: WarmupReplyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "candidate":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only candidates can use interview warm-up.",
        )

    session = (
        db.query(InterviewSession)
        .filter(
            InterviewSession.id == request.session_id,
            InterviewSession.interview_id == interview_id,
            InterviewSession.candidate_id == current_user.id,
            InterviewSession.status == "in_progress",
        )
        .first()
    )
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Active interview session not found.",
        )

    try:
        response = generate_warmup_response(request.answer)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        logger.exception("Interview warm-up response generation failed")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Warm-up response is temporarily unavailable.",
        ) from exc

    return {"text": response}


# =========================================================
# CREATE INTERVIEW
# =========================================================

@router.post(
    "",
    response_model=InterviewResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_interview(
    interview_data: InterviewCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create a new interview.

    Automatically creates a default InterviewConfiguration.
    """

    # -----------------------------------------------------
    # 1. ROLE CHECK
    # -----------------------------------------------------

    if current_user.role not in {"interviewer", "admin"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only interviewers and admins can create interviews",
        )

    # -----------------------------------------------------
    # 2. CREATE INTERVIEW
    # -----------------------------------------------------

    interview = Interview(
        title=interview_data.title,
        description=interview_data.description,
        created_by=current_user.id,
        duration=interview_data.duration,
        status="draft",
    )

    try:

        db.add(interview)

        # Generate interview UUID
        db.flush()

        # -------------------------------------------------
        # 3. CREATE DEFAULT CONFIGURATION
        # -------------------------------------------------

        configuration = InterviewConfiguration(
            interview_id=interview.id,
            construct_from_answers=True,
            difficulty="medium",
            knowledge_expectation="intermediate",
            extra_config={},
        )

        db.add(configuration)

        # -------------------------------------------------
        # 4. COMMIT
        # -------------------------------------------------

        db.commit()

        db.refresh(interview)

    except IntegrityError:

        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to create interview because of a database constraint",
        )

    except Exception as e:

        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create interview: {str(e)}",
        )

    return interview


# =========================================================
# GET INTERVIEW
# =========================================================

@router.get(
    "/{interview_id}",
    response_model=InterviewResponse,
)
def get_interview(
    interview_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get interview details.
    """

    # -----------------------------------------------------
    # 1. FIND INTERVIEW
    # -----------------------------------------------------

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
            detail="Interview not found",
        )

    # -----------------------------------------------------
    # 2. INTERVIEWER / ADMIN
    # -----------------------------------------------------

    if current_user.role in {"interviewer", "admin"}:

        if (
            current_user.role != "admin"
            and interview.created_by != current_user.id
        ):

            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this interview",
            )

    # -----------------------------------------------------
    # 3. CANDIDATE
    # -----------------------------------------------------

    elif current_user.role == "candidate":

        # Only invited candidates (or people who already have a
        # session) may open an interview.
        if not candidate_can_access(
            db, interview.id, current_user
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=NOT_INVITED_MESSAGE,
            )

    else:

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this interview",
        )

    return interview


# =========================================================
# LOBBY (one light request instead of /configuration + /dashboard)
# =========================================================

@router.get("/{interview_id}/lobby")
def get_interview_lobby(
    interview_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Everything the candidate lobby needs, in ONE query round.

    Candidates only get what they are allowed to see: no invited
    e-mail list, no scores.
    """

    interview = (
        db.query(Interview)
        .filter(Interview.id == interview_id)
        .first()
    )

    if interview is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview not found",
        )

    configuration = (
        db.query(InterviewConfiguration)
        .filter(
            InterviewConfiguration.interview_id == interview_id
        )
        .first()
    )

    if current_user.role == "candidate":

        if not candidate_can_access(
            db, interview.id, current_user, configuration
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=NOT_INVITED_MESSAGE,
            )

    elif not owns_interview(current_user, interview):

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this interview",
        )

    extra = (
        (configuration.extra_config or {})
        if configuration
        else {}
    )

    proctoring = extra.get("proctoring") or {}
    job = extra.get("job") or {}
    follow_ups = follow_up_policy(configuration)
    module = features.simple(configuration)

    # candidates only see the role (the "Job details" module was removed)
    job = {"role": job.get("role") or ""}

    # candidate sees the role the interviewer fixed for them
    assigned_role = (
        invited_role(configuration, current_user)
        if current_user.role == "candidate"
        else ""
    ) or job.get("role") or ""

    return {
        "interview": {
            "id": str(interview.id),
            "title": interview.title,
            "description": interview.description,
            "duration": interview.duration,
            "status": interview.status,
            "job": {
                "role": assigned_role,
                "company": job.get("company") or "",
                "location": job.get("location") or "",
                "employment_type": job.get("employment_type") or "",
                "experience": job.get("experience") or "",
                "skills": job.get("skills") or [],
                "responsibilities": job.get("responsibilities") or "",
            },
            "monitoring_required": bool(proctoring.get("enabled", False)),
            "follow_ups_enabled": follow_ups["enabled"] and module["follow_ups"],
            "features": module,
            "question_count": extra.get("question_count"),
        },
        "configuration": {
            "difficulty": (
                configuration.difficulty if configuration else "medium"
            ),
            "knowledge_expectation": (
                configuration.knowledge_expectation
                if configuration
                else "intermediate"
            ),
            "extra_config": {
                "question_count": extra.get("question_count"),
                "categories": extra.get("categories"),
            },
        },
    }


# =========================================================
# CREATE INTERVIEW SESSION
# =========================================================

@router.post(
    "/{interview_id}/sessions",
    response_model=SessionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_session(
    interview_id: UUID,
    session_data: SessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create a fresh interview session.

    Flow:

        Candidate
            ↓
        Interview
            ↓
        Configuration
            ↓
        InterviewSession
            ↓
        Generate Questions
            ↓
        Save Questions
            ↓
        Return Session
    """

    # =====================================================
    # 1. ROLE CHECK
    # =====================================================

    if current_user.role != "candidate":

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only candidates can start interview sessions",
        )

    # =====================================================
    # 2. FIND INTERVIEW
    # =====================================================

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
            detail="Interview not found",
        )

    # =====================================================
    # 3. CHECK CANDIDATE
    # =====================================================

    if session_data.candidate_id != current_user.id:

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only create a session for yourself",
        )

    # =====================================================
    # 4. CHECK INTERVIEW STATUS
    # =====================================================

    if interview.status not in {
        "draft",
        "published",
        "active",
    }:

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Interview cannot be started "
                f"because its status is '{interview.status}'"
            ),
        )

    # =====================================================
    # 5. FIND INTERVIEW CONFIGURATION
    # =====================================================

    configuration = (
        db.query(InterviewConfiguration)
        .filter(
            InterviewConfiguration.interview_id == interview_id
        )
        .first()
    )

    # =====================================================
    # 5A. INVITE-ONLY: only the invited e-mail may start
    # =====================================================

    if not candidate_can_access(
        db,
        interview_id,
        current_user,
        configuration,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=NOT_INVITED_MESSAGE,
        )

    # =====================================================
    # 6. AUTO-CREATE CONFIGURATION IF MISSING
    # =====================================================

    if configuration is None:

        try:

            configuration = InterviewConfiguration(
                interview_id=interview.id,
                construct_from_answers=True,
                difficulty="medium",
                knowledge_expectation="intermediate",
                extra_config={},
            )

            db.add(configuration)

            db.flush()

        except IntegrityError:

            db.rollback()

            # Another request may have created it.
            configuration = (
                db.query(InterviewConfiguration)
                .filter(
                    InterviewConfiguration.interview_id
                    == interview_id
                )
                .first()
            )

            if configuration is None:

                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to create interview configuration",
                )

        except Exception as e:

            db.rollback()

            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=(
                    "Failed to create interview configuration: "
                    f"{str(e)}"
                ),
            )

    # =====================================================
    # 6A. RESUME: one candidate + one interview = one session
    # =====================================================
    # Opening the interview again (refresh, closed tab, coming
    # back later) must continue the SAME session. Creating a new
    # one every time produced many rows for the same candidate and
    # generated a new set of questions each time.

    # Resume as many times as needed, but once the interview is
    # COMPLETED the candidate cannot enter it again.
    already_completed = (
        db.query(InterviewSession.id)
        .filter(
            InterviewSession.interview_id == interview_id,
            InterviewSession.candidate_id == current_user.id,
            InterviewSession.status == "completed",
        )
        .first()
    )

    if already_completed is not None:

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "You have already completed this interview. "
                "You cannot attend it again."
            ),
        )

    existing_session = (
        db.query(InterviewSession)
        .filter(
            InterviewSession.interview_id == interview_id,
            InterviewSession.candidate_id == current_user.id,
            InterviewSession.status == "in_progress",
        )
        .order_by(InterviewSession.started_at.desc().nullslast())
        .first()
    )

    if existing_session is not None:

        saved_questions = (
            db.query(Question)
            .filter(Question.session_id == existing_session.id)
            .count()
        )

        if saved_questions > 0:
            append_compulsory_questions(
                db=db,
                session_id=existing_session.id,
                texts=features.compulsory_questions(configuration),
            )
            db.commit()
            db.refresh(existing_session)
            return existing_session

    # =====================================================
    # 7. CREATE FRESH SESSION
    # =====================================================

    session = InterviewSession(
        interview_id=interview_id,
        candidate_id=current_user.id,
        started_at=datetime.now(timezone.utc),
        status="in_progress",
        current_question=1,
    )

    try:

        db.add(session)

        # Generate session UUID
        db.flush()

    except Exception as e:

        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "Failed to create interview session: "
                f"{str(e)}"
            ),
        )

    # =====================================================
    # 8. GENERATE QUESTIONS
    # =====================================================

    try:

        # Resume the interviewer uploaded for THIS candidate
        # (empty when none, or when the interviewer switched it OFF)
        try:
            candidate_resume = resume_text_for(configuration, current_user)
        except Exception:
            candidate_resume = ""

        generated_questions = generate_questions(
            interview_title=interview.title,
            interview_description=interview.description,
            difficulty=configuration.difficulty,
            knowledge_expectation=(
                configuration.knowledge_expectation
            ),
            construct_from_answers=(
                configuration.construct_from_answers
            ),
            extra_config=(
                configuration.extra_config
            ),
            candidate_resume=candidate_resume,
        )

    except Exception as e:

        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "Failed to generate interview questions: "
                f"{str(e)}"
            ),
        )

    # =====================================================
    # 9. VALIDATE GENERATED QUESTIONS
    # =====================================================

    if not generated_questions:

        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No interview questions were generated",
        )

    # =====================================================
    # 10. SAVE QUESTIONS
    # =====================================================

    try:

        for index, question_data in enumerate(
            generated_questions,
            start=1,
        ):

            # ---------------------------------------------
            # Validate required question fields
            # ---------------------------------------------

            if not question_data.get("question"):

                raise ValueError(
                    f"Generated question {index} has no question text"
                )

            question = Question(
                session_id=session.id,
                parent_question_id=None,
                question=question_data["question"],
                category=question_data.get(
                    "category",
                    "general",
                ),
                difficulty=question_data.get(
                    "difficulty",
                    configuration.difficulty,
                ),
                type=question_data.get(
                    "type",
                    "text",
                ),
                question_order=index,
            )

            db.add(question)

        db.flush()
        append_compulsory_questions(
            db=db,
            session_id=session.id,
            texts=features.compulsory_questions(configuration),
        )

        # ---------------------------------------------
        # First question
        # ---------------------------------------------

        session.current_question = 1

        # ---------------------------------------------
        # Commit session + questions
        # ---------------------------------------------

        db.commit()

        db.refresh(session)

    except Exception as e:

        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "Failed to save interview questions: "
                f"{str(e)}"
            ),
        )

    # =====================================================
    # 11. VERIFY QUESTIONS WERE SAVED
    # =====================================================

    question_count = (
        db.query(Question)
        .filter(
            Question.session_id == session.id
        )
        .count()
    )

    if question_count == 0:

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "Interview session was created, "
                "but no questions were saved"
            ),
        )

    # =====================================================
    # 12. RETURN SESSION
    # =====================================================

    return session