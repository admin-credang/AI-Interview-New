"""
GAZE ANALYSIS (interviewer-only)

Turns the raw per-question numbers measured in the candidate's browser
into the "Eye Movement Detection (AI-Assisted Answer Check)" report.

IMPORTANT
    These are INDICATORS from a webcam, not proof. Lighting, glasses,
    camera height and habits change the numbers. The report must always
    be reviewed by a person before any decision is made.

All thresholds are constants below, so they can be tuned without
touching the logic.  Make the "...FOR_MAX" numbers SMALLER to make the
report more sensitive, LARGER to make it more relaxed.
"""

# ---------------------------------------------------------
# THRESHOLDS
# ---------------------------------------------------------

MIN_ANSWER_MS = 3000          # shorter answers are not assessed

# a question counts as "reading" when this many slow sweeps
# followed by a quick return were seen while answering
READING_SWEEPS_FOR_FLAG = 2

# ---- per-question AI-answer risk points (add up to 100+) ----
POINTS_READING_FLAG = 40
POINTS_READING_PARTIAL = 25   # x reading score (0..1) when not flagged
POINTS_OFFSCREEN_MAX = 40     # share of the answer spent off screen
POINTS_GLANCES_MAX = 25       # glances per minute
POINTS_DIRECTION_MAX = 10     # time looking sideways / down
POINTS_PHONE_MAX = 50         # phone seen by the camera

OFFSCREEN_SHARE_FOR_MAX = 0.40   # 40% off screen = full points
GLANCES_PER_MIN_FOR_MAX = 4      # 4 glances a minute = full points
DIRECTION_SHARE_FOR_MAX = 0.30
PHONE_MS_FOR_MAX = 2000          # phone visible 2 s = full points

# risk levels
RISK_HIGH_AT = 50
RISK_MEDIUM_AT = 25

# second-screen risk (overall, 0..100)
SECOND_SCREEN_MEDIUM_AT = 30
SECOND_SCREEN_HIGH_AT = 60


def _level(points: float) -> str:
    if points >= RISK_HIGH_AT:
        return "HIGH"
    if points >= RISK_MEDIUM_AT:
        return "MEDIUM"
    return "LOW"


def _clamp(value, low, high):
    return max(low, min(high, value))


def _int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


# ---------------------------------------------------------
# ONE QUESTION
# ---------------------------------------------------------

def analyse_question(raw: dict) -> dict:

    answer_ms = max(0, _int(raw.get("answer_ms")))
    on_ms = _clamp(_int(raw.get("on_screen_ms")), 0, answer_ms)
    side_ms = _clamp(_int(raw.get("side_ms")), 0, answer_ms)
    down_ms = _clamp(_int(raw.get("down_ms")), 0, answer_ms)
    phone_ms = _clamp(_int(raw.get("phone_ms")), 0, answer_ms)
    glances = max(0, _int(raw.get("glances")))
    sweeps = max(0, _int(raw.get("sweeps")))

    base = {
        "question": _int(raw.get("question")),
        "answer_seconds": round(answer_ms / 1000, 1),
        "glances": glances,
        "sweeps": sweeps,
    }

    hidden = {
        "_answer_ms": answer_ms,
        "_on_ms": on_ms,
        "_side_ms": side_ms,
        "_down_ms": down_ms,
        "_phone_ms": phone_ms,
    }

    if answer_ms < MIN_ANSWER_MS:
        return {
            **base,
            "assessed": False,
            "gaze_pct": None,
            "reading": False,
            "reading_score": 0,
            "points": 0,
            "risk": "LOW",
            "observation": (
                "Answer too short to assess "
                f"({round(answer_ms / 1000)}s)."
            ),
            **hidden,
        }

    minutes = answer_ms / 60000
    gaze_ratio = on_ms / answer_ms
    off_ratio = 1 - gaze_ratio
    side_ratio = side_ms / answer_ms
    down_ratio = down_ms / answer_ms
    glances_per_min = glances / minutes if minutes > 0 else 0

    reading_score = _clamp(
        sweeps / (READING_SWEEPS_FOR_FLAG + 1), 0, 1
    )
    reading = sweeps >= READING_SWEEPS_FOR_FLAG

    points = 0.0

    points += (
        POINTS_READING_FLAG
        if reading
        else POINTS_READING_PARTIAL * reading_score
    )
    points += POINTS_OFFSCREEN_MAX * _clamp(
        off_ratio / OFFSCREEN_SHARE_FOR_MAX, 0, 1
    )
    points += POINTS_GLANCES_MAX * _clamp(
        glances_per_min / GLANCES_PER_MIN_FOR_MAX, 0, 1
    )
    points += POINTS_DIRECTION_MAX * _clamp(
        (side_ratio + down_ratio) / DIRECTION_SHARE_FOR_MAX, 0, 1
    )
    points += POINTS_PHONE_MAX * _clamp(
        phone_ms / PHONE_MS_FOR_MAX, 0, 1
    )

    points = min(100, round(points))

    # ---- plain-language observation ----
    notes = []

    if phone_ms >= 1000:
        notes.append(
            f"A phone was visible to the camera for "
            f"{round(phone_ms / 1000)}s"
        )

    if reading:
        notes.append(
            f"Slow side-to-side eye sweeps followed by a quick return "
            f"({sweeps}x), a reading-like pattern"
        )
    elif sweeps == 1:
        notes.append("One reading-like eye sweep seen")

    if glances:
        where = []
        if side_ratio >= 0.05:
            where.append(f"sideways {round(side_ratio * 100)}% of the time")
        if down_ratio >= 0.05:
            where.append(f"downwards {round(down_ratio * 100)}% of the time")
        extra = f" ({', '.join(where)})" if where else ""
        notes.append(
            f"Looked off-screen {glances} time(s){extra}"
        )

    if off_ratio >= 0.25:
        notes.append(
            f"Looked away from the screen for {round(off_ratio * 100)}% "
            f"of the answer, possible use of another device or notes"
        )

    if not notes:
        notes.append("Eyes stayed on the screen; no reading pattern seen")

    return {
        **base,
        "assessed": True,
        "gaze_pct": round(gaze_ratio * 100),
        "reading": reading,
        "reading_score": round(reading_score, 2),
        "points": points,
        "risk": _level(points),
        "observation": ". ".join(notes) + ".",
        **hidden,
    }


