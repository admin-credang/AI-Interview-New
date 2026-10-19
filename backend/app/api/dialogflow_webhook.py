from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db

from app.models.session import InterviewSession
from app.models.question import Question
from app.models.answer import Answer
from app.models.interview import Interview
from app.models.interview_configuration import InterviewConfiguration

from app.schemas.answer import AnswerCreate

from app.services.answer_service import process_answer
from app.services.question_service import (
    VALID_QUESTION_COUNTS,
    expected_question_count,
    generate_and_save_questions,
    generated_only,
)
from app import features
from app.services.report_service import generate_interview_report


router = APIRouter(
    prefix="/dialogflow",
    tags=["Dialogflow"],
)


# =========================================================
# CONFIG
# =========================================================

# Main-question sets are 5 questions (no resume) or 5 + 2 resume questions
# (with resume). Use VALID_QUESTION_COUNTS / expected_question_count().
EXPECTED_MAIN_QUESTION_COUNT = 5   # default / fallback only

# ---------------------------------------------------------
# Candidate can think before submitting an answer.
#
# IMPORTANT:
# This value is exposed to Dialogflow as a parameter.
# Actual Dialogflow no-input timeout must also be configured
# in Dialogflow CX Console.
# ---------------------------------------------------------

ANSWER_WAIT_SECONDS = 30


CONTROL_ACTIONS = {
    "start",
    "initialize",
    "init",
    "show_question",
    "display_question",
    "get_question",
}


YES_VALUES = {
    "yes",
    "y",
    "true",
    "1",
}


NO_VALUES = {
    "no",
    "n",
    "false",
    "0",
}


# =========================================================
# REQUEST MODEL
# =========================================================

class DialogflowChatRequest(BaseModel):
    session_id: str
    text: str
    parameters: dict[str, Any] | None = None


# =========================================================
# GENERAL HELPERS
# =========================================================

def normalize_dialogflow_value(value: Any) -> Any:
    """
    Dialogflow parameter values can arrive as:

        {"value": "..."}
        {"text": "..."}
        plain values
    """

    if isinstance(value, dict):

        if "value" in value:
            return normalize_dialogflow_value(
                value["value"]
            )

        if "text" in value:
            return normalize_dialogflow_value(
                value["text"]
            )

    return value


def sanitize_dialogflow_value(value: Any) -> Any:
    """
    Convert UUID / datetime / nested values
    into Dialogflow-safe values.
    """

    if isinstance(value, UUID):
        return str(value)

    if isinstance(value, datetime):
        return value.isoformat()

    if isinstance(value, dict):

        return {
            str(key): sanitize_dialogflow_value(val)
            for key, val in value.items()
        }

    if isinstance(value, list):

        return [
            sanitize_dialogflow_value(item)
            for item in value
        ]

    if isinstance(value, tuple):

        return [
            sanitize_dialogflow_value(item)
            for item in value
        ]

    return value


def is_truthy_dialogflow_value(value: Any) -> bool:
    """
    Safely handle:

        True
        "true"
        "yes"
        "1"
    """

    value = normalize_dialogflow_value(value)

    if isinstance(value, bool):
        return value

    if isinstance(value, (int, float)):
        return value == 1

    if isinstance(value, str):

        return value.strip().lower() in {
            "true",
            "yes",
            "y",
            "1",
        }

    return False


# =========================================================
# DIALOGFLOW RESPONSE BUILDERS
# =========================================================

def build_dialogflow_parameter_response(
    parameters: dict[str, Any],
):
    """
    Dialogflow CX requires camelCase:

        fulfillmentResponse

    NOT:

        fulfillment_response
    """

    clean_parameters = (
        sanitize_dialogflow_value(parameters)
    )

    return {
        "sessionInfo": {
            "parameters": clean_parameters
        },

        "fulfillmentResponse": {
            "messages": []
        },
    }


def build_dialogflow_text_response(
    text: str,
    parameters: dict[str, Any] | None = None,
):

    response: dict[str, Any] = {
        "fulfillmentResponse": {
            "messages": [
                {
                    "text": {
                        "text": [text]
                    }
                }
            ]
        }
    }

    if parameters is not None:

        response["sessionInfo"] = {
            "parameters": sanitize_dialogflow_value(
                parameters
            )
        }

    return response


# =========================================================
# SESSION ID
# =========================================================

def extract_dialogflow_session_id(
    payload: dict[str, Any],
) -> str | None:

    session_info = (
        payload.get("sessionInfo")
        or {}
    )

    parameters = (
        session_info.get("parameters")
        or {}
    )

    session_id = normalize_dialogflow_value(
        parameters.get("session_id")
    )

    if session_id:
        return str(session_id)

    dialogflow_session = (
        session_info.get("session")
    )

    if dialogflow_session:

        return (
            str(dialogflow_session)
            .rstrip("/")
            .split("/")[-1]
        )

    return None


# =========================================================
# FRESH SESSION
# =========================================================

def find_fresh_interview_session(
    db: Session,
) -> InterviewSession | None:

    sessions = (
        db.query(InterviewSession)
        .filter(
            InterviewSession.status == "in_progress"
        )
        .order_by(
            InterviewSession.started_at.desc()
        )
        .all()
    )

    for interview_session in sessions:

        answer_count = (
            db.query(Answer)
            .filter(
                Answer.session_id
                == interview_session.id
            )
            .count()
        )

        if answer_count == 0:
            return interview_session

    return None


# =========================================================
# MAIN QUESTION HELPERS
# =========================================================

def get_first_main_question(
    db: Session,
    session_id: UUID,
) -> Question | None:

    return (
        db.query(Question)
        .filter(
            Question.session_id == session_id,
            Question.parent_question_id.is_(None),
        )
        .order_by(
            Question.question_order.asc()
        )
        .first()
    )


def get_current_main_question(
    db: Session,
    interview_session: InterviewSession,
) -> Question | None:

    current_number = (
        interview_session.current_question
        or 1
    )

    return (
        db.query(Question)
        .filter(
            Question.session_id
            == interview_session.id,

            Question.parent_question_id.is_(None),

            Question.question_order
            == current_number,
        )
        .first()
    )


