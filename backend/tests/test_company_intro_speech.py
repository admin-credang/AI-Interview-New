import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from app.services.company_intro_service import (
    MAX_SPOKEN_INTRO_WORDS,
    summarize_company_intro,
)


class CompanyIntroSpeechTests(unittest.TestCase):
    def test_summarizes_long_introduction_and_keeps_interview_handoff(self):
        create = Mock(
            return_value=SimpleNamespace(
                output_text=(
                    "Northstar builds logistics software for regional "
                    "businesses. The Software Engineer role develops "
                    "reliable services and improves delivery planning."
                )
            )
        )
        client = SimpleNamespace(
            responses=SimpleNamespace(create=create)
        )
        long_intro = " ".join(
            [
                "Northstar builds logistics software and supports "
                "businesses with reliable operations."
            ]
            * 20
        )

        with patch(
            "app.services.company_intro_service._openai",
            return_value=client,
        ):
            result = summarize_company_intro(
                long_intro,
                "Software Engineer",
            )

        self.assertLessEqual(
            len(result.split()),
            MAX_SPOKEN_INTRO_WORDS,
        )
        self.assertIn("Northstar", result)
        self.assertIn("Software Engineer", result)
        self.assertIn("brief introduction", result)
        self.assertEqual(create.call_args.kwargs["max_output_tokens"], 120)

    def test_short_introduction_does_not_call_summarizer(self):
        with patch(
            "app.services.company_intro_service._openai"
        ) as openai:
            result = summarize_company_intro(
                "Northstar builds tools for local businesses.",
                "Analyst",
            )

        openai.assert_not_called()
        self.assertIn("Analyst", result)
        self.assertIn("brief introduction", result)
        self.assertLessEqual(
            len(result.split()),
            MAX_SPOKEN_INTRO_WORDS,
        )

    def test_summarizer_failure_falls_back_to_bounded_sentences(self):
        long_intro = (
            "Northstar builds tools for local businesses. "
            + " ".join(
                [
                    "The Software Engineer develops reliable services."
                ]
                * 20
            )
            + " We will now begin your brief introduction."
        )

        with patch(
            "app.services.company_intro_service._openai",
            side_effect=RuntimeError("unavailable"),
        ):
            result = summarize_company_intro(
                long_intro,
                "Software Engineer",
            )

        self.assertLessEqual(
            len(result.split()),
            MAX_SPOKEN_INTRO_WORDS,
        )
        self.assertIn("Northstar", result)
        self.assertIn("Software Engineer", result)
        self.assertIn("brief introduction", result)


if __name__ == "__main__":
    unittest.main()
