from typing import Any
import os
import json

from dotenv import load_dotenv
from openai import OpenAI


load_dotenv()

api_key = os.getenv("OPENAI_API_KEY")

if not api_key:
    raise RuntimeError("OPENAI_API_KEY is not configured")

client = OpenAI(api_key=api_key)


def evaluate_answer(
    question: str,
    answer: str,
    difficulty: str,
    knowledge_expectation: str,
) -> dict[str, Any]:

    prompt = f"""
You are an expert AI technical interviewer.

Evaluate the candidate's answer to the interview question.

Question:
{question}

Candidate Answer:
{answer}

Interview Difficulty:
{difficulty}

Knowledge Expectation:
{knowledge_expectation}

Evaluate the answer using these five criteria:

1. Relevance
2. Accuracy
3. Technical Knowledge
4. Completeness
5. Communication

Give each score from 0 to 10.

Calculate the overall score as the average of the five scores.

Determine whether a follow-up question is required.

A follow-up should be required when:
- the answer is incomplete,
- the answer contains a technical misunderstanding,
- the answer is too shallow for the expected knowledge level,
- or additional clarification is useful.

If follow-up is not required, follow_up_question must be null.

Return ONLY valid JSON.
Do not use markdown.
Do not include ```json.
Do not include any explanation outside the JSON.

Return exactly this structure:

{{
    "relevance": 0,
    "accuracy": 0,
    "technical_knowledge": 0,
    "completeness": 0,
    "communication": 0,
    "overall_score": 0,
    "feedback_text": "Short constructive feedback",
    "follow_up_required": false,
    "follow_up_question": null
}}
"""

    try:
        response = client.responses.create(
            model="gpt-4.1",
            input=prompt
        )

        output = response.output_text.strip()

        if not output:
            raise ValueError("OpenAI returned an empty response")

        # Remove markdown code fences if GPT happens to return them
        if output.startswith("```"):
            output = output.replace("```json", "")
            output = output.replace("```", "")
            output = output.strip()

        evaluation = json.loads(output)

        required_fields = [
            "relevance",
            "accuracy",
            "technical_knowledge",
            "completeness",
            "communication",
            "overall_score",
            "feedback_text",
            "follow_up_required",
            "follow_up_question",
        ]

        for field in required_fields:
            if field not in evaluation:
                raise ValueError(
                    f"Missing evaluation field: {field}"
                )

        # Validate score values
        score_fields = [
            "relevance",
            "accuracy",
            "technical_knowledge",
            "completeness",
            "communication",
            "overall_score",
        ]

        for field in score_fields:
            value = evaluation[field]

            if not isinstance(value, (int, float)):
                raise ValueError(
                    f"{field} must be a number"
                )

            if value < 0 or value > 10:
                raise ValueError(
                    f"{field} must be between 0 and 10"
                )

        return evaluation

    except json.JSONDecodeError as e:
        print("❌ Failed to parse OpenAI evaluation JSON")
        print("OpenAI output:")
        print(response.output_text if "response" in locals() else "No response")
        print("JSON error:", str(e))

        raise ValueError(
            "AI evaluation returned invalid JSON"
        )

    except Exception as e:
        print("❌ Evaluation service error:")
        print(str(e))

        raise