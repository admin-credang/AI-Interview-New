"""
E-mail helper for the hiring workflow.

If SMTP is not configured in .env the message is only printed to
the console (so the whole flow still works while developing).

.env settings (all optional):

    SMTP_HOST=smtp.gmail.com
    SMTP_PORT=587
    SMTP_USER=you@example.com
    SMTP_PASSWORD=app-password
    SMTP_FROM=Hiring Team <you@example.com>
    SMTP_USE_TLS=true
    SMTP_USE_SSL=false
    COMPANY_NAME=Your Company
"""

import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr, parseaddr
from html import escape

from app.config import settings


class MailBody(str):
    """
    Plain-text body that also carries the designed HTML version.

    The build_*_email() functions return (subject, MailBody). Because it
    is still a normal str, every existing call site keeps working, and
    send_email() sends text + HTML together (mail apps show the HTML,
    the text is the fallback).
    """

    html: str | None = None

    def __new__(cls, text: str, html: str | None = None):
        obj = super().__new__(cls, text)
        obj.html = html
        return obj


def send_email(
    to_email: str,
    subject: str,
    body: str,
    from_name: str | None = None,
    reply_to: str | None = None,
    attachments: list[tuple[str, bytes, str]] | None = None,
) -> tuple[bool, str]:
    """
    Returns (sent, status_text). Never raises.

    from_name -> the name the candidate sees in the inbox
                 ("Acme Technologies" <hr@acme.com>)
    reply_to  -> where the candidate's reply goes (the interviewer)
    attachments -> [(filename, bytes, "application/pdf"), ...]
    """

    if not to_email:
        return False, "skipped: no recipient"

    if not settings.smtp_host:

        print("=" * 70)
        print("EMAIL (SMTP not configured - printed only)")
        print(f"To      : {to_email}")
        print(f"From    : {from_name or settings.company_name}")
        print(f"Subject : {subject}")
        if attachments:
            print(
                "Attached: "
                + ", ".join(f"{n} ({len(b)} bytes)" for n, b, _m in attachments)
            )
        print(body)
        print("=" * 70)

        return False, "skipped: SMTP not configured"

    try:

        sender = (
            settings.smtp_from
            or settings.smtp_user
            or "no-reply@localhost"
        )

        _name, sender_address = parseaddr(sender)

        if from_name and sender_address:
            sender = formataddr((from_name, sender_address))

        message = EmailMessage()
        message["From"] = sender
        message["To"] = to_email

        if reply_to:
            message["Reply-To"] = reply_to

        message["Subject"] = subject
        message.set_content(str(body))

        html_body = getattr(body, "html", None)

        if html_body:
            message.add_alternative(html_body, subtype="html")

        for file_name, file_bytes, mime in attachments or []:
            main_type, _, sub_type = mime.partition("/")
            message.add_attachment(
                file_bytes,
                maintype=main_type or "application",
                subtype=sub_type or "octet-stream",
                filename=file_name,
            )

        context = ssl.create_default_context()

        if settings.smtp_use_ssl:

            server = smtplib.SMTP_SSL(
                settings.smtp_host,
                settings.smtp_port,
                context=context,
                timeout=20,
            )

        else:

            server = smtplib.SMTP(
                settings.smtp_host,
                settings.smtp_port,
                timeout=20,
            )

            server.ehlo()

            if settings.smtp_use_tls:
                server.starttls(context=context)
                server.ehlo()

        if settings.smtp_user:
            server.login(
                settings.smtp_user,
                settings.smtp_password or "",
            )

        server.send_message(message)
        server.quit()

        return True, "sent"

    except Exception as exc:

        print(f"EMAIL FAILED: {exc}")

        return False, f"failed: {exc}"[:240]


# =========================================================
# HTML LAYOUT (table based + inline styles = works in Gmail,
# Outlook, Apple Mail and phones)
# =========================================================

_FONT = (
    "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,"
    "Helvetica,Arial,sans-serif"
)