def get_main_question_from_question(
    db: Session,
    question: Question,
) -> Question:

    if question.parent_question_id is None:
        return question

    parent_question = (
        db.query(Question)
        .filter(
            Question.id
            == question.parent_question_id,

            Question.session_id
            == question.session_id,

            Question.parent_question_id.is_(None),
        )
        .first()
    )

    if parent_question is None:

        raise HTTPException(
            status_code=500,
            detail="Parent main question not found.",
        )

    return parent_question


def get_next_main_question(
    db: Session,
    interview_session: InterviewSession,
    current_question: Question,
) -> Question | None:

    main_question = get_main_question_from_question(
        db=db,
        question=current_question,
    )

    current_order = (
        main_question.question_order
        or 0
    )

    return (
        db.query(Question)
        .filter(
            Question.session_id
            == interview_session.id,

            Question.parent_question_id.is_(None),

            Question.question_order
            > current_order,
        )
        .order_by(
            Question.question_order.asc()
        )
        .first()
    )


def get_total_main_questions_for_session(
    db: Session | None,
    session_id,
) -> int:
    """Number of MAIN questions in this session (5 or 7)."""

    if db is None:
        return EXPECTED_MAIN_QUESTION_COUNT

    total = (
        db.query(Question)
        .filter(
            Question.session_id == session_id,
            Question.parent_question_id.is_(None),
        )
        .count()
    )

    return int(total) or EXPECTED_MAIN_QUESTION_COUNT


def get_main_question_number(
    db: Session,
    question: Question,
) -> int:

    main_question = (
        get_main_question_from_question(
            db=db,
            question=question,
        )
    )

    return (
        db.query(Question)
        .filter(
            Question.session_id
            == main_question.session_id,

            Question.parent_question_id.is_(None),

            Question.question_order
            <= main_question.question_order,
        )
        .count()
    )


# =========================================================
# FOLLOW-UP QUESTION
# =========================================================

def get_follow_up_question(
    db: Session,
    main_question: Question,
) -> Question | None:

    return (
        db.query(Question)
        .filter(
            Question.session_id
            == main_question.session_id,

            Question.parent_question_id
            == main_question.id,
        )
        .order_by(
            Question.created_at.asc()
        )
        .first()
    )


# =========================================================
# ANSWER LOOKUP
# =========================================================

def get_existing_answer(
    db: Session,
    session_id: UUID,
    question_id: UUID,
) -> Answer | None:

    return (
        db.query(Answer)
        .filter(
            Answer.session_id == session_id,

            Answer.question_id == question_id,
        )
        .order_by(
            Answer.answered_at.desc()
        )
        .first()
    )


# =========================================================
# CURRENT QUESTION POINTER
# =========================================================

def set_current_main_question(
    interview_session: InterviewSession,
    question: Question,
):

    if question.parent_question_id is not None:

        raise ValueError(
            "Current interview pointer cannot "
            "point to a follow-up question."
        )

    interview_session.current_question = (
        question.question_order
    )


# =========================================================
# COMPLETE INTERVIEW
# =========================================================

def complete_interview(
    db: Session,
    interview_session: InterviewSession,
):

    interview_session.status = "completed"

    interview_session.ended_at = (
        datetime.now(timezone.utc)
    )

    db.add(interview_session)

    db.flush()

    try:

        generate_interview_report(
            db=db,
            session_id=interview_session.id,
        )

    except Exception as report_error:

        print(
            "WARNING: Interview report generation failed:",
            report_error,
        )


# =========================================================
# COMPLETION RESPONSE
# =========================================================

def build_completion_response(
    interview_session: InterviewSession,
):

    from sqlalchemy.orm import object_session

    total_questions = get_total_main_questions_for_session(
        object_session(interview_session),
        interview_session.id,
    )

    return build_dialogflow_parameter_response(
        {
            "session_id": str(
                interview_session.id
            ),

            "question_id": None,

            "question": None,

            "question_number": total_questions,

            "total_questions": total_questions,

            "category": None,

            "difficulty": None,

            "question_type": None,

            "candidate_answer": None,

            "next_action": "complete",

            "interview_completed": True,

            "follow_up_required": False,

            "follow_up_question": None,

            "follow_up_question_id": None,

            "follow_up_confirmation": None,

            "follow_up_confirmation_required": False,

            "is_follow_up": False,

            # -------------------------------------------------
            # No active answer waiting after completion
            # -------------------------------------------------

            "waiting_for_candidate_answer": False,

            "answer_wait_seconds": 0,
        }
    )


# =========================================================
# QUESTION PARAMETERS
# =========================================================

def build_question_parameters(
    question: Question,
    session_id: UUID,
    db: Session,
):

    is_follow_up = (
        question.parent_question_id is not None
    )

    question_number = (
        get_main_question_number(
            db=db,
            question=question,
        )
    )

    return {
        "session_id": str(session_id),

        "question_id": str(question.id),

        "question": question.question,

        "question_number": question_number,

        # 5 without a resume, 7 with one - the UI shows "Question x of N"
        "total_questions": get_total_main_questions_for_session(
            db,
            session_id,
        ),

        "category": question.category,

        "difficulty": question.difficulty,

        "question_type": question.type,

        "candidate_answer": None,

        "is_follow_up": is_follow_up,

        "follow_up_required": False,

        "follow_up_question": None,

        "follow_up_question_id": None,

        "follow_up_confirmation": None,

        "follow_up_confirmation_required": False,

        "interview_completed": False,

        # =====================================================
        # WAIT FOR CANDIDATE
        # =====================================================

        "waiting_for_candidate_answer": True,

        "answer_wait_seconds": ANSWER_WAIT_SECONDS,
    }


# =========================================================
# CURRENT QUESTION RESPONSE
# =========================================================

