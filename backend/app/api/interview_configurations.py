from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db

from app.models.interview import Interview
from app.models.interview_configuration import InterviewConfiguration
from app.models.user import User

from app.schemas.interview_configuration import (
    InterviewConfigurationCreate,
    InterviewConfigurationUpdate,
    InterviewConfigurationResponse,
)

from app.api.auth.dependencies import get_current_user
from app.services.interview_policy import (
    NOT_INVITED_MESSAGE,
    candidate_can_access,
    owns_interview,
)


# =========================================================
# ROUTER
# =========================================================

router = APIRouter(
    prefix="/interviews",
    tags=["Interview Configuration"],
)


# =========================================================
# CREATE INTERVIEW CONFIGURATION
# =========================================================

@router.post(
    "/{interview_id}/configuration",
    response_model=InterviewConfigurationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_configuration(
    interview_id: UUID,
    configuration_data: InterviewConfigurationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # -----------------------------------------------------
    # ROLE CHECK
    # -----------------------------------------------------

    if current_user.role not in {"interviewer", "admin"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Only interviewers and admins can "
                "configure interviews"
            ),
        )

    # -----------------------------------------------------
    # FIND INTERVIEW
    # -----------------------------------------------------

    interview = (
        db.query(Interview)
        .filter(
            Interview.id == interview_id,
        )
        .first()
    )

    if interview is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview not found",
        )

    if not owns_interview(current_user, interview):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only configure your own interviews",
        )

    # -----------------------------------------------------
    # CHECK EXISTING CONFIGURATION
    # -----------------------------------------------------

    existing_configuration = (
        db.query(InterviewConfiguration)
        .filter(
            InterviewConfiguration.interview_id == interview_id,
        )
        .first()
    )

    if existing_configuration is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Configuration already exists "
                "for this interview"
            ),
        )

    # -----------------------------------------------------
    # CREATE CONFIGURATION
    # -----------------------------------------------------

    configuration = InterviewConfiguration(
        interview_id=interview_id,
        construct_from_answers=(
            configuration_data.construct_from_answers
            if configuration_data.construct_from_answers is not None
            else True
        ),
        difficulty=(
            configuration_data.difficulty
            if configuration_data.difficulty
            else "medium"
        ),
        knowledge_expectation=(
            configuration_data.knowledge_expectation
            if configuration_data.knowledge_expectation
            else "intermediate"
        ),
        extra_config=configuration_data.extra_config,
    )

    try:
        db.add(configuration)
        db.commit()
        db.refresh(configuration)

    except IntegrityError:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Configuration already exists "
                "for this interview"
            ),
        )

    return configuration


# =========================================================
# GET INTERVIEW CONFIGURATION
# =========================================================

@router.get(
    "/{interview_id}/configuration",
    response_model=InterviewConfigurationResponse,
)
def get_configuration(
    interview_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # -----------------------------------------------------
    # FIND CONFIGURATION
    # -----------------------------------------------------

    configuration = (
        db.query(InterviewConfiguration)
        .filter(
            InterviewConfiguration.interview_id == interview_id,
        )
        .first()
    )

    if configuration is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview configuration not found",
        )

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

    # Interviewer / admin who owns the interview: full data.
    if current_user.role in {"interviewer", "admin"}:

        if not owns_interview(current_user, interview):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this interview",
            )

        return configuration

    # Candidate: only if invited, and never the invited e-mail list.
    if current_user.role == "candidate":

        if not candidate_can_access(
            db, interview_id, current_user, configuration
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=NOT_INVITED_MESSAGE,
            )

        safe = InterviewConfigurationResponse.model_validate(
            configuration
        )

        extra = configuration.extra_config or {}

        return safe.model_copy(
            update={
                "extra_config": {
                    "question_count": extra.get("question_count"),
                    "categories": extra.get("categories"),
                    # monitoring rules the interviewer chose for THIS
                    # interview (the candidate screen needs them)
                    "proctoring": {
                        "enabled": bool(
                            (extra.get("proctoring") or {}).get(
                                "enabled", False
                            )
                        ),
                        "face": bool(
                            (extra.get("proctoring") or {}).get(
                                "face", True
                            )
                        ),
                        "eye": bool(
                            (extra.get("proctoring") or {}).get(
                                "eye", True
                            )
                        ),
                        "phone": bool(
                            (extra.get("proctoring") or {}).get(
                                "phone", False
                            )
                        ),
                    },
                }
            }
        )

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You do not have access to this interview",
    )


# =========================================================
# UPDATE INTERVIEW CONFIGURATION
# =========================================================

@router.put(
    "/{interview_id}/configuration",
    response_model=InterviewConfigurationResponse,
)
def update_configuration(
    interview_id: UUID,
    configuration_data: InterviewConfigurationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # -----------------------------------------------------
    # ROLE CHECK
    # -----------------------------------------------------

    if current_user.role not in {"interviewer", "admin"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Only interviewers and admins can "
                "modify interview configuration"
            ),
        )

    # -----------------------------------------------------
    # FIND CONFIGURATION
    # -----------------------------------------------------

    configuration = (
        db.query(InterviewConfiguration)
        .filter(
            InterviewConfiguration.interview_id == interview_id,
        )
        .first()
    )

    if configuration is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview configuration not found",
        )

    # -----------------------------------------------------
    # UPDATE ONLY PROVIDED FIELDS
    # -----------------------------------------------------

    interview = (
        db.query(Interview)
        .filter(Interview.id == interview_id)
        .first()
    )

    if interview is None or not owns_interview(
        current_user, interview
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only modify your own interviews",
        )

    update_data = configuration_data.model_dump(
        exclude_unset=True,
    )

    for field, value in update_data.items():

        # MERGE extra_config so saving the question count never
        # wipes the invited list, monitoring or job settings.
        if field == "extra_config":
            merged = dict(configuration.extra_config or {})
            merged.update(value or {})
            value = merged

        setattr(
            configuration,
            field,
            value,
        )

    # -----------------------------------------------------
    # SAVE
    # -----------------------------------------------------

    try:
        db.commit()
        db.refresh(configuration)

    except IntegrityError:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unable to update interview configuration",
        )

    return configuration


# =========================================================
# DELETE INTERVIEW CONFIGURATION
# =========================================================

@router.delete(
    "/{interview_id}/configuration",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_configuration(
    interview_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # -----------------------------------------------------
    # ROLE CHECK
    # -----------------------------------------------------

    if current_user.role not in {"interviewer", "admin"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Only interviewers and admins can "
                "delete interview configuration"
            ),
        )

    # -----------------------------------------------------
    # FIND CONFIGURATION
    # -----------------------------------------------------

    configuration = (
        db.query(InterviewConfiguration)
        .filter(
            InterviewConfiguration.interview_id == interview_id,
        )
        .first()
    )

    if configuration is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview configuration not found",
        )

    # -----------------------------------------------------
    # DELETE
    # -----------------------------------------------------

    try:
        db.delete(configuration)
        db.commit()

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete interview configuration",
        )

    return None
