import unittest
from types import SimpleNamespace

from app.services.interview_policy import is_recruiter, owns_interview


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


if __name__ == "__main__":
    unittest.main()