def build_current_question_response(
    db: Session,
    interview_session: InterviewSession,
    question: Question,
):

    parameters = build_question_parameters(
        question=question,

        session_id=interview_session.id,

        db=db,
    )

    parameters.update(
        {
            "next_action": (
                "follow_up"
                if question.parent_question_id
                is not None
                else "next_question"
            ),

            "interview_completed": False,

            "candidate_answer": None,

            "follow_up_required": False,

            "follow_up_question": None,

            "follow_up_question_id": None,

            "follow_up_confirmation": None,

            "follow_up_confirmation_required": False,

            # -------------------------------------------------
            # IMPORTANT
            #
            # Question is waiting for candidate answer.
            # Do NOT mark interview complete.
            # -------------------------------------------------

            "waiting_for_candidate_answer": True,

            "answer_wait_seconds": ANSWER_WAIT_SECONDS,
        }
    )

    # A follow-up is asked straight away (no yes/no from the
    # candidate), so the frontend needs the follow-up text / id.
    if question.parent_question_id is not None:

        parameters.update(
            {
                "follow_up_question": question.question,

                "follow_up_question_id": str(question.id),

                "parent_question_id": str(
                    question.parent_question_id
                ),
            }
        )

    return build_dialogflow_parameter_response(
        parameters
    )


# =========================================================
# FOLLOW-UP QUESTION CREATION
# =========================================================

def create_follow_up_question(
    db: Session,
    main_question: Question,
    follow_up_text: str,
) -> Question:

    if main_question.parent_question_id is not None:

        raise ValueError(
            "Follow-up cannot be created "
            "from another follow-up."
        )

    existing_follow_up = (
        get_follow_up_question(
            db=db,
            main_question=main_question,
        )
    )

    if existing_follow_up:
        return existing_follow_up

    follow_up_text = (
        follow_up_text or ""
    ).strip()

    if not follow_up_text:

        raise ValueError(
            "Follow-up question text is empty."
        )

    follow_up = Question(
        session_id=main_question.session_id,

        parent_question_id=main_question.id,

        question=follow_up_text,

        category=main_question.category,

        difficulty=main_question.difficulty,

        type=main_question.type,

        question_order=None,

        created_at=datetime.now(
            timezone.utc
        ),
    )

    db.add(follow_up)

    db.flush()

    return follow_up


# =========================================================
# RESOLVE CURRENT QUESTION
# =========================================================

def resolve_current_question(
    db: Session,
    interview_session: InterviewSession,
    requested_question_id: UUID | None = None,
) -> Question | None:

    current_main = get_current_main_question(
        db=db,
        interview_session=interview_session,
    )

    if current_main is None:
        return None

    # =====================================================
    # EXPLICIT QUESTION REQUEST
    # =====================================================

    if requested_question_id:

        requested_question = (
            db.query(Question)
            .filter(
                Question.id
                == requested_question_id,

                Question.session_id
                == interview_session.id,
            )
            .first()
        )

        if requested_question:

            # ---------------------------------------------
            # Explicit follow-up request
            # ---------------------------------------------

            if (
                requested_question.parent_question_id
                is not None
            ):

                existing_answer = (
                    get_existing_answer(
                        db=db,

                        session_id=interview_session.id,

                        question_id=requested_question.id,
                    )
                )

                if existing_answer:

                    return current_main

                return requested_question

            # ---------------------------------------------
            # Explicit current main request
            # ---------------------------------------------

            if (
                requested_question.id
                == current_main.id
            ):

                return current_main

    # =====================================================
    # CHECK CURRENT MAIN ANSWER
    # =====================================================

    current_main_answer = get_existing_answer(
        db=db,

        session_id=interview_session.id,

        question_id=current_main.id,
    )

    # =====================================================
    # CRITICAL SAFETY
    #
    # Current question unanswered:
    # NEVER advance.
    # NEVER complete.
    # =====================================================

    if current_main_answer is None:

        return current_main

    # =====================================================
    # MAIN ALREADY ANSWERED
    #
    # Confirmation handler decides whether to continue.
    # =====================================================

    return current_main


# =========================================================
# FOLLOW-UP CONFIRMATION RESPONSE
# =========================================================

def build_follow_up_confirmation_response(
    db: Session,
    interview_session: InterviewSession,
    main_question: Question,
    follow_up_question: Question,
):
    """
    The candidate is NEVER asked whether they want a follow-up.

    The interviewer's configuration decides if / how many
    follow-ups happen. When one is due, it is simply asked as
    the next question and the candidate just answers it.

    (Name kept so existing callers keep working.)
    """

    return build_current_question_response(
        db=db,
        interview_session=interview_session,
        question=follow_up_question,
    )


# =========================================================
# FOLLOW-UP YES
# =========================================================

def handle_follow_up_yes(
    db: Session,
    interview_session: InterviewSession,
    main_question: Question,
):

    follow_up_question = (
        get_follow_up_question(
            db=db,
            main_question=main_question,
        )
    )

    if follow_up_question is None:

        return build_current_question_response(
            db=db,

            interview_session=interview_session,

            question=main_question,
        )

    return build_current_question_response(
        db=db,

        interview_session=interview_session,

        question=follow_up_question,
    )


# =========================================================
# FOLLOW-UP NO
# =========================================================

def handle_follow_up_no(
    db: Session,
    interview_session: InterviewSession,
    main_question: Question,
):

    next_question = get_next_main_question(
        db=db,

        interview_session=interview_session,

        current_question=main_question,
    )

    if next_question is None:

        complete_interview(
            db=db,

            interview_session=interview_session,
        )

        db.commit()

        return build_completion_response(
            interview_session
        )

    set_current_main_question(
        interview_session=interview_session,

        question=next_question,
    )

    db.commit()

    return build_current_question_response(
        db=db,

        interview_session=interview_session,

        question=next_question,
    )


# =========================================================
# CANDIDATE ANSWER EXTRACTION
# =========================================================

