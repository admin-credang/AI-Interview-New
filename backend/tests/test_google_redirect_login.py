"""Redirect-based "Sign in with Google" (Login / Register pages)."""
import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest import mock
from urllib.parse import parse_qs, urlparse
from uuid import uuid4

from fastapi import HTTPException
from jose import jwt

from app.api import google_oauth, google_signin
from app.api.auth.auth import ALGORITHM, SECRET_KEY
from app.services import gmail_oauth


class _Query:
    def __init__(self, db):
        self.db = db

    def filter(self, *a, **k):
        return self

    def first(self):
        return self.db.user


class _Db:
    def __init__(self, user=None):
        self.user = user
        self.added = []

    def query(self, *a, **k):
        return _Query(self)

    def add(self, obj):
        obj.id = uuid4()
        self.added.append(obj)
        self.user = obj

    def commit(self):
        pass

    def rollback(self):
        pass

    def refresh(self, obj):
        pass


SETTINGS = dict(
    google_oauth_client_id="cid",
    google_oauth_client_secret="secret",
    google_oauth_redirect_uri="http://localhost:8000/google-oauth/callback",
    frontend_base_url="http://localhost:5173",
)


def _patched_settings():
    return mock.patch.multiple(google_oauth.settings, **SETTINGS)


def _state(purpose="google-login", role="interviewer", minutes=5):
    return jwt.encode(
        {"purpose": purpose, "role": role, "exp": datetime.now(timezone.utc) + timedelta(minutes=minutes)},
        SECRET_KEY,
        algorithm=ALGORITHM,
    )


class RedirectLogin(unittest.TestCase):
    def test_login_url_has_profile_scopes_and_role_in_state(self):
        with _patched_settings(), mock.patch.object(gmail_oauth, "settings", google_oauth.settings):
            url = google_signin.login_url(role="admin")["url"]
        q = parse_qs(urlparse(url).query)
        self.assertEqual(q["redirect_uri"][0], SETTINGS["google_oauth_redirect_uri"])
        self.assertEqual(q["scope"][0], "openid email profile")
        self.assertNotIn("gmail", q["scope"][0])
        state = jwt.decode(q["state"][0], SECRET_KEY, algorithms=[ALGORITHM])
        self.assertEqual(state["purpose"], "google-login")
        self.assertEqual(state["role"], "admin")

    def test_login_url_ignores_unknown_role(self):
        with _patched_settings(), mock.patch.object(gmail_oauth, "settings", google_oauth.settings):
            url = google_signin.login_url(role="superuser")["url"]
        state = jwt.decode(parse_qs(urlparse(url).query)["state"][0], SECRET_KEY, algorithms=[ALGORITHM])
        self.assertIsNone(state["role"])

    def test_login_url_not_configured(self):
        with mock.patch.multiple(google_oauth.settings, **{**SETTINGS, "google_oauth_client_secret": None}), \
             mock.patch.object(gmail_oauth, "settings", google_oauth.settings):
            with self.assertRaises(HTTPException) as ctx:
                google_signin.login_url(role=None)
        self.assertEqual(ctx.exception.status_code, 503)

    def test_callback_creates_user_and_redirects_with_ticket(self):
        db = _Db()
        with _patched_settings(), \
             mock.patch.object(google_signin, "_exchange_code", return_value={"access_token": "at"}), \
             mock.patch.object(google_signin, "_profile", return_value={"sub": "g1", "email": "new@x.com", "name": "New"}):
            resp = google_signin.callback(code="c", state=_state(role="admin"), error=None, db=db)
        loc = resp.headers["location"]
        self.assertTrue(loc.startswith("http://localhost:5173/login?google_ticket="))
        self.assertEqual(db.user.role, "admin")
        ticket = parse_qs(urlparse(loc).query)["google_ticket"][0]

        out = google_signin.google_ticket_login(google_signin.GoogleTicketRequest(ticket=ticket), db=db)
        self.assertEqual(out["user"]["email"], "new@x.com")
        self.assertEqual(out["user"]["role"], "admin")
        self.assertTrue(out["access_token"])

    def test_existing_user_keeps_role(self):
        user = SimpleNamespace(id=uuid4(), name="Old", email="old@x.com", role="interviewer", google_id=None)
        db = _Db(user)
        with _patched_settings(), \
             mock.patch.object(google_signin, "_exchange_code", return_value={"access_token": "at"}), \
             mock.patch.object(google_signin, "_profile", return_value={"sub": "g2", "email": "old@x.com", "name": "Old"}):
            google_signin.callback(code="c", state=_state(role="admin"), error=None, db=db)
        self.assertEqual(user.role, "interviewer")
        self.assertEqual(user.google_id, "g2")

    def test_cancelled_goes_back_to_login_with_message(self):
        with _patched_settings():
            resp = google_signin.callback(code=None, state=_state(), error="access_denied", db=_Db())
        self.assertIn("/login?google_error=", resp.headers["location"])

    def test_google_error_is_shown_on_login(self):
        with _patched_settings(), \
             mock.patch.object(google_signin, "_exchange_code", side_effect=gmail_oauth.GmailError("Google returned HTTP 400: bad code")):
            resp = google_signin.callback(code="c", state=_state(), error=None, db=_Db())
        self.assertIn("google_error=Google+returned+HTTP+400", resp.headers["location"])

    def test_gmail_connect_state_still_uses_gmail_flow(self):
        # a gmail-connect state must NOT be treated as a login
        state = jwt.encode(
            {"uid": str(uuid4()), "purpose": "gmail-connect", "exp": datetime.now(timezone.utc) + timedelta(minutes=5)},
            SECRET_KEY, algorithm=ALGORITHM,
        )
        with _patched_settings(), mock.patch.object(google_signin, "_exchange_code") as exchange:
            resp = google_signin.callback(code="c", state=state, error=None, db=_Db())
        exchange.assert_not_called()
        self.assertIn("/dashboard/controls?", resp.headers["location"])

    def test_bad_or_expired_ticket(self):
        expired = jwt.encode(
            {"purpose": "google-login-ticket", "uid": "1", "exp": datetime.now(timezone.utc) - timedelta(minutes=1)},
            SECRET_KEY, algorithm=ALGORITHM,
        )
        for t in ["nonsense", expired, _state()]:
            with self.subTest(t=t[:10]):
                with self.assertRaises(HTTPException) as ctx:
                    google_signin.google_ticket_login(google_signin.GoogleTicketRequest(ticket=t), db=_Db())
                self.assertEqual(ctx.exception.status_code, 401)

    def test_profile_requires_verified_email(self):
        with mock.patch.object(gmail_oauth, "_request_json", return_value={"sub": "1", "email": "a@x.com", "email_verified": False}):
            with self.assertRaises(gmail_oauth.GmailError):
                google_signin._profile("at")

    def test_signin_router_is_registered_before_gmail_router(self):
        from app.main import app
        paths = [getattr(r, "path", None) for r in app.router.routes]
        flat = []
        for r in app.router.routes:
            flat.append((getattr(r, "path", ""), getattr(r, "endpoint", None)))
        callbacks = [ep for p, ep in flat if p == "/google-oauth/callback"]
        if callbacks:  # plain route list
            self.assertIs(callbacks[0], google_signin.callback)
        schema = app.openapi()["paths"]
        self.assertIn("/google-oauth/login-url", schema)
        self.assertIn("/auth/google/ticket", schema)


if __name__ == "__main__":
    unittest.main()
