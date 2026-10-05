from typing import Any

from google.api_core.client_options import ClientOptions
from google.cloud import dialogflowcx_v3
from google.protobuf.json_format import MessageToDict

from app.config import settings


# =========================================================
# DIALOGFLOW CX CLIENT
# =========================================================

def get_dialogflow_client():
    """
    Create Dialogflow CX SessionsClient.
    """

    endpoint = (
        f"{settings.dialogflow_location}"
        "-dialogflow.googleapis.com:443"
    )

    client_options = ClientOptions(
        api_endpoint=endpoint
    )

    return dialogflowcx_v3.SessionsClient(
        client_options=client_options
    )


# =========================================================
# CONVERT PARAMETERS
# =========================================================

def convert_parameters(parameters: Any) -> dict:
    """
    Convert Dialogflow CX Struct parameters
    into a normal Python dictionary.
    """

    if not parameters:
        return {}

    try:
        return MessageToDict(
            parameters,
            preserving_proto_field_name=True,
        )

    except Exception:

        try:
            return dict(parameters)

        except Exception:
            return {}


# =========================================================
# EXTRACT WEBHOOK / SESSION PARAMETERS
# =========================================================

def extract_session_parameters(
    query_result: Any,
) -> dict[str, Any]:
    """
    Extract parameters returned by Dialogflow CX.

    Depending on the CX response/webhook path,
    useful parameters can appear in different places.
    """

    result: dict[str, Any] = {}

    # -----------------------------------------------------
    # 1. Query result parameters
    # -----------------------------------------------------

    try:

        query_parameters = convert_parameters(
            query_result.parameters
        )

        if query_parameters:
            result.update(
                query_parameters
            )

    except Exception:
        pass

    # -----------------------------------------------------
    # 2. Query result diagnostic / response messages
    #
    # Some webhook/session information can be exposed
    # through response message payloads.
    # -----------------------------------------------------

    try:

        for message in query_result.response_messages:

            # -------------------------------------------------
            # Text messages don't contain parameters
            # -------------------------------------------------

            if not message.payload:
                continue

            payload = convert_parameters(
                message.payload
            )

            if not payload:
                continue

            # -------------------------------------------------
            # Direct parameters
            # -------------------------------------------------

            payload_parameters = payload.get(
                "parameters"
            )

            if isinstance(
                payload_parameters,
                dict,
            ):

                result.update(
                    payload_parameters
                )

            # -------------------------------------------------
            # sessionInfo.parameters
            # -------------------------------------------------

            session_info = payload.get(
                "sessionInfo"
            )

            if isinstance(
                session_info,
                dict,
            ):

                session_parameters = (
                    session_info.get(
                        "parameters"
                    )
                )

                if isinstance(
                    session_parameters,
                    dict,
                ):

                    result.update(
                        session_parameters
                    )

    except Exception as e:

        print(
            "Parameter extraction warning:",
            str(e),
        )

    return result


# =========================================================
# DETECT INTENT
# =========================================================

