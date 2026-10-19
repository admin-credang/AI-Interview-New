"""
FEATURE MODULES
===============

Every optional feature of the platform is a *module* with its own
ON / OFF switch, saved per interview (Client Settings -> Modules).

* Turning a module OFF never breaks the rest of the app: the feature is
  simply skipped and the interview still works.
* A child module (e.g. "PDF attached to the report mail") is only active
  while its parent is ON.
* The CORE of the interview (questions, answers, scoring, sessions) is not
  a module - it cannot be switched off.

Where the value is stored
-------------------------
* New modules   -> extra_config["features"][key]
* Older switches (follow-ups, resume questions, monitoring, face / eye /
  phone) keep their old place in extra_config so nothing that already
  exists changes; this file only gives them one common interface.

Adding a new module later = add ONE entry to FEATURES below, then call
`is_on(configuration, "your_key")` where the feature runs.
"""

from __future__ import annotations

from typing import Any


# ---------------------------------------------------------
# CATALOG  (order = order shown in the UI)
# key, label, description, group, parent, default
# ---------------------------------------------------------

# how many compulsory questions a client may add
MAX_COMPULSORY_QUESTIONS = 5
MAX_COMPULSORY_LENGTH = 500

GROUPS = [
    ("email", "E-mails"),
    ("access", "Candidate access"),
    ("interview", "Interview"),
    ("monitoring", "Monitoring"),
    ("candidates", "Candidate management"),
]

FEATURES: list[dict[str, Any]] = [
    # ---- e-mails ----
    dict(key="email_invite", group="email", default=True, parent=None,
         label="Invitation e-mail",
         description="E-mail the interview link and ID to the candidate. "
                     "OFF = no mail is sent; copy the link and share it yourself."),
    dict(key="email_decision", group="email", default=True, parent=None,
         label="Selected / rejected e-mail",
         description="Mail to the candidate when you select or reject them."),
    dict(key="email_decision_feedback", group="email", default=True,
         parent="email_decision",
         label="Feedback inside that e-mail",
         description="Strengths, weak points and how to improve."),
    dict(key="email_report", group="email", default=True, parent=None,
         label="Report e-mail to interviewer",
         description="Mail to the interviewer when a candidate finishes or is stopped."),
    dict(key="email_report_pdf", group="email", default=True,
         parent="email_report",
         label="PDF attached to the report mail",
         description="Full PDF report attached to the interviewer's mail."),

    # ---- access ----
    dict(key="passwordless_link", group="access", default=True, parent=None,
         label="Open from e-mail without login",
         description="The e-mail button opens the interview directly. "
                     "OFF = the candidate must log in or register first."),

    # ---- interview (order = order of the interview) ----
    # company intro -> resume questions -> follow-ups -> compulsory questions
    dict(key="company_intro", group="interview", default=True, parent=None,
         label="Company introduction",
         description="The AI speaks the approved company introduction first."),
    dict(key="compulsory_questions", group="interview", default=True,
         parent=None, label="Compulsory questions",
         description="Add up to 5 fixed questions of your own. Every candidate is asked the same questions, word for word, at the end of the interview, so answers are easy to compare. These are not AI-generated - ideal for notice period, expected salary, location or availability."),
    dict(key="resume_questions", group="interview", default=True, parent=None,
         label="Resume questions", legacy=True,
         description="ON = candidates who have a resume get 2 extra interview "
                     "questions taken from that resume. OFF = no resume "
                     "questions for anyone."),
    dict(key="follow_ups", group="interview", default=True, parent=None,
         label="Follow-up questions", legacy=True,
         description="The AI may ask a follow-up after some answers."),

    # ---- monitoring ----
    # ONE switch. ON = camera + face + eye / gaze + phone detection all run
    # and the gaze report is part of the candidate report. There are no
    # separate switches for them.
    dict(key="monitoring", group="monitoring", default=False, parent=None,
         label="Cheating detection", legacy=True,
         description="AI proctoring for the whole interview. The camera starts automatically and the candidate cannot turn it off. It detects cheating signs: no face or more than one face, eyes looking away from the screen, and mobile phone use. Findings appear in the gaze report in each candidate's results."),

    # ---- candidate management ----
    dict(key="custom_interviewer", group="candidates", default=True,
         parent=None, label="Interviewer name & email",
         description="Use the interviewer name / email you set here in mails "
                     "(OFF = the account that created the interview)."),
]

BY_KEY = {f["key"]: f for f in FEATURES}


