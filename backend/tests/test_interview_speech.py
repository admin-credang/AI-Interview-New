"""Interview speech: no Google key -> quiet 204, never a 503 traceback."""
import os
import unittest
from types import SimpleNamespace
from unittest import mock
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import interview_speech
from app.api.auth.dependencies import get_current_user
from app.database import get_db


class _Query:
    def __init__(self, result):
        self._result = result

    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return self._result


class _FakeDb:
    def __init__(self, interview, configuration):
        self._interview = interview
        self._configuration = configuration

    def query(self, model):
        if model is interview_speech.Interview:
            return _Query(self._interview)
        return _Query(self._configuration)


def _client(user):
    interview = SimpleNamespace(id=uuid4(), created_by=user.id)
    configuration = SimpleNamespace(extra_config={})
    app = FastAPI()
    app.include_router(interview_speech.router)
    app.dependency_overrides[get_db] = lambda: _FakeDb(interview, configuration)
    app.dependency_overrides[get_current_user] = lambda: user
    return TestClient(app), interview.id


class InterviewSpeechWithoutCredentials(unittest.TestCase):
    def setUp(self):
        self.user = SimpleNamespace(id=uuid4(), role="interviewer")
        patcher = mock.patch.object(interview_speech, "owns_interview", return_value=True)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_returns_204_and_does_not_call_google(self):
        env = {k: v for k, v in os.environ.items() if not k.startswith("GOOGLE_SERVICE_ACCOUNT")}
        with mock.patch.dict(os.environ, env, clear=True), \
             mock.patch.object(interview_speech, "get_google_tts_client") as tts:
            client, interview_id = _client(self.user)
            res = client.post(f"/interviews/{interview_id}/speech", json={"text": "Hello"})
        self.assertEqual(res.status_code, 204)
        self.assertEqual(res.headers.get("X-TTS-Disabled"), "1")
        tts.assert_not_called()

    def test_configured_key_still_uses_google(self):
        fake = mock.Mock()
        fake.synthesize_speech.return_value = SimpleNamespace(audio_content=b"mp3")
        with mock.patch.dict(os.environ, {"GOOGLE_SERVICE_ACCOUNT_JSON": "{}"}), \
             mock.patch.object(interview_speech, "get_google_tts_client", return_value=fake):
            client, interview_id = _client(self.user)
            res = client.post(f"/interviews/{interview_id}/speech", json={"text": "Hello"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.content, b"mp3")


if __name__ == "__main__":
    unittest.main()
