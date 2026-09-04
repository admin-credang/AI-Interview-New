from typing import Any
import os
import json

from dotenv import load_dotenv
from openai import OpenAI


load_dotenv()

client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY")
)


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
- Questions are generated specifically for this interview.
- Return exactly 5 questions.
- Return ONLY valid JSON.
- Do not include markdown or explanations.

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

    return [
        {
            "question": item["question"],
            "category": item["category"],
            "difficulty": item["difficulty"],
            "type": item["type"],
        }
        for item in questions
    ]