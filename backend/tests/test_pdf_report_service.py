import re
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

from app.models.answer import Answer
from app.models.feedback import Feedback
from app.models.interview import Interview
from app.models.interview_configuration import InterviewConfiguration
from app.models.question import Question
from app.models.score import Score
from app.models.session import InterviewSession
from app.models.session_review import SessionReview
from app.models.user import User
from app.services.pdf_report_service import build_report_pdf_for_session


class Query:
    def __init__(self, result):
        self.result = result

    def filter(self, *_conditions):
        return self

    def order_by(self, *_columns):
        return self

    def first(self):
        if isinstance(self.result, list):
            return self.result[0] if self.result else None
        return self.result

    def all(self):
        if self.result is None:
            return []
        return self.result if isinstance(self.result, list) else [self.result]


def test_pdf_uses_persisted_report_and_session_data_without_report_data_column():
    session_id = "session-id"
    interview_id = "interview-id"
    candidate_id = "candidate-id"
    question_id = "question-id"
    answer_id = "answer-id"
    started_at = datetime(2026, 10, 21, 10, 0, tzinfo=timezone.utc)
    ended_at = datetime(2026, 10, 21, 10, 5, tzinfo=timezone.utc)
    session = SimpleNamespace(
        id=session_id,
        interview_id=interview_id,
        candidate_id=candidate_id,
        started_at=started_at,
        ended_at=ended_at,
        status="completed",
    )
    question = SimpleNamespace(
        id=question_id,
        parent_question_id=None,
        question_order=1,
        created_at=started_at,
        question="How did you improve database performance?",
    )
    answer_text = (
        "I used a targeted index to reduce lookup time, then checked the "
        "query plan to confirm the improvement."
    )
    answer = SimpleNamespace(
        id=answer_id,
        question_id=question_id,
        answer_text=answer_text,
        answered_at=started_at,
    )
    report = SimpleNamespace(
        overall_score=74.2,
        summary="The candidate completed the interview.",
    )
    records = {
        InterviewSession: session,
        Interview: SimpleNamespace(title="Backend Engineer"),
        User: SimpleNamespace(name="Candidate", email="candidate@example.test"),
        InterviewConfiguration: SimpleNamespace(
            extra_config={
                "job": {
                    "role": "Backend Engineer",
                    "company": "Example",
                    "location": "Remote",
                }
            }
        ),
        SessionReview: SimpleNamespace(
            decision="pending",
            decision_note=None,
            decided_by=None,
            decided_at=None,
            termination_reason=None,
            proctoring_events=[{"type": "tab_left", "at": started_at.isoformat()}],
            gaze_metrics=[
                {
                    "question": 1,
                    "answer_ms": 4000,
                    "on_screen_ms": 3600,
                    "side_ms": 200,
                    "down_ms": 200,
                    "phone_ms": 0,
                    "glances": 1,
                    "sweeps": 0,
                }
            ],
        ),
        Question: [question],
        Answer: [answer],
        Score: [
            SimpleNamespace(
                answer_id=answer_id,
                relevance=80,
                accuracy=70,
                technical_knowledge=75,
                completeness=72,
                communication=74,
                overall_score=74.2,
            )
        ],
        Feedback: [
            SimpleNamespace(
                answer_id=answer_id,
                feedback_text="The answer explains a measurable improvement.",
            )
        ],
    }
    db = SimpleNamespace(query=lambda model: Query(records.get(model)))

    with patch(
        "app.services.pdf_report_service.generate_interview_report",
        return_value=report,
    ):
        pdf, filename = build_report_pdf_for_session(db, session_id)

    page_count = len(re.findall(rb"/Type\s*/Page\b", pdf))
    assert filename == "interview_report_Candidate.pdf"
    assert pdf.startswith(b"%PDF")
    assert page_count >= 1
    assert b"%%EOF" in pdf[-16:]
