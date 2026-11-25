"""Speech-to-text for interview answers (server side).

The browser's built-in speech recognition drops words, stops after short
silences and mishears technical terms. Instead the browser records the
whole answer as audio and this service transcribes the complete
recording, word for word.
"""

import logging
import os
import tempfile
import time
from pathlib import Path

from app.config import settings
from app.services.transcript_normalizer import (
    is_degenerate_transcript,
    normalize_transcript,
)

logger = logging.getLogger(__name__)

MAX_AUDIO_BYTES = 24 * 1024 * 1024  # OpenAI limit is 25 MB
MIN_AUDIO_BYTES = 1200

# gpt-4o-mini-transcribe is the fastest accurate model; set
# OPENAI_TRANSCRIBE_MODEL=gpt-4o-transcribe for the larger one.
PRIMARY_MODEL = os.getenv("OPENAI_TRANSCRIBE_MODEL", "gpt-4o-mini-transcribe")
FALLBACK_MODEL = "whisper-1"

# Shown to the model as "what the speaker said before". It biases the
# spelling of technical words and keeps filler words / every word.
TRANSCRIBE_PROMPT = (
    "Interview answer by an Indian-English speaker about data science, "
    "machine learning, Python and SQL. Spelled-out letters are acronyms: "
    "J S O N is JSON, S Q L is SQL, A P I is API, K P I is KPI, E T L is "
    "ETL. Technical terms: JSON, SQL, API, KPI, ETL, CSV, Python, pandas, "
    "NumPy, Excel, Power BI, Tableau, MySQL, PostgreSQL, MongoDB, React, "
    "FastAPI, JavaScript, machine learning, deep learning, data cleaning, "
    "outliers, null values, overfitting, dashboard, stakeholders."
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
            key = (settings.openai_api_key or os.getenv("OPENAI_API_KEY") or "").strip()
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


def _transcribe_with(
    model: str, path: str, *, temperature: float = 0.0, use_prompt: bool = True
) -> str:
    kwargs = {
        "model": model,
        "language": "en",
        "temperature": temperature,
    }
    if use_prompt:
        kwargs["prompt"] = TRANSCRIBE_PROMPT

    with open(path, "rb") as audio_file:
        result = client.audio.transcriptions.create(file=audio_file, **kwargs)

    return (getattr(result, "text", "") or "").strip()


def _word_count(text: str) -> int:
    return len((text or "").split())


def _best_transcript(path: str) -> str:
    """Try several models/settings; never accept a looping transcript."""
    attempts = [
        (PRIMARY_MODEL, {"temperature": 0.0, "use_prompt": True}),
        ("gpt-4o-transcribe", {"temperature": 0.0, "use_prompt": False}),
        (FALLBACK_MODEL, {"temperature": 0.2, "use_prompt": False}),
        (FALLBACK_MODEL, {"temperature": 0.4, "use_prompt": True}),
    ]
    candidates: list[str] = []
    any_succeeded = False
    empty_results = 0

    for model, opts in attempts:
        try:
            text = _transcribe_with(model, path, **opts)
        except Exception:
            logger.exception("Transcription with %s %s failed", model, opts)
            continue

        any_succeeded = True
        if not text:
            empty_results += 1
            if empty_results >= 2:
                break  # two models heard nothing: it is silence
            continue
        if is_degenerate_transcript(text):
            logger.warning(
                "Degenerate (looping) transcript from %s %s; retrying",
                model,
                opts,
            )
            candidates.append(text)
            continue
        return text

    if candidates:
        # every attempt looped: return the cleaned version of the longest
        return max(candidates, key=_word_count)

    if any_succeeded:
        return ""  # genuine silence / no speech

    raise RuntimeError("All transcription attempts failed")


def transcribe_answer_audio(
    audio_bytes: bytes, content_type: str | None, filename: str | None
) -> str:
    """Return the full, cleaned transcript of one recorded answer."""
    if len(audio_bytes) < MIN_AUDIO_BYTES:
        return ""

    started = time.perf_counter()

    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "answer" + audio_suffix(content_type, filename))
        with open(path, "wb") as handle:
            handle.write(audio_bytes)

        text = _best_transcript(path)

    logger.info(
        "Transcribed %d KB in %.1fs",
        len(audio_bytes) // 1024,
        time.perf_counter() - started,
    )

    return normalize_transcript(text)
