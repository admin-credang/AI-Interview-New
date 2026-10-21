from __future__ import annotations

from datetime import datetime, timezone
import random
from uuid import UUID
import time

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.session import InterviewSession
from app.models.question import Question
from app.models.answer import Answer
from app.models.interview_configuration import InterviewConfiguration
from app.models.score import Score
from app.models.feedback import Feedback

from app.schemas.answer import AnswerCreate
from app.schemas.evaluation import (
    EvaluationResponse,
    NextQuestionResponse,
)

from app.services.evaluation_service import (
    evaluate_answer,
    generate_follow_up_question,
    is_skip_answer,
)
from app.services.interview_service import move_to_next_question
from app.services.report_service import generate_interview_report
from app.services.interview_policy import max_follow_ups


# =========================================================
# FOLLOW-UP CONFIGURATION
# =========================================================

# Maximum follow-up questions allowed
# for the ENTIRE interview.
MAX_FOLLOW_UPS_PER_INTERVIEW = 2


# =========================================================
# COUNT FOLLOW-UPS USED
# =========================================================

def get_follow_up_count(
    db: Session,
    session_id: UUID,
) -> int:
    """
    Count follow-ups already created for this interview.

    IMPORTANT:
    Only MAIN question answers can create follow-ups.

    Follow-up answers themselves are never counted.
    """

    count = (
        db.query(Feedback)
        .join(
            Answer,
            Feedback.answer_id == Answer.id,
        )
        .join(
            Question,
            Answer.question_id == Question.id,
        )
        .filter(
            Answer.session_id == session_id,

            Feedback.follow_up_required.is_(True),

            # Only main questions can create follow-ups.
            Question.parent_question_id.is_(None),
        )
        .count()
    )

    return int(count)


# =========================================================
# FOLLOW-UP SLOTS (EXACTLY 2 PER INTERVIEW)
# =========================================================

def get_follow_up_slots(
    db: Session,
    session_id: UUID,
    limit: int = MAX_FOLLOW_UPS_PER_INTERVIEW,
) -> list[int]:
    """
    Decide WHICH main questions get a follow-up.

    The slots are derived from the session id with a seeded
    random generator, so they are random per interview but
    always identical for the same session (no DB column
    needed, stable across requests and server restarts).

    The last main question is excluded when there are more
    than 2 main questions, so a skipped answer can be
    carried over to a later question and the interview
    still ends with exactly MAX_FOLLOW_UPS_PER_INTERVIEW.
    """

    orders = sorted(
        order
        for (order,) in (
            db.query(Question.question_order)
            .filter(
                Question.session_id == session_id,
                Question.parent_question_id.is_(None),

                # client-written compulsory questions never get a
                # follow-up, so they are not follow-up candidates
                Question.category != "compulsory",
            )
            .all()
        )
    )

    if limit <= 0:
        return []

    if len(orders) <= limit:
        return orders

    pool = orders[:-1]

    rng = random.Random(str(session_id))

    return sorted(
        rng.sample(
            pool,
            min(limit, len(pool)),
        )
    )


# =========================================================
# NORMALIZE FOLLOW-UP DECISION
# =========================================================

def normalize_follow_up_decision(
    evaluation: dict,
) -> tuple[bool, str | None]:
    """
    Safely normalize AI follow-up decision.

    Supported values:

        True
        False
        "true"
        "false"
        "yes"
        "no"
        1
        0
    """

    value = evaluation.get(
        "follow_up_required",
        False,
    )

    # -----------------------------------------------------
    # Boolean
    # -----------------------------------------------------

    if isinstance(value, bool):

        follow_up_required = value

    # -----------------------------------------------------
    # String
    # -----------------------------------------------------

    elif isinstance(value, str):

        normalized = (
            value.strip().lower()
        )

        if normalized in {
            "true",
            "1",
            "yes",
            "y",
        }:
            follow_up_required = True

        elif normalized in {
            "false",
            "0",
            "no",
            "n",
            "",
        }:
            follow_up_required = False

        else:
            # Unknown string should NOT accidentally
            # create a follow-up.
            follow_up_required = False

    # -----------------------------------------------------
    # Number
    # -----------------------------------------------------

    elif isinstance(value, (int, float)):

        follow_up_required = (
            value != 0
        )

    # -----------------------------------------------------
    # Unknown type
    # -----------------------------------------------------

    else:

        follow_up_required = False

    # =====================================================
    # FOLLOW-UP QUESTION
    # =====================================================

    follow_up_question = evaluation.get(
        "follow_up_question"
    )

    if follow_up_question is not None:

        follow_up_question = str(
            follow_up_question
        ).strip()

        if not follow_up_question:
            follow_up_question = None

    # =====================================================
    # SAFETY
    # =====================================================

    # AI cannot request follow-up without
    # providing an actual question.

    if (
        follow_up_required
        and not follow_up_question
    ):

        print(
            "WARNING: AI requested follow-up "
            "but follow_up_question is empty."
        )

        follow_up_required = False
        follow_up_question = None

    return (
        follow_up_required,
        follow_up_question,
    )


