
"""Google OAuth and Gmail API helpers for the AI Interview app."""

from __future__ import annotations

import base64
import json
import urllib.error
import urllib.parse
import urllib.request
from email.message import EmailMessage

from app.config import settings


AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
REVOKE_URL = "https://oauth2.googleapis.com/revoke"

SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/gmail.send",
]


class GmailError(Exception):
    """Raised when Google OAuth or Gmail API operations fail."""


def configured() -> bool:
    return bool(
        (settings.google_oauth_client_id or "").strip()
        and (settings.google_oauth_client_secret or "").strip()
        and settings.google_oauth_redirect_uri.strip()
    )


def _request_json(
    url: str,
    *,
    method: str = "GET",
    data: dict | None = None,
    headers: dict | None = None,
) -> dict:
    """Make an HTTPS request and parse a JSON response."""
    request_headers = {
        "Accept": "application/json",
        "User-Agent": "AI-Interview-App",
    }
    if headers:
        request_headers.update(headers)

    body = None
    content_type = request_headers.get("Content-Type", "")

    if data is not None:
        if "application/json" in content_type:
            body = json.dumps(data).encode("utf-8")
        else:
            body = urllib.parse.urlencode(data).encode("utf-8")
            request_headers.setdefault(
                "Content-Type",
                "application/x-www-form-urlencoded",
            )

    request = urllib.request.Request(
        url,
        data=body,
        headers=request_headers,
        method=method,
    )

    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            result = json.loads(response.read().decode("utf-8"))

        if not isinstance(result, dict):
            raise GmailError("Google returned an unexpected response.")

        return result

    except urllib.error.HTTPError as exc:
        try:
            detail = exc.read().decode("utf-8", errors="replace")
            parsed = json.loads(detail)
            detail = str(
                parsed.get("error_description")
                or parsed.get("error")
                or "Google request failed."
            )
        except Exception:
            detail = "Google request failed."

        raise GmailError(
            f"Google returned HTTP {exc.code}: {detail}"
        ) from None

    except (urllib.error.URLError, TimeoutError, OSError):
        raise GmailError(
            "Could not reach Google. Check your internet connection."
        ) from None

    except (ValueError, UnicodeDecodeError):
        raise GmailError("Google returned an invalid response.") from None


def build_auth_url(
    state: str,
    login_hint: str | None = None,
) -> str:
    """Build the Google OAuth consent URL."""
    if not configured():
        raise GmailError(
            "Google OAuth is not configured. Check the OAuth variables "
            "in backend/.env."
        )

    params = {
        "client_id": settings.google_oauth_client_id,
        "redirect_uri": settings.google_oauth_redirect_uri,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
        "state": state,
    }

    if login_hint:
        params["login_hint"] = login_hint

    return f"{AUTH_URL}?{urllib.parse.urlencode(params)}"


def exchange_code(code: str) -> dict:
    """Exchange a one-time authorization code for Google tokens."""
    if not configured():
        raise GmailError("Google OAuth is not configured.")

    if not code:
        raise GmailError("Google did not return an authorization code.")

    result = _request_json(
        TOKEN_URL,
        method="POST",
        data={
            "code": code,
            "client_id": settings.google_oauth_client_id,
            "client_secret": settings.google_oauth_client_secret,
            "redirect_uri": settings.google_oauth_redirect_uri,
            "grant_type": "authorization_code",
        },
    )

    if not result.get("access_token"):
        raise GmailError("Google did not return an access token.")

    return result


def refresh_access_token(refresh_token: str) -> dict:
    """Get a new access token using a saved refresh token."""
    if not configured():
        raise GmailError("Google OAuth is not configured.")

    if not refresh_token:
        raise GmailError("No Gmail refresh token is available.")

    result = _request_json(
        TOKEN_URL,
        method="POST",
        data={
            "client_id": settings.google_oauth_client_id,
            "client_secret": settings.google_oauth_client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        },
    )

    if not result.get("access_token"):
        raise GmailError("Could not refresh the Google access token.")

    return result


def get_user_email(access_token: str) -> str:
    """Get the verified Google account email for an access token."""
    result = _request_json(
        USERINFO_URL,
        headers={"Authorization": f"Bearer {access_token}"},
    )

    email = result.get("email")

    if not email or result.get("email_verified") is not True:
        raise GmailError(
            "Google account email is missing or not verified."
        )

    return str(email).strip().lower()


def revoke(token: str) -> None:
    """Revoke a Google OAuth token."""
    if not token:
        return

    request = urllib.request.Request(
        REVOKE_URL,
        data=urllib.parse.urlencode({"token": token}).encode("utf-8"),
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=15):
            pass
    except urllib.error.HTTPError as exc:
        # Ignore tokens already expired or revoked.
        if exc.code not in (400, 401):
            raise GmailError("Could not revoke the Google token.") from None
    except (urllib.error.URLError, TimeoutError, OSError):
        raise GmailError(
            "Could not reach Google to revoke the token."
        ) from None


def send_email(
    access_token: str,
    *,
    to_email: str,
    subject: str,
    body: str,
) -> dict:
    """Send a plain-text email through the connected Gmail account."""
    if not to_email or not to_email.strip():
        raise GmailError("Candidate email address is required.")
    if not access_token:
        raise GmailError("No Gmail access token is available.")

    message = EmailMessage()
    message["To"] = to_email.strip()
    message["Subject"] = subject
    message.set_content(body)

    raw_message = base64.urlsafe_b64encode(
        message.as_bytes()
    ).decode("ascii").rstrip("=")

    return _request_json(
        SEND_URL,
        method="POST",
        data={"raw": raw_message},
        headers={
            "Authorization": "Bearer " + access_token,
            "Content-Type": "application/json",
        },
    )


def send_raw(refresh_token: str, message_bytes: bytes) -> dict:
    """Refresh a saved token, then send a MIME message through Gmail."""
    result = refresh_access_token(refresh_token)
    access_token = result.get("access_token")

    if not access_token:
        raise GmailError("Could not refresh the Google access token.")

    raw_message = base64.urlsafe_b64encode(
        message_bytes
    ).decode("ascii").rstrip("=")

    return _send_raw_message(
        access_token,
        raw_message,
    )


def _send_raw_message(access_token: str, raw_message: str) -> dict:
    """Send a base64url-encoded MIME message with a Google access token."""
    return _request_json(
        SEND_URL,
        method="POST",
        data={"raw": raw_message},
        headers={
            "Authorization": "Bearer " + access_token,
            "Content-Type": "application/json",
        },
    )
