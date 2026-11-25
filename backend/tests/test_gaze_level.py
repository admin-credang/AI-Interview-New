import unittest

from app import features
from app.services.gaze_analysis_service import analyse_question


class GazeLevelTests(unittest.TestCase):
    def test_default_and_invalid_level_is_medium(self):
        self.assertEqual(features.monitoring_flags(True)["gaze_level"], "medium")
        self.assertEqual(
            features.monitoring_flags(True, "extreme")["gaze_level"], "medium"
        )

    def test_level_is_kept(self):
        for level in ("low", "medium", "high"):
            self.assertEqual(
                features.monitoring_flags(True, level)["gaze_level"], level
            )

    def test_policy_reads_saved_level(self):
        class Cfg:
            extra_config = {"proctoring": {"enabled": True, "gaze_level": "low"}}

        policy = features.monitoring_policy(Cfg())
        self.assertTrue(policy["enabled"])
        self.assertEqual(policy["gaze_level"], "low")


class GazeAnalysisTests(unittest.TestCase):
    def test_normal_screen_reading_is_low_risk(self):
        row = analyse_question(
            {
                "question": 1,
                "answer_ms": 40000,
                "on_screen_ms": 32000,
                "side_ms": 4000,
                "down_ms": 2000,
                "glances": 4,
                "sweeps": 2,
            }
        )
        self.assertEqual(row["risk"], "LOW")
        self.assertFalse(row["reading"])

    def test_clear_cheating_pattern_is_still_flagged(self):
        row = analyse_question(
            {
                "question": 1,
                "answer_ms": 40000,
                "on_screen_ms": 10000,
                "side_ms": 20000,
                "down_ms": 5000,
                "glances": 20,
                "sweeps": 6,
                "phone_ms": 3000,
            }
        )
        self.assertEqual(row["risk"], "HIGH")


if __name__ == "__main__":
    unittest.main()
