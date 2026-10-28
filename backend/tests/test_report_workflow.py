import os
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import Mock, patch
from uuid import uuid4

os.environ["OPENAI_API_KEY"] = "unit-test-placeholder"
os.environ["DATABASE_URL"] = (
    "postgresql+psycopg2://test:test@localhost/test"
)
os.environ.setdefault("DIALOGFLOW_PROJECT_ID", "unit-test-project")
os.environ.setdefault("DIALOGFLOW_LOCATION", "unit-test-location")
os.environ.setdefault("DIALOGFLOW_AGENT_ID", "unit-test-agent")
os.environ.setdefault("DIALOGFLOW_FLOW_ID", "unit-test-flow")

import pytest
from fastapi import HTTPException

from app.api.reports import get_interview_report
from app.models.answer import Answer
from app.models.interview import Interview
from app.models.question import Question
from app.models.report import Report
from app.models.score import Score
from app.models.session import InterviewSession
from app.services import report_service
from app.services.pdf_report_service import build_candidate_feedback


class Query:
    def __init__(self, result):
        self.result = result
        self.filters = []
        self.orderings = []

    def filter(self, *conditions):
        self.filters.extend(conditions)
        return self

    def order_by(self, *columns):
        self.orderings.extend(columns)
        return self

    def all(self):
        if self.result is None:
            return []
        return self.result if isinstance(self.result, list) else [self.result]

    def first(self):
        if isinstance(self.result, list):
            return self.result[0] if self.result else None
        return self.result


class Database:
    def __init__(self, records):
        self.records = records
        self.queries = {}
        self.added = []
        self.flush_count = 0
        self.commit_count = 0

    def query(self, model):
        query = Query(self.records.get(model))
        self.queries.setdefault(model, []).append(query)
        return query

    def add(self, record):
        self.added.append(record)

    def flush(self):
        self.flush_count += 1

    def commit(self):
        self.commit_count += 1


def make_score(answer_id, overall_score):
    return SimpleNamespace(answer_id=answer_id, overall_score=overall_score)


def make_report_database(*, answers, questions, scores, existing_report=None):
    return Database(
        {
            Answer: answers,
            Question: questions,
            Score: scores,
            Report: existing_report,
        }
    )


def test_report_averages_latest_scored_answer_per_main_question():
    session_id = uuid4()
    main_one_id, follow_up_id, main_two_id = "main-1", "follow-up-1", "main-2"
    question_one_id, follow_up_question_id, question_two_id = (
        "question-1",
        "follow-up-question-1",
        "question-2",
    )
    first_answered_at = datetime(2026, 10, 21, 10, 0, tzinfo=timezone.utc)
    follow_up_answered_at = datetime(2026, 10, 21, 10, 2, tzinfo=timezone.utc)
    second_answered_at = datetime(2026, 10, 21, 10, 1, tzinfo=timezone.utc)
    questions = [
        SimpleNamespace(id=question_one_id, parent_question_id=None),
        SimpleNamespace(
            id=follow_up_question_id,
            parent_question_id=question_one_id,
        ),
        SimpleNamespace(id=question_two_id, parent_question_id=None),
    ]
    answers = [
        SimpleNamespace(
            id=main_one_id,
            question_id=question_one_id,
            answered_at=first_answered_at,
        ),
        SimpleNamespace(
            id=main_two_id,
            question_id=question_two_id,
            answered_at=second_answered_at,
        ),
        SimpleNamespace(
            id=follow_up_id,
            question_id=follow_up_question_id,
            answered_at=follow_up_answered_at,
        ),
    ]
    db = make_report_database(
        answers=answers,
        questions=questions,
        scores=[
            make_score(main_one_id, 100),
            make_score(follow_up_id, 80),
            make_score(main_two_id, 60),
        ],
    )

    report = report_service.generate_interview_report(db, session_id)

    assert report.overall_score == 70
    assert "70.00/100 across 2 main interview questions" in report.summary
    assert len(db.queries[Score][0].filters) == 1
    selected_answer_ids = db.queries[Score][0].filters[0].right.value
    assert set(selected_answer_ids) == {follow_up_id, main_two_id}
    assert db.added == [report]
    assert db.flush_count == 1
    assert db.commit_count == 0


@pytest.mark.parametrize(
    ("answers", "questions", "scores", "message"),
    [
        ([], [], [], "No answers found"),
        (
            [SimpleNamespace(id="answer", question_id="missing-question")],
            [],
            [],
            "No final answers found",
        ),
        (
            [SimpleNamespace(id="answer", question_id="question")],
            [SimpleNamespace(id="question", parent_question_id=None)],
            [],
            "No evaluation scores found",
        ),
        (
            [SimpleNamespace(id="answer", question_id="question")],
            [SimpleNamespace(id="question", parent_question_id=None)],
            [make_score("another-answer", 70)],
            "No final evaluation scores found",
        ),
    ],
)
def test_report_rejects_missing_answers_or_scores(answers, questions, scores, message):
    db = make_report_database(
        answers=answers,
        questions=questions,
        scores=scores,
    )

    with pytest.raises(ValueError, match=message):
        report_service.generate_interview_report(db, uuid4())

    assert db.flush_count == 0
    assert db.added == []


