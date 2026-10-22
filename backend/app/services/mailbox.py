"""
Interviewer's OWN mailbox (so candidate mails come FROM the interviewer).

The interviewer gives their e-mail address + an App Password in
Interview Controls -> Features -> Interviewer. Mails to candidates
(invitation, selected / rejected) are then sent through THEIR mailbox, so
the candidate sees the interviewer's address in "From".

* The App Password is stored ENCRYPTED (needs MAIL_SECRET_KEY in .env and
  the `cryptography` package) and is never sent back to the browser.
* It is checked with a real login before it is saved.
* If the interviewer has not connected a mailbox, mails go out the old
  way (system address, interviewer name, Reply-To = interviewer).

.env:
    MAIL_SECRET_KEY=any-long-random-text      (keep it secret, never change it
                                               or saved passwords stop working)
"""

from __future__ import annotations

import base64
import hashlib
import smtplib
import ssl

from app.config import settings

# domain -> (smtp host, port, use_ssl)
PROVIDERS: dict[str, tuple[str, int, bool]] = {
    "gmail.com": ("smtp.gmail.com", 587, False),
    "googlemail.com": ("smtp.gmail.com", 587, False),
    "outlook.com": ("smtp.office365.com", 587, False),
    "hotmail.com": ("smtp.office365.com", 587, False),
    "live.com": ("smtp.office365.com", 587, False),
    "yahoo.com": ("smtp.mail.yahoo.com", 465, True),
    "zoho.com": ("smtp.zoho.com", 465, True),
}


class MailboxError(Exception):
    """Message is safe to show to the interviewer."""


def _fernet():
    key = (getattr(settings, "mail_secret_key", None) or "").strip()

    if not key:
        raise MailboxError(
            "MAIL_SECRET_KEY is not set in the server .env, so the mailbox "
            "password cannot be stored safely. Add it and restart the server."
        )

    try:
        from cryptography.fernet import Fernet
    except ImportError:
        raise MailboxError(
            "The 'cryptography' package is missing. Run: pip install cryptography"
        )

    digest = hashlib.sha256(key.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt(text: str) -> str:
    return _fernet().encrypt(text.encode("utf-8")).decode("ascii")


def decrypt(token: str) -> str | None:
    try:
        return _fernet().decrypt(token.encode("ascii")).decode("utf-8")
    except Exception:
        return None


def server_for(email: str, host: str | None = None) -> tuple[str, int, bool]:
    """(host, port, use_ssl) for this mailbox."""

    host = (host or "").strip().lower()
    domain = email.rpartition("@")[2].strip().lower()

    if host:
        return host, (465 if host.endswith(("yahoo.com", "zoho.com")) else 587), host.endswith(("yahoo.com", "zoho.com"))

    if domain in PROVIDERS:
        return PROVIDERS[domain]

    raise MailboxError(
        f"We do not know the mail server for @{domain}. Type your SMTP server "
        "(for a company Google mailbox use smtp.gmail.com)."
    )


def clean_password(password: str, host: str) -> str:
    # Google shows App Passwords as "abcd efgh ijkl mnop"
    return password.replace(" ", "") if "gmail.com" in host else password.strip()


def open_server(account: dict, timeout: int = 20):
    """Connect + log in with the interviewer's mailbox. Returns the server."""

    host, port, use_ssl = account["host"], int(account["port"]), bool(account["ssl"])
    context = ssl.create_default_context()

    if use_ssl:
        server = smtplib.SMTP_SSL(host, port, context=context, timeout=timeout)
    else:
        server = smtplib.SMTP(host, port, timeout=timeout)
        server.ehlo()
        server.starttls(context=context)
        server.ehlo()

    server.login(account["email"], clean_password(account["password"], host))
    return server


def verify(email: str, password: str, host: str | None = None) -> dict:
    """Real login test. Returns the connection info to store."""

    smtp_host, port, use_ssl = server_for(email, host)

    account = {
        "email": email, "password": password,
        "host": smtp_host, "port": port, "ssl": use_ssl,
    }

    try:
        open_server(account, timeout=15).quit()
    except smtplib.SMTPAuthenticationError:
        raise MailboxError(
            "The mailbox rejected this login. For Gmail use an App Password "
            "(Google Account -> Security -> 2-Step Verification -> App passwords), "
            "not your normal password."
        )
    except Exception as exc:
        raise MailboxError(f"Could not connect to {smtp_host}: {type(exc).__name__}")

    return {"host": smtp_host, "port": port, "ssl": use_ssl}


def account_from_config(configuration, interviewer_email: str) -> dict | None:
    """The interviewer's saved mailbox, ready to send with (or None)."""

    extra = (configuration.extra_config or {}) if configuration else {}
    box = ((extra.get("interviewer") or {}).get("mailbox")) or {}

    email = (interviewer_email or "").strip().lower()

    if not box or (box.get("for_email") or "").lower() != email:
        return None

    password = decrypt(box.get("password_enc") or "")

    if not password:
        return None

    return {
        "email": email, "password": password,
        "host": box.get("host"), "port": box.get("port", 587),
        "ssl": bool(box.get("ssl")),
    }


def gmail_account(user) -> dict | None:
    """
    The interviewer's connected Gmail (OAuth), ready to send with (or None).
    The OAuth token is bound to this user's own database record.
    """

    if user is None:
        return None

    token_enc = getattr(user, "gmail_refresh_token_enc", None)
    gmail = (getattr(user, "gmail_email", None) or "").strip().lower()

    if not token_enc or not gmail:
        return None

    refresh = decrypt(token_enc)

    if not refresh:
        return None

    return {"email": gmail, "refresh_token": refresh, "type": "gmail_oauth"}
