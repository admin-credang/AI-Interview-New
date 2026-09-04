from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.interview import Interview
from app.models.interview_config import InterviewConfiguration
from app.models.user import User
from app.schemas.interview_configuration import (
    InterviewConfigurationCreate,
    InterviewConfigurationUpdate,
    InterviewConfigurationResponse,
)
from app.api.auth.dependencies import get_current_user


router = APIRouter(
    prefix="/interviews",
    tags=["Interview Configuration"]
)


@router.post(
    "/{interview_id}/configuration",
    response_model=InterviewConfigurationResponse,
    status_code=status.HTTP_201_CREATED
)
def create_configuration(
    interview_id: UUID,
    configuration_data: InterviewConfigurationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role not in {"interviewer", "admin"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only interviewers and admins can configure interviews"
        )

    interview = (
        db.query(Interview)
        .filter(Interview.id == interview_id)
        .first()
    )

    if interview is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview not found"
        )

    existing_configuration = (
        db.query(InterviewConfiguration)
        .filter(
            InterviewConfiguration.interview_id == interview_id
        )
        .first()
    )

    if existing_configuration:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Configuration already exists for this interview"
        )

    configuration = InterviewConfiguration(
        interview_id=interview_id,
        construct_from_answers=(
            configuration_data.construct_from_answers
        ),
        difficulty=configuration_data.difficulty,
        knowledge_expectation=(
            configuration_data.knowledge_expectation
        ),
        extra_config=configuration_data.extra_config,
    )

    db.add(configuration)
    db.commit()
    db.refresh(configuration)

    return configuration


@router.get(
    "/{interview_id}/configuration",
    response_model=InterviewConfigurationResponse
)
def get_configuration(
    interview_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    configuration = (
        db.query(InterviewConfiguration)
        .filter(
            InterviewConfiguration.interview_id == interview_id
        )
        .first()
    )

    if configuration is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview configuration not found"
        )

    return configuration


@router.put(
    "/{interview_id}/configuration",
    response_model=InterviewConfigurationResponse
)
def update_configuration(
    interview_id: UUID,
    configuration_data: InterviewConfigurationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role not in {"interviewer", "admin"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only interviewers and admins can modify interview configuration"
        )

    configuration = (
        db.query(InterviewConfiguration)
        .filter(
            InterviewConfiguration.interview_id == interview_id
        )
        .first()
    )

    if configuration is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview configuration not found"
        )

    update_data = configuration_data.model_dump(
        exclude_unset=True
    )

    for field, value in update_data.items():
        setattr(configuration, field, value)

    db.commit()
    db.refresh(configuration)

    return configuration