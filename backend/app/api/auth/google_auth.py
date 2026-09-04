import os

from fastapi import APIRouter, Depends, HTTPException, status
from google.oauth2 import id_token
from google.auth.transport import requests
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.api.auth.auth import create_access_token


router = APIRouter(
    prefix="/auth",
    tags=["Authentication"]
)


GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")


@router.post("/google")
def google_login(
    credential: str,
    db: Session = Depends(get_db)
):
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Google Client ID is not configured"
        )

    try:
        google_user = id_token.verify_oauth2_token(
            credential,
            requests.Request(),
            GOOGLE_CLIENT_ID
        )
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Google token"
        )

    google_id = google_user.get("sub")
    email = google_user.get("email")
    name = google_user.get("name")

    if not google_id or not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google account information is incomplete"
        )

    user = (
        db.query(User)
        .filter(User.google_id == google_id)
        .first()
    )

    if not user:
        user = (
            db.query(User)
            .filter(User.email == email)
            .first()
        )

    if user:
        if not user.google_id:
            user.google_id = google_id

        db.commit()
        db.refresh(user)

    else:
        user = User(
            name=name or email.split("@")[0],
            email=email,
            password_hash=None,
            google_id=google_id,
            role="candidate"
        )

        db.add(user)
        db.commit()
        db.refresh(user)

    access_token = create_access_token(str(user.id))

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": str(user.id),
            "name": user.name,
            "email": user.email,
            "role": user.role
        }
    }