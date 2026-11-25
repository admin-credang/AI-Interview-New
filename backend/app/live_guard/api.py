"""Live Interview Guard API - live interviews on Google Meet / Zoom / Teams.

Interviewer (logged in):
  GET    /live-guard/google/status               is Google Calendar connected?
  GET    /live-guard/google/connect-url          Google consent page (calendar permission)
  GET    /live-guard/google/callback             Google sends the interviewer back here
  DELETE /live-guard/google                      disconnect
  POST   /live-guard/interviews                  schedule (+ auto Google Meet + invites)
  GET    /live-guard/interviews                  list
  DELETE /live-guard/interviews/{id}             cancel (calendar event too)
  POST   /live-guard/interviews/{id}/resend      send the invitation e-mail again
  POST   /live-guard/interviews/{id}/command     start a check on the candidate's page
  POST   /live-guard/interviews/{id}/report      the tool uploads its PDF + JSON (automatic)
  GET    /live-guard/interviews/{id}/report.pdf  download the saved PDF

Candidate (no login, secret token in the link):
  GET    /live-guard/public/{token}              interview details for the check page
  GET    /live-guard/public/{token}/command      next check to run (polled every 3 s)
"""

import json
import secrets
import threading
from datetime import datetime, timedelta, timezone
from typing import Literal
from urllib.parse import urlencode, urlparse
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import RedirectResponse, Response
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.api.auth.auth import ALGORITHM, SECRET_KEY, get_current_user
from app.config import settings
from app.database import get_db
from app.models.user import User
from app.services import mailbox as mailbox_service
from app.services.email_service import send_email
from app.services.url_config import FrontendURLConfigurationError, frontend_base_url

from . import google_calendar
from .google_calendar import CalendarError
from .models import TABLES, LiveGuardGoogleAccount, LiveGuardInterview

PUBLIC_DIR = "live-guard"  # frontend/public/live-guard
HIRING_ROLES = {"interviewer", "admin"}
PLATFORM_NAMES = {"meet": "Google Meet", "zoom": "Zoom", "teams": "Microsoft Teams"}
PLATFORM_HOSTS = {
    "meet": ("meet.google.com",),
    "zoom": ("zoom.us",),
    "teams": ("teams.microsoft.com", "teams.live.com"),
}
MAX_PDF_BYTES = 25 * 1024 * 1024
COMMAND_TTL = {"calibrate": 120, "challenge": 240}  # seconds a command stays valid
STATE_PURPOSE = "live-guard-calendar"


# ------------------------------------------------------------------ tables (created on first use)

_tables_ready = False
_tables_lock = threading.Lock()


def ensure_tables() -> None:
    """Creates this feature's own tables once. Nothing else in the database is changed."""
    global _tables_ready
    if _tables_ready:
        return
    with _tables_lock:
        if _tables_ready:
            return
        try:
            from app.database import engine

            for table in TABLES:
                table.create(bind=engine, checkfirst=True)
            _tables_ready = True
        except Exception as exc:  # the request itself will report a DB problem
            print(f"Live Interview Guard: table setup skipped: {exc}")


router = APIRouter(prefix="/live-guard", tags=["Live Interview Guard"], dependencies=[Depends(ensure_tables)])


# ------------------------------------------------------------------ helpers

