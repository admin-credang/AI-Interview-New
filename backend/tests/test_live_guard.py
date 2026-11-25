"""Live Interview Guard (separate feature): scheduling with auto Google Meet, Google Calendar
connection, candidate check-page commands and the automatic report."""
import json
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest import mock
from urllib.parse import parse_qs, urlparse

from fastapi.testclient import TestClient

from app.api.auth.auth import get_current_user
from app.database import get_db
from app.live_guard import google_calendar
from app.live_guard import api as lg
from app.live_guard.google_calendar import CalendarError
from app.live_guard.models import LiveGuardGoogleAccount, LiveGuardInterview
from app.main import app


def _matches(row, expr):
    key = getattr(getattr(expr, "left", None), "key", None)
    value = getattr(getattr(expr, "right", None), "value", None)
    return getattr(row, key, object()) == value


class _Query:
    def __init__(self, rows):
        self.rows = list(rows)

    def filter(self, *exprs):
        return _Query(r for r in self.rows if all(_matches(r, e) for e in exprs))

    def order_by(self, *a):
        return _Query(sorted(self.rows, key=lambda r: r.created_at, reverse=True))

    def limit(self, n):
        return _Query(self.rows[:n])

    def first(self):
        return self.rows[0] if self.rows else None

    def all(self):
        return list(self.rows)


class _Db:
    def __init__(self, users):
        self.tables = {"users": users, LiveGuardInterview: [], LiveGuardGoogleAccount: []}

    def query(self, model):
        return _Query(self.tables.get(model, self.tables["users"]))

    def add(self, obj):
        if isinstance(obj, LiveGuardInterview):
            obj.id = obj.id or uuid.uuid4()
            obj.created_at = obj.created_at or datetime.now(timezone.utc)
            obj.command_seq = obj.command_seq or 0
        self.tables[type(obj)].append(obj)

    def delete(self, obj):
        self.tables[type(obj)].remove(obj)

    def commit(self):
        pass

    def refresh(self, obj):
        pass


def _user(role="interviewer", name="Asha"):
    return SimpleNamespace(id=uuid.uuid4(), role=role, name=name, email=f"{name.lower()}@co.com",
                           gmail_email=None, gmail_refresh_token_enc=None)


START = (datetime.now(timezone.utc) + timedelta(days=1)).replace(microsecond=0)
MEET = {"event_id": "ev1", "meet_url": "https://meet.google.com/abc-defg-hij", "html_link": "x"}


