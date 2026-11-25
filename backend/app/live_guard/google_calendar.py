"""Google Calendar for Live Interview Guard: its own Google connection (calendar only).

Uses the same Google OAuth client as the app (GOOGLE_OAUTH_CLIENT_ID / SECRET in backend/.env)
but its own redirect URI and its own saved token, so the existing Gmail connection is not touched.

Redirect URI to add once in Google Cloud Console (Credentials -> your OAuth client):
    <backend>/live-guard/google/callback
(or set LIVE_GUARD_REDIRECT_URI in backend/.env)
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime

from app.config import settings

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events"
SCOPES = ["openid", "https://www.googleapis.com/auth/userinfo.email", CALENDAR_SCOPE]
CALLBACK_PATH = "/live-guard/google/callback"


class CalendarError(Exception):
    """A Google sign-in or Calendar call failed (message is safe to show)."""


def _client() -> tuple[str, str]:
    cid = (os.getenv("GOOGLE_OAUTH_CLIENT_ID") or settings.google_oauth_client_id or "").strip()
    secret = (os.getenv("GOOGLE_OAUTH_CLIENT_SECRET") or settings.google_oauth_client_secret or "").strip()
    return cid, secret


def redirect_uri() -> str:
    explicit = (os.getenv("LIVE_GUARD_REDIRECT_URI") or "").strip()
    if explicit:
        return explicit
    base = (settings.google_oauth_redirect_uri or "").strip()
    parsed = urllib.parse.urlparse(base)
    if parsed.scheme and parsed.netloc:
        return f"{parsed.scheme}://{parsed.netloc}{CALLBACK_PATH}"
    return f"http://127.0.0.1:8000{CALLBACK_PATH}"


def configured() -> bool:
    cid, secret = _client()
    return bool(cid and secret)


def _http_json(url: str, *, method: str = "GET", form: dict | None = None, body: dict | None = None, token: str | None = None) -> dict:
    headers = {"Accept": "application/json", "User-Agent": "AI-Interview-LiveGuard"}
    data = None
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if form is not None:
        data = urllib.parse.urlencode(form).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    elif body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            raw = res.read().decode("utf-8") or "{}"
            out = json.loads(raw)
            return out if isinstance(out, dict) else {}
    except urllib.error.HTTPError as exc:
        try:
            parsed = json.loads(exc.read().decode("utf-8", errors="replace"))
            err = parsed.get("error")
            detail = parsed.get("error_description") or (err.get("message") if isinstance(err, dict) else err) or "request failed"
        except Exception:
            detail = "request failed"
        raise CalendarError(_friendly(f"Google returned HTTP {exc.code}: {detail}")) from None
    except (urllib.error.URLError, TimeoutError, OSError):
        raise CalendarError("Could not reach Google. Check the internet connection.") from None
    except ValueError:
        raise CalendarError("Google returned an invalid response.") from None


def _friendly(text: str) -> str:
    low = text.lower()
    if "insufficient" in low or ("403" in low and "scope" in low):
        return "Google Calendar permission is missing. Press 'Connect Google Calendar' again and allow Calendar access."
    if "has not been used" in low or "is disabled" in low or "accessnotconfigured" in low.replace(" ", ""):
        return "Google Calendar API is not enabled. Enable 'Google Calendar API' in Google Cloud Console -> APIs & Services."
    if "invalid_grant" in low:
        return "The Google Calendar connection expired. Press 'Connect Google Calendar' again."
    if "redirect_uri_mismatch" in low:
        return f"Add {redirect_uri()} to 'Authorized redirect URIs' of the OAuth client in Google Cloud Console."
    return text


def auth_url(state: str, login_hint: str | None = None) -> str:
    cid, _ = _client()
    if not cid:
        raise CalendarError("Google OAuth is not configured (GOOGLE_OAUTH_CLIENT_ID / SECRET in backend/.env).")
    params = {
        "client_id": cid,
        "redirect_uri": redirect_uri(),
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }
    if login_hint:
        params["login_hint"] = login_hint
    return f"{AUTH_URL}?{urllib.parse.urlencode(params)}"


def exchange_code(code: str) -> tuple[str, str]:
    """Returns (google e-mail, refresh token)."""
    cid, secret = _client()
    if not (cid and secret):
        raise CalendarError("Google OAuth is not configured.")
    if not code:
        raise CalendarError("Google did not return an authorization code.")
    tok = _http_json(TOKEN_URL, method="POST", form={
        "code": code, "client_id": cid, "client_secret": secret,
        "redirect_uri": redirect_uri(), "grant_type": "authorization_code",
    })
    scopes = set((tok.get("scope") or CALENDAR_SCOPE).split())
    if CALENDAR_SCOPE not in scopes:
        raise CalendarError("Calendar access was not allowed. Connect again and tick the Google Calendar permission.")
    refresh = tok.get("refresh_token")
    if not refresh:
        raise CalendarError("Google did not return a long-term token. Connect again.")
    info = _http_json(USERINFO_URL, token=tok.get("access_token"))
    email = (info.get("email") or "").strip().lower()
    if not email:
        raise CalendarError("Google did not return the account e-mail.")
    return email, refresh


def _access_token(refresh_token: str) -> str:
    cid, secret = _client()
    tok = _http_json(TOKEN_URL, method="POST", form={
        "client_id": cid, "client_secret": secret,
        "refresh_token": refresh_token, "grant_type": "refresh_token",
    })
    if not tok.get("access_token"):
        raise CalendarError("Could not refresh the Google Calendar connection. Connect again.")
    return tok["access_token"]


def create_meet_event(refresh_token: str, *, summary: str, description: str, start: datetime, end: datetime, attendee_email: str) -> dict:
    """Calendar event + Google Meet link; Google e-mails the invite to the candidate."""
    token = _access_token(refresh_token)
    query = urllib.parse.urlencode({"conferenceDataVersion": 1, "sendUpdates": "all"})
    result = _http_json(f"{EVENTS_URL}?{query}", method="POST", token=token, body={
        "summary": summary,
        "description": description,
        "start": {"dateTime": start.isoformat()},
        "end": {"dateTime": end.isoformat()},
        "attendees": [{"email": attendee_email}],
        "conferenceData": {"createRequest": {"requestId": uuid.uuid4().hex, "conferenceSolutionKey": {"type": "hangoutsMeet"}}},
        "reminders": {"useDefault": True},
    })
    meet = result.get("hangoutLink")
    if not meet:
        for e in (result.get("conferenceData") or {}).get("entryPoints") or []:
            if e.get("entryPointType") == "video" and e.get("uri"):
                meet = e["uri"]
                break
    if not meet:
        raise CalendarError("Google created the event but no Meet link. Make sure this Google account can use Google Meet.")
    return {"event_id": result.get("id"), "meet_url": meet, "html_link": result.get("htmlLink")}


def delete_event(refresh_token: str, event_id: str) -> None:
    """Cancels the event (Google tells the candidate). Never raises."""
    if not event_id:
        return
    try:
        token = _access_token(refresh_token)
        req = urllib.request.Request(
            f"{EVENTS_URL}/{urllib.parse.quote(event_id)}?sendUpdates=all",
            method="DELETE", headers={"Authorization": f"Bearer {token}"},
        )
        urllib.request.urlopen(req, timeout=20).close()
    except Exception as exc:
        print(f"Live Interview Guard: calendar event delete skipped ({type(exc).__name__})")


def revoke(refresh_token: str) -> None:
    try:
        urllib.request.urlopen(urllib.request.Request(
            "https://oauth2.googleapis.com/revoke?" + urllib.parse.urlencode({"token": refresh_token}), method="POST",
        ), timeout=10).close()
    except Exception:
        pass
