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

GROUPS = [
    ("email", "E-mails"),
    ("access", "Candidate access"),
    ("interview", "Interview"),
    ("monitoring", "Monitoring"),
    ("reports", "Reports"),
    ("candidates", "Candidate management"),
]

FEATURES: list[dict[str, Any]] = [
    # ---- e-mails ----
    dict(key="email_invite", group="email", default=True, parent=None,
         label="Invitation e-mail",
         description="E-mail the interview link and ID to the candidate. "
                     "OFF = no mail is sent; copy the link and share it yourself."),
    dict(key="email_ack", group="email", default=True, parent=None,
         label="Submitted e-mail",
         description="\"Thank you, we received your interview\" mail to the candidate."),
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

    # ---- interview ----
    dict(key="follow_ups", group="interview", default=True, parent=None,
         label="Follow-up questions", legacy=True,
         description="The AI may ask a follow-up after some answers."),
    dict(key="resume_questions", group="interview", default=True, parent=None,
         label="Resume questions", legacy=True,
         description="2 extra questions taken from the candidate's resume."),
    dict(key="company_intro", group="interview", default=True, parent=None,
         label="Company introduction",
         description="The AI speaks the approved company introduction first."),
    dict(key="job_details", group="interview", default=True, parent=None,
         label="Job details for candidate",
         description="Show role, location, skills etc. before the interview."),

    # ---- monitoring ----
    dict(key="monitoring", group="monitoring", default=False, parent=None,
         label="Camera monitoring", legacy=True,
         description="Camera turns on automatically and cannot be switched off."),
    dict(key="face_detection", group="monitoring", default=True,
         parent="monitoring", label="Face detection", legacy=True,
         description="Ends the interview if no face / more than one face."),
    dict(key="eye_gaze", group="monitoring", default=True,
         parent="face_detection", label="Eye / gaze detection", legacy=True,
         description="Watches closed eyes and looking away."),
    dict(key="phone_detection", group="monitoring", default=True,
         parent="monitoring", label="Phone detection", legacy=True,
         description="Ends the interview if a phone stays in view."),

    # ---- reports ----
    dict(key="gaze_report", group="reports", default=True, parent=None,
         label="Eye / gaze report",
         description="Show the per-question gaze report on the candidate page."),

    # ---- candidate management ----
    dict(key="cv_upload", group="candidates", default=True, parent=None,
         label="CV upload",
         description="Upload a CV / resume when adding a candidate."),
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

    if key in ("monitoring", "face_detection", "eye_gaze", "phone_detection"):
        raw = extra.get("proctoring") or {}
        field = {
            "monitoring": "enabled",
            "face_detection": "face",
            "eye_gaze": "eye",
            "phone_detection": "phone",
        }[key]
        # same defaults the interview itself uses when a key is missing
        fallback = (
            spec["default"]
            if not raw
            else {"enabled": False, "face": True, "eye": True, "phone": False}[field]
        )
        return bool(raw.get(field, fallback))

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

        elif key in ("monitoring", "face_detection", "eye_gaze",
                     "phone_detection"):
            raw = dict(extra.get("proctoring") or {})
            raw.setdefault("enabled", False)
            raw.setdefault("face", True)
            raw.setdefault("eye", True)
            raw.setdefault("phone", True)

            field = {
                "monitoring": "enabled",
                "face_detection": "face",
                "eye_gaze": "eye",
                "phone_detection": "phone",
            }[key]
            raw[field] = value
            extra["proctoring"] = raw

        else:
            saved = dict(extra.get("features") or {})
            saved[key] = value
            extra["features"] = saved

    return extra
