"""Admin gets the interviewer dashboard (all interviews), not the candidate one."""
import unittest
from types import SimpleNamespace
from unittest import mock
from uuid import uuid4

from app import dashboard


class _Chain:
    """Fake SQLAlchemy query: records every .filter() argument."""

    def __init__(self, log):
        self.log = log

    def __getattr__(self, name):
        def call(*args, **kwargs):
            if name == "filter":
                self.log.extend(args)
            if name in {"scalar"}:
                return 0
            if name in {"all"}:
                return []
            return self
        return call


class _Db:
    def __init__(self):
        self.filters = []

    def query(self, *args, **kwargs):
        return _Chain(self.filters)


def _run(role):
    db = _Db()
    user = SimpleNamespace(id=uuid4(), role=role, name="X", email="x@example.com")
    with mock.patch.object(dashboard, "_generate_missing_reports", create=True):
        result = dashboard.get_dashboard(background_tasks=mock.Mock(), db=db, current_user=user)
    owner_filters = [f for f in db.filters if "created_by" in str(f)]
    return result, owner_filters


class DashboardRoles(unittest.TestCase):
    def test_admin_gets_interviewer_dashboard_without_owner_filter(self):
        result, owner_filters = _run("admin")
        self.assertEqual(result["role"], "admin")
        self.assertIn("interviews", result)
        self.assertNotIn("available_interviews", result)
        self.assertEqual(owner_filters, [])

    def test_interviewer_still_sees_only_own_interviews(self):
        result, owner_filters = _run("interviewer")
        self.assertEqual(result["role"], "interviewer")
        self.assertTrue(owner_filters)


if __name__ == "__main__":
    unittest.main()
