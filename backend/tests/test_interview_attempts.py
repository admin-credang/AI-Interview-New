import unittest
import uuid
from unittest.mock import patch

from fastapi import BackgroundTasks, HTTPException
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.api.interviews import create_session
from app.api.hiring import InviteRequest, invite_candidates
from app.models.answer import Answer
from app.models.base import Base
from app.models.interview import Interview
from app.models.interview_configuration import InterviewConfiguration
from app.models.question import Question
from app.models.session import InterviewSession
from app.models.user import User
from app.schemas.session import SessionCreate


class InterviewAttemptTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")

        @event.listens_for(self.engine, "connect")
        def register_uuid_function(connection, _record):
            connection.create_function(
                "gen_random_uuid",
                0,
                lambda: uuid.uuid4().hex,
            )

        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()

        recruiter = User(
            id=uuid.uuid4(),
            name="Interviewer",
            email="interviewer@example.com",
            role="interviewer",
        )
        self.candidate = User(
            id=uuid.uuid4(),
            name="Candidate",
            email="candidate@example.com",
            role="candidate",
        )
        self.interview = Interview(
            id=uuid.uuid4(),
            title="Software Engineer",
            created_by=recruiter.id,
            duration=30,
            status="active",
        )
        self.configuration = InterviewConfiguration(
            id=uuid.uuid4(),
            interview_id=self.interview.id,
            construct_from_answers=True,
            difficulty="medium",
            knowledge_expectation="intermediate",
            extra_config={
                "invitations": {
                    "candidate@example.com": {
                        "email": "candidate@example.com",
                        "code": "INV-ABCD-EFGH",
                        "session_id": None,
                        "attempts": [
                            {
                                "email": "candidate@example.com",
                                "code": "INV-JKLM-NPQR",
                                "session_id": None,
                            }
                        ],
                    }
                }
            },
        )
        self.db.add_all(
            [recruiter, self.candidate, self.interview, self.configuration]
        )
        self.recruiter = recruiter
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def start_attempt(self, code):
        request = SessionCreate(
            interview_id=self.interview.id,
            candidate_id=self.candidate.id,
            invitation_code=code,
        )
        with (
            patch(
                "app.api.interviews.resume_text_for",
                return_value="",
            ),
            patch(
                "app.api.interviews.generate_questions",
                return_value=[
                    {
                        "question": "Describe a challenging project.",
                        "category": "behavioral",
                        "difficulty": "medium",
                        "type": "text",
                    }
                ],
            ),
            patch(
                "app.api.interviews.append_compulsory_questions"
            ),
        ):
            return create_session(
                self.interview.id,
                request,
                self.db,
                self.candidate,
            )

    def test_each_invitation_code_has_an_isolated_resumable_attempt(self):
        first = self.start_attempt("INV-JKLM-NPQR")
        first_question = (
            self.db.query(Question)
            .filter(Question.session_id == first.id)
            .one()
        )
        self.db.add(
            Answer(
                id=uuid.uuid4(),
                session_id=first.id,
                question_id=first_question.id,
                answer_text="An answer from the first attempt.",
            )
        )
        self.db.commit()

        resumed_first = self.start_attempt("INV-JKLM-NPQR")
        self.assertEqual(resumed_first.id, first.id)

        first.status = "completed"
        self.db.commit()

        with self.assertRaises(HTTPException):
            self.start_attempt("INV-JKLM-NPQR")

        second = self.start_attempt("INV-ABCD-EFGH")
        self.assertNotEqual(second.id, first.id)

        saved_answers = (
            self.db.query(Answer)
            .filter(Answer.session_id == first.id)
            .all()
        )
        self.assertEqual(len(saved_answers), 1)
        self.assertEqual(
            saved_answers[0].answer_text,
            "An answer from the first attempt.",
        )

        sessions = (
            self.db.query(InterviewSession)
            .filter(
                InterviewSession.interview_id == self.interview.id,
                InterviewSession.candidate_id == self.candidate.id,
            )
            .all()
        )
        self.assertEqual(len(sessions), 2)

    def test_invitation_code_cannot_be_used_by_another_candidate(self):
        other_candidate = User(
            id=uuid.uuid4(),
            name="Other Candidate",
            email="other@example.com",
            role="candidate",
        )
        self.db.add(other_candidate)
        self.db.commit()

        with self.assertRaisesRegex(Exception, "not invited"):
            request = SessionCreate(
                interview_id=self.interview.id,
                candidate_id=other_candidate.id,
                invitation_code="INV-ABCD-EFGH",
            )
            with patch(
                "app.api.interviews.generate_questions",
                return_value=[],
            ):
                create_session(
                    self.interview.id,
                    request,
                    self.db,
                    other_candidate,
                )

    def test_resending_invitation_rotates_code_and_preserves_old_attempts(self):
        body = InviteRequest(
            emails=["candidate@example.com"],
            send_email=False,
            role="Software Engineer",
        )
        with (
            patch(
                "app.api.hiring._configured_frontend_base_url",
                return_value="http://localhost:5173",
            ),
            patch(
                "app.api.hiring._interviewer",
                return_value={"name": "Interviewer", "email": "interviewer@example.com"},
            ),
            patch(
                "app.api.hiring._mail_identity",
                return_value={
                    "from_name": "Interviewer",
                    "reply_to": "interviewer@example.com",
                    "mailbox": None,
                },
            ),
            patch("app.api.hiring.features.is_on", return_value=False),
            patch(
                "app.api.hiring.build_invite_email",
                return_value=("Invitation", "Invitation body"),
            ),
        ):
            first_response = invite_candidates(
                self.interview.id,
                body,
                BackgroundTasks(),
                self.db,
                self.recruiter,
            )
            first_code = first_response["invitations"][0]["code"]

            second_response = invite_candidates(
                self.interview.id,
                body,
                BackgroundTasks(),
                self.db,
                self.recruiter,
            )
            second_code = second_response["invitations"][0]["code"]

        self.assertNotEqual(first_code, second_code)
        record = self.configuration.extra_config["invitations"][
            "candidate@example.com"
        ]
        attempt_codes = [attempt["code"] for attempt in record["attempts"]]
        self.assertIn("INV-JKLM-NPQR", attempt_codes)
        self.assertIn("INV-ABCD-EFGH", attempt_codes)
        self.assertIn(first_code, attempt_codes)
        self.assertEqual(record["code"], second_code)


if __name__ == "__main__":
    unittest.main()
