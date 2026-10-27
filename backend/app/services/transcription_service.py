"""Speech-to-text for interview answers (server side).

The browser's built-in speech recognition drops words, stops after short
silences and mishears technical terms. Instead the browser records the
whole answer as audio and this service transcribes the complete
recording, word for word.
"""

import logging
import os
import tempfile
from pathlib import Path

from app.services.transcript_normalizer import normalize_transcript

logger = logging.getLogger(__name__)

MAX_AUDIO_BYTES = 24 * 1024 * 1024  # OpenAI limit is 25 MB
MIN_AUDIO_BYTES = 1200

PRIMARY_MODEL = os.getenv("OPENAI_TRANSCRIBE_MODEL", "gpt-4o-transcribe")
FALLBACK_MODEL = "whisper-1"

# Shown to the model as "what the speaker said before". It biases the
# spelling of technical words and keeps filler words / every word.
TRANSCRIBE_PROMPT = (
    "Interview answer by an Indian-English speaker. Transcribe every spoken "
    "word exactly as said, including um, uh, repeated words and false "
    "starts. Do not summarise, translate or correct grammar. Spelled-out "
    "letters are acronyms: J S O N is JSON, S Q L is SQL, A P I is API, "
    "K P I is KPI, E T L is ETL. Technical terms: JSON, SQL, API, KPI, "
    "ETL, CSV, Python, pandas, NumPy, Excel, Power BI, Tableau, MySQL, "
    "PostgreSQL, MongoDB, React, FastAPI, JavaScript, machine learning, "
    "data cleaning, outliers, null values, dashboard, stakeholders."
)

_ALLOWED_SUFFIX = {
    "audio/webm": ".webm",
    "video/webm": ".webm",
    "audio/ogg": ".ogg",
    "audio/mp4": ".mp4",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/x-m4a": ".m4a",
}


class _LazyOpenAI:
    _inst = None

    def __getattr__(self, name):
        if _LazyOpenAI._inst is None:
            key = os.getenv("OPENAI_API_KEY")
            if not key:
                raise RuntimeError("OPENAI_API_KEY is not configured.")
            from openai import OpenAI

            _LazyOpenAI._inst = OpenAI(api_key=key)
        return getattr(_LazyOpenAI._inst, name)


client = _LazyOpenAI()


def audio_suffix(content_type: str | None, filename: str | None) -> str:
    base = (content_type or "").split(";")[0].strip().lower()
    if base in _ALLOWED_SUFFIX:
        return _ALLOWED_SUFFIX[base]
    suffix = Path(filename or "").suffix.lower()
    if suffix in {".webm", ".ogg", ".mp4", ".mp3", ".wav", ".m4a"}:
        return suffix
    return ".webm"


def _transcribe_with(model: str, path: str) -> str:
    kwargs = {
        "model": model,
        "language": "en",
        "temperature": 0,
        "prompt": TRANSCRIBE_PROMPT,
    }

    with open(path, "rb") as audio_file:
        result = client.audio.transcriptions.create(file=audio_file, **kwargs)

    return (getattr(result, "text", "") or "").strip()


def transcribe_answer_audio(
    audio_bytes: bytes, content_type: str | None, filename: str | None
) -> str:
    """Return the full, cleaned transcript of one recorded answer."""
    if len(audio_bytes) < MIN_AUDIO_BYTES:
        return ""

    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "answer" + audio_suffix(content_type, filename))
        with open(path, "wb") as handle:
            handle.write(audio_bytes)

        try:
            text = _transcribe_with(PRIMARY_MODEL, path)
        except Exception:
            logger.exception(
                "Transcription with %s failed, retrying with %s",
                PRIMARY_MODEL,
                FALLBACK_MODEL,
            )
            text = _transcribe_with(FALLBACK_MODEL, path)

    return normalize_transcript(text)
