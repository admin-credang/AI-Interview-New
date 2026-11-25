import os

from fastapi import APIRouter, Depends, HTTPException, status
from google.oauth2 import id_token
from google.auth.transport import requests
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.api.auth.auth import create_access_token


router = APIRouter(
    prefix="/auth",
    tags=["Authentication"]
)

# Roles a brand-new Google account may choose on the login / register page.
# (Candidates are created with the default role and join via their invitation.)
SIGNUP_ROLES = {"interviewer", "admin"}


class GoogleLoginRequest(BaseModel):
    # ID token ("credential") returned by Google Identity Services
    credential: str
    # Only used when this Google account has no user yet (sign-up).
    role: str | None = None


def google_client_id() -> str:
    """Read at request time (the .env file is loaded after this module is
    imported). GOOGLE_CLIENT_ID wins; otherwise the Gmail OAuth client ID
    from the settings is used - one Web client works for both."""
    return (
        os.getenv("GOOGLE_CLIENT_ID")
        or getattr(settings, "google_oauth_client_id", None)
        or ""
    ).strip()


def login_or_create_google_user(db: Session, google_id: str, email: str, name: str | None, role: str | None) -> User:
    """Find the user for this Google account (by Google ID, then e-mail) or
    create one. Existing accounts keep their role; a new account gets the
    chosen sign-up role (interviewer / admin) or the default role."""
    user = (
        db.query(User)
        .filter(User.google_id == google_id)
        .first()
    )

    if not user:
        user = (
            db.query(User)
            .filter(User.email == email)
            .first()
        )

    if user:
        # Existing account: just link Google. The role never changes here.
        if not user.google_id:
            user.google_id = google_id

        db.commit()
        db.refresh(user)

    else:
        # Sign-up with Google. Interviewer / admin when chosen on the page,
        # otherwise the default role (invited candidates).
        role = (role or "").strip().lower()
        user = User(
            name=name or email.split("@")[0],
            email=email,
            password_hash=None,
            google_id=google_id,
            role=role if role in SIGNUP_ROLES else "candidate"
        )

        db.add(user)
        db.commit()
        db.refresh(user)

    return user


@router.get("/google/config")
def google_config():
    """Public: lets the Login / Register pages show "Continue with Google"
    without a frontend .env entry. The client ID is not a secret."""
    client_id = google_client_id()
    return {"enabled": bool(client_id), "client_id": client_id or None}


@router.post("/google")
def google_login(
    payload: GoogleLoginRequest,
    db: Session = Depends(get_db)
):
    client_id = google_client_id()

    if not client_id:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Google sign-in is not configured on the server. "
                   "Set GOOGLE_CLIENT_ID in the backend .env file."
        )

    try:
        google_user = id_token.verify_oauth2_token(
            payload.credential,
            requests.Request(),
            client_id
        )
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Google token. Please try again."
        )

    google_id = google_user.get("sub")
    email = google_user.get("email")
    name = google_user.get("name")

    if not google_id or not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google account information is incomplete"
        )

    if google_user.get("email_verified") is False:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="This Google e-mail address is not verified."
        )

    user = login_or_create_google_user(db, google_id, email, name, payload.role)

    access_token = create_access_token(str(user.id))

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": str(user.id),
            "name": user.name,
            "email": user.email,
            "role": user.role
        }
    }