_INK = "#1F1B3A"       # header + headings
_TEXT = "#3B3757"      # body text
_MUTED = "#6B6785"     # small print
_LINE = "#E6E3F0"      # dividers
_PAGE = "#F2F0F8"      # page background
_ACCENT = "#6D3BEA"    # button + step numbers

_TONES = {
    "info": ("#F4F1FE", "#6D3BEA"),
    "good": ("#E9F7F1", "#0F7B5F"),
    "warn": ("#FDF1E8", "#B4501A"),
    "bad": ("#FDECEA", "#B42318"),
}


def _e(value) -> str:
    return escape(str(value if value is not None else ""))


def _multiline(value) -> str:
    return _e(value).replace("\n", "<br>")


def _h1(text: str) -> str:
    return (
        f'<h1 style="margin:0 0 14px;font:700 24px/1.3 {_FONT};'
        f'color:{_INK};">{_e(text)}</h1>'
    )


def _p(html_text: str, bottom: int = 16) -> str:
    return (
        f'<p style="margin:0 0 {bottom}px;font:400 15px/1.7 {_FONT};'
        f'color:{_TEXT};">{html_text}</p>'
    )


def _facts(rows: list[tuple[str, str]]) -> str:
    """Label / value table. Empty values are skipped."""

    cells = ""

    for label, value in rows:

        if value in (None, ""):
            continue

        cells += (
            "<tr>"
            f'<td style="padding:11px 0;border-top:1px solid {_LINE};'
            f'font:400 14px/1.5 {_FONT};color:{_MUTED};width:38%;'
            f'vertical-align:top;">{_e(label)}</td>'
            f'<td style="padding:11px 0;border-top:1px solid {_LINE};'
            f'font:600 14px/1.5 {_FONT};color:{_INK};'
            f'vertical-align:top;">{value}</td>'
            "</tr>"
        )

    if not cells:
        return ""

    return (
        '<table role="presentation" width="100%" cellpadding="0" '
        f'cellspacing="0" style="margin:6px 0 24px;border-bottom:1px '
        f'solid {_LINE};">{cells}</table>'
    )


def _steps(items: list[str]) -> str:
    """Numbered steps - used only where the order really matters."""

    rows = ""

    for number, text in enumerate(items, start=1):
        rows += (
            "<tr>"
            '<td width="36" valign="top" style="padding:0 0 14px;">'
            f'<div style="width:24px;height:24px;border-radius:12px;'
            f'background:{_ACCENT};color:#ffffff;text-align:center;'
            f'font:700 12px/24px {_FONT};">{number}</div></td>'
            f'<td valign="top" style="padding:2px 0 14px;'
            f'font:400 15px/1.55 {_FONT};color:{_TEXT};">{text}</td>'
            "</tr>"
        )

    return (
        '<table role="presentation" width="100%" cellpadding="0" '
        f'cellspacing="0" style="margin:0 0 12px;">{rows}</table>'
    )


def _callout(text_html: str, tone: str = "info") -> str:
    background, border = _TONES[tone]

    return (
        '<table role="presentation" width="100%" cellpadding="0" '
        'cellspacing="0" style="margin:0 0 24px;"><tr>'
        f'<td style="background:{background};border-left:4px solid '
        f'{border};border-radius:6px;padding:14px 16px;'
        f'font:400 14px/1.6 {_FONT};color:{_TEXT};">{text_html}</td>'
        "</tr></table>"
    )


def _button(label: str, url: str) -> str:
    return (
        '<table role="presentation" cellpadding="0" cellspacing="0" '
        'style="margin:18px 0 22px;"><tr>'
        f'<td align="center" bgcolor="{_ACCENT}" '
        'style="border-radius:8px;">'
        f'<a href="{_e(url)}" target="_blank" '
        'style="display:inline-block;padding:14px 30px;'
        f'font:700 16px/1 {_FONT};color:#ffffff;text-decoration:none;'
        f'border-radius:8px;">{_e(label)}</a>'
        "</td></tr></table>"
        f'<p style="margin:0 0 4px;font:400 12px/1.6 {_FONT};'
        f'color:{_MUTED};">Button not working? Copy this link into '
        f'your browser:<br><a href="{_e(url)}" style="color:{_ACCENT};'
        f'word-break:break-all;">{_e(url)}</a></p>'
    )


