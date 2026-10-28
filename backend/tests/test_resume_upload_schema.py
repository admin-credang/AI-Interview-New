import pytest
from pydantic import ValidationError

from app.api.candidate_resume import ResumeUpload


def test_resume_upload_accepts_frontend_json_payload():
    body = ResumeUpload.model_validate(
        {
            "email": "candidate@example.com",
            "filename": "resume.pdf",
            "content_base64": "JVBERi0xLjQ=",
        }
    )

    assert body.email == "candidate@example.com"
    assert body.filename == "resume.pdf"
    assert body.content_base64 == "JVBERi0xLjQ="


def test_resume_upload_rejects_empty_base64_content():
    with pytest.raises(ValidationError) as error:
        ResumeUpload.model_validate(
            {
                "email": "candidate@example.com",
                "filename": "resume.pdf",
                "content_base64": "",
            }
        )

    assert any(
        item["loc"] == ("content_base64",)
        and item["type"] == "string_too_short"
        for item in error.value.errors()
    )
