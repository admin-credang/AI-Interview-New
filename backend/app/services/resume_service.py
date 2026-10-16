"""
Candidate resume -> plain text (PDF or DOCX).

* Only the extracted TEXT is stored (inside the invitation record). The
  uploaded file itself is never saved, so there is no file to leak.
* The file type is decided from the file's first bytes, not from its name.
* DOCX is read with the zip module + a small regex (no XML parser), and the
  unzipped size is capped, so "zip bombs" and XML tricks do nothing.
* PDF needs the `pypdf` package:   pip install pypdf
"""

from __future__ import annotations

import io
import re
import zipfile
from html import unescape

MAX_FILE_BYTES = 5 * 1024 * 1024      # 5 MB upload
MAX_PDF_PAGES = 15
MAX_DOCX_XML_BYTES = 15 * 1024 * 1024  # unzipped word/document.xml
MAX_TEXT_CHARS = 15_000               # stored per resume
MIN_TEXT_CHARS = 80                   # shorter = probably a scanned image


class ResumeError(Exception):
    """Expected, user-presentable problem with the uploaded resume."""


# =========================================================
# HELPERS
# =========================================================

def clean_filename(name: str | None) -> str:
    base = re.split(r"[\\/]", str(name or "resume"))[-1]
    base = re.sub(r"[\x00-\x1f\x7f<>:\"|?*]", "", base).strip()
    return (base or "resume")[:120]


def _normalize(text: str) -> str:
    text = text.replace("\r", "\n").replace(" ", " ")
    text = re.sub(r"[ \t\f\v]+", " ", text)
    text = re.sub(r"\n\s*\n\s*\n+", "\n\n", text)
    return text.strip()


# =========================================================
# PDF
# =========================================================

def _pdf_text(data: bytes) -> str:
    try:
        from pypdf import PdfReader
    except ImportError:
        raise ResumeError(
            "PDF reading is not installed on the server. "
            "Run:  pip install pypdf   and restart the backend."
        )

    try:
        reader = PdfReader(io.BytesIO(data))

        if reader.is_encrypted:
            try:
                if not reader.decrypt(""):
                    raise ResumeError(
                        "That PDF is password protected. Upload an "
                        "unlocked copy."
                    )
            except ResumeError:
                raise
            except Exception:
                raise ResumeError(
                    "That PDF is password protected. Upload an "
                    "unlocked copy."
                )

        parts = []

        for page in reader.pages[:MAX_PDF_PAGES]:
            parts.append(page.extract_text() or "")

        return "\n".join(parts)

    except ResumeError:
        raise
    except Exception:
        raise ResumeError("We could not read that PDF file.")


# =========================================================
# DOCX
# =========================================================

_PARA_RE = re.compile(r"<w:p[ >].*?</w:p>", re.S)
_TEXT_RE = re.compile(r"<w:t(?: [^>]*)?>(.*?)</w:t>", re.S)
_BREAK_RE = re.compile(r"<w:(?:br|cr)\s*/>")
_TAB_RE = re.compile(r"<w:tab\s*/>")


def _docx_text(data: bytes) -> str:
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            try:
                info = archive.getinfo("word/document.xml")
            except KeyError:
                raise ResumeError("That is not a valid Word (.docx) file.")

            if info.file_size > MAX_DOCX_XML_BYTES:
                raise ResumeError("That Word file is too large to read.")

            with archive.open(info) as handle:
                xml = handle.read(MAX_DOCX_XML_BYTES + 1).decode(
                    "utf-8", errors="replace"
                )

    except ResumeError:
        raise
    except zipfile.BadZipFile:
        raise ResumeError("That is not a valid Word (.docx) file.")
    except Exception:
        raise ResumeError("We could not read that Word file.")

    lines = []

    for paragraph in _PARA_RE.findall(xml):
        paragraph = _TAB_RE.sub("<w:t> </w:t>", paragraph)
        paragraph = _BREAK_RE.sub("<w:t>\n</w:t>", paragraph)
        text = "".join(_TEXT_RE.findall(paragraph))
        lines.append(unescape(text))

    return "\n".join(lines)


# =========================================================
# PUBLIC
# =========================================================

def extract_resume_text(data: bytes) -> str:
    if not data:
        raise ResumeError("The file is empty.")

    if len(data) > MAX_FILE_BYTES:
        raise ResumeError("The file is too large (maximum 5 MB).")

    if data.startswith(b"%PDF-"):
        raw = _pdf_text(data)
    elif data.startswith(b"PK\x03\x04"):
        raw = _docx_text(data)
    else:
        raise ResumeError("Only PDF or Word (.docx) resumes are allowed.")

    text = _normalize(raw)

    if len(text) < MIN_TEXT_CHARS:
        raise ResumeError(
            "We could not find readable text in that file. If it is a "
            "scanned image, upload a text-based PDF or a Word file."
        )

    return text[:MAX_TEXT_CHARS]


def resume_questions_enabled(record) -> bool:
    """Interviewer's ON/OFF switch. A resume is ON unless switched off."""

    return (record or {}).get("resume_questions") is not False


def resume_text_for(configuration, user) -> str:
    """The stored resume text of this candidate (by invitation e-mail).

    Returns "" when there is no resume OR the interviewer switched
    resume questions OFF for this candidate (the file stays stored).
    """

    if configuration is None or user is None:
        print("RESUME CHECK: no configuration/user -> no resume")
        return ""

    extra = configuration.extra_config or {}

    # Interview-level switch (Interview Controls > Resume questions)
    if extra.get("resume_questions_enabled") is False:
        print("RESUME CHECK: resume questions switched OFF for this interview")
        return ""

    records = extra.get("invitations") or {}
    email = (getattr(user, "email", "") or "").strip().lower()

    record = records.get(email) or {}

    if not record:
        print(
            f"RESUME CHECK: no invitation record for {email!r}. "
            f"Invited e-mails: {list(records.keys())}. "
            "The candidate must log in with the SAME e-mail the resume "
            "was uploaded for."
        )
        return ""

    if not resume_questions_enabled(record):
        print(f"RESUME CHECK: resume switched OFF for {email!r}")
        return ""

    resume = record.get("resume") or {}
    text = str(resume.get("text") or "")

    print(
        f"RESUME CHECK: {email!r} resume found = {bool(text)} "
        f"({len(text)} chars)"
    )

    return text