def detect_intent(
    session_id: str,
    text: str,
    parameters: dict[str, Any] | None = None,
):
    """
    Send user input to Dialogflow CX.

    Flow:

        React
          ↓
        FastAPI /dialogflow/chat
          ↓
        detect_intent()
          ↓
        Dialogflow CX
          ↓
        FastAPI webhook
          ↓
        Dialogflow CX
          ↓
        detect_intent()
          ↓
        FastAPI
          ↓
        React

    The application InterviewSession UUID is always
    preserved as `session_id`.
    """

    # =====================================================
    # 1. VALIDATE SESSION ID
    # =====================================================

    if not session_id:

        raise ValueError(
            "Dialogflow session_id is required"
        )

    session_id = str(
        session_id
    ).strip()

    if not session_id:

        raise ValueError(
            "Dialogflow session_id cannot be empty"
        )

    # =====================================================
    # 2. VALIDATE TEXT
    # =====================================================

    if not text or not text.strip():

        raise ValueError(
            "Dialogflow text input is required"
        )

    text = text.strip()

    # =====================================================
    # 3. CREATE CLIENT
    # =====================================================

    client = get_dialogflow_client()

    # =====================================================
    # 4. CREATE SESSION PATH
    # =====================================================

    session_path = client.session_path(
        project=settings.dialogflow_project_id,
        location=settings.dialogflow_location,
        agent=settings.dialogflow_agent_id,
        session=session_id,
    )

    # =====================================================
    # 5. REQUEST PARAMETERS
    # =====================================================

    request_parameters: dict[str, Any] = {}

    if parameters:

        request_parameters.update(
            parameters
        )

    # -----------------------------------------------------
    # ALWAYS preserve application session ID
    # -----------------------------------------------------

    request_parameters["session_id"] = (
        session_id
    )

    # =====================================================
    # 6. START INTERVIEW FLAG
    # =====================================================

    start_interview = bool(
        request_parameters.get(
            "start_interview",
            False,
        )
    )

    # =====================================================
    # 7. QUERY PARAMETERS
    # =====================================================

    query_parameters = (
        dialogflowcx_v3.QueryParameters(
            parameters=request_parameters,
        )
    )

    # =====================================================
    # 8. TEXT INPUT
    # =====================================================

    text_input = dialogflowcx_v3.TextInput(
        text=text
    )

    query_input = dialogflowcx_v3.QueryInput(
        text=text_input,
        language_code="en",
    )

    # =====================================================
    # 9. DETECT INTENT REQUEST
    # =====================================================

    request = dialogflowcx_v3.DetectIntentRequest(
        session=session_path,
        query_input=query_input,
        query_params=query_parameters,
    )

    # =====================================================
    # 10. CALL DIALOGFLOW
    # =====================================================

    response = client.detect_intent(
        request=request
    )

    # =====================================================
    # 11. QUERY RESULT
    # =====================================================

    query_result = response.query_result

    # =====================================================
    # 12. RESPONSE TEXT
    # =====================================================

    messages: list[str] = []

    for message in query_result.response_messages:

        try:

            if (
                message.text
                and message.text.text
            ):

                messages.extend(
                    message.text.text
                )

        except Exception:
            continue

    response_text = "\n".join(
        messages
    )

    # =====================================================
    # 13. EXTRACT DIALOGFLOW PARAMETERS
    # =====================================================

    dialogflow_parameters = (
        extract_session_parameters(
            query_result
        )
    )

    # =====================================================
    # 14. MERGE PARAMETERS
    # =====================================================
    #
    # IMPORTANT:
    #
    # Request parameters
    #       +
    # Dialogflow parameters
    #       =
    # final parameters
    #
    # Dialogflow values are allowed to update the
    # application state.
    # =====================================================

    response_parameters: dict[str, Any] = {}

    response_parameters.update(
        request_parameters
    )

    response_parameters.update(
        dialogflow_parameters
    )

    # =====================================================
    # 15. ALWAYS PRESERVE APPLICATION SESSION ID
    # =====================================================

    response_parameters["session_id"] = (
        session_id
    )

    # =====================================================
    # 16. CURRENT PAGE
    # =====================================================

    current_page = None

    try:

        if query_result.current_page:

            current_page = (
                query_result.current_page.name
            )

    except Exception:
        current_page = None

    # =====================================================
    # 17. IMPORTANT DEBUG INFORMATION
    # =====================================================

    print()
    print("=" * 80)
    print("DIALOGFLOW CX RESPONSE")
    print("=" * 80)

    print(
        "Session ID:",
        session_id,
    )

    print(
        "Input Text:",
        text,
    )

    print(
        "Start Interview:",
        start_interview,
    )

    print(
        "Input Parameters:",
        request_parameters,
    )

    print(
        "Dialogflow Parameters:",
        dialogflow_parameters,
    )

    print(
        "Final Parameters:",
        response_parameters,
    )

    print(
        "Question ID:",
        response_parameters.get(
            "question_id"
        ),
    )

    print(
        "Question:",
        response_parameters.get(
            "question"
        ),
    )

    print(
        "Question Number:",
        response_parameters.get(
            "question_number"
        ),
    )

    print(
        "Question Type:",
        response_parameters.get(
            "question_type"
        ),
    )

    print(
        "Next Action:",
        response_parameters.get(
            "next_action"
        ),
    )

    print(
        "Follow-up Required:",
        response_parameters.get(
            "follow_up_required"
        ),
    )

    print(
        "Follow-up Question:",
        response_parameters.get(
            "follow_up_question"
        ),
    )

    print(
        "Current Page:",
        current_page,
    )

    print(
        "Response Text:",
        response_text,
    )

    print("=" * 80)
    print()

    # =====================================================
    # 18. RETURN RESULT
    # =====================================================

    return {
        "text": response_text,

        "parameters": response_parameters,

        "current_page": current_page,
    }