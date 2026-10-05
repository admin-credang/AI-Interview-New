from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # =========================================================
    # DATABASE
    # =========================================================

    database_url: str

    # =========================================================
    # DIALOGFLOW CX
    # =========================================================

    dialogflow_project_id: str
    dialogflow_location: str
    dialogflow_agent_id: str
    dialogflow_flow_id: str

    # =========================================================
    # E-MAIL (optional - console fallback when not set)
    # =========================================================

    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_from: str | None = None
    smtp_use_tls: bool = True
    smtp_use_ssl: bool = False
    company_name: str = "The Hiring Team"
    frontend_url: str = "http://localhost:5173"

    # =========================================================
    # SETTINGS
    # =========================================================

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore"
    )


settings = Settings()