def _code_box(label: str, code: str) -> str:
    """Big, easy-to-copy ID block (the candidate's personal interview ID)."""

    return (
        '<table role="presentation" width="100%" cellpadding="0" '
        'cellspacing="0" style="margin:6px 0 22px;"><tr>'
        f'<td align="center" style="background:{_TONES["info"][0]};'
        f'border:1px dashed {_ACCENT};border-radius:10px;'
        'padding:16px 12px;">'
        f'<div style="font:600 11px/1.4 {_FONT};letter-spacing:1.5px;'
        f'text-transform:uppercase;color:{_MUTED};">{_e(label)}</div>'
        f'<div style="margin-top:6px;font:700 26px/1.2 '
        f"'Courier New',Courier,monospace;letter-spacing:3px;"
        f'color:{_INK};">{_e(code)}</div>'
        "</td></tr></table>"
    )


def _layout(
    title: str,
    preheader: str,
    inner: str,
    org: str | None = None,
) -> str:

    team = _e(org or _team())

    return (
        '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,'
        'initial-scale=1">'
        '<meta name="color-scheme" content="light">'
        f"<title>{_e(title)}</title></head>"
        f'<body style="margin:0;padding:0;background:{_PAGE};">'
        # hidden line shown next to the subject in the inbox list
        f'<div style="display:none;max-height:0;overflow:hidden;'
        f'opacity:0;color:{_PAGE};">{_e(preheader)}</div>'
        '<table role="presentation" width="100%" cellpadding="0" '
        f'cellspacing="0" bgcolor="{_PAGE}"><tr>'
        '<td align="center" style="padding:32px 14px;">'
        '<table role="presentation" width="600" cellpadding="0" '
        'cellspacing="0" style="width:100%;max-width:600px;">'
        f'<tr><td bgcolor="{_INK}" style="background:{_INK};'
        'border-radius:14px 14px 0 0;padding:22px 32px;'
        f'font:700 18px/1.2 {_FONT};color:#ffffff;">{team}</td></tr>'
        '<tr><td bgcolor="#ffffff" style="background:#ffffff;'
        'border-radius:0 0 14px 14px;padding:34px 32px 30px;">'
        f"{inner}</td></tr>"
        f'<tr><td style="padding:20px 10px 0;text-align:center;'
        f'font:400 12px/1.6 {_FONT};color:{_MUTED};">'
        f"Sent by {team}. If this message is not meant for you, "
        "you can safely ignore it.</td></tr>"
        "</table></td></tr></table></body></html>"
    )


# =========================================================
# TEMPLATES
# =========================================================

def _team() -> str:
    return settings.company_name or "The Hiring Team"


