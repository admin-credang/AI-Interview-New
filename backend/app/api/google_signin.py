"""Sign in / sign up with Google for the Login and Register pages.

Uses the SAME Google OAuth client and redirect URI as the Gmail connection
(GOOGLE_OAUTH_CLIENT_ID / _SECRET / _REDIRECT_URI), so nothing new is needed
in Google Cloud or in the frontend .env.

Flow:
  1. GET  /google-oauth/login-url   -> URL of Google's account chooser
  2. Google sends the browser to /google-oauth/callback (already registered).
     This router answers that URL first: sign-in requests are handled here,
     Gmail-connection requests are passed on to the original Gmail handler.
  3. The browser lands on {frontend}/login?google_ticket=...  (valid 2 min)
  4. POST /auth/google/ticket       -> normal access token + user

Register this router in app/main.py BEFORE the Gmail OAuth router.
"""

from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api import google_oauth as gmail_routes
from app.api.auth.auth import ALGORITHM, SECRET_KEY, create_access_token
from app.config import settings
from app.database import get_db
from app.models.user import User
from app.services import gmail_oauth
from app.services.url_config import (
    FrontendURLConfigurationError,
    google_oauth_redirect_uri,
)


router = APIRouter(tags=["Google Sign-in"])

LOGIN_SCOPES = ["openid", "email", "profile"]
# Roles a brand-new Google account may choose on the Login / Register page.
SIGNUP_ROLES = {"interviewer", "admin"}


# ------------------------------------------------------------------ helpers

def _frontend_login(**params) -> RedirectResponse:
    base = gmail_routes._configured_frontend_base_url()
    return RedirectResponse(f"{base}/login?{urlencode(params)}", status_code=302)


def _exchange_code(code: str) -> dict:
    """Authorization code -> tokens (no Gmail permission check)."""
    result = gmail_oauth._request_json(
        gmail_oauth.TOKEN_URL,
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
        raise gmail_oauth.GmailError("Google did not return an access token.")
    return result


def _profile(access_token: str) -> dict:
    """Verified Google profile: {sub, email, name}."""
    result = gmail_oauth._request_json(
        gmail_oauth.USERINFO_URL,
        headers={"Authorization": f"Bearer {access_token}"},
    )
    email = result.get("email")
    sub = result.get("sub")
    if not email or not sub or result.get("email_verified") is not True:
        raise gmail_oauth.GmailError("Google account email is missing or not verified.")
    email = str(email).strip().lower()
    return {"sub": str(sub), "email": email, "name": result.get("name") or email.split("@")[0]}


def login_or_create_user(db: Session, google_id: str, email: str, name: str | None, role: str | None) -> User:
    """Existing account (by Google ID, then e-mail) keeps its role; a new
    account gets the chosen sign-up role, otherwise the default role."""
    user = db.query(User).filter(User.google_id == google_id).first()
    if not user:
        user = db.query(User).filter(User.email == email).first()

    if user:
        if not user.google_id:
            user.google_id = google_id
        db.commit()
        db.refresh(user)
        return user

    role = (role or "").strip().lower()
    user = User(
        name=name or email.split("@")[0],
        email=email,
        password_hash=None,
        google_id=google_id,
        role=role if role in SIGNUP_ROLES else "candidate",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


# ------------------------------------------------------------------ routes

@router.get("/google-oauth/login-url")
def login_url(role: str | None = Query(None)):
    """Public. Google consent URL for signing in (basic profile only)."""
    gmail_routes._configured_frontend_base_url()

    if not gmail_oauth.configured():
        raise HTTPException(status_code=503, detail="Google sign-in is not set up on the server yet.")

    try:
        google_oauth_redirect_uri(settings.google_oauth_redirect_uri, settings.frontend_base_url)
    except FrontendURLConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    chosen = (role or "").strip().lower()
    state = jwt.encode(
        {
            "purpose": "google-login",
            "role": chosen if chosen in SIGNUP_ROLES else None,
            "exp": datetime.now(timezone.utc) + timedelta(minutes=10),
        },
        SECRET_KEY,
        algorithm=ALGORITHM,
    )
    params = {
        "client_id": settings.google_oauth_client_id,
        "redirect_uri": settings.google_oauth_redirect_uri,
        "response_type": "code",
        "scope": " ".join(LOGIN_SCOPES),
        "state": state,
        "prompt": "select_account",
    }
    return {"url": f"{gmail_oauth.AUTH_URL}?{urlencode(params)}"}


@router.get("/google-oauth/callback", include_in_schema=False)
def callback(
    code: str | None = Query(None),
    state: str | None = Query(None),
    error: str | None = Query(None),
    db: Session = Depends(get_db),
):
    """Sign-in requests are finished here; anything else (the Gmail
    connection) goes to the original Gmail OAuth callback unchanged."""
    try:
        data = jwt.decode(state or "", SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        data = None

    if not data or data.get("purpose") != "google-login":
        return gmail_routes.callback(code=code, state=state, error=error, db=db)

    if error:
        return _frontend_login(google_error="Google sign-in was cancelled.")
    if not code:
        return _frontend_login(google_error="Google did not return a sign-in code. Please try again.")

    try:
        tokens = _exchange_code(code)
        profile = _profile(tokens["access_token"])
        user = login_or_create_user(db, profile["sub"], profile["email"], profile["name"], data.get("role"))
    except gmail_oauth.GmailError as exc:
        db.rollback()
        return _frontend_login(google_error=str(exc))
    except Exception:
        db.rollback()
        return _frontend_login(google_error="Google sign-in failed. Check the backend terminal for the actual error.")

    ticket = jwt.encode(
        {
            "purpose": "google-login-ticket",
            "uid": str(user.id),
            "exp": datetime.now(timezone.utc) + timedelta(minutes=2),
        },
        SECRET_KEY,
        algorithm=ALGORITHM,
    )
    return _frontend_login(google_ticket=ticket)


class GoogleTicketRequest(BaseModel):
    ticket: str


@router.post("/auth/google/ticket")
def google_ticket_login(payload: GoogleTicketRequest, db: Session = Depends(get_db)):
    """Swap the short-lived ticket from the callback for an access token."""
    expired = HTTPException(status_code=401, detail="Google sign-in expired. Please try again.")
    try:
        data = jwt.decode(payload.ticket, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise expired
    if data.get("purpose") != "google-login-ticket" or not data.get("uid"):
        raise expired

    user = db.query(User).filter(User.id == data["uid"]).first()
    if not user:
        raise expired

    return {
        "access_token": create_access_token(str(user.id)),
        "token_type": "bearer",
        "user": {"id": str(user.id), "name": user.name, "email": user.email, "role": user.role},
    }