def extract_candidate_answer(
    payload: dict[str, Any],
) -> str | None:

    session_info = (
        payload.get("sessionInfo")
        or {}
    )

    parameters = (
        session_info.get("parameters")
        or {}
    )

    # =====================================================
    # 1. Explicit candidate_answer
    # =====================================================

    candidate_answer = (
        normalize_dialogflow_value(
            parameters.get(
                "candidate_answer"
            )
        )
    )

    if candidate_answer is not None:

        text = str(
            candidate_answer
        ).strip()

        if text:
            return text

    # =====================================================
    # 2. Dialogflow form parameter
    # =====================================================

    page_info = (
        payload.get("pageInfo")
        or {}
    )

    form_info = (
        page_info.get("formInfo")
        or {}
    )

    parameter_info = (
        form_info.get("parameterInfo")
        or []
    )

    for item in parameter_info:

        if not isinstance(item, dict):
            continue

        display_name = item.get(
            "displayName"
        )

        if display_name != "candidate_answer":
            continue

        value = normalize_dialogflow_value(
            item.get("value")
        )

        if value is None:

            value = normalize_dialogflow_value(
                item.get("resolvedValue")
            )

        if value is not None:

            text = str(value).strip()

            if text:
                return text

    # =====================================================
    # 3. Top-level Dialogflow text
    # =====================================================

    text = payload.get("text")

    if text:

        text = str(text).strip()

        if text:
            return text

    # =====================================================
    # 4. Query result transcript
    # =====================================================

    query_result = (
        payload.get("queryResult")
        or {}
    )

    transcript = query_result.get(
        "transcript"
    )

    if transcript:

        transcript = str(
            transcript
        ).strip()

        if transcript:
            return transcript

    return None


# =========================================================
# INTERVIEW CONFIGURATION
# =========================================================

def ensure_interview_configuration(
    db: Session,
    interview_session: InterviewSession,
):

    interview = (
        db.query(Interview)
        .filter(
            Interview.id
            == interview_session.interview_id
        )
        .first()
    )

    if interview is None:

        raise HTTPException(
            status_code=404,
            detail="Interview not found.",
        )

    configuration = (
        db.query(InterviewConfiguration)
        .filter(
            InterviewConfiguration.interview_id
            == interview.id
        )
        .first()
    )

    if configuration is None:

        raise HTTPException(
            status_code=404,
            detail="Interview configuration not found.",
        )

    return interview, configuration


# =========================================================
# ENSURE QUESTIONS
# =========================================================

def ensure_interview_questions(
    db: Session,
    interview_session: InterviewSession,
):

    existing_main_questions = (
        db.query(Question)
        .filter(
            Question.session_id
            == interview_session.id,

            Question.parent_question_id.is_(None),
        )
        .order_by(
            Question.question_order.asc()
        )
        .all()
    )

    # =====================================================
    # Already a complete set (5 without resume, 7 with resume)
    # =====================================================

    # Compulsory questions (client-written, saved last) are not part of
    # the 5 / 7 generated questions, so they are not counted here.
    generated_count = len(generated_only(existing_main_questions))

    if generated_count in VALID_QUESTION_COUNTS:

        return existing_main_questions

    # =====================================================
    # Existing but wrong count
    # =====================================================

    if existing_main_questions:

        raise HTTPException(
            status_code=500,

            detail=(
                f"Expected one of "
                f"{VALID_QUESTION_COUNTS} "
                f"main questions, found "
                f"{generated_count}."
            ),
        )

    # =====================================================
    # Generate
    # =====================================================

    interview, configuration = (
        ensure_interview_configuration(
            db=db,

            interview_session=interview_session,
        )
    )

    # Resume the interviewer uploaded for THIS candidate (if any)
    candidate_resume = ""

    try:
        from app.models.user import User as _User
        from app.services.resume_service import resume_text_for

        candidate = (
            db.query(_User)
            .filter(_User.id == interview_session.candidate_id)
            .first()
        )

        candidate_resume = resume_text_for(configuration, candidate)

    except Exception:
        candidate_resume = ""

    generate_and_save_questions(
        db=db,

        session_id=interview_session.id,

        interview_title=interview.title,

        interview_description=getattr(
            interview,
            "description",
            None,
        ),

        difficulty=configuration.difficulty,

        knowledge_expectation=(
            configuration.knowledge_expectation
        ),

        construct_from_answers=(
            configuration.construct_from_answers
        ),

        extra_config=configuration.extra_config,

        candidate_resume=candidate_resume,

        # client-written questions, asked last, word for word
        compulsory_questions=features.compulsory_questions(
            configuration
        ),
    )

    db.flush()

    main_questions = (
        db.query(Question)
        .filter(
            Question.session_id
            == interview_session.id,

            Question.parent_question_id.is_(None),
        )
        .order_by(
            Question.question_order.asc()
        )
        .all()
    )

    if (
        len(generated_only(main_questions))
        != expected_question_count(candidate_resume)
    ):

        raise HTTPException(
            status_code=500,

            detail=(
                "Question generation failed. "
                f"Expected "
                f"{expected_question_count(candidate_resume)}, "
                f"found {len(generated_only(main_questions))}."
            ),
        )

    return main_questions


# =========================================================
# START INTERVIEW
# =========================================================

def start_interview(
    payload: dict[str, Any],
    db: Session,
):

    session_info = (
        payload.get("sessionInfo")
        or {}
    )

    parameters = (
        session_info.get("parameters")
        or {}
    )

    session_id_value = (
        normalize_dialogflow_value(
            parameters.get("session_id")
        )
    )

    interview_session = None

    if session_id_value:

        try:

            session_uuid = UUID(
                str(session_id_value)
            )

        except ValueError:

            session_uuid = None

        if session_uuid:

            interview_session = (
                db.query(InterviewSession)
                .filter(
                    InterviewSession.id
                    == session_uuid
                )
                .first()
            )

    # =====================================================
    # Simulator fallback
    # =====================================================

    if interview_session is None:

        interview_session = (
            find_fresh_interview_session(db)
        )

    if interview_session is None:

        raise HTTPException(
            status_code=404,
            detail="Interview session not found.",
        )

    if interview_session.status != "in_progress":

        if interview_session.status == "completed":

            return build_completion_response(
                interview_session
            )

        raise HTTPException(
            status_code=409,
            detail=(
                "Interview session is not in progress."
            ),
        )

    # =====================================================
    # Ensure the full question set exists (5, or 7 with a resume)
    # =====================================================

    ensure_interview_questions(
        db=db,

        interview_session=interview_session,
    )

    # =====================================================
    # NEVER RESET POINTER HERE
    # =====================================================

    current_question = (
        get_current_main_question(
            db=db,

            interview_session=interview_session,
        )
    )

    if current_question is None:

        first_question = (
            get_first_main_question(
                db=db,

                session_id=interview_session.id,
            )
        )

        if first_question is None:

            raise HTTPException(
                status_code=500,
                detail="No interview questions found.",
            )

        set_current_main_question(
            interview_session=interview_session,

            question=first_question,
        )

        current_question = first_question

    db.commit()

    return build_current_question_response(
        db=db,

        interview_session=interview_session,

        question=current_question,
    )