def catalog() -> list[dict]:
    """What the UI needs to draw the Modules panel."""

    return [
        {
            "key": f["key"],
            "label": f["label"],
            "description": f["description"],
            "group": f["group"],
            "parent": f["parent"],
            "default": f["default"],
        }
        for f in FEATURES
    ]


def groups() -> list[dict]:
    return [{"key": k, "label": label} for k, label in GROUPS]


# ---------------------------------------------------------
# READ
# ---------------------------------------------------------

def _extra(configuration) -> dict:
    return (
        (configuration.extra_config or {}) if configuration is not None else {}
    )


def _stored(extra: dict, key: str) -> bool:
    """The switch itself, ignoring the parent."""

    spec = BY_KEY[key]

    if key == "follow_ups":
        return bool((extra.get("follow_ups") or {}).get("enabled", True))

    if key == "resume_questions":
        return extra.get("resume_questions_enabled") is not False

    if key == "monitoring":
        raw = extra.get("proctoring") or {}
        return bool(raw.get("enabled", spec["default"]))

    saved = (extra.get("features") or {}).get(key)

    return spec["default"] if saved is None else bool(saved)


def resolve(configuration) -> dict[str, dict[str, bool]]:
    """
    key -> {"on": the switch, "active": really running (parent is ON too)}
    """

    extra = _extra(configuration)

    result: dict[str, dict[str, bool]] = {}

    for spec in FEATURES:
        key = spec["key"]
        on = _stored(extra, key)
        parent = spec["parent"]
        parent_active = result[parent]["active"] if parent else True
        result[key] = {"on": on, "active": on and parent_active}

    return result


def is_on(configuration, key: str) -> bool:
    """True when the module is switched on AND its parent is on."""

    if key not in BY_KEY:
        return True  # unknown key: never block anything by accident

    return resolve(configuration)[key]["active"]


def simple(configuration) -> dict[str, bool]:
    """key -> active (what candidate-facing pages receive)."""

    return {k: v["active"] for k, v in resolve(configuration).items()}


# ---------------------------------------------------------
# WRITE
# ---------------------------------------------------------

def apply(extra: dict, changes: dict[str, bool]) -> dict:
    """Return a copy of `extra` with the switches changed."""

    extra = dict(extra or {})

    for key, value in (changes or {}).items():

        if key not in BY_KEY:
            continue

        value = bool(value)

        if key == "follow_ups":
            raw = dict(extra.get("follow_ups") or {})
            raw["enabled"] = value
            raw.setdefault("count", 2)
            extra["follow_ups"] = raw

        elif key == "resume_questions":
            extra["resume_questions_enabled"] = value

        elif key == "monitoring":
            # ONE switch: face, eye / gaze and phone detection follow it
            extra["proctoring"] = monitoring_flags(value)

        else:
            saved = dict(extra.get("features") or {})
            saved[key] = value
            extra["features"] = saved

    return extra


# ---------------------------------------------------------
# MONITORING  (one switch -> face + eye / gaze + phone)
# ---------------------------------------------------------

def monitoring_flags(enabled: bool) -> dict[str, bool]:
    """Everything monitoring does is ON or OFF together."""

    enabled = bool(enabled)

    return {
        "enabled": enabled,
        "face": enabled,
        "eye": enabled,
        "phone": enabled,
    }


def monitoring_policy(configuration) -> dict[str, bool]:
    """What the interview and the reports use. Old interviews that saved
    face / eye / phone separately now follow the main switch too."""

    raw = _extra(configuration).get("proctoring") or {}

    return monitoring_flags(raw.get("enabled", False))


# ---------------------------------------------------------
# COMPULSORY QUESTIONS  (asked to every candidate, at the END)
# ---------------------------------------------------------

def clean_compulsory(raw) -> list[str]:
    """Trim, drop empty / duplicate lines, keep at most 5 questions."""

    seen: set[str] = set()
    out: list[str] = []

    for item in raw or []:
        text = " ".join(str(item or "").split())[:MAX_COMPULSORY_LENGTH]

        if not text or text.lower() in seen:
            continue

        seen.add(text.lower())
        out.append(text)

    return out[:MAX_COMPULSORY_QUESTIONS]


def compulsory_questions(configuration) -> list[str]:
    """The compulsory questions that really run (module ON + questions)."""

    if not is_on(configuration, "compulsory_questions"):
        return []

    return clean_compulsory(_extra(configuration).get("compulsory_questions"))
