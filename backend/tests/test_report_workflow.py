import base64
import os
import re
import unittest
import zlib
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import Mock, patch
from uuid import uuid4

os.environ.setdefault("OPENAI_API_KEY", "unit-test-placeholder")
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg2://test:test@localhost/test",
)
os.environ.setdefault("DIALOGFLOW_PROJECT_ID", "unit-test-project")
os.environ.setdefault("DIALOGFLOW_LOCATION", "unit-test-location")
os.environ.setdefault("DIALOGFLOW_AGENT_ID", "unit-test-agent")
os.environ.setdefault("DIALOGFLOW_FLOW_ID", "unit-test-flow")

from fastapi import HTTPException

from app.api.reports import get_interview_report
from app.api import hiring as hiring_api
from app.models.session import InterviewSession
from app.services import report_service
from app.services import evaluation_service
from app.services.evaluation_service import (
    validate_scores,
    validate_supporting_evidence,
)
from app.services.pdf_report_service import (
    build_candidate_feedback,
    build_report_pdf,
)


def make_score(**overrides):
    values = {
        "relevance": 100,
        "accuracy": 80,
        "technical_knowledge": 60,
        "completeness": 40,
        "communication": 20,
        "overall_score": 60,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def pdf_page_count(pdf):
    return len(re.findall(rb"/Type\s*/Page\b", pdf))


def extract_pdf_text(pdf):
    streams = re.findall(rb"stream\r?\n(.*?)endstream", pdf, re.S)
    page_text = []
    for stream in streams:
        try:
            encoded = stream.strip()
            if encoded.endswith(b"~>"):
                encoded = encoded[:-2]
            page_text.append(zlib.decompress(base64.a85decode(encoded)))
        except (ValueError, zlib.error):
            continue
    return b"\n".join(page_text)


class ReportCalculationTests(unittest.TestCase):
    def test_report_contributions_match_the_reported_4_9_score(self):
        score = make_score(
            relevance=6,
            accuracy=5,
            technical_knowledge=6,
            completeness=3,
            communication=4.5,
        )
        competencies, overall = report_service.calculate_competencies(
            [score],
            [dict(item) for item in report_service.DEFAULT_RUBRIC],
        )

        self.assertEqual(
            [item["weighted_contribution"] for item in competencies],
            [1.2, 1.0, 1.2, 0.6, 0.9],
        )
        self.assertEqual(overall, 4.9)
        self.assertEqual(
            sum(item["weighted_contribution"] for item in competencies),
            overall,
        )

    def test_configured_weights_explain_question_and_report_score_difference(self):
        rubric = [
            {"criterion": "relevance", "name": "Relevance", "weight": 15},
            {"criterion": "accuracy", "name": "Accuracy", "weight": 25},
            {
                "criterion": "technical_knowledge",
                "name": "Technical knowledge",
                "weight": 30,
            },
            {"criterion": "completeness", "name": "Completeness", "weight": 15},
            {"criterion": "communication", "name": "Communication", "weight": 15},
        ]
        criteria = [
            (5, 0, 0, 0, 5),
            (0, 0, 0, 0, 0),
            (20, 20, 20, 20, 10),
            (5, 0, 0, 0, 5),
            (10, 0, 0, 0, 10),
        ]
        question_scores = [
            make_score(
                relevance=row[0],
                accuracy=row[1],
                technical_knowledge=row[2],
                completeness=row[3],
                communication=row[4],
                overall_score=sum(row) / len(row),
            )
            for row in criteria
        ]

        competencies, overall = report_service.calculate_competencies(
            question_scores,
            rubric,
        )

        self.assertEqual(
            [item["score"] for item in competencies],
            [8.0, 4.0, 4.0, 4.0, 6.0],
        )
        self.assertEqual(
            [item["weighted_contribution"] for item in competencies],
            [1.2, 1.0, 1.2, 0.6, 0.9],
        )
        self.assertEqual(overall, 4.9)
        self.assertEqual(
            [score.overall_score for score in question_scores],
            [2.0, 0.0, 18.0, 2.0, 4.0],
        )
        self.assertEqual(
            sum(score.overall_score for score in question_scores)
            / len(question_scores),
            5.2,
        )

    def test_evaluator_scores_are_validated_on_a_zero_to_100_scale(self):
        evaluation = {
            "relevance": 2,
            "accuracy": 0,
            "technical_knowledge": 18,
            "completeness": 2,
            "communication": 4,
        }

        scores = validate_scores(evaluation)

        self.assertEqual(scores, [2, 0, 18, 2, 4])
        self.assertEqual(round(sum(scores) / len(scores), 2), 5.2)
        with self.assertRaisesRegex(ValueError, "between 0 and 100"):
            validate_scores({**evaluation, "relevance": 101})

    def test_competency_ratings_follow_evaluator_score_bands(self):
        self.assertEqual(report_service.competency_rating(20), "Very poor")
        self.assertEqual(report_service.competency_rating(21), "Poor")
        self.assertEqual(report_service.competency_rating(60), "Average")
        self.assertEqual(report_service.competency_rating(61), "Good")
        self.assertEqual(report_service.competency_rating(90), "Very good")
        self.assertEqual(report_service.competency_rating(91), "Excellent")
        self.assertIsNone(report_service.competency_rating(None))

    def test_human_ai_disagreement_is_reported_without_changing_decision(self):
        self.assertTrue(
            report_service._recommendation_disagreement(
                "advance_to_next_round",
                "rejected",
            )
        )
        self.assertFalse(
            report_service._recommendation_disagreement(
                "advance_to_next_round",
                "selected",
            )
        )
        self.assertFalse(
            report_service._recommendation_disagreement(
                "insufficient_data",
                "rejected",
            )
        )

    def test_empty_ai_next_round_suggestions_use_scored_gaps_and_unanswered_items(self):
        basis = {
            "competency_gaps": [
                {"criterion": "technical_knowledge", "name": "Technical", "score": 20},
                {"criterion": "accuracy", "name": "Accuracy", "score": 10},
            ],
            "answer_evaluations": [
                {
                    "question": "How did you optimize the database query?",
                    "scores": {
                        "technical_knowledge": 20,
                        "accuracy": 10,
                    },
                }
            ],
            "unanswered_questions": [
                {
                    "question": "How would you validate the result?",
                    "is_follow_up": True,
                }
            ],
            "followups_already_asked": [
                "What trade-off did you consider?"
            ],
        }

        suggestions = report_service._fallback_next_round_questions(basis)

        self.assertEqual(len(suggestions), 3)
        self.assertIn("verify the factual or technical claims", suggestions[0])
        self.assertIn("implementation steps and trade-offs", suggestions[1])
        self.assertIn("How would you validate the result?", suggestions[2])
        self.assertNotIn("What trade-off did you consider?", suggestions)

    def test_weighted_competencies_sum_to_report_score(self):
        rubric = [
            {"criterion": "relevance", "name": "Relevance", "weight": 50},
            {"criterion": "accuracy", "name": "Accuracy", "weight": 25},
            {
                "criterion": "technical_knowledge",
                "name": "Technical",
                "weight": 10,
            },
            {
                "criterion": "completeness",
                "name": "Completeness",
                "weight": 10,
            },
            {
                "criterion": "communication",
                "name": "Communication",
                "weight": 5,
            },
        ]

        competencies, overall = report_service.calculate_competencies(
            [make_score()],
            rubric,
        )

        self.assertEqual(overall, 81.0)
        self.assertEqual(
            sum(item["weighted_contribution"] for item in competencies),
            overall,
        )

    def test_incomplete_criteria_make_total_unavailable(self):
        score = make_score(communication=None)

        competencies, overall = report_service.calculate_competencies(
            [score],
            [dict(item) for item in report_service.DEFAULT_RUBRIC],
        )

        self.assertIsNone(overall)
        self.assertIsNone(competencies[-1]["weighted_contribution"])

    def test_invalid_rubric_weight_total_is_rejected(self):
        configuration = SimpleNamespace(
            extra_config={
                "report_rubric": [
                    {
                        **dict(item),
                        "weight": 19,
                    }
                    for item in report_service.DEFAULT_RUBRIC
                ]
            }
        )

        with self.assertRaisesRegex(ValueError, "sum to exactly 100"):
            report_service.normalize_report_rubric(configuration)

    def test_latest_scored_answer_is_selected_deterministically(self):
        earlier = SimpleNamespace(
            id="a",
            answered_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        later = SimpleNamespace(
            id="b",
            answered_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
        )
        tied_lower_id = SimpleNamespace(
            id="a",
            answered_at=later.answered_at,
        )
        selected = report_service.select_representative_answers(
            {"main": [(earlier, "earlier"), (later, "later"), (tied_lower_id, "tie")]}
        )

        self.assertEqual(selected["main"], (later, "later"))

    def test_question_sort_handles_missing_order_without_mixing_types(self):
        numbered = SimpleNamespace(
            question_order=2,
            parent_question_id=None,
            created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            id="numbered",
        )
        unnumbered = SimpleNamespace(
            question_order=None,
            parent_question_id=None,
            created_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
            id="unnumbered",
        )

        ordered = sorted(
            [unnumbered, numbered],
            key=report_service.question_order_sort_key,
        )

        self.assertEqual(ordered, [numbered, unnumbered])

    def test_candidate_feedback_keeps_missing_scores_unavailable(self):
        feedback = build_candidate_feedback(
            {
                "skills": {
                    "relevance": None,
                    "accuracy": None,
                },
                "qa": [],
            }
        )

        self.assertFalse(feedback["available"])
        self.assertEqual(feedback["strengths"], [])
        self.assertEqual(feedback["weaknesses"], [])

    def test_evidence_must_be_an_exact_answer_quote(self):
        answer = "I used a hash map to reduce lookup time."
        evidence = [
            {
                "criterion": "technical_knowledge",
                "quote": "a hash map",
                "explanation": "The answer names the data structure used.",
            }
        ]

        self.assertEqual(
            validate_supporting_evidence(evidence, answer),
            evidence,
        )
        with self.assertRaisesRegex(ValueError, "verbatim"):
            validate_supporting_evidence(
                [{**evidence[0], "quote": "used a dictionary"}],
                answer,
            )

    def test_regeneration_updates_existing_report_row(self):
        existing = SimpleNamespace(
            report_data={},
            overall_score=None,
            summary=None,
            report_url="existing-url",
        )
        db = Mock()
        db.query.return_value.filter.return_value.first.return_value = existing
        report_data = {
            "score": {"overall": 81.25},
            "questions": [{"selected_for_aggregate": True}],
        }

        with patch.object(
            report_service,
            "build_report_data",
            return_value=report_data,
        ):
            result = report_service.generate_interview_report(db, uuid4())

        self.assertIs(result, existing)
        self.assertEqual(result.overall_score, 81.25)
        self.assertEqual(result.report_data, report_data)
        self.assertEqual(result.report_url, "existing-url")
        db.flush.assert_called_once()

    def test_generation_creates_report_row_when_missing(self):
        db = Mock()
        db.query.return_value.filter.return_value.first.return_value = None
        report_data = {
            "score": {"overall": 81.25},
            "questions": [{"selected_for_aggregate": True}],
        }

        with patch.object(
            report_service,
            "build_report_data",
            return_value=report_data,
        ):
            result = report_service.generate_interview_report(db, uuid4())

        self.assertEqual(result.overall_score, 81.25)
        self.assertIsNone(result.report_url)
        self.assertEqual(result.report_data, report_data)
        db.add.assert_called_once_with(result)
        db.flush.assert_called_once()

    def test_monitoring_events_are_associated_only_to_known_questions(self):
        question_event = {
            "question_id": "question-1",
            "type": "looking_away",
            "at": "2026-01-01T10:00:00Z",
        }
        session_event = {"type": "tab_left", "at": "2026-01-01T10:01:00Z"}
        unknown_question_event = {
            "question_id": "question-2",
            "type": "phone_detected",
        }

        associated = report_service.associate_monitoring_events(
            [question_event, session_event, unknown_question_event],
            {"question-1"},
        )

        self.assertEqual(associated, {"question-1": [question_event]})

    def test_report_data_includes_human_review_and_session_events(self):
        session_id = uuid4()
        reviewer_id = uuid4()
        review = SimpleNamespace(
            decision="selected",
            decision_note="Proceed after reference checks.",
            decided_by=reviewer_id,
            decided_at=datetime(2026, 1, 3, tzinfo=timezone.utc),
            proctoring_events=[
                {
                    "type": "tab_left",
                    "at": "2026-01-03T10:00:00Z",
                }
            ],
            termination_reason=None,
        )
        values = [
            SimpleNamespace(
                id=session_id,
                interview_id=uuid4(),
                candidate_id=uuid4(),
                status="completed",
                started_at=None,
                ended_at=None,
            ),
            SimpleNamespace(
                id=uuid4(),
                title="Engineer interview",
                description=None,
                status="open",
            ),
            SimpleNamespace(id=uuid4(), name="Candidate", email="candidate@example.test"),
            None,
            review,
            SimpleNamespace(id=reviewer_id, name="Recruiter"),
            [],
            [],
        ]
        queries = []
        for value in values:
            query = Mock()
            query.filter.return_value = query
            query.order_by.return_value = query
            query.first.return_value = value
            query.all.return_value = value if isinstance(value, list) else []
            queries.append(query)

        db = Mock()
        db.query.side_effect = queries

        report_data = report_service.build_report_data(db, session_id)

        self.assertEqual(report_data["human_review"]["status"], "reviewed")
        self.assertEqual(report_data["human_review"]["decision"], "selected")
        self.assertEqual(report_data["human_review"]["reviewer"], "Recruiter")
        self.assertEqual(
            report_data["human_review"]["note"],
            "Proceed after reference checks.",
        )
        self.assertEqual(len(report_data["monitoring"]["events"]), 1)
        self.assertIn("not proof of misconduct", report_data["monitoring"]["event_note"])

    def test_next_round_questions_cannot_repeat_in_interview_followups(self):
        response = Mock(
            output_text=(
                '{"recommendation":"consider","rationale":"Evidence-based.",'
                '"next_round_questions":["Can you describe the trade-off?"]}'
            )
        )
        basis = {
            "followups_already_asked": [
                "Can you describe the trade-off?"
            ]
        }

        with patch.object(
            evaluation_service.client.responses,
            "create",
            return_value=response,
        ):
            with self.assertRaisesRegex(ValueError, "differ from"):
                evaluation_service.generate_report_recommendation(basis)


class ReportAuthorizationTests(unittest.TestCase):
    def test_candidate_cannot_access_report(self):
        session = SimpleNamespace(interview_id=uuid4())
        db = Mock()
        db.query.return_value.filter.return_value.first.return_value = session

        with self.assertRaises(HTTPException) as error:
            get_interview_report(
                uuid4(),
                db=db,
                current_user=SimpleNamespace(role="candidate", id=uuid4()),
            )

        self.assertEqual(error.exception.status_code, 403)
        self.assertEqual(db.query.call_args.args[0], InterviewSession)

    def test_reportlab_generates_a_pdf_with_missing_values_allowed(self):
        canonical = {
            "score": {
                "overall": None,
                "formula": "Weighted competency total.",
                "competencies": [
                    {
                        "criterion": "communication",
                        "name": "Communication",
                        "weight": 20,
                        "score": None,
                        "weighted_contribution": None,
                    }
                ],
            },
            "recommendation": {
                "recommendation": None,
                "rationale": "Insufficient scored answers.",
                "next_round_questions": [],
            },
            "strengths": [],
            "concerns": [],
            "monitoring": {
                "events": [],
                "event_note": "Events are observations, not proof.",
            },
            "human_review": {
                "status": "pending",
                "decision": "pending",
                "reviewer": None,
                "decided_at": None,
                "note": None,
            },
            "disclaimer": "AI supports, but does not replace, human review.",
        }
        data = {
            "candidate_name": "Candidate",
            "candidate_email": "candidate@example.test",
            "interview_title": "Interview",
            "role": "Engineer",
            "company": "Example",
            "location": "Remote",
            "status": "completed",
            "started_at": "-",
            "duration": "-",
            "overall_score": None,
            "summary": "Score unavailable.",
            "skills": {},
            "competencies": [],
            "qa": [
                {
                    "question": "Describe a trade-off.",
                    "is_follow_up": False,
                    "overall": None,
                    "answer": None,
                    "feedback": None,
                    "scores": {
                        "relevance": None,
                        "accuracy": None,
                        "technical_knowledge": None,
                        "completeness": None,
                        "communication": None,
                    },
                    "evidence": [],
                    "risk_observations": [],
                }
            ],
            "events": [],
            "terminated_reason": None,
            "decision": "pending",
            "canonical": canonical,
        }

        pdf = build_report_pdf(data)
        extracted = extract_pdf_text(pdf)

        self.assertTrue(pdf.startswith(b"%PDF"))
        self.assertLessEqual(pdf_page_count(pdf), 2)
        self.assertIn(b"Competency scores unavailable", extracted)
        self.assertIn(b"No answered questions are available", extracted)
        self.assertIn(b"contributions: Unavailable", extracted)

    def test_pdf_includes_answer_evidence_review_and_timestamped_signals(self):
        answer = (
            "The candidate described a real indexed-lookup recovery path. "
            + ("They verified the query plan and added a targeted index. " * 120)
            + "Long response ending marker."
        )
        event = {
            "type": "looking_away",
            "at": "2026-10-12T10:15:00Z",
            "question_id": "question-1",
        }
        repeated_events = [
            {**event, "at": f"2026-10-12T10:{minute:02d}:00Z"}
            for minute in range(15, 27)
        ] + [{"type": "eyes_closed", "at": "2026-10-12T10:27:00Z"}]
        canonical = {
            "score": {
                "overall": 4.9,
                "formula": "Weighted competency total.",
                "competencies": [],
            },
            "recommendation": {
                "recommendation": "advance_to_next_round",
                "rationale": "The answer provided a concrete technical example.",
                "basis": "Scored answer and quoted evidence.",
                "next_round_questions": [
                    "How would you verify the index's effect under write load?"
                ],
                "confidence": None,
            },
            "strengths": [],
            "concerns": [],
            "communication": {
                "note": "Text-based AI assessment; no audio measurements.",
            },
            "monitoring": {
                "events": repeated_events,
                "event_note": "Events are observations, not proof of misconduct.",
            },
            "human_review": {
                "status": "reviewed",
                "decision": "rejected",
                "reviewer": "Recruiter",
                "decided_at": "2026-10-12T12:00:00Z",
                "note": None,
                "ai_decision_disagreement": True,
            },
            "disclaimer": "AI supports and does not replace human review.",
        }
        evidence_excerpt = "real indexed-lookup recovery path"
        data = {
            "candidate_name": "Candidate",
            "candidate_email": "candidate@example.test",
            "interview_title": "Engineer interview",
            "role": "Engineer",
            "company": "Example",
            "location": "Remote",
            "status": "completed",
            "interview_date": "12 Oct 2026",
            "started_at": "2026-10-12T10:00:00Z",
            "duration": "15 min 0 sec",
            "overall_score": 4.9,
            "summary": "Score derived from weighted competencies.",
            "skills": {},
            "competencies": [],
            "qa": [
                {
                    "question_id": "question-1",
                    "question": "How did you improve database lookup performance?",
                    "is_follow_up": False,
                    "overall": 81,
                    "answer": answer,
                    "feedback": "The response gives a concrete optimization.",
                    "scores": {
                        "relevance": 80,
                        "accuracy": 80,
                        "technical_knowledge": 90,
                        "completeness": 75,
                        "communication": 80,
                    },
                    "evidence": [
                        {
                            "criterion": "technical_knowledge",
                            "quote": evidence_excerpt,
                            "explanation": "It identifies a concrete recovery action.",
                        }
                    ],
                    "risk_observations": [event],
                },
                {
                    "question_id": "question-2",
                    "question": "What would you measure next?",
                    "is_follow_up": True,
                    "overall": None,
                    "answer": None,
                    "feedback": None,
                    "scores": {},
                    "evidence": [],
                    "risk_observations": [],
                },
                {
                    "question_id": "question-3",
                    "question": "What result would confirm success?",
                    "is_follow_up": True,
                    "overall": None,
                    "answer": None,
                    "feedback": None,
                    "scores": {},
                    "evidence": [],
                    "risk_observations": [],
                },
            ],
            "events": repeated_events,
            "terminated_reason": None,
            "decision": "rejected",
            "canonical": canonical,
        }

        pdf = build_report_pdf(data)
        extracted = extract_pdf_text(pdf)

        self.assertTrue(pdf.startswith(b"%PDF"))
        self.assertLessEqual(pdf_page_count(pdf), 2)
        self.assertIn(evidence_excerpt.encode(), extracted)
        self.assertNotIn(b"Long response ending marker", extracted)
        self.assertTrue(data["qa"][0]["answer"].endswith("Long response ending marker."))
        self.assertIn(b"unanswered", extracted)
        self.assertIn(b"What result would confirm success?", extracted)
        self.assertIn(b"No reviewer note recorded", extracted)
        self.assertIn(b"AI and human decisions differ", extracted)
        self.assertIn(b"Looking away from the screen", extracted)
        self.assertIn(b"12 Oct 2026, 10:26 UTC", extracted)
        self.assertIn(b"How would you verify the index", extracted)
        self.assertIn(b"second-screen activity", extracted)
        self.assertIn(b"Not available", extracted)
        self.assertIn(b"not replace human review", extracted)
        self.assertNotIn(b"Question-linked monitoring signal", extracted)

    def test_pdf_endpoint_uses_session_id_and_returns_pdf_headers(self):
        session_id = uuid4()
        session = SimpleNamespace(id=session_id)
        user = SimpleNamespace(role="interviewer")
        db = Mock()

        with (
            patch.object(hiring_api, "_require_recruiter") as require,
            patch.object(
                hiring_api,
                "_session_for_recruiter",
                return_value=(session, SimpleNamespace()),
            ) as get_session,
            patch.object(
                hiring_api,
                "generate_interview_report",
                return_value=SimpleNamespace(),
            ) as generate,
            patch.object(
                hiring_api,
                "build_report_pdf_for_session",
                return_value=(b"%PDF-1.4 test", "interview_report_test.pdf"),
            ) as build_pdf,
        ):
            response = hiring_api.download_candidate_report_pdf(
                session_id,
                db=db,
                current_user=user,
            )

        require.assert_called_once()
        get_session.assert_called_once_with(db, user, session_id)
        generate.assert_called_once_with(db=db, session_id=session_id)
        build_pdf.assert_called_once_with(db, session_id)
        self.assertEqual(response.media_type, "application/pdf")
        self.assertEqual(response.body, b"%PDF-1.4 test")
        self.assertIn(
            'filename="interview_report_test.pdf"',
            response.headers["content-disposition"],
        )

    def test_pdf_endpoint_rejects_non_recruiter_before_access(self):
        with self.assertRaises(HTTPException) as error:
            hiring_api.download_candidate_report_pdf(
                uuid4(),
                db=Mock(),
                current_user=SimpleNamespace(role="candidate"),
            )

        self.assertEqual(error.exception.status_code, 403)

    def test_interviewer_cannot_access_another_interviewers_report(self):
        owner_id = uuid4()
        session = SimpleNamespace(interview_id=uuid4())
        interview = SimpleNamespace(created_by=owner_id)
        db = Mock()
        db.query.side_effect = [
            Mock(filter=Mock(return_value=Mock(first=Mock(return_value=session)))),
            Mock(filter=Mock(return_value=Mock(first=Mock(return_value=interview)))),
        ]

        with self.assertRaises(HTTPException) as error:
            get_interview_report(
                uuid4(),
                db=db,
                current_user=SimpleNamespace(role="interviewer", id=uuid4()),
            )

        self.assertEqual(error.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