# =========================================================
# PROCESS CANDIDATE ANSWER
# =========================================================

def process_candidate_answer(
    db: Session,
    interview_session: InterviewSession,
    current_question: Question,
    candidate_answer: str,
):

    candidate_answer = (
        candidate_answer or ""
    ).strip()

    # =====================================================
    # NEVER PROCESS EMPTY ANSWER
    #
    # Candidate may still be thinking.
    #
    # IMPORTANT:
    # Do NOT move question.
    # Do NOT complete interview.
    # Do NOT call AI.
    # =====================================================

    if not candidate_answer:

        print(
            "Candidate has not submitted an answer yet."
        )

        return build_current_question_response(
            db=db,

            interview_session=interview_session,

            question=current_question,
        )

    # =====================================================
    # DUPLICATE PROTECTION
    # =====================================================

    existing_answer = get_existing_answer(
        db=db,

        session_id=interview_session.id,

        question_id=current_question.id,
    )

    if existing_answer is not None:

        return build_current_state_response(
            db=db,

            interview_session=interview_session,

            requested_question=current_question,
        )

    # =====================================================
    # CREATE ANSWER PAYLOAD
    # =====================================================

    answer_payload = AnswerCreate(
        session_id=interview_session.id,

        question_id=current_question.id,

        answer_text=candidate_answer,
    )

    # =====================================================
    # PROCESS + AI EVALUATION
    # =====================================================

    result = process_answer(
        db=db,

        answer_data=answer_payload,
    )

    # =====================================================
    # BUILD NEXT RESPONSE
    # =====================================================

    return format_answer_result(
        db=db,

        interview_session=interview_session,

        current_question=current_question,

        result=result,
    )


# =========================================================
# NEXT QUESTION RESPONSE
# =========================================================

def build_next_question_response(
    db: Session,
    interview_session: InterviewSession,
    next_question: Question | None,
):

    # =====================================================
    # NO NEXT QUESTION = COMPLETE
    # =====================================================

    if next_question is None:

        complete_interview(
            db=db,

            interview_session=interview_session,
        )

        db.commit()

        return build_completion_response(
            interview_session
        )

    # =====================================================
    # NEXT MUST BE MAIN
    # =====================================================

    if next_question.parent_question_id is not None:

        raise HTTPException(
            status_code=500,

            detail=(
                "Invalid next question: "
                "next question cannot be a follow-up."
            ),
        )

    set_current_main_question(
        interview_session=interview_session,

        question=next_question,
    )

    db.commit()

    return build_current_question_response(
        db=db,

        interview_session=interview_session,

        question=next_question,
    )


# =========================================================
# CURRENT STATE RESPONSE
# =========================================================

def build_current_state_response(
    db: Session,
    interview_session: InterviewSession,
    requested_question: Question,
):

    # =====================================================
    # FOLLOW-UP QUESTION
    # =====================================================

    if requested_question.parent_question_id is not None:

        existing_follow_up_answer = (
            get_existing_answer(
                db=db,

                session_id=interview_session.id,

                question_id=requested_question.id,
            )
        )

        if existing_follow_up_answer is None:

            return build_current_question_response(
                db=db,

                interview_session=interview_session,

                question=requested_question,
            )

        main_question = (
            get_main_question_from_question(
                db=db,

                question=requested_question,
            )
        )

        next_question = get_next_main_question(
            db=db,

            interview_session=interview_session,

            current_question=main_question,
        )

        return build_next_question_response(
            db=db,

            interview_session=interview_session,

            next_question=next_question,
        )

    # =====================================================
    # MAIN QUESTION
    # =====================================================

    existing_main_answer = get_existing_answer(
        db=db,

        session_id=interview_session.id,

        question_id=requested_question.id,
    )

    # =====================================================
    # UNANSWERED = NEVER ADVANCE
    # =====================================================

    if existing_main_answer is None:

        return build_current_question_response(
            db=db,

            interview_session=interview_session,

            question=requested_question,
        )

    # =====================================================
    # MAIN ANSWERED
    # =====================================================

    follow_up_question = (
        get_follow_up_question(
            db=db,

            main_question=requested_question,
        )
    )

    if follow_up_question:

        follow_up_answer = (
            get_existing_answer(
                db=db,

                session_id=interview_session.id,

                question_id=follow_up_question.id,
            )
        )

        if follow_up_answer is None:

            return build_follow_up_confirmation_response(
                db=db,

                interview_session=interview_session,

                main_question=requested_question,

                follow_up_question=follow_up_question,
            )

    # =====================================================
    # NO FOLLOW-UP / FOLLOW-UP COMPLETED
    # =====================================================

    next_question = get_next_main_question(
        db=db,

        interview_session=interview_session,

        current_question=requested_question,
    )

    return build_next_question_response(
        db=db,

        interview_session=interview_session,

        next_question=next_question,
    )


# =========================================================
# FORMAT ANSWER RESULT
# =========================================================