# =========================================================
# PROCESS ANSWER
# =========================================================

def process_answer(
    db: Session,
    answer_data: AnswerCreate,
    candidate_id: UUID | None = None,
) -> EvaluationResponse:

    try:

        # =================================================
        # 1. FIND INTERVIEW SESSION
        # =================================================

        session_query = (
            db.query(InterviewSession)
            .filter(
                InterviewSession.id
                == answer_data.session_id,
            )
        )

        # Candidate validation is optional because
        # Dialogflow already provides session_id.

        if candidate_id is not None:

            session_query = session_query.filter(
                InterviewSession.candidate_id
                == candidate_id
            )

        session = session_query.first()

        if session is None:

            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Interview session not found",
            )

        # =================================================
        # 2. SESSION MUST BE ACTIVE
        # =================================================

        if session.status != "in_progress":

            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Interview session is not active",
            )

        # =================================================
        # 3. FIND QUESTION
        # =================================================

        question = (
            db.query(Question)
            .filter(
                Question.id
                == answer_data.question_id,

                Question.session_id
                == answer_data.session_id,
            )
            .first()
        )

        if question is None:

            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=(
                    "Question not found for this session"
                ),
            )

        # =================================================
        # 4. DETERMINE QUESTION TYPE
        # =================================================

        is_follow_up = (
            question.parent_question_id is not None
        )

        print()
        print("=" * 70)
        print("QUESTION PROCESSING")
        print("=" * 70)

        print(
            f"Question ID      : {question.id}"
        )

        print(
            f"Question Order   : "
            f"{question.question_order}"
        )

        print(
            f"Parent Question  : "
            f"{question.parent_question_id}"
        )

        print(
            f"Is Follow-up     : "
            f"{is_follow_up}"
        )

        print("=" * 70)

        # =================================================
        # 5. MAIN QUESTION VALIDATION
        # =================================================

        # Main question MUST be the current question.
        #
        # Follow-up question does not change
        # session.current_question.

        if not is_follow_up:

            if (
                question.question_order
                != session.current_question
            ):

                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        "This is not the current "
                        "interview question"
                    ),
                )

        # =================================================
        # 6. FOLLOW-UP VALIDATION
        # =================================================

        if is_follow_up:

            # -------------------------------------------------
            # Make sure the follow-up belongs to the current
            # main question.
            # -------------------------------------------------

            parent_question = (
                db.query(Question)
                .filter(
                    Question.id
                    == question.parent_question_id,

                    Question.session_id
                    == answer_data.session_id,
                )
                .first()
            )

            if parent_question is None:

                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        "Parent question for follow-up "
                        "was not found"
                    ),
                )

            # -------------------------------------------------
            # Follow-up must belong to current main question.
            # -------------------------------------------------

            if (
                parent_question.question_order
                != session.current_question
            ):

                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        "This follow-up does not belong "
                        "to the current interview question"
                    ),
                )

            # -------------------------------------------------
            # Parent main question must already have an answer.
            # -------------------------------------------------

            parent_answer = (
                db.query(Answer)
                .filter(
                    Answer.session_id
                    == answer_data.session_id,

                    Answer.question_id
                    == parent_question.id,
                )
                .first()
            )

            if parent_answer is None:

                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        "The main question must be answered "
                        "before its follow-up"
                    ),
                )

        # =================================================
        # 7. ANSWER VALIDATION
        # =================================================

        if (
            not answer_data.answer_text
            and not answer_data.audio_url
        ):

            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Either answer_text or audio_url "
                    "must be provided"
                ),
            )

        # =================================================
        # 8. DUPLICATE ANSWER CHECK
        # =================================================

        existing_answer = (
            db.query(Answer)
            .filter(
                Answer.session_id
                == answer_data.session_id,

                Answer.question_id
                == answer_data.question_id,
            )
            .first()
        )

        if existing_answer:

            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "This question has already been answered"
                ),
            )

        # =================================================
        # 9. GET INTERVIEW CONFIGURATION
        # =================================================

        configuration = (
            db.query(
                InterviewConfiguration
            )
            .filter(
                InterviewConfiguration.interview_id
                == session.interview_id
            )
            .first()
        )

        if configuration is None:

            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=(
                    "Interview configuration not found"
                ),
            )

        # =================================================
        # 10. TEXT REQUIRED FOR AI
        # =================================================

        if not answer_data.answer_text:

            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Answer text is required "
                    "for evaluation"
                ),
            )

        answer_text = str(
            answer_data.answer_text
        ).strip()

        if not answer_text:

            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Answer text cannot be empty"
                ),
            )

        # =================================================
        # 11. AI EVALUATION
        # =================================================

        print()
        print("=" * 70)
        print("AI EVALUATION START")
        print("=" * 70)

        evaluation_start = time.time()

        evaluation = evaluate_answer(
            question=question.question,

            answer=answer_text,

            difficulty=configuration.difficulty,

            knowledge_expectation=(
                configuration.knowledge_expectation
            ),

            question_type=question.type,

            category=question.category,
        )

        evaluation_time = (
            time.time()
            - evaluation_start
        )

        print(
            f"GPT evaluation time: "
            f"{evaluation_time:.2f}s"
        )

        print("=" * 70)

        # =================================================
        # 12. VALIDATE AI EVALUATION
        # =================================================

        if not isinstance(
            evaluation,
            dict,
        ):

            raise HTTPException(
                status_code=500,
                detail=(
                    "AI evaluation returned "
                    "an invalid response."
                ),
            )

        required_evaluation_fields = (
            "relevance",
            "accuracy",
            "technical_knowledge",
            "completeness",
            "communication",
            "overall_score",
            "feedback_text",
            "follow_up_required",
            "follow_up_question",
        )

        missing_fields = [
            field
            for field in required_evaluation_fields
            if field not in evaluation
        ]

        if missing_fields:

            raise HTTPException(
                status_code=500,
                detail=(
                    "AI evaluation is missing "
                    "required fields: "
                    + ", ".join(
                        missing_fields
                    )
                ),
            )

        # =================================================
        # 13. EXTRACT FOLLOW-UP DECISION
        # =================================================

        (
            ai_follow_up_required,
            ai_follow_up_question,
        ) = normalize_follow_up_decision(
            evaluation
        )

        # =================================================
        # 13A. SKIP / UNKNOWN ANSWER SAFETY
        # =================================================
        #
        # Answers such as:
        #   "I don't know"
        #   "not sure"
        #   "skip"
        #   "I can't answer"
        #
        # are VALID submitted answers.
        #
        # They must never create a follow-up.
        #
        # This backend check is intentionally placed BEFORE
        # Feedback is saved so a wrongly returned AI
        # follow_up_required=True can never increase the
        # interview follow-up count.
        # =================================================

        candidate_skipped = is_skip_answer(
            answer_text
        )

        if candidate_skipped:

            print()
            print("=" * 70)
            print("SKIP / UNKNOWN ANSWER DETECTED")
            print("=" * 70)
            print(
                f"Candidate answer: {answer_text}"
            )
            print(
                "Forcing follow_up_required = False"
            )
            print(
                "Forcing follow_up_question = None"
            )
            print("=" * 70)
            print()

            ai_follow_up_required = False
            ai_follow_up_question = None

        # =================================================
        # 14. COUNT FOLLOW-UPS
        # =================================================

        follow_ups_used = (
            get_follow_up_count(
                db=db,
                session_id=answer_data.session_id,
            )
        )

        # The INTERVIEWER decides: follow-ups on/off and how many.
        follow_up_limit = max_follow_ups(configuration)

        print()
        print("=" * 70)
        print("FOLLOW-UP CONTROL")
        print("=" * 70)

        print(
            f"Follow-ups already used : "
            f"{follow_ups_used}"
        )

        print(
            f"Maximum allowed         : "
            f"{follow_up_limit}"
        )

        print(
            f"AI requested follow-up  : "
            f"{ai_follow_up_required}"
        )

        print(
            f"Current is follow-up    : "
            f"{is_follow_up}"
        )

        # =================================================
        # 15. DETERMINE FINAL FOLLOW-UP DECISION
        # =================================================

        follow_up_required = False
        follow_up_question = None

        # -------------------------------------------------
        # CASE A:
        # Current question is a FOLLOW-UP.
        #
        # NEVER create another follow-up.
        # -------------------------------------------------

        if is_follow_up:

            print(
                "FOLLOW-UP ANSWER DETECTED"
            )

            print(
                "Nested follow-up is BLOCKED."
            )

            follow_up_required = False
            follow_up_question = None

        # -------------------------------------------------
        # CASE B:
        # Current question is MAIN.
        #
        # The BACKEND decides whether a follow-up is asked
        # (exactly MAX_FOLLOW_UPS_PER_INTERVIEW per interview,
        # on randomly chosen main questions). The AI never
        # decides this; it only provides the question text.
        #
        # A slot that was missed because the candidate
        # skipped / said "I don't know" is carried over to
        # the next main question.
        # -------------------------------------------------

        else:

            follow_up_slots = get_follow_up_slots(
                db=db,
                session_id=answer_data.session_id,
                limit=follow_up_limit,
            )

            slots_reached = sum(
                1
                for slot in follow_up_slots
                if slot <= question.question_order
            )

            follow_up_due = (
                slots_reached > follow_ups_used
                and follow_ups_used
                < follow_up_limit
                and not candidate_skipped
                # compulsory questions are asked as written, no follow-up
                and str(question.category or "").lower() != "compulsory"
            )

            print(
                f"Follow-up slots         : "
                f"{follow_up_slots}"
            )

            print(
                f"Follow-up due now       : "
                f"{follow_up_due}"
            )

            if follow_up_due:

                # Prefer the question the evaluator already
                # wrote from this answer; otherwise generate
                # one from the candidate's answer.

                follow_up_question = (
                    ai_follow_up_question
                    if (
                        ai_follow_up_required
                        and ai_follow_up_question
                    )
                    else None
                )

                if not follow_up_question:

                    follow_up_question = (
                        generate_follow_up_question(
                            question=question.question,
                            answer=answer_text,
                            difficulty=(
                                configuration.difficulty
                            ),
                            knowledge_expectation=(
                                configuration.knowledge_expectation
                            ),
                        )
                    )

                if follow_up_question:

                    follow_up_required = True

                    print(
                        "FOLLOW-UP APPROVED"
                    )

                    print(
                        f"Follow-up number: "
                        f"{follow_ups_used + 1}"
                    )

                else:

                    follow_up_required = False

                    print(
                        "FOLLOW-UP GENERATION FAILED - "
                        "will retry on next main question."
                    )

            else:

                follow_up_required = False
                follow_up_question = None

        print(
            f"Final follow-up decision: "
            f"{follow_up_required}"
        )

        print("=" * 70)

        # =================================================
        # 16. CREATE ANSWER
        # =================================================

        answer = Answer(
            session_id=answer_data.session_id,

            question_id=answer_data.question_id,

            answer_text=answer_text,

            audio_url=answer_data.audio_url,
        )

        db.add(answer)

        db.flush()

        # =================================================
        # 17. SAVE SCORE
        # =================================================

        try:

            score = Score(
                answer_id=answer.id,

                relevance=evaluation[
                    "relevance"
                ],

                accuracy=evaluation[
                    "accuracy"
                ],

                technical_knowledge=evaluation[
                    "technical_knowledge"
                ],

                completeness=evaluation[
                    "completeness"
                ],

                communication=evaluation[
                    "communication"
                ],

                overall_score=evaluation[
                    "overall_score"
                ],
            )

            db.add(score)

        except (
            KeyError,
            TypeError,
            ValueError,
        ) as exc:

            raise HTTPException(
                status_code=500,
                detail=(
                    "Invalid score returned by "
                    f"AI evaluation: {str(exc)}"
                ),
            )

        # =================================================
        # 18. SAVE FEEDBACK
        # =================================================

        feedback = Feedback(
            answer_id=answer.id,

            feedback_text=str(
                evaluation[
                    "feedback_text"
                ]
            ).strip(),

            follow_up_required=(
                follow_up_required
            ),

            follow_up_question=(
                follow_up_question
            ),
        )

        db.add(feedback)

        db.flush()

        # =================================================
        # 19. FOLLOW-UP REQUIRED
        # =================================================

        if follow_up_required:

            print()
            print("=" * 70)
            print("FOLLOW-UP REQUIRED")
            print("=" * 70)

            print(
                f"Follow-up question: "
                f"{follow_up_question}"
            )

            print(
                f"Follow-up number: "
                f"{follow_ups_used + 1}"
            )

            print(
                "Waiting for candidate YES/NO..."
            )

            print("=" * 70)

            next_action = (
                "ask_follow_up_confirmation"
            )

            next_question_response = None

        # =================================================
        # 20. NO FOLLOW-UP
        # =================================================

        else:

            print()
            print("=" * 70)
            print("MOVING TO NEXT MAIN QUESTION")
            print("=" * 70)

            # -------------------------------------------------
            # IMPORTANT:
            #
            # Answer is already flushed to DB above.
            #
            # Therefore interview_service can safely verify
            # that the current main question has been answered.
            #
            # If current question is:
            #
            # Q1 -> move to Q2
            #
            # Follow-up of Q1 -> move to Q2
            #
            # Q5 -> complete
            # -------------------------------------------------

            next_question = (
                move_to_next_question(
                    db=db,
                    session_id=answer_data.session_id,
                )
            )

            # =================================================
            # SAFETY CHECK
            # =================================================

            if (
                next_question is not None
                and next_question.parent_question_id
                is not None
            ):

                print(
                    "WARNING: "
                    "move_to_next_question returned "
                    "a follow-up question."
                )

                print(
                    "This is invalid."
                )

                print(
                    "Ignoring returned follow-up."
                )

                next_question = None

            # =================================================
            # NEXT MAIN QUESTION
            # =================================================

            if next_question is not None:

                next_action = "next_question"

                next_question_response = (
                    NextQuestionResponse(
                        id=next_question.id,

                        question=next_question.question,

                        category=next_question.category,

                        difficulty=next_question.difficulty,

                        type=next_question.type,

                        question_order=(
                            next_question.question_order
                        ),
                    )
                )

                print(
                    "NEXT MAIN QUESTION FOUND"
                )

                print(
                    f"Next question: "
                    f"{next_question.question}"
                )

                print(
                    f"Next question number: "
                    f"{next_question.question_order}"
                )

            # =================================================
            # INTERVIEW COMPLETE
            # =================================================

            else:

                next_action = "complete"

                next_question_response = None

                session.status = "completed"

                if session.ended_at is None:

                    session.ended_at = (
                        datetime.now(timezone.utc)
                    )

                db.add(session)

                print()
                print("=" * 70)
                print("INTERVIEW COMPLETED")
                print("=" * 70)

        # =================================================
        # 21. GENERATE REPORT
        # =================================================

        if next_action == "complete":

            db.flush()

            try:

                generate_interview_report(
                    db=db,
                    session_id=answer_data.session_id,
                )

                print(
                    "Interview report generated."
                )

            except Exception as report_error:

                # Report failure should NOT undo
                # interview completion.

                print(
                    "WARNING: "
                    "Report generation failed:"
                )

                print(
                    str(report_error)
                )

        # =================================================
        # 22. COMMIT
        # =================================================

        db.commit()

        db.refresh(answer)

        # =================================================
        # 23. RETURN RESULT
        # =================================================

        return EvaluationResponse(

            answer_id=answer.id,

            relevance=evaluation[
                "relevance"
            ],

            accuracy=evaluation[
                "accuracy"
            ],

            technical_knowledge=evaluation[
                "technical_knowledge"
            ],

            completeness=evaluation[
                "completeness"
            ],

            communication=evaluation[
                "communication"
            ],

            overall_score=evaluation[
                "overall_score"
            ],

            feedback_text=str(
                evaluation[
                    "feedback_text"
                ]
            ).strip(),

            follow_up_required=(
                follow_up_required
            ),

            follow_up_question=(
                follow_up_question
            ),

            next_action=next_action,

            next_question=(
                next_question_response
            ),
        )

    # =====================================================
    # HTTP ERROR
    # =====================================================

    except HTTPException:

        db.rollback()

        raise

    # =====================================================
    # UNKNOWN ERROR
    # =====================================================

    except Exception as exc:

        db.rollback()

        print()
        print("=" * 70)
        print("PROCESS ANSWER ERROR")
        print("=" * 70)

        print(
            f"Error type: "
            f"{type(exc).__name__}"
        )

        print(
            f"Error: "
            f"{str(exc)}"
        )

        print("=" * 70)

        raise HTTPException(
            status_code=(
                status.HTTP_500_INTERNAL_SERVER_ERROR
            ),
            detail=(
                "Failed to process interview answer"
            ),
        )