import unittest

from app.services.transcript_normalizer import (
    collapse_repetition_loops,
    is_degenerate_transcript,
    normalize_transcript,
)


class TranscriptNormalizerTests(unittest.TestCase):
    def test_spelled_letters_become_acronyms(self):
        cases = {
            "I read the j s o n file": "I read the JSON file",
            "use S Q L for queries": "use SQL for queries",
            "call the a p i": "call the API",
            "track the k p i weekly": "track the KPI weekly",
            "we built an e t l pipeline": "we built an ETL pipeline",
            "J. S. O. N. is a format": "JSON. is a format",
        }
        for spoken, expected in cases.items():
            with self.subTest(spoken=spoken):
                self.assertEqual(normalize_transcript(spoken), expected)

    def test_lookalike_words_become_json(self):
        self.assertEqual(
            normalize_transcript("I parse jay son data"), "I parse JSON data"
        )
        self.assertEqual(
            normalize_transcript("send the jason response"),
            "send the JSON response",
        )
        self.assertEqual(
            normalize_transcript("I like to read jason files"),
            "I like to read JSON files",
        )

    def test_name_jason_is_left_alone(self):
        self.assertEqual(
            normalize_transcript("my manager Jason helped me"),
            "my manager Jason helped me",
        )

    def test_lowercase_terms_get_correct_case(self):
        self.assertEqual(
            normalize_transcript("I use python and numpy with power bi"),
            "I use Python and NumPy with Power BI",
        )

    def test_no_words_are_dropped(self):
        text = "um first identify when the performance started dropping"
        self.assertEqual(normalize_transcript(text), text)

    def test_single_letters_that_are_not_acronyms_stay(self):
        self.assertEqual(
            normalize_transcript("plan a or b"), "plan a or b"
        )

    def test_empty(self):
        self.assertEqual(normalize_transcript(""), "")
        self.assertEqual(normalize_transcript(None), "")

    def test_loop_is_collapsed_but_real_words_kept(self):
        looped = "So, um, I, I, I think that, uh, " + "the, " * 1000
        result = normalize_transcript(looped)
        self.assertTrue(result.startswith("So, um, I, I, I think that, uh,"))
        self.assertLess(len(result.split()), 20)
        self.assertTrue(is_degenerate_transcript(looped))

    def test_normal_stutter_is_not_touched(self):
        text = "I, I, I think the the data is clean"
        self.assertEqual(normalize_transcript(text), text)
        self.assertFalse(is_degenerate_transcript(text))

    def test_phrase_loop_collapsed(self):
        text = "I know " + "thank you " * 30 + "and then I cleaned data"
        out = collapse_repetition_loops(text)
        self.assertTrue(out.endswith("and then I cleaned data"))
        self.assertLess(len(out.split()), 25)


if __name__ == "__main__":
    unittest.main()