def build_invite_email(
    job_title: str,
    link: str,
    monitoring: bool,
    company: str | None = None,
    duration: int | None = None,
    question_count: int | None = None,
    *,
    access_code: str | None = None,
    interviewer_name: str | None = None,
    candidate_email: str | None = None,
) -> tuple[str, str]:
    """
    Interview invitation sent to ONE candidate.

    The e-mail carries the candidate's personal interview ID and a
    button that opens the interview straight away.
    """

    org = company or _team()

    subject = f"Interview invitation from {org} - {job_title}"

    camera_text = (
        "This interview uses camera monitoring, so please use a "
        "device with a working camera and microphone."
        if monitoring
        else "You only need a working microphone."
    )

    email_hint = (
        f"({candidate_email}) " if candidate_email else ""
    )

    # ---------- plain text (fallback) ----------

    text = (
        "Hello,\n\n"
        f"{org} has invited you to an AI interview for the "
        f"position of \"{job_title}\".\n\n"
        + (
            f"YOUR INTERVIEW ID: {access_code}\n\n"
            if access_code
            else ""
        )
        + f"Start your interview here:\n{link}\n\n"
        f"1. Open the link above.\n"
        f"2. Log in, or register with this same email address "
        f"{email_hint}- the interview opens only for the invited "
        "address.\n"
        "3. Complete the quick device check and start.\n\n"
        + (
            "If you open the platform yourself, enter your "
            "Interview ID on your dashboard.\n\n"
            if access_code
            else ""
        )
        + f"{camera_text}\n\n"
        "Good luck!\n"
        f"{interviewer_name + chr(10) if interviewer_name else ''}"
        f"{org}\n"
    )

    # ---------- designed HTML ----------

    facts = [
        ("Position", _e(job_title)),
        ("Company", _e(company) if company else ""),
        (
            "Time allowed",
            f"{_e(duration)} minutes" if duration else "",
        ),
        (
            "Questions",
            _e(question_count) if question_count else "",
        ),
        (
            "You will need",
            "Camera and microphone" if monitoring else "Microphone",
        ),
    ]

    inner = (
        _h1("You are invited to an interview")
        + _p("Hello,")
        + _p(
            f"<strong>{_e(org)}</strong> would like you to take an "
            f"AI interview for the position of "
            f"<strong>{_e(job_title)}</strong>. You can do it on "
            "your own time, from your laptop, whenever you are ready."
        )
        + (
            _code_box("Your personal Interview ID", access_code)
            if access_code
            else ""
        )
        + _facts(facts)
        + _p("<strong>How to start</strong>", bottom=12)
        + _steps(
            [
                "Click <strong>Start your interview</strong> below.",
                "Log in. New here? Register with <strong>this same "
                "email address</strong> - the interview only opens "
                "for the address that was invited.",
                "Your Interview ID is checked automatically. Finish "
                "the quick device check and start.",
            ]
        )
        + (
            _callout(
                "<strong>Camera monitoring is on.</strong> Your camera "
                "switches on automatically and checks that you stay "
                "in view. Sit somewhere quiet and well lit, and stay "
                "on the interview page until you finish.",
                "warn",
            )
            if monitoring
            else _callout(
                "<strong>No camera needed.</strong> Allow your "
                "microphone so you can answer by voice.",
                "info",
            )
        )
        + _button("Start your interview", link)
        + (
            _p(
                "Opened the platform yourself? Enter the Interview "
                "ID above on your dashboard to begin.",
                bottom=18,
            )
            if access_code
            else ""
        )
        + _p(
            "Your Interview ID is personal to you - please do not "
            "share it.",
            bottom=22,
        )
        + _p(
            "Good luck!<br>"
            + (
                f"<strong>{_e(interviewer_name)}</strong><br>"
                if interviewer_name
                else ""
            )
            + f"{_e(org)}",
            bottom=0,
        )
    )

    html = _layout(
        subject,
        f"{org} invited you to interview for {job_title}.",
        inner,
        org=org,
    )

    return subject, MailBody(text, html)


def build_ack_email(name: str, job_title: str) -> tuple[str, str]:

    subject = f"We received your interview - {job_title}"

    text = (
        f"Hi {name},\n\n"
        f"Thank you for attending the interview for \"{job_title}\".\n\n"
        "Your responses have been submitted successfully and our "
        "team will review them.\n\n"
        "What happens next:\n"
        "  - If you are selected, our team will contact you.\n"
        "  - If you are not selected, you will receive an email.\n\n"
        "No further action is needed from you right now.\n\n"
        f"Regards,\n{_team()}\n"
    )

    inner = (
        _h1("Your interview is submitted")
        + _p(f"Hi {_e(name)},")
        + _p(
            "Thank you for attending the interview for "
            f"<strong>{_e(job_title)}</strong>. Your answers reached "
            "our team and they will review them."
        )
        + _p("<strong>What happens next</strong>", bottom=10)
        + _callout(
            "If you are selected, our team will contact you.<br>"
            "If you are not selected, you will get an email.",
            "info",
        )
        + _p("You do not need to do anything right now.", bottom=4)
    )

    html = _layout(
        subject,
        "Your answers were submitted. Our team will review them.",
        inner,
    )

    return subject, MailBody(text, html)


