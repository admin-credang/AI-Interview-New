
"""Google OAuth routes for interviewer Gmail connection."""

from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.api.auth.auth import ALGORITHM, SECRET_KEY, get_current_user
from app.config import settings
from app.database import get_db
from app.models.user import User
from app.services import gmail_oauth, mailbox
from app.services.url_config import (
    FrontendURLConfigurationError,
    frontend_base_url,
    google_oauth_redirect_uri,
)


router = APIRouter(prefix="/google-oauth", tags=["Gmail OAuth"])


def _configured_frontend_base_url() -> str:
    try:
        return frontend_base_url(settings.frontend_base_url)
    except FrontendURLConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def _frontend_redirect(**params) -> RedirectResponse:
    base = _configured_frontend_base_url()
    query = urlencode(params)

    return RedirectResponse(
        f"{base}/dashboard/controls?{query}",
        status_code=302,
    )


@router.get("/status")
def status(current_user: User = Depends(get_current_user)):
    account = mailbox.gmail_account(current_user)

    try:
        frontend_base = _configured_frontend_base_url()
        google_oauth_redirect_uri(
            settings.google_oauth_redirect_uri,
            frontend_base,
        )
        urls_configured = True
    except HTTPException:
        urls_configured = False
    except FrontendURLConfigurationError:
        urls_configured = False

    return {
        "configured": (
            gmail_oauth.configured()
            and urls_configured
        ),
        "connected": bool(account),
        "email": account["email"] if account else None,
    }


@router.get("/connect-url")
def connect_url(current_user: User = Depends(get_current_user)):
    _configured_frontend_base_url()

    if not gmail_oauth.configured():
        raise HTTPException(
            status_code=503,
            detail="Google OAuth is not configured on the backend.",
        )

    try:
        google_oauth_redirect_uri(
            settings.google_oauth_redirect_uri,
            settings.frontend_base_url,
        )
    except FrontendURLConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    state = jwt.encode(
        {
            "uid": str(current_user.id),
            "purpose": "gmail-connect",
            "exp": datetime.now(timezone.utc) + timedelta(minutes=10),
        },
        SECRET_KEY,
        algorithm=ALGORITHM,
    )

    try:
        url = gmail_oauth.build_auth_url(
            state,
            login_hint=current_user.email,
        )
    except gmail_oauth.GmailError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from None

    return {"url": url}


@router.get("/callback")
def callback(
    code: str | None = Query(None),
    state: str | None = Query(None),
    error: str | None = Query(None),
    db: Session = Depends(get_db),
):
    _configured_frontend_base_url()

    # Google may redirect here with an error if consent was denied.
    if error:
        return _frontend_redirect(
            gmail="error",
            reason="Google sign-in was cancelled or permission was denied.",
        )

    # Validate the signed, time-limited state token.
    try:
        payload = jwt.decode(
            state or "",
            SECRET_KEY,
            algorithms=[ALGORITHM],
        )

        if payload.get("purpose") != "gmail-connect":
            raise JWTError("Invalid OAuth state.")

        user_id = payload.get("uid")
        if not user_id:
            raise JWTError("Missing user ID.")

        user = db.query(User).filter(User.id == user_id).first()

    except (JWTError, KeyError, ValueError):
        user = None

    if user is None:
        return _frontend_redirect(
            gmail="error",
            reason="The connect link expired or is invalid. Please try again.",
        )

    if not code:
        return _frontend_redirect(
            gmail="error",
            reason="Google did not return an authorization code. Please retry.",
        )

    try:
        # Exchange the authorization code for tokens.
        result = gmail_oauth.exchange_code(code)

        access_token = result.get("access_token")
        refresh_token = result.get("refresh_token")

        if not access_token:
            raise gmail_oauth.GmailError(
                "Google did not return an access token."
            )

        # Email is returned by the userinfo endpoint, not the token endpoint.
        google_email = gmail_oauth.get_user_email(access_token)

        # Google may omit a refresh token for an existing grant. Only reuse a
        # saved token when it belongs to this same connected Google account.
        if refresh_token:
            encrypted_token = mailbox.encrypt(refresh_token)
            user.gmail_refresh_token_enc = encrypted_token

        elif (
            not user.gmail_refresh_token_enc
            or (user.gmail_email or "").strip().lower() != google_email
        ):
            raise gmail_oauth.GmailError(
                "Google did not return a refresh token. Please try connecting "
                "again and grant permission when prompted."
            )

        user.gmail_email = google_email
        db.commit()

    except (gmail_oauth.GmailError, mailbox.MailboxError) as exc:
        db.rollback()
        return _frontend_redirect(
            gmail="error",
            reason=str(exc),
        )

    except Exception:
        db.rollback()
        # Avoid returning database details or secrets to the browser.
        return _frontend_redirect(
            gmail="error",
            reason=(
                "Gmail connection failed while saving the account. "
                "Check the backend terminal for the actual error."
            ),
        )

    return _frontend_redirect(
        gmail="connected",
        email=user.gmail_email,
    )


@router.delete("/disconnect")
def disconnect(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        encrypted_token = current_user.gmail_refresh_token_enc or ""
        token = mailbox.decrypt(encrypted_token)

        if token:
            try:
                gmail_oauth.revoke(token)
            except gmail_oauth.GmailError:
                # Clear the local connection even if Google is temporarily
                # unreachable; the token can be revoked in Google Account settings.
                pass

        current_user.gmail_email = None
        current_user.gmail_refresh_token_enc = None
        db.commit()

        return {"success": True}

    except mailbox.MailboxError:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not safely disconnect the saved Gmail account.",
        ) from None

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not disconnect Gmail. Check the backend logs.",
        ) from None
