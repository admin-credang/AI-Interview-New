# app/services/question_service.py

from __future__ import annotations

from typing import Any
import json
import os

from dotenv import load_dotenv
from openai import OpenAI
from sqlalchemy.orm import Session

from app.models.question import Question


# =========================================================
# ENVIRONMENT
# =========================================================

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

if not OPENAI_API_KEY:
    raise RuntimeError(
        "OPENAI_API_KEY is not configured."
    )

client = OpenAI(
    api_key=OPENAI_API_KEY
)


# =========================================================
# CONSTANTS
# =========================================================

QUESTION_COUNT = 5

ALLOWED_QUESTION_TYPES = {
    "technical",
    "behavioral",
    "situational",
}


# =========================================================
# NORMALIZE QUESTION TYPE
# =========================================================

def normalize_question_type(
    question_type: str | None,
    category: str | None,
) -> str:
    """
    Normalize AI question type.

    Allowed values:

        technical
        behavioral
        situational
    """

    # -----------------------------------------------------
    # Explicit type
    # -----------------------------------------------------

    if question_type:

        normalized_type = (
            str(question_type)
            .strip()
            .lower()
        )

        if normalized_type in ALLOWED_QUESTION_TYPES:
            return normalized_type

    # -----------------------------------------------------
    # Infer from category
    # -----------------------------------------------------

    category_value = (
        category or ""
    ).strip().lower()

    technical_categories = {
        "technical",
        "coding",
        "programming",
        "database",
        "python",
        "django",
        "api",
        "machine_learning",
        "data_structures",
        "algorithms",
        "frontend",
        "backend",
        "react",
        "javascript",
        "sql",
        "postgresql",
        "mysql",
        "fastapi",
    }

    behavioral_categories = {
        "behavioral",
        "communication",
        "leadership",
        "teamwork",
        "collaboration",
    }

    if category_value in technical_categories:
        return "technical"

    if category_value in behavioral_categories:
        return "behavioral"

    return "situational"


# =========================================================
# NORMALIZE DIFFICULTY
# =========================================================

def normalize_difficulty(
    difficulty: str | None,
    fallback: str = "medium",
) -> str:
    """
    Normalize difficulty.
    """

    value = (
        difficulty or fallback
    ).strip().lower()

    allowed = {
        "easy",
        "medium",
        "hard",
    }

    if value not in allowed:
        return fallback

    return value


# =========================================================
# NORMALIZE KNOWLEDGE EXPECTATION
# =========================================================

def normalize_knowledge_expectation(
    knowledge_expectation: str | None,
) -> str:
    """
    Normalize expected candidate knowledge level.
    """

    value = (
        knowledge_expectation
        or "intermediate"
    ).strip().lower()

    allowed = {
        "beginner",
        "intermediate",
        "advanced",
        "expert",
    }

    if value not in allowed:
        return "intermediate"

    return value


# =========================================================
# GENERATE QUESTIONS USING AI
# =========================================================

