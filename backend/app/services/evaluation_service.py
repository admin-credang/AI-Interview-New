from __future__ import annotations

import json
import os
import re
from typing import Any

from dotenv import load_dotenv
from openai import OpenAI


# =========================================================
# ENVIRONMENT
# =========================================================

load_dotenv()

api_key = os.getenv("OPENAI_API_KEY")

if not api_key:
    raise RuntimeError(
        "OPENAI_API_KEY is not configured."
    )

client = OpenAI(
    api_key=api_key
)


# =========================================================
# CONSTANTS
# =========================================================

ALLOWED_QUESTION_TYPES = {
    "technical",
    "behavioral",
    "situational",
}

SCORE_FIELDS = (
    "relevance",
    "accuracy",
    "technical_knowledge",
    "completeness",
    "communication",
)

REQUIRED_FIELDS = (
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


# =========================================================
# SKIP / UNKNOWN ANSWERS
# =========================================================
#
# These are valid candidate answers.
#
# IMPORTANT:
# They must NOT trigger a follow-up question.
#
# Example:
# "I don't know"
# "not sure"
# "skip"
# "I can't answer"
#
# These answers will still be evaluated and saved.
# Then the interview should move to the next main question.
# =========================================================

SKIP_ANSWER_PHRASES = {
    "i don't know",
    "i dont know",
    "i do not know",

    "i don't know the answer",
    "i dont know the answer",
    "i do not know the answer",

    "not sure",
    "i am not sure",
    "i'm not sure",
    "im not sure",

    "skip",

    "i can't answer",
    "i cant answer",
    "i cannot answer",

    "no idea",
    "i have no idea",

    "i don't have an answer",
    "i dont have an answer",
    "i do not have an answer",

    "i don't know this",
    "i dont know this",
    "i do not know this",

    "i'm unsure",
    "im unsure",
    "i am unsure",
}


# =========================================================
# NORMALIZE ANSWER FOR SKIP DETECTION
# =========================================================

def normalize_answer_for_skip_check(
    answer: str | None,
) -> str:

    if answer is None:
        return ""

    normalized = " ".join(
        str(answer)
        .strip()
        .lower()
        .split()
    )

    # Remove common ending punctuation.
    normalized = normalized.rstrip(
        ".!?,;:"
    )

    return normalized


# =========================================================
# CHECK SKIP / UNKNOWN ANSWER
# =========================================================

def is_skip_answer(
    answer: str | None,
) -> bool:
    """
    Returns True when candidate explicitly says
    they do not know / cannot answer / want to skip.

    These are VALID answers.

    They should:
        - be evaluated
        - be saved
        - NOT receive a follow-up
        - move to the next main question
    """

    normalized = normalize_answer_for_skip_check(
        answer
    )

    if not normalized:
        return False

    return normalized in SKIP_ANSWER_PHRASES


# =========================================================
# SAFE BOOLEAN PARSER
# =========================================================

def normalize_bool(value: Any) -> bool:
    """
    Convert common boolean representations into bool.
    """

    if isinstance(value, bool):
        return value

    if isinstance(value, str):

        normalized = value.strip().lower()

        if normalized in {
            "true",
            "1",
            "yes",
            "y",
        }:
            return True

        if normalized in {
            "false",
            "0",
            "no",
            "n",
        }:
            return False

    if isinstance(value, int) and not isinstance(value, bool):

        if value == 1:
            return True

        if value == 0:
            return False

    raise ValueError(
        "follow_up_required must be a boolean value."
    )


# =========================================================
# NORMALIZE QUESTION TYPE
# =========================================================

def normalize_question_type(
    question_type: str | None,
) -> str:

    value = (
        str(question_type or "technical")
        .strip()
        .lower()
    )

    if value not in ALLOWED_QUESTION_TYPES:
        return "technical"

    return value


# =========================================================
# NORMALIZE TEXT
# =========================================================

def normalize_text(value: Any) -> str:

    if value is None:
        return ""

    return str(value).strip()


# =========================================================
# CLEAN JSON OUTPUT
# =========================================================

def clean_json_output(output: str) -> str:
    """
    Remove accidental markdown fences and surrounding text.
    """

    output = (output or "").strip()

    if not output:
        return ""

    # -----------------------------------------------------
    # Remove markdown code fences
    # -----------------------------------------------------

    if output.startswith("```"):

        output = re.sub(
            r"^```(?:json)?\s*",
            "",
            output,
            flags=re.IGNORECASE,
        )

        output = re.sub(
            r"\s*```$",
            "",
            output,
        )

        output = output.strip()

    # -----------------------------------------------------
    # If model returned text before JSON,
    # extract the first JSON object.
    # -----------------------------------------------------

    if not output.startswith("{"):

        start = output.find("{")
        end = output.rfind("}")

        if start != -1 and end != -1 and end > start:

            output = output[
                start : end + 1
            ]

    return output.strip()


# =========================================================
# FOLLOW-UP QUESTION VALIDATION
# =========================================================

def validate_follow_up_question(
    follow_up_question: Any,
) -> str:

    if not isinstance(
        follow_up_question,
        str,
    ):
        raise ValueError(
            "follow_up_question must be a string "
            "when follow_up_required is true."
        )

    question = follow_up_question.strip()

    if not question:

        raise ValueError(
            "Follow-up question cannot be empty."
        )

    # -----------------------------------------------------
    # Question mark validation
    # -----------------------------------------------------

    if question.count("?") > 1:

        raise ValueError(
            "Follow-up question must contain only "
            "one question."
        )

    # -----------------------------------------------------
    # Prevent multiple numbered questions
    # -----------------------------------------------------

    multiple_question_patterns = (
        r"^\s*1[\.\)]\s+",
        r"^\s*2[\.\)]\s+",
        r"\b1[\.\)]\s+",
        r"\b2[\.\)]\s+",
        r"\band\s+also\b",
        r"\balso\s+tell\s+me\b",
        r"\badditionally\s+explain\b",
        r"\bas\s+well\s+as\b",
    )

    for pattern in multiple_question_patterns:

        if re.search(
            pattern,
            question,
            flags=re.IGNORECASE,
        ):

            raise ValueError(
                "Follow-up question must target "
                "one specific point."
            )

    # -----------------------------------------------------
    # Prevent obvious multi-part wording
    # -----------------------------------------------------

    multi_part_patterns = (
        r"\bwhat\s+and\s+why\b",
        r"\bhow\s+and\s+why\b",
        r"\bwhat\s+and\s+how\b",
        r"\bexplain\s+.*\s+and\s+.*\b",
    )

    for pattern in multi_part_patterns:

        if re.search(
            pattern,
            question,
            flags=re.IGNORECASE,
        ):

            raise ValueError(
                "Follow-up question must target "
                "one specific point."
            )

    return question


# =========================================================
# EVALUATION FOCUS
# =========================================================

def get_evaluation_focus(
    question_type: str,
) -> str:

    if question_type == "behavioral":

        return """
This is a BEHAVIORAL interview question.

Focus primarily on:

- communication
- ownership
- teamwork
- leadership when relevant
- clarity
- reasoning
- real-world examples
- quality of explanation

Do not require technical implementation details
unless the question explicitly asks for them.

Technical knowledge should not be heavily penalized
when the question is not technical.
"""

    if question_type == "situational":

        return """
This is a SITUATIONAL interview question.

Focus primarily on:

- reasoning
- decision making
- problem solving
- practical judgment
- communication
- handling the given situation

Evaluate technical knowledge only when the question
actually requires technical knowledge.

Do not demand technical implementation details
when the scenario does not require them.
"""

    return """
This is a TECHNICAL interview question.

Focus primarily on:

- technical correctness
- accuracy
- technical depth
- problem solving
- completeness
- communication

Technical correctness and understanding are important.
Missing critical technical concepts should affect
accuracy, technical knowledge, and completeness.
"""


# =========================================================
# VALIDATE SCORES
# =========================================================

def validate_scores(
    evaluation: dict[str, Any],
) -> list[float]:

    criteria_scores: list[float] = []

    for field in SCORE_FIELDS:

        value = evaluation.get(field)

        # bool is a subclass of int in Python.
        if isinstance(value, bool):

            raise ValueError(
                f"{field} must be a number."
            )

        if not isinstance(
            value,
            (int, float),
        ):

            raise ValueError(
                f"{field} must be a number."
            )

        numeric_value = float(value)

        if (
            numeric_value < 0
            or numeric_value > 100
        ):

            raise ValueError(
                f"{field} must be between 0 and 100."
            )

        numeric_value = round(
            numeric_value,
            2,
        )

        evaluation[field] = numeric_value

        criteria_scores.append(
            numeric_value
        )

    return criteria_scores


# =========================================================
# VALIDATE FEEDBACK
# =========================================================

def validate_feedback(
    value: Any,
) -> str:

    if not isinstance(value, str):

        raise ValueError(
            "feedback_text must be a string."
        )

    feedback = value.strip()

    if not feedback:

        raise ValueError(
            "feedback_text cannot be empty."
        )

    # -----------------------------------------------------
    # Keep feedback concise.
    # We do not reject slightly longer output because
    # sentence counting can be unreliable.
    # -----------------------------------------------------

    sentences = re.findall(
        r"[^.!?]+[.!?]+",
        feedback,
    )

    if len(sentences) > 3:

        raise ValueError(
            "feedback_text must contain at most "
            "3 sentences."
        )

    return feedback


# =========================================================
# VALIDATE FOLLOW-UP DECISION
# =========================================================

def validate_follow_up_decision(
    evaluation: dict[str, Any],
) -> tuple[bool, str | None]:

    follow_up_required = normalize_bool(
        evaluation.get(
            "follow_up_required"
        )
    )

    raw_question = evaluation.get(
        "follow_up_question"
    )

    # -----------------------------------------------------
    # NO FOLLOW-UP
    # -----------------------------------------------------

    if not follow_up_required:

        return (
            False,
            None,
        )

    # -----------------------------------------------------
    # FOLLOW-UP REQUIRED
    # -----------------------------------------------------

    follow_up_question = (
        validate_follow_up_question(
            raw_question
        )
    )

    return (
        True,
        follow_up_question,
    )


# =========================================================
# EVALUATE CANDIDATE ANSWER
# =========================================================

def evaluate_answer(
    question: str,
    answer: str,
    difficulty: str,
    knowledge_expectation: str,
    question_type: str | None = None,
    category: str | None = None,
) -> dict[str, Any]:

    # =====================================================
    # NORMALIZE INPUT
    # =====================================================

    normalized_question = normalize_text(
        question
    )

    normalized_answer = normalize_text(
        answer
    )

    normalized_type = normalize_question_type(
        question_type
    )

    normalized_category = (
        normalize_text(category).lower()
        or "general"
    )

    normalized_difficulty = (
        normalize_text(difficulty).lower()
        or "medium"
    )

    normalized_knowledge_expectation = (
        normalize_text(
            knowledge_expectation
        ).lower()
        or "intermediate"
    )

    if not normalized_question:

        raise ValueError(
            "Interview question cannot be empty."
        )

    if not normalized_answer:

        raise ValueError(
            "Candidate answer cannot be empty."
        )

    # =====================================================
    # DETECT SKIP / UNKNOWN ANSWER
    # =====================================================

    candidate_does_not_know = is_skip_answer(
        normalized_answer
    )

    evaluation_focus = get_evaluation_focus(
        normalized_type
    )

    # =====================================================
    # PROMPT
    # =====================================================

    prompt = f"""
You are an expert AI interviewer evaluating exactly ONE
candidate answer.

Your responsibilities are:

1. Evaluate the candidate's answer fairly.
2. Decide whether a meaningful follow-up question is
   genuinely necessary.

A follow-up is an EXCEPTION, NOT the default.

The candidate should move to the next main question
whenever the answer is sufficiently adequate.

Do NOT create a follow-up merely because more detail
could theoretically be added.

=========================================================
INTERVIEW QUESTION
=========================================================

{normalized_question}

=========================================================
QUESTION INFORMATION
=========================================================

Question Type:
{normalized_type}

Question Category:
{normalized_category}

Interview Difficulty:
{normalized_difficulty}

Knowledge Expectation:
{normalized_knowledge_expectation}

=========================================================
CANDIDATE ANSWER
=========================================================

{normalized_answer}

=========================================================
SPECIAL ANSWER RULE
=========================================================

The candidate's answer has been checked for explicit
"I don't know / cannot answer / skip" style responses.

Candidate skip/unknown detected by backend:
{candidate_does_not_know}

IMPORTANT:

If the candidate explicitly says that they do not know
the answer, are not sure, cannot answer, have no idea,
or want to skip:

- Treat the response as a VALID submitted answer.
- Evaluate it as an answer showing lack of knowledge
  or lack of confidence where appropriate.
- Do NOT ask a follow-up question.
- Set follow_up_required to false.
- Set follow_up_question to null.
- The interview should proceed to the next main question.

Examples include:

"I don't know"
"I don't know the answer"
"I am not sure"
"Not sure"
"Skip"
"I can't answer"
"I cannot answer"
"No idea"

Never try to rescue, coach, clarify, or probe a candidate
who explicitly says they do not know or want to skip.

=========================================================
EVALUATION FOCUS
=========================================================

{evaluation_focus}

=========================================================
SCORING
=========================================================

Evaluate these five criteria from 0 to 100:

1. relevance
2. accuracy
3. technical_knowledge
4. completeness
5. communication

General guidance:

0-20   = Very poor
21-40  = Poor
41-60  = Average
61-80  = Good
81-90  = Very good
91-100 = Excellent

The backend will calculate overall_score as the
arithmetic average of the five criteria.

Do NOT invent another scoring formula.

For an explicit "I don't know / skip" answer:

- Do not give an artificially high score.
- Score according to the actual submitted response.
- Do not create a follow-up.

=========================================================
FOLLOW-UP DECISION
=========================================================

DEFAULT:

follow_up_required = false

A follow-up should ONLY be requested when an important
unresolved issue prevents a fair evaluation of the
candidate's understanding.

A follow-up MAY be required when:

- A substantial part of the original question is missing.
- An important concept is misunderstood.
- A critical technical step is missing.
- The answer is genuinely ambiguous.
- A required part of the question is unanswered.
- The answer is too shallow for the stated knowledge
  expectation AND the missing depth prevents fair
  evaluation.
- One specific missing detail is necessary to determine
  whether the candidate actually understands the topic.

A follow-up MUST NOT be created for:

- grammar mistakes
- spelling mistakes
- wording differences
- minor omissions
- minor inaccuracies that do not change the meaning
- code formatting
- terminology differences that do not change meaning
- reasonably correct answers
- answers satisfying the expected knowledge level
- curiosity
- asking for unnecessary examples
- asking for extra depth when the answer is already adequate
- extending the interview unnecessarily
- explicit "I don't know" answers
- explicit "not sure" answers
- explicit "skip" answers
- explicit "I can't answer" answers
- explicit "I cannot answer" answers
- explicit "no idea" answers

=========================================================
IMPORTANT DECISION TEST
=========================================================

Before setting follow_up_required to true, ask:

"Can I fairly evaluate the candidate's answer without
asking another question?"

If YES:

follow_up_required = false
follow_up_question = null

If NO because an important unresolved gap remains:

follow_up_required = true

The follow-up must address the specific unresolved gap.

IMPORTANT:

If Candidate skip/unknown detected by backend is TRUE,
follow_up_required MUST ALWAYS be false.

=========================================================
FOLLOW-UP QUESTION RULES
=========================================================

If follow_up_required = true:

Generate EXACTLY ONE short follow-up question.

It MUST:

- target ONE specific missing or unclear point
- directly relate to the original question
- directly relate to the candidate's answer
- help evaluate the candidate
- not repeat the original question
- not introduce an unrelated topic
- not contain multiple requests
- not ask for two separate explanations
- not ask for unnecessary additional detail

It should normally be one concise sentence.

If follow_up_required = false:

follow_up_question MUST be null.

=========================================================
FEEDBACK
=========================================================

Write concise constructive feedback.

feedback_text must contain 1 to 3 sentences.

Describe the candidate's answer itself.

Do NOT mention:

- this prompt
- internal instructions
- hidden rules
- follow-up limits
- system behavior

=========================================================
OUTPUT
=========================================================

Return ONLY valid JSON.

Do NOT return markdown.

Do NOT return ```json.

Do NOT return explanations outside JSON.

Return exactly these fields:

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

    response = None

    try:

        # =================================================
        # OPENAI REQUEST
        # =================================================

        response = client.responses.create(
            model="gpt-4.1",
            input=prompt,
        )

        output = normalize_text(
            response.output_text
        )

        if not output:

            raise ValueError(
                "OpenAI returned an empty response."
            )

        print()
        print("=" * 70)
        print("OPENAI EVALUATION RESPONSE")
        print("=" * 70)
        print(output)
        print("=" * 70)
        print()

        # =================================================
        # CLEAN JSON
        # =================================================

        output = clean_json_output(
            output
        )

        if not output:

            raise ValueError(
                "OpenAI returned empty JSON output."
            )

        # =================================================
        # PARSE JSON
        # =================================================

        evaluation = json.loads(
            output
        )

        if not isinstance(
            evaluation,
            dict,
        ):

            raise ValueError(
                "AI evaluation must be a JSON object."
            )

        # =================================================
        # REQUIRED FIELDS
        # =================================================

        missing_fields = [
            field
            for field in REQUIRED_FIELDS
            if field not in evaluation
        ]

        if missing_fields:

            raise ValueError(
                "Missing evaluation fields: "
                + ", ".join(missing_fields)
            )

        # =================================================
        # SCORE VALIDATION
        # =================================================

        criteria_scores = validate_scores(
            evaluation
        )

        # =================================================
        # BACKEND-CALCULATED OVERALL SCORE
        # =================================================

        evaluation["overall_score"] = round(
            sum(criteria_scores)
            / len(criteria_scores),
            2,
        )

        # =================================================
        # FOLLOW-UP VALIDATION
        # =================================================

        # FIX 3: a badly worded AI follow-up must never crash the
        # whole evaluation. The backend writes its own follow-up
        # (generate_follow_up_question) when one is due.
        try:
            (
                follow_up_required,
                follow_up_question,
            ) = validate_follow_up_decision(
                evaluation
            )
        except ValueError as follow_up_error:
            print(
                "AI follow-up ignored: "
                f"{follow_up_error}"
            )
            follow_up_required = False
            follow_up_question = None

        # =================================================
        # ABSOLUTE BACKEND SAFETY
        # =================================================
        #
        # Even if OpenAI incorrectly returns:
        #
        # follow_up_required = true
        #
        # for an "I don't know" / "skip" answer,
        # backend will force it to false.
        #
        # This is important because the backend must be the
        # final authority for interview flow.
        # =================================================

        if candidate_does_not_know:

            follow_up_required = False
            follow_up_question = None

            print()
            print(
                "SKIP / UNKNOWN ANSWER DETECTED"
            )
            print(
                "Follow-up has been forcibly disabled."
            )
            print()

        evaluation["follow_up_required"] = (
            follow_up_required
        )

        evaluation["follow_up_question"] = (
            follow_up_question
        )

        # =================================================
        # VALIDATE FEEDBACK
        # =================================================

        feedback_text = validate_feedback(
            evaluation.get(
                "feedback_text"
            )
        )

        evaluation["feedback_text"] = (
            feedback_text
        )

        # =================================================
        # FINAL LOG
        # =================================================

        print()
        print("=" * 70)
        print("FINAL AI EVALUATION")
        print("=" * 70)

        print(
            f"Question Type       : "
            f"{normalized_type}"
        )

        print(
            f"Category            : "
            f"{normalized_category}"
        )

        print(
            f"Candidate Skip      : "
            f"{candidate_does_not_know}"
        )

        print(
            f"Relevance           : "
            f"{evaluation['relevance']}"
        )

        print(
            f"Accuracy            : "
            f"{evaluation['accuracy']}"
        )

        print(
            f"Technical Knowledge : "
            f"{evaluation['technical_knowledge']}"
        )

        print(
            f"Completeness        : "
            f"{evaluation['completeness']}"
        )

        print(
            f"Communication       : "
            f"{evaluation['communication']}"
        )

        print(
            f"Overall Score       : "
            f"{evaluation['overall_score']}"
        )

        print(
            f"Follow-up Required  : "
            f"{evaluation['follow_up_required']}"
        )

        print(
            f"Follow-up Question  : "
            f"{evaluation['follow_up_question']}"
        )

        print("=" * 70)
        print()

        return evaluation

    # =====================================================
    # JSON ERROR
    # =====================================================

    except json.JSONDecodeError as exc:

        print()
        print("=" * 70)
        print(
            "FAILED TO PARSE OPENAI EVALUATION JSON"
        )
        print("=" * 70)

        if response is not None:

            print("OpenAI output:")
            print(
                response.output_text
            )

        else:

            print(
                "No OpenAI response."
            )

        print(
            "JSON error:",
            str(exc),
        )

        print("=" * 70)
        print()

        raise ValueError(
            "AI evaluation returned invalid JSON."
        ) from exc

    # =====================================================
    # OTHER ERRORS
    # =====================================================

    except Exception as exc:

        print()
        print("=" * 70)
        print(
            "EVALUATION SERVICE ERROR"
        )
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
        print()

        raise


# =========================================================
# GENERATE FOLLOW-UP QUESTION (FORCED FOLLOW-UP SLOT)
# =========================================================

def generate_follow_up_question(
    question: str,
    answer: str,
    difficulty: str | None = None,
    knowledge_expectation: str | None = None,
) -> str | None:
    """
    Generate exactly ONE follow-up question based on the
    candidate's actual answer.

    The backend decides WHETHER a follow-up is asked
    (see answer_service.get_follow_up_slots).
    This function only decides WHAT the follow-up is.

    Returns None if a valid follow-up could not be generated.
    """

    normalized_question = normalize_text(question)
    normalized_answer = normalize_text(answer)

    if not normalized_question or not normalized_answer:
        return None

    prompt = f"""
You are an expert AI interviewer.

The candidate has just answered an interview question.
Ask exactly ONE short follow-up question that builds
directly on something specific the candidate said in
their answer (a claim, tool, decision or example they
mentioned) and probes it deeper.

Rules:
- Exactly ONE question, ending with a single question mark.
- Target ONE specific point from the answer.
- Do NOT repeat the original question.
- Do NOT use numbering, bullet points or multi-part wording.
- Difficulty: {normalize_text(difficulty) or "medium"}
- Expected level: {normalize_text(knowledge_expectation) or "intermediate"}

Original question:
{normalized_question}

Candidate answer:
{normalized_answer}

Return ONLY the follow-up question text. No quotes, no JSON.
"""

    for attempt in range(2):

        try:

            response = client.responses.create(
                model="gpt-4.1",
                input=prompt,
            )

            candidate = normalize_text(
                response.output_text
            ).strip().strip('"').strip()

            try:
                return validate_follow_up_question(
                    candidate
                )
            except ValueError as validation_error:
                # FIX 4: strict validation rejected a perfectly
                # usable question (for example one containing
                # "and"). Keep the first question only.
                print(
                    "FOLLOW-UP VALIDATION RELAXED: "
                    f"{validation_error}"
                )
                first = candidate.split("?")[0].strip()
                first = re.sub(
                    r"^\s*(?:\d+[\.\)]|[-*])\s*",
                    "",
                    first,
                )
                if 10 <= len(first) <= 300:
                    return first + "?"
                raise

        except Exception as exc:

            print(
                "FOLLOW-UP GENERATION FAILED "
                f"(attempt {attempt + 1}): {exc}"
            )

    return None