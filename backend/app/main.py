from fastapi import FastAPI
from sqlalchemy import text
from app.api.auth.auth import router as auth_router
from app.database import engine
from app.api.interviews import router as interview_router
from app.api.auth.google_auth import router as google_auth_router
from app.api.interview_configurations import (
    router as interview_configuration_router
)
from app.api import answers
from app.api import questions
from app.api import reports
from app.api import dialogflow_webhook
app = FastAPI(
    title="AI Interview Agent API",
    version="1.0.0"
)
app.include_router(auth_router)
app.include_router(google_auth_router)
app.include_router(interview_router)
app.include_router(interview_configuration_router)
app.include_router(answers.router)
app.include_router(questions.router)
app.include_router(reports.router)
app.include_router(dialogflow_webhook.router)
@app.get("/")
def root():
    return {
        "message": "AI Interview Agent API is running"
    }


@app.get("/health")
def health():
    return {
        "status": "healthy"
    }


@app.get("/health/database")
def database_health():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))

        return {
            "status": "healthy",
            "database": "connected"
        }

    except Exception as e:
        return {
            "status": "unhealthy",
            "database": "disconnected",
            "error": str(e)
        }