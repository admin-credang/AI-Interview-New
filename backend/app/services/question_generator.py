from typing import Any
import os
import json

from dotenv import load_dotenv
from openai import OpenAI


load_dotenv()

client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY")
)


# =========================================================
# ALLOWED QUESTION TYPES
# =========================================================

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

    if question_type:
        normalized_type = question_type.strip().lower()

        if normalized_type in ALLOWED_QUESTION_TYPES:
            return normalized_type

    # If AI returns category as type, infer a valid type.
    category_value = (category or "").strip().lower()

    if category_value in {
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
    }:
        return "technical"

    if category_value in {
        "behavioral",
        "communication",
        "leadership",
        "teamwork",
        "collaboration",
    }:
        return "behavioral"

    return "situational"


# =========================================================
# GENERATE QUESTIONS
# =========================================================

def generate_questions(
    interview_title: str,
    interview_description: str | None,
    difficulty: str,
    knowledge_expectation: str,
    construct_from_answers: bool,
    extra_config: dict | None = None,
) -> list[dict[str, Any]]:

    prompt = f"""
You are an AI technical interviewer.

Generate exactly 5 interview questions based on the interview
details and configuration below.

Interview title:
{interview_title}

Interview description:
{interview_description or "Not provided"}

Difficulty:
{difficulty}

Knowledge expectation:
{knowledge_expectation}

Construct questions from candidate answers:
{construct_from_answers}

Additional configuration:
{extra_config or "None"}

Rules:

- Questions must be relevant to the interview.
- Questions must match the requested difficulty.
- Questions must match the requested knowledge expectation.
- Do not use a reusable question bank.
- Questions must be generated specifically for this interview.
- Return exactly 5 questions.
- Return ONLY valid JSON.
- Do not include markdown.
- Do not include explanations.

IMPORTANT:

The "category" describes the topic or skill being tested.

Examples of categories:
- technical
- problem_solving
- communication
- leadership
- python
- django
- database
- api
- machine_learning
- algorithms
- data_structures

The "type" MUST be exactly one of these values:

- technical
- behavioral
- situational

Do NOT use category names as the type.

For example:

[
  {{
    "question": "Explain how Django handles database migrations.",
    "category": "django",
    "difficulty": "{difficulty}",
    "type": "technical"
  }},
  {{
    "question": "Describe a time when you had to debug a complex Python program.",
    "category": "problem_solving",
    "difficulty": "{difficulty}",
    "type": "behavioral"
  }}
]

Return exactly 5 objects.

JSON format:

[
  {{
    "question": "Question text",
    "category": "technical",
    "difficulty": "{difficulty}",
    "type": "technical"
  }}
]
"""

    response = client.responses.create(
        model="gpt-4.1",
        input=prompt
    )

    questions = json.loads(response.output_text)

    if not isinstance(questions, list):
        raise ValueError(
            "OpenAI returned an invalid question format."
        )

    if len(questions) != 5:
        raise ValueError(
            f"Expected exactly 5 questions, received {len(questions)}."
        )

    normalized_questions = []

    for item in questions:

        category = str(
            item.get("category", "technical")
        ).strip().lower()

        question_type = normalize_question_type(
            item.get("type"),
            category,
        )

        normalized_questions.append(
            {
                "question": str(
                    item["question"]
                ).strip(),

                "category": category,

                "difficulty": str(
                    item.get(
                        "difficulty",
                        difficulty,
                    )
                ).strip().lower(),

                "type": question_type,
            }
        )

    return normalized_questions