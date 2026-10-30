"""Validated public frontend URLs used by backend-generated links."""

import ipaddress
import os
import re
from urllib.parse import urlparse


LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", "0.0.0.0"}


class FrontendURLConfigurationError(ValueError):
    """Raised when a frontend URL is missing or unsafe for this deployment."""


def is_vercel_deployment() -> bool:
    return bool(
        os.getenv("VERCEL", "").lower() in {"1", "true"}
        or os.getenv("VERCEL_ENV", "").lower()
        in {"development", "preview", "production"}
    )


def _is_local_host(host: str) -> bool:
    if host in LOCAL_HOSTS or host.endswith(".local"):
        return True

    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return False

    return (
        address.is_loopback
        or address.is_private
        or address.is_unspecified
    )


def _is_valid_host(host: str) -> bool:
    if not host or len(host) > 253:
        return False

    try:
        ipaddress.ip_address(host)
        return True
    except ValueError:
        pass

    labels = host.rstrip(".").split(".")
    return all(
        label
        and len(label) <= 63
        and re.fullmatch(
            r"[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?",
            label,
        )
        for label in labels
    )


def frontend_base_url(configured_url: str | None) -> str:
    value = str(configured_url or "").strip().rstrip("/")
    if not value:
        raise FrontendURLConfigurationError(
            "FRONTEND_BASE_URL is not configured on the backend."
        )

    try:
        parsed = urlparse(value)
        host = (parsed.hostname or "").lower().rstrip(".")
        port = parsed.port
    except ValueError as exc:
        raise FrontendURLConfigurationError(
            "FRONTEND_BASE_URL must be a valid absolute HTTP or HTTPS URL."
        ) from exc

    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.netloc
        or not _is_valid_host(host)
        or any(character.isspace() for character in value)
        or (port is not None and not 1 <= port <= 65535)
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
    ):
        raise FrontendURLConfigurationError(
            "FRONTEND_BASE_URL must be a valid absolute HTTP or HTTPS URL "
            "without credentials, a query, or a fragment."
        )

    if is_vercel_deployment() and (
        _is_local_host(host) or parsed.scheme != "https"
    ):
        raise FrontendURLConfigurationError(
            "FRONTEND_BASE_URL must use the public HTTPS frontend URL on Vercel."
        )

    return value


def google_oauth_redirect_uri(
    configured_uri: str | None,
    frontend_url: str | None,
) -> str:
    value = str(configured_uri or "").strip()
    parsed = urlparse(value)
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.netloc
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
    ):
        raise FrontendURLConfigurationError(
            "GOOGLE_OAUTH_REDIRECT_URI must be an absolute HTTP or HTTPS "
            "URL without credentials, a query, or a fragment."
        )

    if is_vercel_deployment():
        host = (parsed.hostname or "").lower()
        if _is_local_host(host) or parsed.scheme != "https":
            raise FrontendURLConfigurationError(
                "GOOGLE_OAUTH_REDIRECT_URI must use a public HTTPS URL on Vercel."
            )

        frontend_host = urlparse(
            frontend_base_url(frontend_url)
        ).hostname
        frontend_host = (frontend_host or "").lower()
        if host == frontend_host and parsed.path != (
            "/api/google-oauth/callback"
        ):
            raise FrontendURLConfigurationError(
                "The Vercel OAuth callback path must be "
                "/api/google-oauth/callback."
            )
        if parsed.path.startswith("/api/") and host != frontend_host:
            raise FrontendURLConfigurationError(
                "A Vercel /api OAuth callback must use the same host as "
                "FRONTEND_BASE_URL."
            )

    return value


def build_invite_url(frontend_url: str | None, invitation_code: str) -> str:
    base = frontend_base_url(frontend_url)
    return f"{base}/invite/{invitation_code}"
