"""
GMAIL OAUTH  (interviewer connects the Gmail they logged in with)

    GET    /google-oauth/status        connected? which Gmail?
    GET    /google-oauth/connect-url   -> {"url": "https://accounts.google.com/..."}
    GET    /google-oauth/callback      Google redirects here, then back to the frontend
    DELETE /google-oauth/disconnect    forget the Gmail

Rule: the Gmail account must be the SAME e-mail the interviewer logged in
with, so candidate mails always come from the interviewer's own id.
"""

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

router = APIRouter(prefix="/google-oauth", tags=["Gmail OAuth"])


def _frontend_redirect(**params) -> RedirectResponse:
    base = settings.frontend_url.rstrip("/")
    return RedirectResponse(
        f"{base}/dashboard/controls?{urlencode(params)}", status_code=302
    )


@router.get("/status")
def status(current_user: User = Depends(get_current_user)):
    account = mailbox.gmail_account(current_user)

    return {
        "configured": gmail_oauth.configured(),
        "connected": bool(account),
        "email": account["email"] if account else None,
        "login_email": current_user.email,
    }


@router.get("/connect-url")
def connect_url(current_user: User = Depends(get_current_user)):
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
        url = gmail_oauth.build_auth_url(state, login_hint=current_user.email)
    except gmail_oauth.GmailError as exc:
        raise HTTPException(500, str(exc))

    return {"url": url}


@router.get("/callback")
def callback(
    code: str | None = Query(None),
    state: str | None = Query(None),
    error: str | None = Query(None),
    db: Session = Depends(get_db),
):
    if error:
        return _frontend_redirect(gmail="error", reason="Google sign-in was cancelled.")

    try:
        payload = jwt.decode(state or "", SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("purpose") != "gmail-connect":
            raise JWTError("wrong purpose")
        user = db.query(User).filter(User.id == payload["uid"]).first()
    except (JWTError, KeyError, ValueError):
        user = None

    if user is None or not code:
        return _frontend_redirect(
            gmail="error", reason="The connect link expired. Try again."
        )

    try:
        result = gmail_oauth.exchange_code(code)

        # candidate mails must come from the id the interviewer logged in with
        if result["email"] != (user.email or "").strip().lower():
            gmail_oauth.revoke(result["refresh_token"])
            return _frontend_redirect(
                gmail="error",
                reason=(
                    f"You chose {result['email']} but you are logged in as "
                    f"{user.email}. Choose the same Gmail you logged in with."
                ),
            )

        user.gmail_email = result["email"]
        user.gmail_refresh_token_enc = mailbox.encrypt(result["refresh_token"])
        db.commit()

    except (gmail_oauth.GmailError, mailbox.MailboxError) as exc:
        return _frontend_redirect(gmail="error", reason=str(exc))

    return _frontend_redirect(gmail="connected", email=user.gmail_email)


@router.delete("/disconnect")
def disconnect(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    token = mailbox.decrypt(current_user.gmail_refresh_token_enc or "")

    if token:
        gmail_oauth.revoke(token)

    current_user.gmail_email = None
    current_user.gmail_refresh_token_enc = None
    db.commit()

    return {"success": True}
