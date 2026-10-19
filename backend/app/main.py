
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.database import engine
from app.config import settings

# =========================================================
# AUTH
# =========================================================

from app.api.auth.auth import router as auth_router
from app.api.auth.google_auth import router as google_auth_router
from app.api.google_oauth import router as gmail_oauth_router

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
# HIRING
# =========================================================

from app.api.hiring import router as hiring_router
from app.api.company_intro import router as company_intro_router
from app.api.candidate_resume import router as candidate_resume_router

from app.models.session_review import SessionReview


# =========================================================
# DATABASE COMPATIBILITY SETUP
# =========================================================

def initialize_database_compatibility():
    """
    Run compatibility changes when the application starts.

    For production, prefer running schema migrations separately.
    These operations may run again when a serverless instance starts.
    """

    # Create session_reviews table if it does not exist.
    try:
        SessionReview.__table__.create(
            bind=engine,
            checkfirst=True,
        )
    except Exception as exc:
        print(f"Could not create session_reviews table: {exc}")

    # Add gaze_metrics column if missing.
    try:
        with engine.begin() as connection:
            connection.execute(
                text(
                    "ALTER TABLE session_reviews "
                    "ADD COLUMN IF NOT EXISTS gaze_metrics JSON"
                )
            )
    except Exception as exc:
        print(f"gaze_metrics column skipped: {exc}")

    # Add Gmail OAuth columns if missing.
    gmail_statements = [
        """
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS gmail_email VARCHAR(255)
        """,
        """
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS gmail_refresh_token_enc TEXT
        """,
    ]

    for statement in gmail_statements:
        try:
            with engine.begin() as connection:
                connection.execute(text(statement))
        except Exception as exc:
            print(f"Gmail column setup skipped: {exc}")

    # Create indexes if they do not exist.
    index_statements = [
        """
        CREATE INDEX IF NOT EXISTS ix_interviews_created_by
        ON interviews (created_by)
        """,
        """
        CREATE INDEX IF NOT EXISTS ix_sessions_candidate_id
        ON sessions (candidate_id)
        """,
        """
        CREATE INDEX IF NOT EXISTS ix_sessions_interview_id
        ON sessions (interview_id)
        """,
        """
        CREATE INDEX IF NOT EXISTS ix_reports_session_id
        ON reports (session_id)
        """,
        """
        CREATE INDEX IF NOT EXISTS ix_questions_session_id
        ON questions (session_id)
        """,
        """
        CREATE INDEX IF NOT EXISTS ix_answers_session_id
        ON answers (session_id)
        """,
    ]

    for statement in index_statements:
        try:
            with engine.begin() as connection:
                connection.execute(text(statement))
        except Exception as exc:
            print(f"Index setup skipped: {exc}")


# =========================================================
# APPLICATION LIFESPAN
# =========================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    # Keep this only if the application needs these compatibility changes.
    initialize_database_compatibility()

    yield

    # Shutdown
    # Do not dispose the shared engine here unless your deployment
    # architecture specifically requires it.


# =========================================================
# FASTAPI APP
# =========================================================

app = FastAPI(
    title="AI Interview Agent API",
    version="1.0.0",
    lifespan=lifespan,
)


# =========================================================
# CORS
# =========================================================

frontend_url = (
    getattr(settings, "frontend_url", "") or ""
).strip().rstrip("/")

configured_origins = (
    getattr(settings, "cors_origins", "") or ""
)

allowed_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

if frontend_url:
    allowed_origins.append(frontend_url)

allowed_origins.extend(
    origin.strip().rstrip("/")
    for origin in configured_origins.split(",")
    if origin.strip()
)

# Remove duplicates while preserving order.
allowed_origins = list(dict.fromkeys(allowed_origins))

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=(
        r"^https?://("
        r"localhost"
        r"|127\.0\.0\.1"
        r"|10(?:\.\d{1,3}){3}"
        r"|192\.168(?:\.\d{1,3}){2}"
        r"|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}"
        r")(:\d+)?$"
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# AUTH ROUTES
# =========================================================

app.include_router(auth_router)
app.include_router(google_auth_router)
app.include_router(gmail_oauth_router)


# =========================================================
# DASHBOARD ROUTES
# =========================================================

app.include_router(dashboard.router)


# =========================================================
# INTERVIEW ROUTES
# =========================================================

app.include_router(interview_router)
app.include_router(interview_configuration_router)
app.include_router(company_intro_router)


# =========================================================
# INTERVIEW PROCESS ROUTES
# =========================================================

app.include_router(answers.router)
app.include_router(questions.router)
app.include_router(reports.router)


# =========================================================
# DIALOGFLOW ROUTES
# =========================================================

app.include_router(dialogflow_webhook.router)


# =========================================================
# INTERVIEW MONITORING ROUTES
# =========================================================

app.include_router(interview_monitoring_router)


# =========================================================
# HIRING ROUTES
# =========================================================

app.include_router(hiring_router)
app.include_router(candidate_resume_router)


# =========================================================
# DEBUG DIALOGFLOW ROUTES
# =========================================================

@app.get("/debug/dialogflow-routes")
def debug_dialogflow_routes():
    routes = []

    for route in app.routes:
        if hasattr(route, "path") and "/dialogflow" in route.path:
            routes.append(
                {
                    "path": route.path,
                    "methods": list(route.methods or []),
                }
            )

    return {"dialogflow_routes": routes}


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
            connection.execute(text("SELECT 1"))

        return {
            "status": "healthy",
            "database": "connected",
        }

    except Exception:
        # Do not expose database credentials or internal errors publicly.
        return {
            "status": "unhealthy",
            "database": "disconnected",
        }