def _hiring_user(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in HIRING_ROLES:
        raise HTTPException(status_code=403, detail="Only interviewers and admins can use Live Interview Guard.")
    return current_user


def _own(db: Session, interview_id: UUID, user: User) -> LiveGuardInterview:
    row = db.query(LiveGuardInterview).filter(LiveGuardInterview.id == interview_id).first()
    if not row or (user.role != "admin" and row.created_by != user.id):
        raise HTTPException(status_code=404, detail="Interview not found.")
    return row


def _frontend() -> str:
    try:
        return frontend_base_url(settings.frontend_base_url)
    except FrontendURLConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def _clean_api_base(value: str | None) -> str:
    value = (value or "").strip().rstrip("/")
    parsed = urlparse(value)
    if parsed.scheme in {"http", "https"} and parsed.netloc and not parsed.query and not parsed.fragment:
        return value
    return ""


def _google(db: Session, user_id) -> LiveGuardGoogleAccount | None:
    return db.query(LiveGuardGoogleAccount).filter(LiveGuardGoogleAccount.user_id == user_id).first()


def _refresh_token(acc: LiveGuardGoogleAccount | None) -> str | None:
    return mailbox_service.decrypt(acc.refresh_token_enc) if acc else None


def companion_link(row: LiveGuardInterview, api_base: str = "") -> str:
    params = {"t": row.candidate_token}
    if api_base:
        params["api"] = api_base
    return f"{_frontend()}/{PUBLIC_DIR}/Candidate_Companion.html?{urlencode(params)}"


def _valid_meeting(platform: str, url: str) -> bool:
    try:
        u = urlparse(url)
    except ValueError:
        return False
    host = (u.hostname or "").lower()
    return u.scheme == "https" and any(host == h or host.endswith("." + h) for h in PLATFORM_HOSTS[platform])


def _invite_text(row: LiveGuardInterview, interviewer: User, link: str) -> tuple[str, str]:
    platform = PLATFORM_NAMES.get(row.platform, "online")
    company = settings.company_name
    when = row.starts_at.strftime("%A, %d %B %Y, %H:%M UTC") if row.starts_at else "To be confirmed"
    subject = f"Interview invitation{f' - {row.role}' if row.role else ''} ({platform})"
    body = "\n".join([
        f"Hi {row.candidate_name},",
        "",
        f"Thank you for your interest{f' in the {row.role} role' if row.role else ''} at {company}.",
        f"Your interview will be on {platform}.",
        "",
        f"When:  {when} ({row.duration_min} minutes)",
        f"Join:  {row.meeting_url or 'the meeting link will be shared with you'}",
        "",
        "Interview check page (please open it 5 minutes before the interview and keep it open):",
        link,
        "",
        "How to prepare:",
        "  - Use a laptop or desktop with Google Chrome and a working camera and microphone.",
        "  - Sit in a quiet, well-lit place so your face, hands and desk are visible.",
        "  - Please do not use a virtual background or blur.",
        "  - During the interview the check page may ask you to look at a few numbers on",
        "    the screen and say them aloud (about 1 minute). It starts by itself.",
        "",
        "The interview may be recorded and transcribed, and an AI tool looks at the camera",
        "(face / eye direction) to keep the interview fair. It cannot see your files or other tabs.",
        "",
        "Best regards,",
        interviewer.name or company,
        company,
    ])
    return subject, body


def _send_invite(row: LiveGuardInterview, interviewer: User, link: str) -> str:
    subject, body = _invite_text(row, interviewer, link)
    sent, info = send_email(
        row.candidate_email,
        subject,
        body,
        from_name=settings.company_name,
        reply_to=interviewer.email,
        mailbox=mailbox_service.gmail_account(interviewer),
    )
    return ("Invitation e-mail sent" if sent else f"Invitation e-mail not sent: {info}")[:500]


def serialize(row: LiveGuardInterview, api_base: str = "") -> dict:
    now = datetime.now(timezone.utc)
    seen = row.candidate_seen_at
    try:
        link = companion_link(row, api_base)
    except HTTPException:
        link = None
    return {
        "id": str(row.id),
        "candidate_name": row.candidate_name,
        "candidate_email": row.candidate_email,
        "role": row.role,
        "platform": row.platform,
        "meeting_url": row.meeting_url,
        "starts_at": row.starts_at.isoformat() if row.starts_at else None,
        "duration_min": row.duration_min,
        "calendar_event": bool(row.calendar_event_id),
        "invite_status": row.invite_status,
        "candidate_link": link,
        "candidate_online": bool(seen and (now - seen).total_seconds() < 30),
        "candidate_seen_at": seen.isoformat() if seen else None,
        "report": {
            "available": bool(row.report_pdf),
            "final_status": row.final_status,
            "filename": row.report_filename,
            "at": row.report_at.isoformat() if row.report_at else None,
            "reasons": ((row.report_json or {}).get("reasons") or [])[:8],
        },
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


# ------------------------------------------------------------------ Google Calendar connection

@router.get("/google/status")
def google_status(db: Session = Depends(get_db), user: User = Depends(_hiring_user)):
    acc = _google(db, user.id)
    return {
        "configured": google_calendar.configured(),
        "connected": bool(acc),
        "email": acc.email if acc else None,
        "redirect_uri": google_calendar.redirect_uri(),
    }


@router.get("/google/connect-url")
def google_connect_url(user: User = Depends(_hiring_user)):
    state = jwt.encode(
        {"purpose": STATE_PURPOSE, "sub": str(user.id), "exp": datetime.now(timezone.utc) + timedelta(minutes=10)},
        SECRET_KEY, algorithm=ALGORITHM,
    )
    try:
        return {"url": google_calendar.auth_url(state, login_hint=user.email)}
    except CalendarError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None


@router.get("/google/callback")
def google_callback(
    code: str | None = Query(None),
    state: str | None = Query(None),
    error: str | None = Query(None),
    db: Session = Depends(get_db),
):
    back = f"{_frontend()}/dashboard/live-guard"

    def fail(msg: str):
        return RedirectResponse(f"{back}?{urlencode({'calendar_error': msg[:300]})}", status_code=302)

    try:
        data = jwt.decode(state or "", SECRET_KEY, algorithms=[ALGORITHM])
        if data.get("purpose") != STATE_PURPOSE:
            raise JWTError("wrong purpose")
        user_id = UUID(str(data.get("sub")))
    except (JWTError, ValueError):
        return fail("The Google sign-in link expired. Press Connect again.")
    if error:
        return fail("Google Calendar access was not allowed." if error == "access_denied" else f"Google returned: {error}")
    try:
        email, refresh = google_calendar.exchange_code(code or "")
    except CalendarError as exc:
        return fail(str(exc))

    acc = _google(db, user_id)
    if acc:
        acc.email = email
        acc.refresh_token_enc = mailbox_service.encrypt(refresh)
        acc.connected_at = datetime.now(timezone.utc)
    else:
        db.add(LiveGuardGoogleAccount(user_id=user_id, email=email, refresh_token_enc=mailbox_service.encrypt(refresh)))
    db.commit()
    return RedirectResponse(f"{back}?calendar=connected", status_code=302)


@router.delete("/google")
def google_disconnect(db: Session = Depends(get_db), user: User = Depends(_hiring_user)):
    acc = _google(db, user.id)
    if acc:
        token = _refresh_token(acc)
        if token:
            google_calendar.revoke(token)
        db.delete(acc)
        db.commit()
    return {"connected": False}


# ------------------------------------------------------------------ interviews

class InterviewCreate(BaseModel):
    candidate_name: str = Field(min_length=1, max_length=200)
    candidate_email: EmailStr
    role: str | None = Field(default=None, max_length=200)
    platform: Literal["meet", "zoom", "teams"] = "meet"
    meeting_url: str | None = Field(default=None, max_length=2000)  # empty + meet = create automatically
    starts_at: datetime | None = None
    duration_min: int = Field(default=45, ge=10, le=480)
    send_invite: bool = True
    api_base: str | None = Field(default=None, max_length=500)  # this API's URL as the browser sees it


@router.post("/interviews")
def create_interview(payload: InterviewCreate, db: Session = Depends(get_db), user: User = Depends(_hiring_user)):
    meeting = (payload.meeting_url or "").strip()
    starts = payload.starts_at
    if starts and starts.tzinfo is None:
        starts = starts.replace(tzinfo=timezone.utc)

    auto_meet = payload.platform == "meet" and not meeting
    refresh = None
    if auto_meet:
        if not starts:
            raise HTTPException(status_code=400, detail="Pick the date & time so the Google Meet can be created.")
        refresh = _refresh_token(_google(db, user.id))
        if not refresh:
            raise HTTPException(status_code=400, detail="Connect Google Calendar first (button at the top of Live Interview Guard) so the Meet link can be created automatically.")
    elif not _valid_meeting(payload.platform, meeting):
        raise HTTPException(status_code=400, detail=f"Paste a valid {PLATFORM_NAMES[payload.platform]} meeting link (https://…).")

    _frontend()

    row = LiveGuardInterview(
        created_by=user.id,
        candidate_name=payload.candidate_name.strip(),
        candidate_email=str(payload.candidate_email).strip().lower(),
        role=(payload.role or "").strip() or None,
        platform=payload.platform,
        meeting_url=meeting or None,
        starts_at=starts,
        duration_min=payload.duration_min,
        candidate_token=secrets.token_urlsafe(24),
    )
    api_base = _clean_api_base(payload.api_base)
    link = companion_link(row, api_base)

    if auto_meet:
        try:
            event = google_calendar.create_meet_event(
                refresh,
                summary=f"Interview: {row.candidate_name}{f' - {row.role}' if row.role else ''}",
                description=(
                    f"Interview with {settings.company_name}.\n\n"
                    f"Interview check page (open it 5 minutes before and keep it open):\n{link}\n\n"
                    "Please use a laptop / desktop with Google Chrome and your camera ON."
                ),
                start=starts,
                end=starts + timedelta(minutes=payload.duration_min),
                attendee_email=row.candidate_email,
            )
        except CalendarError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from None
        row.meeting_url = event["meet_url"]
        row.calendar_event_id = event["event_id"]

    statuses = []
    if row.calendar_event_id:
        statuses.append("Google Calendar invite sent")
    if payload.send_invite:
        statuses.append(_send_invite(row, user, link))
    row.invite_status = " · ".join(statuses) or "Not sent"

    db.add(row)
    db.commit()
    db.refresh(row)
    return serialize(row, api_base)


@router.get("/interviews")
def list_interviews(api_base: str | None = Query(None), db: Session = Depends(get_db), user: User = Depends(_hiring_user)):
    q = db.query(LiveGuardInterview)
    if user.role != "admin":
        q = q.filter(LiveGuardInterview.created_by == user.id)
    rows = q.order_by(LiveGuardInterview.created_at.desc()).limit(200).all()
    base = _clean_api_base(api_base)
    return {"interviews": [serialize(r, base) for r in rows]}


@router.delete("/interviews/{interview_id}")
def cancel_interview(interview_id: UUID, db: Session = Depends(get_db), user: User = Depends(_hiring_user)):
    row = _own(db, interview_id, user)
    if row.calendar_event_id:
        token = _refresh_token(_google(db, row.created_by))
        if token:
            google_calendar.delete_event(token, row.calendar_event_id)
    db.delete(row)
    db.commit()
    return {"deleted": True}


class ResendRequest(BaseModel):
    api_base: str | None = Field(default=None, max_length=500)


@router.post("/interviews/{interview_id}/resend")
def resend_invite(interview_id: UUID, payload: ResendRequest | None = None, db: Session = Depends(get_db), user: User = Depends(_hiring_user)):
    row = _own(db, interview_id, user)
    base = _clean_api_base(payload.api_base if payload else None)
    row.invite_status = _send_invite(row, user, companion_link(row, base))
    db.commit()
    db.refresh(row)
    return serialize(row, base)


class CommandRequest(BaseModel):
    type: Literal["calibrate", "challenge"]
    code: str | None = Field(default=None, max_length=12)


@router.post("/interviews/{interview_id}/command")
def send_command(interview_id: UUID, payload: CommandRequest, db: Session = Depends(get_db), user: User = Depends(_hiring_user)):
    row = _own(db, interview_id, user)
    command = {"type": payload.type, "at": datetime.now(timezone.utc).isoformat()}
    if payload.type == "challenge":
        code = "".join(ch for ch in (payload.code or "") if ch.isdigit())
        if len(code) != 6:
            raise HTTPException(status_code=400, detail="The attention-check code has 6 digits.")
        command["code"] = code
    row.command_seq = (row.command_seq or 0) + 1
    command["seq"] = row.command_seq
    row.command = command
    db.commit()
    return {"ok": True, "command": command, "seq": row.command_seq, "candidate_online": serialize(row)["candidate_online"]}


@router.post("/interviews/{interview_id}/report")
async def upload_report(
    interview_id: UUID,
    pdf: UploadFile = File(...),
    report: str = Form("{}"),
    db: Session = Depends(get_db),
    user: User = Depends(_hiring_user),
):
    row = _own(db, interview_id, user)
    data = await pdf.read(MAX_PDF_BYTES + 1)
    if len(data) > MAX_PDF_BYTES:
        raise HTTPException(status_code=413, detail="The PDF report is too large.")
    if not data.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="That is not a PDF file.")
    try:
        parsed = json.loads(report or "{}")
        if not isinstance(parsed, dict):
            parsed = {}
    except ValueError:
        parsed = {}
    status = parsed.get("finalStatus") if isinstance(parsed.get("finalStatus"), dict) else {}
    row.report_pdf = data
    row.report_json = parsed
    row.report_filename = (pdf.filename or "Interview_Report.pdf")[:255]
    row.final_status = str(status.get("level") or "")[:60] or None
    row.report_at = datetime.now(timezone.utc)
    db.commit()
    return {"saved": True, "final_status": row.final_status}


@router.get("/interviews/{interview_id}/report.pdf")
def download_report(interview_id: UUID, db: Session = Depends(get_db), user: User = Depends(_hiring_user)):
    row = _own(db, interview_id, user)
    if not row.report_pdf:
        raise HTTPException(status_code=404, detail="No report has been saved for this interview yet.")
    name = (row.report_filename or "Interview_Report.pdf").replace('"', "")
    return Response(content=row.report_pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})