def generate_questions(
    interview_title: str,
    interview_description: str | None,
    difficulty: str,
    knowledge_expectation: str,
    construct_from_answers: bool,
    extra_config: dict | None = None,
) -> list[dict[str, Any]]:
    """
    Generate exactly 5 MAIN interview questions.

    Follow-up questions are NEVER generated here.

    Follow-ups are generated later by the evaluation flow.
    """

    normalized_difficulty = normalize_difficulty(
        difficulty
    )

    normalized_knowledge = (
        normalize_knowledge_expectation(
            knowledge_expectation
        )
    )

    # =====================================================
    # PROMPT
    # =====================================================

    prompt = f"""
You are an expert AI interviewer.

Generate exactly {QUESTION_COUNT} unique MAIN interview
questions based on the interview configuration below.

INTERVIEW TITLE:
{interview_title}

INTERVIEW DESCRIPTION:
{interview_description or "Not provided"}

DIFFICULTY:
{normalized_difficulty}

KNOWLEDGE EXPECTATION:
{normalized_knowledge}

CONSTRUCT QUESTIONS FROM CANDIDATE ANSWERS:
{construct_from_answers}

ADDITIONAL CONFIGURATION:
{json.dumps(extra_config or {}, indent=2)}


=========================================================
MAIN QUESTION RULES
=========================================================

1. Generate exactly {QUESTION_COUNT} questions.

2. Every question must be unique.

3. Every question must be relevant to this interview.

4. Do not use a generic reusable question bank.

5. Match the requested difficulty.

6. Match the requested knowledge expectation.

7. Questions should test actual understanding,
   reasoning, and practical ability.

8. Mix categories when appropriate.

9. Every question must be independently answerable.

10. Do NOT generate follow-up questions.

11. Do NOT refer to another generated question.

12. Do NOT include question numbering in the question text.

13. Avoid duplicate or nearly identical questions.


=========================================================
QUESTION CATEGORY
=========================================================

The "category" represents the skill or topic.

Possible categories include:

- technical
- problem_solving
- communication
- leadership
- teamwork
- python
- django
- database
- api
- machine_learning
- algorithms
- data_structures
- javascript
- react
- frontend
- backend
- fastapi
- postgresql
- mysql
- sql


=========================================================
QUESTION TYPE
=========================================================

The "type" MUST be exactly one of:

- technical
- behavioral
- situational

Never use category names as the type.


=========================================================
OUTPUT
=========================================================

Return ONLY valid JSON.

Do not use markdown.
Do not use ```json.
Do not include explanations.

Return exactly:

[
  {{
    "question": "Question text",
    "category": "technical",
    "difficulty": "{normalized_difficulty}",
    "type": "technical"
  }}
]
"""

    # =====================================================
    # LOGGING
    # =====================================================

    print()
    print("=" * 70)
    print("GENERATING AI INTERVIEW QUESTIONS")
    print("=" * 70)

    print(
        f"Interview title : {interview_title}"
    )

    print(
        f"Difficulty      : {normalized_difficulty}"
    )

    print(
        f"Knowledge       : {normalized_knowledge}"
    )

    print(
        f"Construct mode  : {construct_from_answers}"
    )

    print("=" * 70)

    # =====================================================
    # OPENAI REQUEST
    # =====================================================

    try:

        response = client.responses.create(
            model="gpt-4.1",
            input=prompt,
        )

    except Exception as exc:

        print()
        print("OPENAI ERROR:")
        print(str(exc))

        raise RuntimeError(
            "Failed to generate interview questions using AI."
        ) from exc

    # =====================================================
    # EXTRACT OUTPUT
    # =====================================================

    raw_output = (
        response.output_text or ""
    ).strip()

    print()
    print("AI QUESTION RESPONSE:")
    print(raw_output)

    if not raw_output:

        raise ValueError(
            "OpenAI returned an empty response."
        )

    # =====================================================
    # REMOVE MARKDOWN CODE FENCE
    # =====================================================

    if raw_output.startswith("```"):

        if raw_output.startswith("```json"):

            raw_output = raw_output[
                len("```json"):
            ]

        else:

            raw_output = raw_output[
                len("```"):
            ]

        if raw_output.endswith("```"):

            raw_output = raw_output[
                :-len("```")
            ]

        raw_output = raw_output.strip()

    # =====================================================
    # PARSE JSON
    # =====================================================

    try:

        questions = json.loads(
            raw_output
        )

    except json.JSONDecodeError as exc:

        raise ValueError(
            "OpenAI returned invalid JSON "
            "while generating interview questions."
        ) from exc

    # =====================================================
    # VALIDATE LIST
    # =====================================================

    if not isinstance(
        questions,
        list,
    ):

        raise ValueError(
            "OpenAI returned an invalid question format."
        )

    if len(questions) != QUESTION_COUNT:

        raise ValueError(
            f"Expected exactly {QUESTION_COUNT} questions, "
            f"received {len(questions)}."
        )

    # =====================================================
    # NORMALIZE QUESTIONS
    # =====================================================

    normalized_questions: list[
        dict[str, Any]
    ] = []

    seen_questions: set[str] = set()

    for index, item in enumerate(
        questions,
        start=1,
    ):

        # -------------------------------------------------
        # Validate object
        # -------------------------------------------------

        if not isinstance(
            item,
            dict,
        ):

            raise ValueError(
                f"Question {index} is not a valid object."
            )

        # -------------------------------------------------
        # Question text
        # -------------------------------------------------

        question_text = str(
            item.get(
                "question",
                "",
            )
        ).strip()

        if not question_text:

            raise ValueError(
                f"Question {index} has empty question text."
            )

        # -------------------------------------------------
        # Duplicate detection
        # -------------------------------------------------

        normalized_question_key = (
            " ".join(
                question_text.lower().split()
            )
        )

        if normalized_question_key in seen_questions:

            raise ValueError(
                f"Question {index} is duplicated."
            )

        seen_questions.add(
            normalized_question_key
        )

        # -------------------------------------------------
        # Category
        # -------------------------------------------------

        category = str(
            item.get(
                "category",
                "technical",
            )
        ).strip().lower()

        if not category:

            category = "technical"

        # -------------------------------------------------
        # Type
        # -------------------------------------------------

        question_type = (
            normalize_question_type(
                item.get("type"),
                category,
            )
        )

        # -------------------------------------------------
        # Difficulty
        # -------------------------------------------------

        question_difficulty = (
            normalize_difficulty(
                item.get(
                    "difficulty",
                    normalized_difficulty,
                ),
                fallback=normalized_difficulty,
            )
        )

        # -------------------------------------------------
        # Final normalized object
        # -------------------------------------------------

        normalized_questions.append(
            {
                "question": question_text,
                "category": category,
                "difficulty": question_difficulty,
                "type": question_type,
            }
        )

    # =====================================================
    # FINAL VALIDATION
    # =====================================================

    if len(normalized_questions) != QUESTION_COUNT:

        raise ValueError(
            f"Question generation failed. "
            f"Expected {QUESTION_COUNT} questions."
        )

    print()
    print(
        f"Successfully generated "
        f"{len(normalized_questions)} main questions."
    )

    return normalized_questions


