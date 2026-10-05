from datetime import datetime, timedelta, timezone
import os

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
)
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from sqlalchemy.orm import Session

from jose import jwt

from pwdlib import PasswordHash

from app.database import get_db
from app.models.user import User
from app.schemas.user import UserCreate, UserResponse
from app.schemas.auth import LoginRequest, LoginResponse


# =========================================================
# ROUTER
# =========================================================

router = APIRouter(
    prefix="/auth",
    tags=["Authentication"]
)


# =========================================================
# PASSWORD HASHING
# =========================================================

password_hash = PasswordHash.recommended()


# =========================================================
# JWT CONFIGURATION
# =========================================================

SECRET_KEY = os.getenv(
    "SECRET_KEY",
    "change-this-secret-key"
)

ALGORITHM = "HS256"

ACCESS_TOKEN_EXPIRE_MINUTES = 60


# =========================================================
# HTTP BEARER SECURITY
# =========================================================

security = HTTPBearer()


# =========================================================
# PASSWORD HELPERS
# =========================================================

def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(
    plain_password: str,
    hashed_password: str
) -> bool:
    return password_hash.verify(
        plain_password,
        hashed_password
    )


# =========================================================
# JWT TOKEN CREATION
# =========================================================

def create_access_token(user_id: str) -> str:

    expire = (
        datetime.now(timezone.utc)
        + timedelta(
            minutes=ACCESS_TOKEN_EXPIRE_MINUTES
        )
    )

    payload = {
        "sub": user_id,
        "exp": expire
    }

    return jwt.encode(
        payload,
        SECRET_KEY,
        algorithm=ALGORITHM
    )


# =========================================================
# GET CURRENT LOGGED-IN USER
# =========================================================

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(
        security
    ),
    db: Session = Depends(get_db)
):
    """
    Reads the JWT Bearer token from the Authorization header,
    validates the token, extracts the user ID and returns
    the corresponding database user.
    """

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={
            "WWW-Authenticate": "Bearer"
        }
    )

    try:

        # -------------------------------------------------
        # Extract Bearer token
        # -------------------------------------------------

        token = credentials.credentials

        # -------------------------------------------------
        # Decode JWT
        # -------------------------------------------------

        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )

        # -------------------------------------------------
        # Extract user ID
        # -------------------------------------------------

        user_id = payload.get("sub")

        if not user_id:
            raise credentials_exception

    except Exception:
        raise credentials_exception

    # -----------------------------------------------------
    # Find user in database
    # -----------------------------------------------------

    user = (
        db.query(User)
        .filter(
            User.id == user_id
        )
        .first()
    )

    if user is None:
        raise credentials_exception

    return user


# =========================================================
# REGISTER
# =========================================================

@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED
)
def register(
    user_data: UserCreate,
    db: Session = Depends(get_db)
):

    # -----------------------------------------------------
    # Check if email already exists
    # -----------------------------------------------------

    existing_user = (
        db.query(User)
        .filter(
            User.email == user_data.email
        )
        .first()
    )

    if existing_user:

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered"
        )

    # -----------------------------------------------------
    # Validate role
    # -----------------------------------------------------

    allowed_roles = {
        "candidate",
        "interviewer",
        "admin"
    }

    if user_data.role not in allowed_roles:

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid role"
        )

    # -----------------------------------------------------
    # Create user
    # -----------------------------------------------------

    user = User(
        name=user_data.name,
        email=user_data.email,
        password_hash=hash_password(
            user_data.password
        ),
        role=user_data.role
    )

    db.add(user)

    db.commit()

    db.refresh(user)

    return user


# =========================================================
# LOGIN
# =========================================================

@router.post(
    "/login",
    response_model=LoginResponse
)
def login(
    login_data: LoginRequest,
    db: Session = Depends(get_db)
):

    # -----------------------------------------------------
    # Find user by email
    # -----------------------------------------------------

    user = (
        db.query(User)
        .filter(
            User.email == login_data.email
        )
        .first()
    )

    # -----------------------------------------------------
    # Don't reveal whether email exists
    # -----------------------------------------------------

    if not user:

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )

    # -----------------------------------------------------
    # Verify password
    # -----------------------------------------------------

    if not user.password_hash:

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )

    if not verify_password(
        login_data.password,
        user.password_hash
    ):

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )

    # -----------------------------------------------------
    # Create JWT
    # -----------------------------------------------------

    access_token = create_access_token(
        str(user.id)
    )

    # -----------------------------------------------------
    # Return login response
    # -----------------------------------------------------

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