class LiveGuardApi(unittest.TestCase):
    def setUp(self):
        self.me = _user()
        self.other = _user(name="Ravi")
        self.db = _Db([self.me, self.other])
        self.current = self.me
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = lambda: self.current
        app.dependency_overrides[lg.ensure_tables] = lambda: None
        self.client = TestClient(app)
        self.patches = [
            mock.patch.object(lg.settings, "frontend_base_url", "http://localhost:5173"),
            mock.patch.object(lg.mailbox_service, "encrypt", side_effect=lambda t: "enc:" + t),
            mock.patch.object(lg.mailbox_service, "decrypt", side_effect=lambda t: t[4:] if t and t.startswith("enc:") else None),
            mock.patch.object(lg.mailbox_service, "gmail_account", return_value=None),
        ]
        for p in self.patches:
            p.start()
        self.p_mail = mock.patch.object(lg, "send_email", return_value=(True, "sent"))
        self.send_email = self.p_mail.start()

    def tearDown(self):
        self.p_mail.stop()
        for p in self.patches:
            p.stop()
        app.dependency_overrides.clear()

    def _connect_google(self, user=None):
        self.db.add(LiveGuardGoogleAccount(user_id=(user or self.me).id, email="asha@gmail.com", refresh_token_enc="enc:rt"))

    def _create(self, **extra):
        body = {"candidate_name": "Priya", "candidate_email": "priya@x.com", "role": "Data Analyst",
                "platform": "meet", "starts_at": START.isoformat(), "duration_min": 45,
                "api_base": "http://127.0.0.1:8000", **extra}
        return self.client.post("/live-guard/interviews", json=body)

    def _zoom(self):
        return self._create(platform="zoom", meeting_url="https://zoom.us/j/1").json()

    # ---------- Google Calendar connection ----------
    def test_google_connect_flow(self):
        with mock.patch.object(google_calendar, "_client", return_value=("cid", "sec")), \
             mock.patch.object(google_calendar.settings, "google_oauth_redirect_uri", "http://127.0.0.1:8000/google-oauth/callback"):
            st = self.client.get("/live-guard/google/status").json()
            self.assertFalse(st["connected"])
            self.assertEqual(st["redirect_uri"], "http://127.0.0.1:8000/live-guard/google/callback")
            url = self.client.get("/live-guard/google/connect-url").json()["url"]
        q = parse_qs(urlparse(url).query)
        self.assertIn(google_calendar.CALENDAR_SCOPE, q["scope"][0])
        self.assertEqual(q["redirect_uri"][0], "http://127.0.0.1:8000/live-guard/google/callback")
        with mock.patch.object(google_calendar, "exchange_code", return_value=("asha@gmail.com", "rt1")):
            r = self.client.get("/live-guard/google/callback", params={"code": "c", "state": q["state"][0]}, follow_redirects=False)
        self.assertEqual(r.status_code, 302)
        self.assertEqual(r.headers["location"], "http://localhost:5173/dashboard/live-guard?calendar=connected")
        st = self.client.get("/live-guard/google/status").json()
        self.assertTrue(st["connected"])
        self.assertEqual(st["email"], "asha@gmail.com")
        with mock.patch.object(google_calendar, "revoke") as revoke:
            self.client.delete("/live-guard/google")
        revoke.assert_called_once_with("rt1")
        self.assertFalse(self.client.get("/live-guard/google/status").json()["connected"])

    def test_google_callback_rejects_bad_state_and_shows_errors(self):
        r = self.client.get("/live-guard/google/callback", params={"code": "c", "state": "nope"}, follow_redirects=False)
        self.assertIn("calendar_error=", r.headers["location"])
        with mock.patch.object(google_calendar, "_client", return_value=("cid", "sec")):
            state = parse_qs(urlparse(self.client.get("/live-guard/google/connect-url").json()["url"]).query)["state"][0]
        with mock.patch.object(google_calendar, "exchange_code", side_effect=CalendarError("Calendar access was not allowed.")):
            r = self.client.get("/live-guard/google/callback", params={"code": "c", "state": state}, follow_redirects=False)
        self.assertIn("Calendar+access+was+not+allowed", r.headers["location"])
        self.assertEqual(self.db.tables[LiveGuardGoogleAccount], [])

    # ---------- scheduling ----------
    def test_auto_meet_needs_google_calendar(self):
        r = self._create()
        self.assertEqual(r.status_code, 400)
        self.assertIn("Connect Google Calendar", r.json()["detail"])

    def test_auto_meet_creates_event_and_sends_invite(self):
        self._connect_google()
        with mock.patch.object(google_calendar, "create_meet_event", return_value=MEET) as create:
            r = self._create()
        self.assertEqual(r.status_code, 200, r.text)
        d = r.json()
        self.assertEqual(d["meeting_url"], MEET["meet_url"])
        self.assertTrue(d["calendar_event"])
        self.assertIn("Google Calendar invite sent", d["invite_status"])
        self.assertIn("Invitation e-mail sent", d["invite_status"])
        self.assertTrue(d["candidate_link"].startswith("http://localhost:5173/live-guard/Candidate_Companion.html?t="))
        self.assertIn("api=http%3A%2F%2F127.0.0.1%3A8000", d["candidate_link"])
        self.assertEqual(create.call_args.args[0], "rt")
        kw = create.call_args.kwargs
        self.assertEqual(kw["attendee_email"], "priya@x.com")
        self.assertEqual(kw["end"] - kw["start"], timedelta(minutes=45))
        self.assertIn(d["candidate_link"], kw["description"])
        to, _subject, body = self.send_email.call_args.args[:3]
        self.assertEqual(to, "priya@x.com")
        self.assertIn(MEET["meet_url"], body)
        self.assertIn(d["candidate_link"], body)

    def test_auto_meet_needs_time(self):
        self._connect_google()
        self.assertEqual(self._create(starts_at=None).status_code, 400)

    def test_calendar_error_is_shown_and_nothing_saved(self):
        self._connect_google()
        with mock.patch.object(google_calendar, "create_meet_event", side_effect=CalendarError("Google Calendar API is not enabled.")):
            r = self._create()
        self.assertEqual(r.status_code, 502)
        self.assertIn("not enabled", r.json()["detail"])
        self.assertEqual(self.db.tables[LiveGuardInterview], [])

    def test_zoom_and_teams_need_their_own_link(self):
        self.assertEqual(self._create(platform="zoom", meeting_url="https://meet.google.com/abc-defg-hij").status_code, 400)
        self.assertEqual(self._create(platform="zoom", meeting_url="http://us05web.zoom.us/j/1").status_code, 400)
        ok = self._create(platform="zoom", meeting_url="https://us05web.zoom.us/j/81234567890?pwd=x")
        self.assertEqual(ok.status_code, 200, ok.text)
        self.assertFalse(ok.json()["calendar_event"])
        self.assertEqual(self._create(platform="teams", meeting_url="https://teams.microsoft.com/l/meetup-join/abc").status_code, 200)

    def test_pasted_meet_link_skips_calendar(self):
        with mock.patch.object(google_calendar, "create_meet_event") as create:
            r = self._create(meeting_url="https://meet.google.com/xyz-abcd-efg")
        self.assertEqual(r.status_code, 200)
        create.assert_not_called()

    def test_candidates_cannot_use_it(self):
        self.current = _user(role="candidate")
        self.assertEqual(self.client.get("/live-guard/interviews").status_code, 403)

    def test_list_only_own_unless_admin(self):
        self._zoom()
        self.current = self.other
        self.assertEqual(self.client.get("/live-guard/interviews").json()["interviews"], [])
        self.current = _user(role="admin")
        self.assertEqual(len(self.client.get("/live-guard/interviews").json()["interviews"]), 1)

    # ---------- candidate page ----------
    def test_command_flow(self):
        d = self._zoom()
        token = d["candidate_link"].split("t=")[1].split("&")[0]
        info = self.client.get(f"/live-guard/public/{token}").json()
        self.assertEqual(info["candidate_name"], "Priya")
        self.assertEqual(info["platform_name"], "Zoom")
        self.assertNotIn("candidate_email", info)

        self.assertIsNone(self.client.get(f"/live-guard/public/{token}/command").json()["command"])
        self.assertTrue(self.client.get("/live-guard/interviews").json()["interviews"][0]["candidate_online"])

        url = f"/live-guard/interviews/{d['id']}/command"
        self.assertEqual(self.client.post(url, json={"type": "challenge", "code": "12"}).status_code, 400)
        self.assertEqual(self.client.post(url, json={"type": "challenge", "code": "4821 07"}).status_code, 200)
        got = self.client.get(f"/live-guard/public/{token}/command").json()
        self.assertEqual(got["command"], {"type": "challenge", "code": "482107"})
        seq = got["seq"]
        self.assertIsNone(self.client.get(f"/live-guard/public/{token}/command", params={"after": seq}).json()["command"])
        self.client.post(url, json={"type": "calibrate"})
        self.assertEqual(self.client.get(f"/live-guard/public/{token}/command", params={"after": seq}).json()["command"]["type"], "calibrate")

        row = self.db.tables[LiveGuardInterview][0]
        row.command = {**row.command, "at": (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat(), "seq": 99}
        self.assertIsNone(self.client.get(f"/live-guard/public/{token}/command").json()["command"])

    def test_bad_token(self):
        self.assertEqual(self.client.get("/live-guard/public/short").status_code, 404)
        self.assertEqual(self.client.get("/live-guard/public/" + "x" * 30).status_code, 404)

    def test_other_interviewer_cannot_send_commands(self):
        d = self._zoom()
        self.current = self.other
        self.assertEqual(self.client.post(f"/live-guard/interviews/{d['id']}/command", json={"type": "calibrate"}).status_code, 404)

    # ---------- report ----------
    def test_report_upload_and_download(self):
        d = self._zoom()
        url = f"/live-guard/interviews/{d['id']}/report"
        bad = self.client.post(url, files={"pdf": ("r.pdf", b"hello", "application/pdf")}, data={"report": "{}"})
        self.assertEqual(bad.status_code, 400)
        rep = {"finalStatus": {"level": "REVIEW"}, "reasons": ["phone seen 3 times"]}
        ok = self.client.post(url, files={"pdf": ("Interview_Report_Priya.pdf", b"%PDF-1.4 test", "application/pdf")}, data={"report": json.dumps(rep)})
        self.assertEqual(ok.status_code, 200, ok.text)
        self.assertEqual(ok.json()["final_status"], "REVIEW")
        item = self.client.get("/live-guard/interviews").json()["interviews"][0]["report"]
        self.assertTrue(item["available"])
        self.assertEqual(item["reasons"], ["phone seen 3 times"])
        pdf = self.client.get(f"/live-guard/interviews/{d['id']}/report.pdf")
        self.assertEqual(pdf.content, b"%PDF-1.4 test")
        self.assertIn("Interview_Report_Priya.pdf", pdf.headers["content-disposition"])
        self.current = self.other
        self.assertEqual(self.client.get(f"/live-guard/interviews/{d['id']}/report.pdf").status_code, 404)

    def test_cancel_deletes_calendar_event(self):
        self._connect_google()
        with mock.patch.object(google_calendar, "create_meet_event", return_value={**MEET, "event_id": "ev9"}):
            d = self._create().json()
        with mock.patch.object(google_calendar, "delete_event") as delete:
            r = self.client.delete(f"/live-guard/interviews/{d['id']}")
        self.assertEqual(r.status_code, 200)
        delete.assert_called_once_with("rt", "ev9")
        self.assertEqual(self.db.tables[LiveGuardInterview], [])


class CalendarService(unittest.TestCase):
    def test_creates_meet_event(self):
        calls = []

        def fake(url, **kw):
            calls.append((url, kw))
            if "token" in url and "oauth2" in url:
                return {"access_token": "at"}
            return {"id": "ev1", "hangoutLink": "https://meet.google.com/aaa-bbbb-ccc", "htmlLink": "h"}

        with mock.patch.object(google_calendar, "_client", return_value=("cid", "sec")), \
             mock.patch.object(google_calendar, "_http_json", side_effect=fake):
            out = google_calendar.create_meet_event("rt", summary="s", description="d", start=START, end=START + timedelta(minutes=30), attendee_email="c@x.com")
        self.assertEqual(out["meet_url"], "https://meet.google.com/aaa-bbbb-ccc")
        url, kw = calls[1]
        self.assertIn("conferenceDataVersion=1", url)
        self.assertIn("sendUpdates=all", url)
        self.assertEqual(kw["token"], "at")
        self.assertEqual(kw["body"]["conferenceData"]["createRequest"]["conferenceSolutionKey"]["type"], "hangoutsMeet")
        self.assertEqual(kw["body"]["attendees"], [{"email": "c@x.com"}])

    def test_friendly_messages(self):
        self.assertIn("Connect Google Calendar", google_calendar._friendly("Google returned HTTP 403: Request had insufficient authentication scopes."))
        self.assertIn("Enable 'Google Calendar API'", google_calendar._friendly("Google returned HTTP 403: Calendar API has not been used in project 1"))
        self.assertIn("Authorized redirect URIs", google_calendar._friendly("Google returned HTTP 400: redirect_uri_mismatch"))

    def test_exchange_requires_calendar_permission(self):
        with mock.patch.object(google_calendar, "_client", return_value=("cid", "sec")), \
             mock.patch.object(google_calendar, "_http_json", return_value={"access_token": "a", "refresh_token": "r", "scope": "openid email"}):
            with self.assertRaises(CalendarError):
                google_calendar.exchange_code("code")

    def test_old_gmail_scopes_untouched(self):
        from app.services import gmail_oauth
        self.assertNotIn(google_calendar.CALENDAR_SCOPE, gmail_oauth.SCOPES)


if __name__ == "__main__":
    unittest.main()
