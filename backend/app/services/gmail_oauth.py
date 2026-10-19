"""
Gmail OAuth helpers (HTTPS only - no SMTP port needed, works on Render/Vercel).

The interviewer clicks "Connect Gmail", approves the `gmail.send` permission
and we keep a REFRESH TOKEN (encrypted). Candidate mails are then sent with the
Gmail API, so the candidate sees the interviewer's own Gmail as the sender.
"""

from __future__ import annotations

import base64
import json
import urllib.error
import urllib.parse
import urllib.request

from app.config import settings

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"

SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/gmail.send",
]


class GmailError(Exception):
    """Message is safe to show to the interviewer."""


def configured() -> bool:
    return bool(
        settings.google_oauth_client_id and settings.google_oauth_client_secret
    )


def build_auth_url(state: str, login_hint: str | None = None) -> str:
    if not configured():
        raise GmailError(
            "GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET are not set "
            "in the server .env."
        )

    params = {
        "client_id": settings.google_oauth_client_id,
        "redirect_uri": settings.google_oauth_redirect_uri,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        # offline + consent = Google always returns a refresh token
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
        "state": state,
    }

    if login_hint:
        params["login_hint"] = login_hint

    return f"{AUTH_URL}?{urllib.parse.urlencode(params)}"


def _post_form(url: str, data: dict, timeout: int = 20) -> dict:
    request = urllib.request.Request(
        url,
        data=urllib.parse.urlencode(data).encode(),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as exc:
        try:
            detail = json.loads(exc.read().decode())
        except Exception:
            detail = {}
        raise GmailError(
            detail.get("error_description")
            or detail.get("error")
            or f"Google returned HTTP {exc.code}"
        )
    except Exception as exc:
        raise GmailError(f"Could not reach Google: {type(exc).__name__}")


def exchange_code(code: str) -> dict:
    """code -> {access_token, refresh_token, email}"""

    tokens = _post_form(
        TOKEN_URL,
        {
            "code": code,
            "client_id": settings.google_oauth_client_id,
            "client_secret": settings.google_oauth_client_secret,
            "redirect_uri": settings.google_oauth_redirect_uri,
            "grant_type": "authorization_code",
        },
    )

    access = tokens.get("access_token")
    refresh = tokens.get("refresh_token")

    if not access:
        raise GmailError("Google did not return an access token.")

    if not refresh:
        raise GmailError(
            "Google did not return a refresh token. Remove this app at "
            "myaccount.google.com/permissions and connect again."
        )

    if "https://www.googleapis.com/auth/gmail.send" not in (
        tokens.get("scope") or ""
    ):
        raise GmailError(
            "The 'Send email' permission was not ticked. Connect again and "
            "allow it."
        )

    request = urllib.request.Request(
        USERINFO_URL, headers={"Authorization": f"Bearer {access}"}
    )

    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            info = json.loads(response.read().decode())
    except Exception as exc:
        raise GmailError(f"Could not read the Google account: {type(exc).__name__}")

    email = (info.get("email") or "").strip().lower()

    if not email:
        raise GmailError("Google did not return the account email.")

    return {"access_token": access, "refresh_token": refresh, "email": email}


def access_token_from_refresh(refresh_token: str) -> str:
    tokens = _post_form(
        TOKEN_URL,
        {
            "client_id": settings.google_oauth_client_id,
            "client_secret": settings.google_oauth_client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        },
    )

    token = tokens.get("access_token")

    if not token:
        raise GmailError("Gmail access expired. Connect Gmail again.")

    return token


def send_raw(refresh_token: str, message_bytes: bytes) -> None:
    """Send a ready RFC 2822 message through the Gmail API."""

    access = access_token_from_refresh(refresh_token)

    payload = json.dumps(
        {"raw": base64.urlsafe_b64encode(message_bytes).decode()}
    ).encode()

    request = urllib.request.Request(
        SEND_URL,
        data=payload,
        headers={
            "Authorization": f"Bearer {access}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=30):
            return
    except urllib.error.HTTPError as exc:
        body = ""
        try:
            body = exc.read().decode()[:300]
        except Exception:
            pass
        raise GmailError(f"Gmail API HTTP {exc.code}: {body}")
    except Exception as exc:
        raise GmailError(f"Gmail API failed: {type(exc).__name__}")


def revoke(token: str) -> None:
    """Best effort: tell Google this app no longer has access."""

    try:
        _post_form("https://oauth2.googleapis.com/revoke", {"token": token}, 10)
    except Exception:
        pass
