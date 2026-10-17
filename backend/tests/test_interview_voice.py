import unittest

from app.services.interview_voice import (
    ALLOWED_VOICES,
    DEFAULT_VOICE,
    get_voice_language_code,
    normalize_voice_config,
)


class InterviewVoiceTests(unittest.TestCase):
    def test_all_seven_voices_are_accepted_and_preserved(self):
        expected_voices = {
            "en-IN-Chirp3-HD-Kore",
            "en-IN-Chirp3-HD-Puck",
            "en-IN-Chirp3-HD-Leda",
            "en-IN-Chirp3-HD-Charon",
            "en-IN-Chirp3-HD-Orus",
            "en-US-Chirp3-HD-Aoede",
            "en-US-Chirp3-HD-Achird",
        }

        self.assertEqual(ALLOWED_VOICES, expected_voices)

        for voice_name in expected_voices:
            with self.subTest(voice_name=voice_name):
                result = normalize_voice_config(
                    {"voice_name": voice_name, "question_count": 5}
                )
                self.assertEqual(result["voice_name"], voice_name)
                self.assertEqual(result["question_count"], 5)

    def test_missing_voice_uses_existing_default(self):
        self.assertEqual(
            normalize_voice_config({"question_count": 5}),
            {"question_count": 5, "voice_name": DEFAULT_VOICE},
        )

    def test_unknown_voice_is_rejected(self):
        with self.assertRaisesRegex(
            ValueError, "Invalid interviewer voice selection"
        ):
            normalize_voice_config({"voice_name": "en-US-Chirp3-HD-Kore"})

    def test_voice_language_code_matches_voice_locale(self):
        for voice_name in ALLOWED_VOICES:
            expected_language = (
                "en-US" if voice_name.startswith("en-US-") else "en-IN"
            )
            with self.subTest(voice_name=voice_name):
                self.assertEqual(
                    get_voice_language_code(voice_name),
                    expected_language,
                )
