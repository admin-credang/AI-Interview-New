from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.session import InterviewSession
from app.schemas.answer import AnswerCreate
from app.services.answer_service import process_answer
from app.services.interview_service import (
    get_current_question,
    get_main_question_number,
)


router = APIRouter(
    prefix="/dialogflow",
    tags=["Dialogflow"]
)


# =========================================================
# START DIALOGFLOW INTERVIEW
# =========================================================

@router.post("/start")
def start_dialogflow_interview(
    payload: dict,
    db: Session = Depends(get_db)
):
    """
    Initializes a Dialogflow interview using an existing
    backend interview session.

    Receives:
        session_id

    Returns:
        session_id
        question_id
        question
        question_number
    """

    try:
        # -----------------------------------------------------
        # Read Dialogflow session parameters
        # -----------------------------------------------------

        session_info = payload.get("sessionInfo", {})
        parameters = session_info.get("parameters", {})

        session_id = parameters.get("session_id")

        # -----------------------------------------------------
        # Validate session_id
        # -----------------------------------------------------

        if not session_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing session_id"
            )

        # -----------------------------------------------------
        # Find interview session
        # -----------------------------------------------------

        interview_session = (
            db.query(InterviewSession)
            .filter(
                InterviewSession.id == session_id
            )
            .first()
        )

        if interview_session is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Interview session not found"
            )

        # -----------------------------------------------------
        # Make sure session is active
        # -----------------------------------------------------

        if interview_session.status != "in_progress":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Interview session is not active"
            )

        # -----------------------------------------------------
        # Get current question from database
        # -----------------------------------------------------

        question = get_current_question(
            db=db,
            session_id=interview_session.id
        )

        # -----------------------------------------------------
        # Prepare Dialogflow session parameters
        # -----------------------------------------------------

        response_parameters = {
            "session_id": str(interview_session.id),
            "question_id": str(question.id),
            "question": question.question,
            "question_number": get_main_question_number(
                db=db,
                question=question,
            )
        }

        # -----------------------------------------------------
        # Return Dialogflow CX response
        # -----------------------------------------------------

        return {
            "sessionInfo": {
                "parameters": response_parameters
            },
        }

    except HTTPException:
        raise

    except Exception as e:
       import traceback

       traceback.print_exc()

       raise HTTPException(
          status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
          detail=str(e)
       )


# =========================================================
# PROCESS CANDIDATE ANSWER
# =========================================================

@router.post("/webhook")
def dialogflow_webhook(
    payload: dict,
    db: Session = Depends(get_db)
):
    """
    Dialogflow CX webhook endpoint.

    Receives:
        session_id
        question_id
        candidate_answer

    Processes the candidate answer using the SAME
    answer processing service used by the normal /answers API.

    Backend decides whether the next action is:

        follow_up
        next_question
        complete
    """

    try:
        # -----------------------------------------------------
        # Read Dialogflow session parameters
        # -----------------------------------------------------

        session_info = payload.get("sessionInfo", {})
        parameters = session_info.get("parameters", {})

        session_id = parameters.get("session_id")
        question_id = parameters.get("question_id")
        candidate_answer = parameters.get("candidate_answer")

        # -----------------------------------------------------
        # Validate required parameters
        # -----------------------------------------------------

        if not session_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing session_id"
            )

        if not question_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing question_id"
            )

        if not candidate_answer:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing candidate_answer"
            )

        # -----------------------------------------------------
        # Find interview session
        # -----------------------------------------------------

        interview_session = (
            db.query(InterviewSession)
            .filter(
                InterviewSession.id == session_id
            )
            .first()
        )

        if interview_session is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Interview session not found"
            )

        # -----------------------------------------------------
        # Build AnswerCreate
        # -----------------------------------------------------

        answer_data = AnswerCreate(
            session_id=session_id,
            question_id=question_id,
            answer_text=candidate_answer
        )

        # -----------------------------------------------------
        # Process answer using shared backend service
        # -----------------------------------------------------

        result = process_answer(
            db=db,
            answer_data=answer_data,
            candidate_id=interview_session.candidate_id
        )

        # -----------------------------------------------------
        # Prepare response parameters
        # -----------------------------------------------------

        response_parameters = {
            # IMPORTANT:
            # Keep session_id for the next Dialogflow turn.
            "session_id": str(interview_session.id),

            "answer_id": str(result.answer_id),

            "next_action": result.next_action,

            "follow_up_required": result.follow_up_required,
        }

        # -----------------------------------------------------
        # If there is another question
        # -----------------------------------------------------

        if result.next_question:

            response_parameters.update({
                "question_id": str(result.next_question.id),

                "question": result.next_question.question,

                "question_number": result.next_question.question_order,
            })

        # -----------------------------------------------------
        # Prepare response message
        # -----------------------------------------------------

        if result.next_question:

            response_text = result.next_question.question

        else:

            response_text = "The interview has been completed."

        # -----------------------------------------------------
        # Return Dialogflow CX response
        # -----------------------------------------------------

        return {
            "sessionInfo": {
                "parameters": response_parameters
            },
            "fulfillmentResponse": {
                "messages": [
                    {
                        "text": {
                            "text": [
                                response_text
                            ]
                        }
                    }
                ]
            }
        }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )