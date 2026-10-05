from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.database import engine

# =========================================================
# AUTH
# =========================================================

from app.api.auth.auth import router as auth_router
from app.api.auth.google_auth import router as google_auth_router

# =========================================================
# DASHBOARD
# =========================================================

from app import dashboard

# =========================================================
# INTERVIEWS
# =========================================================

from app.api.interviews import router as interview_router
from app.api.interview_configurations import (
    router as interview_configuration_router,
)

# =========================================================
# API MODULES
# =========================================================

from app.api import (
    answers,
    questions,
    reports,
    dialogflow_webhook,
)

# =========================================================
# INTERVIEW MONITORING
# =========================================================

from app.api.interview_monitoring import (
    router as interview_monitoring_router,
)

# =========================================================
# HIRING (candidates, decisions, e-mail)
# =========================================================

from app.api.hiring import router as hiring_router
from app.models.session_review import SessionReview


# =========================================================
# CREATE NEW HIRING TABLE (only if missing)
# =========================================================

try:
    SessionReview.__table__.create(
        bind=engine,
        checkfirst=True,
    )
except Exception as exc:
    print(f"Could not create session_reviews table: {exc}")


# =========================================================
# INDEXES (speed) - safe to run on every start
# =========================================================

_INDEX_SQL = [
    "CREATE INDEX IF NOT EXISTS ix_interviews_created_by "
    "ON interviews (created_by)",
    "CREATE INDEX IF NOT EXISTS ix_sessions_candidate_id "
    "ON sessions (candidate_id)",
    "CREATE INDEX IF NOT EXISTS ix_sessions_interview_id "
    "ON sessions (interview_id)",
    "CREATE INDEX IF NOT EXISTS ix_reports_session_id "
    "ON reports (session_id)",
    "CREATE INDEX IF NOT EXISTS ix_questions_session_id "
    "ON questions (session_id)",
    "CREATE INDEX IF NOT EXISTS ix_answers_session_id "
    "ON answers (session_id)",
]

for _statement in _INDEX_SQL:
    try:
        with engine.begin() as _connection:
            _connection.execute(text(_statement))
    except Exception as exc:
        print(f"Index skipped ({_statement[:45]}...): {exc}")


# =========================================================
# FASTAPI APP
# =========================================================

app = FastAPI(
    title="AI Interview Agent API",
    version="1.0.0",
)


# =========================================================
# CORS
# =========================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# AUTH ROUTES
# =========================================================

app.include_router(auth_router)
app.include_router(google_auth_router)


# =========================================================
# DASHBOARD ROUTES
# =========================================================

app.include_router(
    dashboard.router
)


# =========================================================
# INTERVIEW ROUTES
# =========================================================

app.include_router(
    interview_router
)

app.include_router(
    interview_configuration_router
)


# =========================================================
# INTERVIEW PROCESS ROUTES
# =========================================================

app.include_router(
    answers.router
)

app.include_router(
    questions.router
)

app.include_router(
    reports.router
)


# =========================================================
# DIALOGFLOW ROUTES
# =========================================================

app.include_router(
    dialogflow_webhook.router
)


# =========================================================
# INTERVIEW MONITORING ROUTES
# =========================================================

app.include_router(
    interview_monitoring_router
)


# =========================================================
# HIRING ROUTES
# =========================================================

app.include_router(
    hiring_router
)


# =========================================================
# DEBUG DIALOGFLOW ROUTES
# =========================================================

@app.get("/debug/dialogflow-routes")
def debug_dialogflow_routes():

    routes = []

    for route in app.routes:

        if hasattr(route, "path"):

            if "/dialogflow" in route.path:

                routes.append(
                    {
                        "path": route.path,
                        "methods": list(
                            route.methods or []
                        ),
                    }
                )

    return {
        "dialogflow_routes": routes
    }


# =========================================================
# ROOT
# =========================================================

@app.get("/")
def root():

    return {
        "message": "AI Interview Agent API is running"
    }


# =========================================================
# HEALTH CHECK
# =========================================================

@app.get("/health")
def health():

    return {
        "status": "healthy"
    }


# =========================================================
# DATABASE HEALTH CHECK
# =========================================================

@app.get("/health/database")
def database_health():

    try:

        with engine.connect() as connection:

            connection.execute(
                text("SELECT 1")
            )

        return {
            "status": "healthy",
            "database": "connected",
        }

    except Exception as e:

        return {
            "status": "unhealthy",
            "database": "disconnected",
            "error": str(e),
        }