from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # =========================================================
    # DATABASE
    # =========================================================

    database_url: str

    # =========================================================
    # DIALOGFLOW CX
    # =========================================================

    dialogflow_project_id: str = ""
    dialogflow_location: str = ""
    dialogflow_agent_id: str = ""
    dialogflow_flow_id: str = ""

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

    # HTTPS e-mail API (Brevo). Works even when the PC antivirus / firewall
    # blocks SMTP (WinError 10053). Used first when set.
    brevo_api_key: str | None = None

    # Encrypts the interviewers' mailbox App Passwords (Features -> Interviewer)
    mail_secret_key: str | None = None
    company_name: str = "The Hiring Team"

    # =========================================================
    # GMAIL OAUTH (interviewer connects their own Gmail)
    # =========================================================

    google_oauth_client_id: str | None = None
    google_oauth_client_secret: str | None = None
    # must match "Authorized redirect URIs" in Google Cloud exactly
    google_oauth_redirect_uri: str = (
        "http://localhost:8000/google-oauth/callback"
    )
    # extra allowed browser origins (comma separated), e.g. the Vercel URL
    cors_origins: str = ""
    frontend_url: str = "http://localhost:5173"

    # =========================================================
    # SETTINGS
    # =========================================================

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore"
    )


settings = Settings()
