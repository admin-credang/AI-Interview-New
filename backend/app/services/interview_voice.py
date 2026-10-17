DEFAULT_VOICE = "en-IN-Chirp3-HD-Kore"

VOICE_LANGUAGE_CODES = {
    "en-IN-Chirp3-HD-Kore": "en-IN",
    "en-IN-Chirp3-HD-Puck": "en-IN",
    "en-IN-Chirp3-HD-Leda": "en-IN",
    "en-IN-Chirp3-HD-Charon": "en-IN",
    "en-IN-Chirp3-HD-Orus": "en-IN",
    "en-US-Chirp3-HD-Aoede": "en-US",
    "en-US-Chirp3-HD-Achird": "en-US",
}

ALLOWED_VOICES = frozenset(VOICE_LANGUAGE_CODES)


def get_voice_language_code(voice_name: str) -> str:
    return VOICE_LANGUAGE_CODES[voice_name]


def normalize_voice_config(extra_config: dict | None) -> dict:
    extra = dict(extra_config or {})
    voice_name = extra.get("voice_name", DEFAULT_VOICE)

    if not isinstance(voice_name, str) or voice_name not in ALLOWED_VOICES:
        raise ValueError("Invalid interviewer voice selection")

    extra["voice_name"] = voice_name
    return extra
