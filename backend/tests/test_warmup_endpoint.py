from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.interviews import WarmupReplyRequest, create_warmup_response
from app.models.session import InterviewSession


class Query:
    def __init__(self, result):
        self.result = result
        self.conditions = ()

    def filter(self, *conditions):
        self.conditions = conditions
        return self

    def first(self):
        return self.result


class Database:
    def __init__(self, session):
        self.session = session
        self.query_model = None
        self.query_result = None
        self.writes = []

    def query(self, model):
        self.query_model = model
        self.query_result = Query(self.session)
        return self.query_result

    def add(self, _record):
        self.writes.append("add")

    def commit(self):
        self.writes.append("commit")


def test_warmup_response_is_separate_and_not_persisted():
    interview_id = uuid4()
    session_id = uuid4()
    candidate_id = uuid4()
    db = Database(
        SimpleNamespace(
            id=session_id,
            interview_id=interview_id,
            candidate_id=candidate_id,
            status="in_progress",
        )
    )
    user = SimpleNamespace(id=candidate_id, role="candidate")

    with patch(
        "app.api.interviews.generate_warmup_response",
        return_value="I hope the rest of your day goes smoothly.",
    ) as generate:
        result = create_warmup_response(
            interview_id,
            WarmupReplyRequest(
                session_id=session_id,
                answer="My day has been busy.",
            ),
            db=db,
            current_user=user,
        )

    assert result == {"text": "I hope the rest of your day goes smoothly."}
    generate.assert_called_once_with("My day has been busy.")
    assert db.query_model is InterviewSession
    assert len(db.query_result.conditions) == 4
    assert db.writes == []


def test_warmup_rejects_non_candidate_users():
    with pytest.raises(HTTPException) as error:
        create_warmup_response(
            uuid4(),
            WarmupReplyRequest(session_id=uuid4(), answer="Hello"),
            db=Database(None),
            current_user=SimpleNamespace(id=uuid4(), role="interviewer"),
        )

    assert error.value.status_code == 403


def test_warmup_rejects_missing_active_sessions():
    with pytest.raises(HTTPException) as error:
        create_warmup_response(
            uuid4(),
            WarmupReplyRequest(session_id=uuid4(), answer="Hello"),
            db=Database(None),
            current_user=SimpleNamespace(id=uuid4(), role="candidate"),
        )

    assert error.value.status_code == 404
