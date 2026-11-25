"""Google sign-in / sign-up endpoint (/auth/google)."""
import unittest
from types import SimpleNamespace
from unittest import mock
from uuid import uuid4

from fastapi import HTTPException

from app.api.auth import google_auth
from app.api.auth.google_auth import GoogleLoginRequest, google_login


class _Query:
    def __init__(self, db):
        self.db = db

    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return self.db.existing


class _Db:
    def __init__(self, existing=None):
        self.existing = existing
        self.added = []

    def query(self, *args, **kwargs):
        return _Query(self)

    def add(self, obj):
        if getattr(obj, "id", None) is None:
            obj.id = uuid4()
        self.added.append(obj)

    def commit(self):
        pass

    def refresh(self, obj):
        pass


GOOGLE_USER = {"sub": "g-123", "email": "new@example.com", "name": "New Person", "email_verified": True}


def _call(db, role=None, token_info=GOOGLE_USER):
    with mock.patch.dict("os.environ", {"GOOGLE_CLIENT_ID": "client-1"}), \
         mock.patch.object(google_auth.id_token, "verify_oauth2_token", return_value=token_info) as verify:
        result = google_login(GoogleLoginRequest(credential="tok", role=role), db=db)
    return result, verify


class GoogleAuth(unittest.TestCase):
    def test_body_model_accepts_json_credential(self):
        # the frontend posts {"credential": "..."} as JSON
        self.assertEqual(GoogleLoginRequest(**{"credential": "abc"}).credential, "abc")

    def test_signup_as_interviewer(self):
        db = _Db()
        result, verify = _call(db, role="interviewer")
        self.assertEqual(result["user"]["role"], "interviewer")
        self.assertEqual(result["user"]["email"], "new@example.com")
        self.assertTrue(result["access_token"])
        self.assertEqual(verify.call_args[0][2], "client-1")

    def test_signup_admin_allowed_but_not_other_roles(self):
        self.assertEqual(_call(_Db(), role="admin")[0]["user"]["role"], "admin")
        self.assertEqual(_call(_Db(), role="superuser")[0]["user"]["role"], "candidate")
        self.assertEqual(_call(_Db(), role=None)[0]["user"]["role"], "candidate")

    def test_existing_user_keeps_role_and_gets_linked(self):
        user = SimpleNamespace(id=uuid4(), name="Old", email="new@example.com", role="candidate", google_id=None)
        result, _ = _call(_Db(existing=user), role="admin")
        self.assertEqual(result["user"]["role"], "candidate")
        self.assertEqual(user.google_id, "g-123")

    def test_unverified_email_rejected(self):
        with self.assertRaises(HTTPException) as ctx:
            _call(_Db(), token_info={**GOOGLE_USER, "email_verified": False})
        self.assertEqual(ctx.exception.status_code, 401)

    def test_client_id_falls_back_to_gmail_oauth_setting(self):
        with mock.patch.dict("os.environ", {}, clear=False):
            import os
            os.environ.pop("GOOGLE_CLIENT_ID", None)
            with mock.patch.object(google_auth.settings, "google_oauth_client_id", "gmail-client"):
                self.assertEqual(google_auth.google_client_id(), "gmail-client")

    def test_missing_client_id_gives_clear_error(self):
        import os
        with mock.patch.dict("os.environ", {}, clear=False):
            os.environ.pop("GOOGLE_CLIENT_ID", None)
            with mock.patch.object(google_auth.settings, "google_oauth_client_id", None):
                with self.assertRaises(HTTPException) as ctx:
                    google_login(GoogleLoginRequest(credential="tok"), db=_Db())
        self.assertEqual(ctx.exception.status_code, 500)
        self.assertIn("GOOGLE_CLIENT_ID", ctx.exception.detail)

    def test_config_endpoint(self):
        with mock.patch.dict("os.environ", {"GOOGLE_CLIENT_ID": "client-xyz"}):
            self.assertEqual(google_auth.google_config(), {"enabled": True, "client_id": "client-xyz"})
        import os
        with mock.patch.dict("os.environ", {}, clear=False):
            os.environ.pop("GOOGLE_CLIENT_ID", None)
            with mock.patch.object(google_auth.settings, "google_oauth_client_id", None):
                self.assertEqual(google_auth.google_config(), {"enabled": False, "client_id": None})


if __name__ == "__main__":
    unittest.main()