def _feedback_text(feedback: dict | None) -> str:
    """Plain-text feedback block (strengths / weak points / improve)."""

    if not feedback or not feedback.get("available"):
        return ""

    def block(title: str, items: list[str]) -> str:
        if not items:
            return ""
        return f"{title}\n" + "\n".join(f"- {i}" for i in items) + "\n\n"

    text = "Your interview feedback\n\n"
    text += block("Your strengths", feedback.get("strengths") or [])
    text += block("Where you were weaker", feedback.get("weaknesses") or [])
    text += block("How to improve", feedback.get("improvements") or [])

    notes = feedback.get("answer_notes") or []

    if notes:
        text += "Comments on your answers\n"
        for n, item in enumerate(notes, start=1):
            text += f"{n}. {item['question']}\n   {item['feedback']}\n"
        text += "\n"

    return text


def _bullets(items: list[str]) -> str:
    rows = "".join(
        f'<li style="margin:0 0 6px;">{_e(i)}</li>' for i in items
    )
    return (
        f'<ul style="margin:0 0 16px;padding-left:20px;font:400 15px/1.6 '
        f'{_FONT};color:{_TEXT};">{rows}</ul>'
    )


def _feedback_html(feedback: dict | None) -> str:
    """Strengths / weak points / improve / per-answer comments."""

    if not feedback or not feedback.get("available"):
        return ""

    html = _h1("Your interview feedback")

    for title, key in (
        ("Your strengths", "strengths"),
        ("Where you were weaker", "weaknesses"),
        ("How to improve", "improvements"),
    ):
        items = feedback.get(key) or []

        if items:
            html += _p(f"<strong>{_e(title)}</strong>", bottom=6)
            html += _bullets(items)

    notes = feedback.get("answer_notes") or []

    if notes:
        html += _p("<strong>Comments on your answers</strong>", bottom=6)
        html += _bullets(
            [f"{n['question']} - {n['feedback']}" for n in notes]
        )

    return html


def build_selected_email(
    name: str,
    job_title: str,
    note: str | None,
    feedback: dict | None = None,
) -> tuple[str, str]:

    subject = f"Good news - you are selected for {job_title}"

    extra = f"\nMessage from the interviewer:\n{note}\n" if note else ""

    text = (
        f"Hi {name},\n\n"
        f"Congratulations! You have been selected for the next step "
        f"for \"{job_title}\".\n\n"
        "Our team will contact you shortly with the details.\n"
        f"{extra}\n"
        f"{_feedback_text(feedback)}"
        f"Regards,\n{_team()}\n"
    )

    inner = (
        _h1("Congratulations, you are selected")
        + _p(f"Hi {_e(name)},")
        + _p(
            "You have been selected for the next step for "
            f"<strong>{_e(job_title)}</strong>. Our team will contact "
            "you shortly with the details."
        )
        + (
            _callout(
                "<strong>Message from the interviewer</strong><br>"
                f"{_multiline(note)}",
                "good",
            )
            if note
            else ""
        )
        + _feedback_html(feedback)
        + _p("Well done, and thank you for your time.", bottom=4)
    )

    html = _layout(
        subject,
        f"You are selected for the next step for {job_title}.",
        inner,
    )

    return subject, MailBody(text, html)