def test_report_regeneration_updates_existing_row_and_preserves_pdf_url():
    session_id = uuid4()
    question_id = "question"
    answer_id = "answer"
    existing = SimpleNamespace(
        overall_score=None,
        summary=None,
        report_url="existing-report.pdf",
    )
    db = make_report_database(
        answers=[
            SimpleNamespace(
                id=answer_id,
                question_id=question_id,
                answered_at=datetime(2026, 10, 21, tzinfo=timezone.utc),
            )
        ],
        questions=[
            SimpleNamespace(id=question_id, parent_question_id=None)
        ],
        scores=[make_score(answer_id, 81.25)],
        existing_report=existing,
    )

    result = report_service.generate_interview_report(db, session_id)

    assert result is existing
    assert result.overall_score == 81.25
    assert "81.25/100 across 1 main interview questions" in result.summary
    assert result.report_url == "existing-report.pdf"
    assert db.added == []
    assert db.flush_count == 1
    assert db.commit_count == 0


def test_candidate_feedback_is_unavailable_without_saved_competency_scores():
    feedback = build_candidate_feedback(
        {
            "skills": {
                "relevance": None,
                "accuracy": None,
                "technical_knowledge": None,
                "completeness": None,
                "communication": None,
            },
            "qa": [],
        }
    )

    assert feedback == {
        "available": False,
        "strengths": [],
        "weaknesses": [],
        "improvements": [],
        "answer_notes": [],
    }


def test_candidate_cannot_access_the_interviewer_report():
    session = SimpleNamespace(interview_id=uuid4())
    db = Database({InterviewSession: session})

    with pytest.raises(HTTPException) as error:
        get_interview_report(
            uuid4(),
            db=db,
            current_user=SimpleNamespace(role="candidate", id=uuid4()),
        )

    assert error.value.status_code == 403
    assert db.queries[InterviewSession]


def test_interviewer_can_request_report_and_generation_errors_are_client_errors():
    session_id = uuid4()
    user_id = uuid4()
    session = SimpleNamespace(interview_id=uuid4())
    interview = SimpleNamespace(created_by=user_id)
    db = Database({InterviewSession: session, Interview: interview})
    report = SimpleNamespace(
        id=uuid4(),
        session_id=session_id,
        overall_score=74.5,
        summary="Stored interview evaluation.",
        report_url=None,
        created_at=datetime(2026, 10, 21, tzinfo=timezone.utc),
    )

    with patch(
        "app.api.reports.generate_interview_report",
        return_value=report,
    ) as generate:
        result = get_interview_report(
            session_id,
            db=db,
            current_user=SimpleNamespace(role="interviewer", id=user_id),
        )

    assert result is report
    generate.assert_called_once_with(db=db, session_id=session_id)

    with patch(
        "app.api.reports.generate_interview_report",
        side_effect=ValueError("No answers found for this interview session."),
    ):
        with pytest.raises(HTTPException) as error:
            get_interview_report(
                session_id,
                db=db,
                current_user=SimpleNamespace(role="interviewer", id=user_id),
            )

    assert error.value.status_code == 400
    assert error.value.detail == "No answers found for this interview session."


def test_interviewer_cannot_access_another_interviewers_report():
    session_id = uuid4()
    session = SimpleNamespace(interview_id=uuid4())
    interview = SimpleNamespace(created_by=uuid4())
    db = Database({InterviewSession: session, Interview: interview})

    with patch("app.api.reports.generate_interview_report") as generate:
        with pytest.raises(HTTPException) as error:
            get_interview_report(
                session_id,
                db=db,
                current_user=SimpleNamespace(role="interviewer", id=uuid4()),
            )

    assert error.value.status_code == 403
    generate.assert_not_called()


def test_admin_can_access_another_interviewers_report():
    session_id = uuid4()
    session = SimpleNamespace(interview_id=uuid4())
    interview = SimpleNamespace(created_by=uuid4())
    db = Database({InterviewSession: session, Interview: interview})
    report = SimpleNamespace(id=uuid4())

    with patch(
        "app.api.reports.generate_interview_report",
        return_value=report,
    ) as generate:
        result = get_interview_report(
            session_id,
            db=db,
            current_user=SimpleNamespace(role="admin", id=uuid4()),
        )

    assert result is report
    generate.assert_called_once_with(db=db, session_id=session_id)
