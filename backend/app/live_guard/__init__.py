"""Live Interview Guard - a separate, self-contained feature.

AI watch-guard for live interviews on Google Meet / Zoom / Microsoft Teams:
automatic Google Meet + invites, candidate check page, gaze calibration /
attention checks and an automatically saved PDF report.

Everything lives in this folder and uses its own tables
(live_guard_interviews, live_guard_google_accounts). The only change outside
this folder is two lines in app/main.py:

    from app.live_guard import register_live_guard
    register_live_guard(app)

Remove those two lines and this folder to take the feature out again.
"""

from fastapi import FastAPI

from .api import router


def register_live_guard(app: FastAPI) -> None:
    app.include_router(router)


__all__ = ["register_live_guard", "router"]