def format_answer_result(
    db: Session,
    interview_session: InterviewSession,
    current_question: Question,
    result: Any,
):

    if result is None:

        raise HTTPException(
            status_code=500,

            detail=(
                "Answer processing returned no result."
            ),
        )

    # =====================================================
    # Convert result to dict
    # =====================================================

    if hasattr(result, "model_dump"):

        result_data = result.model_dump()

    elif hasattr(result, "dict"):

        result_data = result.dict()

    elif isinstance(result, dict):

        result_data = result

    else:

        result_data = {
            "next_action": getattr(
                result,
                "next_action",
                None,
            ),

            "follow_up_required": getattr(
                result,
                "follow_up_required",
                False,
            ),

            "follow_up_question": getattr(
                result,
                "follow_up_question",
                None,
            ),

            "next_question": getattr(
                result,
                "next_question",
                None,
            ),
        }

    follow_up_required = bool(
        result_data.get(
            "follow_up_required",
            False,
        )
    )

    follow_up_text = result_data.get(
        "follow_up_question"
    )

    is_follow_up = (
        current_question.parent_question_id
        is not None
    )

    # =====================================================
    # FOLLOW-UP ANSWER
    #
    # NEVER CREATE ANOTHER FOLLOW-UP
    # =====================================================

    if is_follow_up:

        next_question = get_next_main_question(
            db=db,

            interview_session=interview_session,

            current_question=current_question,
        )

        return build_next_question_response(
            db=db,

            interview_session=interview_session,

            next_question=next_question,
        )

    # =====================================================
    # MAIN QUESTION ANSWER
    #
    # AI requested follow-up
    # =====================================================

    if (
        follow_up_required
        and follow_up_text
    ):

        follow_up_question = (
            create_follow_up_question(
                db=db,

                main_question=current_question,

                follow_up_text=str(
                    follow_up_text
                ).strip(),
            )
        )

        # FIX 1: the follow-up Question row was only flushed, never
        # committed. process_answer() had already committed earlier,
        # so when the request ended the session closed and this row
        # was rolled back. The candidate answered YES but no
        # follow-up existed, so nothing was asked. Commit it now.
        db.commit()
        db.refresh(follow_up_question)

        return build_follow_up_confirmation_response(
            db=db,

            interview_session=interview_session,

            main_question=current_question,

            follow_up_question=follow_up_question,
        )

    # =====================================================
    # NO FOLLOW-UP
    #
    # Automatically move to next main question.
    # =====================================================

    next_question = get_next_main_question(
        db=db,

        interview_session=interview_session,

        current_question=current_question,
    )

    return build_next_question_response(
        db=db,

        interview_session=interview_session,

        next_question=next_question,
    )


# =========================================================
# FOLLOW-UP CONFIRMATION
# =========================================================

def resolve_confirmation_main_question(
    db: Session,
    interview_session: InterviewSession,
    parameters: dict[str, Any],
):

    question_id_value = (
        normalize_dialogflow_value(
            parameters.get("question_id")
        )
    )

    if question_id_value:

        try:

            question_uuid = UUID(
                str(question_id_value)
            )

        except ValueError:

            question_uuid = None

        if question_uuid:

            question = (
                db.query(Question)
                .filter(
                    Question.id
                    == question_uuid,

                    Question.session_id
                    == interview_session.id,
                )
                .first()
            )

            if question:

                return (
                    get_main_question_from_question(
                        db=db,

                        question=question,
                    )
                )

    return get_current_main_question(
        db=db,

        interview_session=interview_session,
    )


def handle_follow_up_confirmation(
    db: Session,
    interview_session: InterviewSession,
    parameters: dict[str, Any],
    fallback_text: str | None = None,
):

    # Follow-ups are asked automatically (no yes/no from the
    # candidate), so there is never a confirmation to handle.
    # "yes" / "no" typed by a candidate is a normal answer.
    return None

    # =====================================================
    # CHECK WHETHER CONFIRMATION IS REQUIRED
    # =====================================================

    confirmation_required = (
        normalize_dialogflow_value(
            parameters.get(
                "follow_up_confirmation_required"
            )
        )
    )

    # FIX 2: the frontend sends only follow_up_confirmation
    # ("yes" / "no") and never follow_up_confirmation_required,
    # so this handler used to return None and the "yes" was
    # treated like a normal answer. An explicit yes/no value is
    # enough. The checks below still require a real, unanswered
    # follow-up to exist before anything happens.
    explicit_confirmation = normalize_dialogflow_value(
        parameters.get("follow_up_confirmation")
    )

    explicit_confirmation_given = (
        explicit_confirmation is not None
        and str(explicit_confirmation).strip().lower()
        in (YES_VALUES | NO_VALUES)
    )

    if (
        not is_truthy_dialogflow_value(confirmation_required)
        and not explicit_confirmation_given
    ):
        return None

    # =====================================================
    # GET CONFIRMATION PARAMETER
    # =====================================================

    confirmation = (
        normalize_dialogflow_value(
            parameters.get(
                "follow_up_confirmation"
            )
        )
    )

    if confirmation is None:

        confirmation = (
            normalize_dialogflow_value(
                parameters.get(
                    "confirmation"
                )
            )
        )

    # =====================================================
    # FALLBACK TO USER TEXT
    # =====================================================

    if confirmation is None and fallback_text:

        fallback_text = (
            fallback_text.strip().lower()
        )

        if fallback_text in YES_VALUES:

            confirmation = fallback_text

        elif fallback_text in NO_VALUES:

            confirmation = fallback_text

    if confirmation is None:
        return None

    confirmation_text = str(
        confirmation
    ).strip().lower()

    # =====================================================
    # ONLY ACCEPT YES / NO
    # =====================================================

    if (
        confirmation_text not in YES_VALUES
        and confirmation_text not in NO_VALUES
    ):

        return None

    # =====================================================
    # FIND MAIN QUESTION
    # =====================================================

    main_question = (
        resolve_confirmation_main_question(
            db=db,

            interview_session=interview_session,

            parameters=parameters,
        )
    )

    if main_question is None:
        return None

    # =====================================================
    # FIND FOLLOW-UP
    # =====================================================

    follow_up_question = (
        get_follow_up_question(
            db=db,

            main_question=main_question,
        )
    )

    if follow_up_question is None:
        return None

    # =====================================================
    # SAFETY:
    # Main question must already be answered.
    # =====================================================

    main_answer = get_existing_answer(
        db=db,

        session_id=interview_session.id,

        question_id=main_question.id,
    )

    if main_answer is None:

        return build_current_question_response(
            db=db,

            interview_session=interview_session,

            question=main_question,
        )

    # =====================================================
    # SAFETY:
    # If follow-up already answered, do not ask again.
    # =====================================================

    follow_up_answer = get_existing_answer(
        db=db,

        session_id=interview_session.id,

        question_id=follow_up_question.id,
    )

    if follow_up_answer is not None:

        return build_current_state_response(
            db=db,

            interview_session=interview_session,

            requested_question=main_question,
        )

    # =====================================================
    # YES
    # =====================================================

    if confirmation_text in YES_VALUES:

        return handle_follow_up_yes(
            db=db,

            interview_session=interview_session,

            main_question=main_question,
        )

    # =====================================================
    # NO
    # =====================================================

    return handle_follow_up_no(
        db=db,

        interview_session=interview_session,

        main_question=main_question,
    )