# =========================================================
# SAVE GENERATED MAIN QUESTIONS
# =========================================================

def save_generated_questions(
    db: Session,
    session_id,
    questions: list[dict[str, Any]],
) -> list[Question]:
    """
    Save exactly 5 MAIN questions.

    Main questions always have:

        parent_question_id = None

    Question order:

        1
        2
        3
        4
        5
    """

    # =====================================================
    # VALIDATE INPUT
    # =====================================================

    if not questions:

        raise ValueError(
            "No questions were provided for saving."
        )

    if len(questions) != QUESTION_COUNT:

        raise ValueError(
            f"Exactly {QUESTION_COUNT} questions are required."
        )

    # =====================================================
    # CHECK EXISTING MAIN QUESTIONS
    # =====================================================

    existing_main_questions = (
        db.query(Question)
        .filter(
            Question.session_id == session_id,

            # IMPORTANT:
            # Follow-up questions are excluded.
            Question.parent_question_id.is_(None),
        )
        .order_by(
            Question.question_order.asc()
        )
        .all()
    )

    # -----------------------------------------------------
    # Exactly 5 main questions already exist
    # -----------------------------------------------------

    if existing_main_questions:

        if len(existing_main_questions) != QUESTION_COUNT:

            raise ValueError(
                "Session contains an incomplete set of "
                f"main questions. Expected "
                f"{QUESTION_COUNT}, found "
                f"{len(existing_main_questions)}."
            )

        # -------------------------------------------------
        # Validate main question ordering
        # -------------------------------------------------

        expected_orders = list(
            range(
                1,
                QUESTION_COUNT + 1,
            )
        )

        actual_orders = [
            question.question_order
            for question in existing_main_questions
        ]

        if actual_orders != expected_orders:

            raise ValueError(
                "Existing main questions have invalid "
                "question ordering."
            )

        print()
        print("=" * 70)
        print("MAIN QUESTIONS ALREADY EXIST")
        print("=" * 70)

        for question in existing_main_questions:

            print(
                f"{question.question_order}. "
                f"[{question.type}] "
                f"{question.question}"
            )

        print("=" * 70)

        return existing_main_questions

    # =====================================================
    # CREATE MAIN QUESTIONS
    # =====================================================

    saved_questions: list[
        Question
    ] = []

    for index, item in enumerate(
        questions,
        start=1,
    ):

        question = Question(
            question=item["question"],

            category=item["category"],

            difficulty=item["difficulty"],

            type=item["type"],

            session_id=session_id,

            question_order=index,

            # IMPORTANT:
            # These are MAIN questions.
            parent_question_id=None,
        )

        db.add(
            question
        )

        saved_questions.append(
            question
        )

    # =====================================================
    # FLUSH
    # =====================================================

    db.flush()

    # =====================================================
    # LOG
    # =====================================================

    print()
    print("=" * 70)
    print("AI MAIN QUESTIONS SAVED")
    print("=" * 70)

    for question in saved_questions:

        print(
            f"{question.question_order}. "
            f"[{question.type}] "
            f"{question.question}"
        )

    print("=" * 70)

    return saved_questions


# =========================================================
# GENERATE + SAVE QUESTIONS
# =========================================================

def generate_and_save_questions(
    db: Session,
    session_id,
    interview_title: str,
    interview_description: str | None,
    difficulty: str,
    knowledge_expectation: str,
    construct_from_answers: bool,
    extra_config: dict | None = None,
) -> list[Question]:
    """
    Generate and save exactly 5 MAIN questions.

    This function does NOT commit.

    The caller owns the transaction.
    """

    # =====================================================
    # CHECK EXISTING MAIN QUESTIONS
    # =====================================================

    existing_main_questions = (
        db.query(Question)
        .filter(
            Question.session_id == session_id,
            Question.parent_question_id.is_(None),
        )
        .order_by(
            Question.question_order.asc()
        )
        .all()
    )

    # -----------------------------------------------------
    # Reuse existing complete question set
    # -----------------------------------------------------

    if existing_main_questions:

        if len(existing_main_questions) != QUESTION_COUNT:

            raise ValueError(
                "Session already contains "
                f"{len(existing_main_questions)} main questions. "
                f"Expected exactly {QUESTION_COUNT}."
            )

        print()
        print(
            "Complete main question set already exists."
        )

        return existing_main_questions

    # =====================================================
    # GENERATE USING AI
    # =====================================================

    generated_questions = generate_questions(
        interview_title=interview_title,

        interview_description=(
            interview_description
        ),

        difficulty=difficulty,

        knowledge_expectation=(
            knowledge_expectation
        ),

        construct_from_answers=(
            construct_from_answers
        ),

        extra_config=extra_config,
    )

    # =====================================================
    # SAVE TO DATABASE
    # =====================================================

    saved_questions = (
        save_generated_questions(
            db=db,
            session_id=session_id,
            questions=generated_questions,
        )
    )

    return saved_questions