def build_rejected_email(
    name: str,
    job_title: str,
    feedback: dict | None = None,
) -> tuple[str, str]:

    subject = f"Update on your application - {job_title}"

    text = (
        f"Hi {name},\n\n"
        f"Thank you for the time you spent on the interview for "
        f"\"{job_title}\".\n\n"
        "After careful review we will not be moving forward with "
        "your application at this time. This is not a reflection "
        "of your potential, and we encourage you to apply again "
        "for future openings.\n\n"
        f"{_feedback_text(feedback)}"
        f"Best wishes,\n{_team()}\n"
    )

    inner = (
        _h1("An update on your application")
        + _p(f"Hi {_e(name)},")
        + _p(
            "Thank you for the time you spent on the interview for "
            f"<strong>{_e(job_title)}</strong>."
        )
        + _p(
            "After careful review we will not be moving forward with "
            "your application at this time. This is not a reflection "
            "of your potential, and we encourage you to apply again "
            "for future openings."
        )
        + _feedback_html(feedback)
        + _p("We wish you all the best.", bottom=4)
    )

    html = _layout(
        subject,
        f"An update on your application for {job_title}.",
        inner,
    )

    return subject, MailBody(text, html)


def build_interviewer_report_email(
    interviewer_name: str,
    candidate_name: str,
    candidate_email: str,
    job_title: str,
    status_text: str,
    score: float | None,
    flag_count: int,
    termination_reason: str | None,
    link: str,
) -> tuple[str, str]:
    """
    Sent to the INTERVIEWER when a candidate finishes (or is stopped).
    The candidate never receives this.
    """

    subject = f"Interview report ready - {candidate_name} ({job_title})"

    score_text = (
        f"{score:.1f} / 100" if score is not None else "being prepared"
    )

    if termination_reason:
        monitoring_text = f"interview was STOPPED - {termination_reason}"
        monitoring_html = (
            f'<span style="color:#B42318;">Interview stopped: '
            f"{_e(termination_reason)}</span>"
        )
    elif flag_count:
        monitoring_text = f"{flag_count} flag(s) to check"
        monitoring_html = (
            f'<span style="color:#B4501A;">{_e(flag_count)} '
            "flag(s) to check</span>"
        )
    else:
        monitoring_text = "no flags"
        monitoring_html = '<span style="color:#0F7B5F;">No flags</span>'

    text = (
        f"Hi {interviewer_name or 'there'},\n\n"
        f"{candidate_name} has finished the interview for "
        f"\"{job_title}\".\n\n"
        f"  Candidate     : {candidate_name} <{candidate_email}>\n"
        f"  Status        : {status_text}\n"
        f"  Overall score : {score_text}\n"
        f"  Monitoring    : {monitoring_text}\n\n"
        "The full report is attached as a PDF (bullet points, feedback "
        "and improvement analysis).\n"
        "Open the full report, answers and monitoring timeline, "
        "then select or reject the candidate:\n"
        f"{link}\n\n"
        f"Regards,\n{_team()}\n"
    )

    inner = (
        _h1(f"{candidate_name} finished the interview")
        + _p(
            f"Hi {_e(interviewer_name or 'there')}, the report for "
            f"<strong>{_e(job_title)}</strong> is ready."
        )
        + _facts(
            [
                (
                    "Candidate",
                    f"{_e(candidate_name)}<br>"
                    f'<span style="font-weight:400;color:{_MUTED};">'
                    f"{_e(candidate_email)}</span>",
                ),
                ("Status", _e(status_text)),
                ("Overall score", _e(score_text)),
                ("Monitoring", monitoring_html),
            ]
        )
        + _p(
            "The PDF report (bullet points, feedback and improvement "
            "analysis) is attached. Open the report online to read the "
            "answers and the monitoring timeline, then select or reject "
            "the candidate.",
            bottom=6,
        )
        + _button("Open the report", link)
    )

    html = _layout(
        subject,
        f"{candidate_name} finished. Score: {score_text}.",
        inner,
    )

    return subject, MailBody(text, html)