# =========================================================
# WEBHOOK
# =========================================================

@router.post("/webhook")
def dialogflow_webhook(
    payload: dict[str, Any],
    db: Session = Depends(get_db),
):

    try:

        # =================================================
        # TAG
        # =================================================

        fulfillment_info = (
            payload.get("fulfillmentInfo")
            or {}
        )

        tag = str(
            fulfillment_info.get("tag")
            or ""
        ).strip().lower()

        # =================================================
        # SESSION ID
        # =================================================

        session_id_value = (
            extract_dialogflow_session_id(
                payload
            )
        )

        interview_session = None

        if session_id_value:

            try:

                session_uuid = UUID(
                    str(session_id_value)
                )

            except ValueError:

                session_uuid = None

            if session_uuid:

                interview_session = (
                    db.query(InterviewSession)
                    .filter(
                        InterviewSession.id
                        == session_uuid
                    )
                    .first()
                )

        # =================================================
        # START
        # =================================================

        if tag in {
            "start_interview",
            "start",
            "initialize",
            "init",
        }:

            return start_interview(
                payload=payload,

                db=db,
            )

        # =================================================
        # SESSION FALLBACK
        # =================================================

        if interview_session is None:

            interview_session = (
                find_fresh_interview_session(db)
            )

        if interview_session is None:

            raise HTTPException(
                status_code=404,
                detail="Interview session not found.",
            )

        if interview_session.status == "completed":

            return build_completion_response(
                interview_session
            )

        if interview_session.status != "in_progress":

            raise HTTPException(
                status_code=409,
                detail="Interview is not in progress.",
            )

        # =================================================
        # PARAMETERS
        # =================================================

        session_info = (
            payload.get("sessionInfo")
            or {}
        )

        parameters = (
            session_info.get("parameters")
            or {}
        )

        # =================================================
        # CANDIDATE TEXT
        #
        # Used only for confirmation fallback.
        # =================================================

        raw_text = payload.get("text")

        fallback_text = None

        if raw_text:

            fallback_text = str(
                raw_text
            ).strip()

        # =================================================
        # FOLLOW-UP CONFIRMATION
        # =================================================

        confirmation_response = (
            handle_follow_up_confirmation(
                db=db,

                interview_session=interview_session,

                parameters=parameters,

                fallback_text=fallback_text,
            )
        )

        if confirmation_response is not None:

            return confirmation_response

        # =================================================
        # REQUESTED QUESTION
        # =================================================

        requested_question_id = None

        question_id_value = (
            normalize_dialogflow_value(
                parameters.get(
                    "question_id"
                )
            )
        )

        if question_id_value:

            try:

                requested_question_id = UUID(
                    str(question_id_value)
                )

            except ValueError:

                requested_question_id = None

        # =================================================
        # CURRENT QUESTION
        # =================================================

        current_question = (
            resolve_current_question(
                db=db,

                interview_session=interview_session,

                requested_question_id=requested_question_id,
            )
        )

        if current_question is None:

            complete_interview(
                db=db,

                interview_session=interview_session,
            )

            db.commit()

            return build_completion_response(
                interview_session
            )

        # =================================================
        # CANDIDATE ANSWER
        # =================================================

        candidate_answer = (
            extract_candidate_answer(
                payload
            )
        )

        # =================================================
        # NO ANSWER
        #
        # Candidate may be thinking.
        #
        # NEVER:
        #   - advance
        #   - complete
        #   - call AI
        # =================================================

        if not candidate_answer:

            print(
                "No candidate answer submitted."
            )

            print(
                "Keeping current question active."
            )

            # -------------------------------------------------
            # If main question was already answered and there
            # is a pending follow-up, show confirmation.
            # -------------------------------------------------

            if (
                current_question.parent_question_id
                is None
            ):

                existing_main_answer = (
                    get_existing_answer(
                        db=db,

                        session_id=interview_session.id,

                        question_id=current_question.id,
                    )
                )

                if existing_main_answer:

                    follow_up_question = (
                        get_follow_up_question(
                            db=db,

                            main_question=current_question,
                        )
                    )

                    if follow_up_question:

                        follow_up_answer = (
                            get_existing_answer(
                                db=db,

                                session_id=interview_session.id,

                                question_id=follow_up_question.id,
                            )
                        )

                        if follow_up_answer is None:

                            return (
                                build_follow_up_confirmation_response(
                                    db=db,

                                    interview_session=interview_session,

                                    main_question=current_question,

                                    follow_up_question=follow_up_question,
                                )
                            )

            # -------------------------------------------------
            # IMPORTANT:
            #
            # Stay on same question.
            # -------------------------------------------------

            return build_current_question_response(
                db=db,

                interview_session=interview_session,

                question=current_question,
            )

        # =================================================
        # CONTROL ACTIONS ARE NOT ANSWERS
        # =================================================

        if (
            candidate_answer.strip().lower()
            in CONTROL_ACTIONS

            and not parameters.get(
                "candidate_answer"
            )
        ):

            return build_current_question_response(
                db=db,

                interview_session=interview_session,

                question=current_question,
            )

        # =================================================
        # PROCESS REAL ANSWER
        # =================================================

        return process_candidate_answer(
            db=db,

            interview_session=interview_session,

            current_question=current_question,

            candidate_answer=candidate_answer,
        )

    except HTTPException:
        raise

    except Exception as exc:

        db.rollback()

        print(
            "Dialogflow webhook error:",
            repr(exc),
        )

        raise HTTPException(
            status_code=500,

            detail=str(exc),
        )


