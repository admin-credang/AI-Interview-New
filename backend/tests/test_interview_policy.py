import unittest
from types import SimpleNamespace

from app.services.interview_policy import (
    invitation_by_code,
    is_recruiter,
    owns_interview,
    update_invitation_attempt,
)


class InterviewPolicyTests(unittest.TestCase):
    def test_only_interviewers_and_admins_are_recruiters(self):
        self.assertTrue(is_recruiter(SimpleNamespace(role="interviewer")))
        self.assertTrue(is_recruiter(SimpleNamespace(role="admin")))
        self.assertFalse(is_recruiter(SimpleNamespace(role="candidate")))

    def test_interview_ownership_is_required_except_for_admins(self):
        owner = SimpleNamespace(id="owner", role="interviewer")
        other_interviewer = SimpleNamespace(id="other", role="interviewer")
        admin = SimpleNamespace(id="admin", role="admin")
        interview = SimpleNamespace(created_by="owner")

        self.assertTrue(owns_interview(owner, interview))
        self.assertFalse(owns_interview(other_interviewer, interview))
        self.assertTrue(owns_interview(admin, interview))

    def test_invitation_lookup_finds_current_and_archived_attempts(self):
        configuration = SimpleNamespace(
            extra_config={
                "invitations": {
                    "candidate@example.com": {
                        "email": "candidate@example.com",
                        "code": "INV-ABCD-EFGH",
                        "role": "Engineer",
                        "attempts": [
                            {
                                "code": "INV-JKLM-NPQR",
                                "email": "candidate@example.com",
                                "session_id": "previous-session",
                            }
                        ],
                    }
                }
            }
        )

        self.assertEqual(
            invitation_by_code(configuration, "inv-jklm-npqr"),
            (
                "candidate@example.com",
                {
                    "code": "INV-JKLM-NPQR",
                    "email": "candidate@example.com",
                    "session_id": "previous-session",
                },
            ),
        )
        self.assertEqual(
            invitation_by_code(configuration, "INV-ABCD-EFGH")[0],
            "candidate@example.com",
        )
        self.assertIsNone(
            invitation_by_code(configuration, "INV-ZZZZ-ZZZZ")
        )

    def test_attempt_updates_do_not_overwrite_the_latest_invitation(self):
        configuration = SimpleNamespace(
            extra_config={
                "invitations": {
                    "candidate@example.com": {
                        "email": "candidate@example.com",
                        "code": "INV-ABCD-EFGH",
                        "session_id": None,
                        "attempts": [
                            {
                                "code": "INV-JKLM-NPQR",
                                "session_id": "old-session",
                            }
                        ],
                    }
                }
            }
        )

        updated = update_invitation_attempt(
            configuration,
            "candidate@example.com",
            "INV-JKLM-NPQR",
            {"opened_at": "old-opened"},
        )

        self.assertTrue(updated)
        current = configuration.extra_config["invitations"][
            "candidate@example.com"
        ]
        self.assertEqual(current["session_id"], None)
        self.assertEqual(
            current["attempts"][0]["session_id"],
            "old-session",
        )
        self.assertEqual(
            current["attempts"][0]["opened_at"],
            "old-opened",
        )


if __name__ == "__main__":
    unittest.main()