# ---------------------------------------------------------
# WHOLE INTERVIEW
# ---------------------------------------------------------

def _public(rows):
    return [
        {k: v for k, v in r.items() if not k.startswith("_")}
        for r in rows
    ]


def build_gaze_report(raw_items) -> dict | None:
    """
    raw_items: review.gaze_metrics (list of dicts) or None.
    Returns None when nothing was measured (monitoring off,
    older interviews), so the UI / PDF can skip the section.
    """

    if not raw_items:
        return None

    rows = [
        analyse_question(item)
        for item in raw_items
        if isinstance(item, dict)
    ]

    rows.sort(key=lambda r: r["question"])

    assessed = [r for r in rows if r["assessed"]]

    if not assessed:
        return {
            "available": True,
            "assessed_questions": 0,
            "total_questions": len(rows),
            "questions": _public(rows),
            "summary": None,
        }

    total_ms = sum(r["_answer_ms"] for r in assessed)
    on_ms = sum(r["_on_ms"] for r in assessed)
    side_ms = sum(r["_side_ms"] for r in assessed)
    down_ms = sum(r["_down_ms"] for r in assessed)
    phone_ms = sum(r["_phone_ms"] for r in assessed)
    glances = sum(r["glances"] for r in assessed)

    gaze_pct = round(on_ms / total_ms * 100)

    off_ratio = 1 - on_ms / total_ms
    glances_per_min = glances / (total_ms / 60000)
    direction_ratio = (side_ms + down_ms) / total_ms

    second_screen = round(
        _clamp(
            100
            * (
                0.45 * _clamp(off_ratio / OFFSCREEN_SHARE_FOR_MAX, 0, 1)
                + 0.25 * _clamp(glances_per_min / GLANCES_PER_MIN_FOR_MAX, 0, 1)
                + 0.10 * _clamp(direction_ratio / DIRECTION_SHARE_FOR_MAX, 0, 1)
                + 0.20 * _clamp(phone_ms / (PHONE_MS_FOR_MAX * 1.5), 0, 1)
            ),
            0,
            100,
        )
    )

    if second_screen >= SECOND_SCREEN_HIGH_AT:
        second_label = "High"
    elif second_screen >= SECOND_SCREEN_MEDIUM_AT:
        second_label = "Medium"
    else:
        second_label = "Low"

    flagged = [r["question"] for r in assessed if r["reading"]]
    high = [r["question"] for r in assessed if r["risk"] == "HIGH"]
    medium = [r["question"] for r in assessed if r["risk"] == "MEDIUM"]

    avg_points = sum(r["points"] for r in assessed) / len(assessed)

    if len(high) >= 2 or avg_points >= RISK_HIGH_AT:
        overall = "HIGH"
    elif high or len(medium) >= 2 or avg_points >= RISK_MEDIUM_AT:
        overall = "MEDIUM"
    else:
        overall = "LOW"

    review_list = high or medium

    def _qs(items):
        return ", ".join(f"Q{n}" for n in items)

    return {
        "available": True,
        "assessed_questions": len(assessed),
        "total_questions": len(rows),
        "questions": _public(rows),
        "summary": {
            "gaze_pct": gaze_pct,
            "glances": glances,
            "reading_flagged": len(flagged),
            "reading_total": len(assessed),
            "reading_note": (
                f"Answer flagged ({_qs(flagged)})"
                if flagged
                else "No answer flagged"
            ),
            "second_screen_pct": second_screen,
            "second_screen_label": second_label,
            "ai_answer_risk": overall,
            "ai_answer_note": (
                f"Review {_qs(review_list)}"
                if review_list
                else "No concerns"
            ),
        },
    }
