"""
Small shared helpers for per-interview rules.

* Invite-only access  -> only invited e-mails (or people who already
  have a session) can see / open / start an interview.
* Follow-up policy    -> the interviewer decides if follow-up
  questions are asked and how many.

Everything is stored inside InterviewConfiguration.extra_config, so no
database migration is needed:

    extra_config = {
        "invited": ["a@x.com", ...],
        "invitations": {
            "a@x.com": {
                "code": "INV-K7QM-4X9B",     # personal interview ID
                "role": "Python Developer",  # role fixed by interviewer
                "invited_at": "...", "opened_at": "...",
            }
        },
        "follow_ups": {"enabled": true, "count": 2},
        "proctoring": {...},
        "job": {...},
    }
"""

import re
import secrets

from sqlalchemy.orm import Session

from app.models.interview import Interview
from app.models.interview_configuration import InterviewConfiguration
from app.models.session import InterviewSession
from app.models.user import User


DEFAULT_FOLLOW_UP_COUNT = 2
MAX_FOLLOW_UP_COUNT = 5


# =========================================================
# ROLES / OWNERSHIP
# =========================================================

def is_recruiter(user: User) -> bool:
    return user.role in {"interviewer", "admin"}


def owns_interview(user: User, interview: Interview) -> bool:
    return user.role == "admin" or interview.created_by == user.id


# =========================================================
# INVITE-ONLY ACCESS
# =========================================================

def _extra(configuration) -> dict:
    return (
        (configuration.extra_config or {})
        if configuration is not None
        else {}
    )


def invitations(configuration) -> dict:
    """email (lower case) -> invitation record."""

    raw = _extra(configuration).get("invitations") or {}

    return {
        str(email).strip().lower(): dict(record or {})
        for email, record in raw.items()
        if email
    }


def invited_emails(configuration) -> set[str]:
    legacy = {
        str(e).strip().lower()
        for e in (_extra(configuration).get("invited") or [])
        if e
    }

    return legacy | set(invitations(configuration).keys())


def invitation_for(configuration, user: User) -> dict | None:
    """The invitation (ID + fixed role) issued to this user, if any."""

    return invitations(configuration).get(
        (user.email or "").strip().lower()
    )


def invited_role(configuration, user: User) -> str:
    record = invitation_for(configuration, user) or {}
    return (record.get("role") or "").strip()


# ---------------------------------------------------------
# PERSONAL INTERVIEW ID   (INV-XXXX-XXXX)
# No 0/O/1/I so it is easy to read and type.
# ---------------------------------------------------------

_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def new_invite_code(existing: set[str] | None = None) -> str:

    existing = existing or set()

    while True:
        raw = "".join(
            secrets.choice(_CODE_ALPHABET) for _ in range(8)
        )
        code = f"INV-{raw[:4]}-{raw[4:]}"

        if code not in existing:
            return code


def format_code(value) -> str | None:
    """
    'inv-k7qm-4x9b', 'INVK7QM4X9B', ' INV K7QM 4X9B ' -> 'INV-K7QM-4X9B'
    Returns None when it cannot be an interview ID.
    """

    clean = re.sub(r"[^A-Z0-9]", "", str(value or "").upper())

    if len(clean) != 11 or not clean.startswith("INV"):
        return None

    return f"INV-{clean[3:7]}-{clean[7:]}"


def mask_email(email: str) -> str:
    name, _, domain = (email or "").partition("@")

    if not domain:
        return "the invited email address"

    return f"{name[:1]}***@{domain}"


def is_invited(configuration, user: User) -> bool:
    return (user.email or "").strip().lower() in invited_emails(
        configuration
    )


def candidate_can_access(
    db: Session,
    interview_id,
    user: User,
    configuration: InterviewConfiguration | None = None,
) -> bool:
    """
    A candidate may open an interview only if

      1. the interviewer invited this e-mail address, or
      2. the candidate already has a session for it
         (so started / finished interviews never disappear).
    """

    has_session = (
        db.query(InterviewSession.id)
        .filter(
            InterviewSession.interview_id == interview_id,
            InterviewSession.candidate_id == user.id,
        )
        .first()
        is not None
    )

    if has_session:
        return True

    if configuration is None:
        configuration = (
            db.query(InterviewConfiguration)
            .filter(
                InterviewConfiguration.interview_id == interview_id
            )
            .first()
        )

    return is_invited(configuration, user)


NOT_INVITED_MESSAGE = (
    "You are not invited to this interview. "
    "Please contact the interviewer."
)


# =========================================================
# FOLLOW-UP POLICY
# =========================================================

def follow_up_policy(configuration) -> dict:
    """
    enabled = False -> the AI never asks a follow-up question.
    count           -> how many follow-ups (1..5) when enabled.

    Old interviews without the setting keep the old behaviour
    (follow-ups ON, 2 of them).
    """

    raw = _extra(configuration).get("follow_ups") or {}

    enabled = bool(raw.get("enabled", True))

    try:
        count = int(raw.get("count", DEFAULT_FOLLOW_UP_COUNT))
    except (TypeError, ValueError):
        count = DEFAULT_FOLLOW_UP_COUNT

    count = max(1, min(MAX_FOLLOW_UP_COUNT, count))

    return {"enabled": enabled, "count": count}


def max_follow_ups(configuration) -> int:
    policy = follow_up_policy(configuration)
    return policy["count"] if policy["enabled"] else 0