# =========================================================
# CHAT API
# =========================================================

@router.post("/chat")
def dialogflow_chat(
    request: DialogflowChatRequest,

    db: Session = Depends(get_db),
):

    try:

        # =================================================
        # COPY PARAMETERS
        # =================================================

        request_parameters = dict(
            request.parameters or {}
        )

        request_parameters["session_id"] = (
            request.session_id
        )

        action = str(
            normalize_dialogflow_value(
                request_parameters.get(
                    "action"
                )
            )
            or ""
        ).strip().lower()

        text_value = (
            request.text or ""
        ).strip()

        # =================================================
        # START
        # =================================================

        if (
            action in {
                "start",
                "initialize",
                "init",
            }

            or (
                not request_parameters.get(
                    "candidate_answer"
                )

                and text_value.lower()
                == "start"
            )
        ):

            start_payload = {
                "sessionInfo": {
                    "parameters":
                        request_parameters
                },

                "fulfillmentInfo": {
                    "tag":
                        "start_interview"
                },
            }

            return start_interview(
                payload=start_payload,

                db=db,
            )

        # =================================================
        # SESSION
        # =================================================

        try:

            session_uuid = UUID(
                request.session_id
            )

        except ValueError:

            session_uuid = None

        interview_session = None

        if session_uuid:

            interview_session = (
                db.query(InterviewSession)
                .filter(
                    InterviewSession.id
                    == session_uuid
                )
                .first()
            )

        if interview_session is None:

            interview_session = (
                find_fresh_interview_session(db)
            )

        if interview_session is None:

            raise HTTPException(
                status_code=404,
                detail="Interview session not found.",
            )

        if interview_session.status == "completed":

            return build_completion_response(
                interview_session
            )

        if interview_session.status != "in_progress":

            raise HTTPException(
                status_code=409,
                detail="Interview is not in progress.",
            )

        # =================================================
        # FOLLOW-UP CONFIRMATION
        # =================================================

        confirmation_response = (
            handle_follow_up_confirmation(
                db=db,

                interview_session=interview_session,

                parameters=request_parameters,

                fallback_text=text_value,
            )
        )

        if confirmation_response is not None:

            return confirmation_response

        # =================================================
        # REQUESTED QUESTION
        # =================================================

        requested_question_id = None

        question_id_value = (
            normalize_dialogflow_value(
                request_parameters.get(
                    "question_id"
                )
            )
        )

        if question_id_value:

            try:

                requested_question_id = UUID(
                    str(question_id_value)
                )

            except ValueError:

                requested_question_id = None

        # =================================================
        # CURRENT QUESTION
        # =================================================

        current_question = (
            resolve_current_question(
                db=db,

                interview_session=interview_session,

                requested_question_id=requested_question_id,
            )
        )

        if current_question is None:

            complete_interview(
                db=db,

                interview_session=interview_session,
            )

            db.commit()

            return build_completion_response(
                interview_session
            )

        # =================================================
        # EXPLICIT CANDIDATE ANSWER
        # =================================================

        candidate_answer = (
            normalize_dialogflow_value(
                request_parameters.get(
                    "candidate_answer"
                )
            )
        )

        if candidate_answer is not None:

            candidate_answer = str(
                candidate_answer
            ).strip()

        # =================================================
        # FALLBACK TO REQUEST TEXT
        # =================================================

        if not candidate_answer:

            if action in CONTROL_ACTIONS:

                candidate_answer = ""

            else:

                candidate_answer = text_value

        # =================================================
        # NO ANSWER
        #
        # Candidate can still think.
        # NEVER advance / complete.
        # =================================================

        if not candidate_answer:

            print(
                "Chat API: candidate has not submitted answer."
            )

            if (
                current_question.parent_question_id
                is None
            ):

                existing_main_answer = (
                    get_existing_answer(
                        db=db,

                        session_id=interview_session.id,

                        question_id=current_question.id,
                    )
                )

                if existing_main_answer:

                    follow_up_question = (
                        get_follow_up_question(
                            db=db,

                            main_question=current_question,
                        )
                    )

                    if follow_up_question:

                        follow_up_answer = (
                            get_existing_answer(
                                db=db,

                                session_id=interview_session.id,

                                question_id=follow_up_question.id,
                            )
                        )

                        if follow_up_answer is None:

                            return (
                                build_follow_up_confirmation_response(
                                    db=db,

                                    interview_session=interview_session,

                                    main_question=current_question,

                                    follow_up_question=follow_up_question,
                                )
                            )

            return build_current_question_response(
                db=db,

                interview_session=interview_session,

                question=current_question,
            )

        # =================================================
        # CONTROL ACTION
        # =================================================

        if (
            candidate_answer.strip().lower()
            in CONTROL_ACTIONS

            and not request_parameters.get(
                "candidate_answer"
            )
        ):

            return build_current_question_response(
                db=db,

                interview_session=interview_session,

                question=current_question,
            )

        # =================================================
        # PROCESS REAL ANSWER
        # =================================================

        return process_candidate_answer(
            db=db,

            interview_session=interview_session,

            current_question=current_question,

            candidate_answer=candidate_answer,
        )

    except HTTPException:
        raise

    except Exception as exc:

        db.rollback()

        print(
            "Dialogflow chat error:",
            repr(exc),
        )

        raise HTTPException(
            status_code=500,

            detail=str(exc),
        )