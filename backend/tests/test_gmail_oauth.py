import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql://unit-test:unit-test@localhost/unit-test",
)

from app.services import email_service, gmail_oauth, mailbox


class GmailOAuthTests(unittest.TestCase):
    @patch.object(gmail_oauth, "_request_json")
    def test_userinfo_uses_bearer_access_token(self, request_json):
        request_json.return_value = {
            "email": "interviewer@gmail.com",
            "email_verified": True,
        }

        email = gmail_oauth.get_user_email("access-token")

        self.assertEqual(email, "interviewer@gmail.com")
        self.assertEqual(
            request_json.call_args.kwargs["headers"]["Authorization"],
            "Bearer access-token",
        )

    @patch.object(gmail_oauth, "_request_json")
    @patch.object(
        gmail_oauth,
        "refresh_access_token",
        return_value={"access_token": "short-lived-token"},
    )
    def test_send_raw_refreshes_token_and_sends_mime(
        self, refresh_token, request_json
    ):
        message = b"To: candidate@example.com\r\n\r\nInterview invitation"

        gmail_oauth.send_raw("saved-refresh-token", message)

        refresh_token.assert_called_once_with("saved-refresh-token")
        self.assertEqual(request_json.call_args.args[0], gmail_oauth.SEND_URL)
        self.assertEqual(
            request_json.call_args.kwargs["headers"]["Authorization"],
            "Bearer short-lived-token",
        )
        self.assertEqual(
            request_json.call_args.kwargs["data"]["raw"],
            gmail_oauth.base64.urlsafe_b64encode(message)
            .decode("ascii")
            .rstrip("="),
        )

    def test_configured_requires_explicit_redirect_uri(self):
        with (
            patch.object(
                gmail_oauth.settings,
                "google_oauth_client_id",
                "client-id",
            ),
            patch.object(
                gmail_oauth.settings,
                "google_oauth_client_secret",
                "client-secret",
            ),
            patch.object(
                gmail_oauth.settings,
                "google_oauth_redirect_uri",
                "",
            ),
        ):
            self.assertFalse(gmail_oauth.configured())

    @patch.object(mailbox, "decrypt", return_value="saved-refresh-token")
    def test_gmail_account_can_differ_from_app_login(self, decrypt):
        user = SimpleNamespace(
            email="interviewer@company.example",
            gmail_email="interviewer@gmail.com",
            gmail_refresh_token_enc="encrypted-token",
        )

        account = mailbox.gmail_account(user)

        self.assertEqual(
            account,
            {
                "email": "interviewer@gmail.com",
                "refresh_token": "saved-refresh-token",
                "type": "gmail_oauth",
            },
        )
        decrypt.assert_called_once_with("encrypted-token")

    @patch.object(email_service, "_send_via_brevo")
    @patch.object(
        email_service,
        "_send_via_mailbox",
        return_value=(False, "Gmail API send failed"),
    )
    def test_gmail_failure_does_not_fallback_to_another_sender(
        self, send_from_mailbox, send_from_brevo
    ):
        sent, status = email_service.send_email(
            "candidate@example.com",
            "Interview invitation",
            "Your interview details",
            mailbox={
                "email": "interviewer@gmail.com",
                "refresh_token": "encrypted-at-rest",
                "type": "gmail_oauth",
            },
        )

        self.assertFalse(sent)
        self.assertEqual(status, "Gmail API send failed")
        send_from_mailbox.assert_called_once()
        send_from_brevo.assert_not_called()


if __name__ == "__main__":
    unittest.main()