# ------------------------------------------------------------------ candidate (no login)

def _by_token(db: Session, token: str) -> LiveGuardInterview:
    row = None
    if 16 <= len(token or "") <= 64:
        row = db.query(LiveGuardInterview).filter(LiveGuardInterview.candidate_token == token).first()
    if not row:
        raise HTTPException(status_code=404, detail="This interview link is not valid any more.")
    return row


@router.get("/public/{token}")
def public_interview(token: str, db: Session = Depends(get_db)):
    row = _by_token(db, token)
    interviewer = db.query(User).filter(User.id == row.created_by).first()
    return {
        "candidate_name": row.candidate_name,
        "role": row.role,
        "platform": row.platform,
        "platform_name": PLATFORM_NAMES.get(row.platform, row.platform),
        "meeting_url": row.meeting_url,
        "starts_at": row.starts_at.isoformat() if row.starts_at else None,
        "duration_min": row.duration_min,
        "company": settings.company_name,
        "interviewer": interviewer.name if interviewer else None,
    }


@router.get("/public/{token}/command")
def public_command(token: str, after: int = Query(0, ge=0), db: Session = Depends(get_db)):
    row = _by_token(db, token)
    row.candidate_seen_at = datetime.now(timezone.utc)
    db.commit()
    command = row.command or {}
    seq = int(command.get("seq") or 0)
    if seq <= after:
        return {"seq": seq, "command": None}
    try:
        age = (datetime.now(timezone.utc) - datetime.fromisoformat(command["at"])).total_seconds()
    except (KeyError, ValueError, TypeError):
        age = 10**9
    if age > COMMAND_TTL.get(command.get("type"), 120):
        return {"seq": seq, "command": None}
    return {"seq": seq, "command": {"type": command.get("type"), "code": command.get("code")}}
