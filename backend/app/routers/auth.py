from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services import AuthService, GoogleOAuthService
from app.schemas import EmailLoginRequest, EmailSignupRequest, Token, User

router = APIRouter(prefix="/auth", tags=["authentication"])

oauth_service = GoogleOAuthService()


@router.post("/signup", response_model=Token)
async def signup_with_email(payload: EmailSignupRequest, db: AsyncSession = Depends(get_db)):
    """Create a user account with email and password."""
    auth_service = AuthService(db)
    user = await auth_service.create_user_with_password(
        email=payload.email,
        password=payload.password,
        name=payload.name,
    )
    access_token = auth_service.create_access_token(data={"sub": user.email})
    return Token(access_token=access_token, token_type="bearer")


@router.post("/login", response_model=Token)
async def login_with_email(payload: EmailLoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate a user with email and password."""
    auth_service = AuthService(db)
    user = await auth_service.authenticate_with_password(payload.email, payload.password)
    access_token = auth_service.create_access_token(data={"sub": user.email})
    return Token(access_token=access_token, token_type="bearer")


@router.get("/google/login")
async def google_login(
    state: str = Query(None, description="State parameter for OAuth flow"),
    redirect: bool = Query(False, description="Redirect the browser directly to Google instead of returning JSON"),
):
    """Initiate Google OAuth login flow."""
    try:
        authorization_url = oauth_service.get_authorization_url(state)
        if redirect:
            return RedirectResponse(url=authorization_url, status_code=307)
        return {"authorization_url": authorization_url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to initiate OAuth: {str(e)}")


@router.get("/google/callback", response_model=Token)
async def google_oauth_callback(
    code: str = Query(..., description="Authorization code from Google"),
    state: str = Query(None, description="State parameter"),
    db: AsyncSession = Depends(get_db)
):
    """Handle Google OAuth callback."""
    try:
        # Authenticate with Google
        user_data = await oauth_service.authenticate_user(code)

        # Create or get user
        auth_service = AuthService(db)
        user = await auth_service.get_or_create_user(
            google_id=user_data["google_id"],
            email=user_data["email"],
            name=user_data.get("name"),
            picture=user_data.get("picture")
        )

        # Create JWT token
        access_token = auth_service.create_access_token(data={"sub": user.email})

        return Token(access_token=access_token, token_type="bearer")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OAuth callback failed: {str(e)}")


@router.get("/me", response_model=User)
async def get_current_user(
    token: str = Query(..., description="JWT access token"),
    db: AsyncSession = Depends(get_db)
):
    """Get current authenticated user information."""
    try:
        auth_service = AuthService(db)
        user = await auth_service.get_current_user(token)
        return user
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid or expired token")