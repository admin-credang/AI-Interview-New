import os
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from app.services.warmup_service import generate_warmup_response


class WarmupServiceTests(unittest.TestCase):
    def test_generates_one_short_response_from_candidate_reply(self):
        create = Mock(
            return_value=SimpleNamespace(
                output_text="That sounds like a full day; thank you for sharing."
            )
        )
        openai_module = SimpleNamespace(
            OpenAI=lambda **_kwargs: SimpleNamespace(
                responses=SimpleNamespace(create=create)
            )
        )

        with (
            patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"}),
            patch.dict(sys.modules, {"openai": openai_module}),
        ):
            result = generate_warmup_response("I had a busy morning.")

        self.assertEqual(
            result,
            "That sounds like a full day; thank you for sharing.",
        )
        user_content = create.call_args.kwargs["input"][1]["content"][0]["text"]
        self.assertEqual(user_content, "I had a busy morning.")
        system_prompt = create.call_args.kwargs["input"][0]["content"][0]["text"]
        self.assertIn("without evaluating", system_prompt)
        self.assertIn("asking any question", system_prompt)

    def test_requires_candidate_reply(self):
        with self.assertRaisesRegex(ValueError, "warm-up reply is required"):
            generate_warmup_response(" ")

    def test_requires_openai_key(self):
        with (
            patch.dict(os.environ, {}, clear=True),
            patch("app.services.warmup_service.settings.openai_api_key", ""),
            self.assertRaisesRegex(RuntimeError, "OPENAI_API_KEY"),
        ):
            generate_warmup_response("A pleasant day.")

    def test_rejects_empty_model_response(self):
        create = Mock(return_value=SimpleNamespace(output_text=" "))
        openai_module = SimpleNamespace(
            OpenAI=lambda **_kwargs: SimpleNamespace(
                responses=SimpleNamespace(create=create)
            )
        )

        with (
            patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"}),
            patch.dict(sys.modules, {"openai": openai_module}),
            self.assertRaisesRegex(
                RuntimeError,
                "returned no text",
            ),
        ):
            generate_warmup_response("I am ready.")


if __name__ == "__main__":
    unittest.main()
