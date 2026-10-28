import os
import unittest
from unittest.mock import patch

from app.services.url_config import (
    FrontendURLConfigurationError,
    build_invite_url,
    frontend_base_url,
    google_oauth_redirect_uri,
)


class FrontendURLConfigurationTests(unittest.TestCase):
    def test_builds_local_invitation_url(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(
                build_invite_url(
                    "http://localhost:5173/",
                    "INV-LOCAL-1234",
                ),
                "http://localhost:5173/invite/INV-LOCAL-1234",
            )

    def test_builds_production_invitation_url(self):
        with patch.dict(
            os.environ,
            {"VERCEL": "1", "VERCEL_ENV": "production"},
            clear=True,
        ):
            self.assertEqual(
                build_invite_url(
                    "https://ai-interview-version-b.vercel.app/",
                    "INV-PROD-1234",
                ),
                (
                    "https://ai-interview-version-b.vercel.app/"
                    "invite/INV-PROD-1234"
                ),
            )

    def test_accepts_local_oauth_callback(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(
                google_oauth_redirect_uri(
                    "http://localhost:8000/google-oauth/callback",
                    "http://localhost:5173",
                ),
                "http://localhost:8000/google-oauth/callback",
            )

    def test_accepts_production_oauth_callback(self):
        with patch.dict(os.environ, {"VERCEL": "1"}, clear=True):
            self.assertEqual(
                google_oauth_redirect_uri(
                    (
                        "https://ai-interview-version-b.vercel.app/"
                        "api/google-oauth/callback"
                    ),
                    "https://ai-interview-version-b.vercel.app",
                ),
                (
                    "https://ai-interview-version-b.vercel.app/"
                    "api/google-oauth/callback"
                ),
            )

    def test_rejects_local_frontend_url_on_vercel(self):
        with (
            patch.dict(os.environ, {"VERCEL": "1"}, clear=True),
            self.assertRaises(FrontendURLConfigurationError),
        ):
            frontend_base_url("http://localhost:5173")

    def test_rejects_private_frontend_url_on_vercel(self):
        with (
            patch.dict(os.environ, {"VERCEL": "1"}, clear=True),
            self.assertRaises(FrontendURLConfigurationError),
        ):
            frontend_base_url("https://192.168.1.10:5173")

    def test_rejects_stale_vercel_oauth_callback_host(self):
        with (
            patch.dict(os.environ, {"VERCEL": "1"}, clear=True),
            self.assertRaises(FrontendURLConfigurationError),
        ):
            google_oauth_redirect_uri(
                (
                    "https://ai-interview-new-8f5k.vercel.app/"
                    "api/google-oauth/callback"
                ),
                "https://ai-interview-version-b.vercel.app",
            )

    def test_rejects_wrong_same_domain_vercel_oauth_callback_path(self):
        with (
            patch.dict(os.environ, {"VERCEL": "1"}, clear=True),
            self.assertRaises(FrontendURLConfigurationError),
        ):
            google_oauth_redirect_uri(
                (
                    "https://ai-interview-version-b.vercel.app/"
                    "google-oauth/callback"
                ),
                "https://ai-interview-version-b.vercel.app",
            )

    def test_rejects_missing_frontend_url(self):
        with self.assertRaises(FrontendURLConfigurationError):
            frontend_base_url("")


if __name__ == "__main__":
    unittest.main()
