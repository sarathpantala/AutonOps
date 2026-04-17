from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status, Depends, Cookie, Header
from passlib.context import CryptContext

from app.core.config import settings
from app.core.database import get_db
from app.models import User, Workspace
from app.schemas import TokenData


pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")


class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db

    def create_access_token(self, data: dict, expires_delta: Optional[timedelta] = None):
        to_encode = data.copy()
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(hours=settings.jwt_expiration_hours)
        to_encode.update({"exp": expire})
        encoded_jwt = jwt.encode(to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
        return encoded_jwt

    def get_password_hash(self, password: str) -> str:
        return pwd_context.hash(password)

    def verify_password(self, plain_password: str, password_hash: str) -> bool:
        return pwd_context.verify(plain_password, password_hash)

    def verify_token(self, token: str) -> TokenData:
        try:
            payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
            email: str = payload.get("sub")
            if email is None:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid authentication credentials",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            token_data = TokenData(email=email)
        except jwt.ExpiredSignatureError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has expired",
                headers={"WWW-Authenticate": "Bearer"},
            )
        except jwt.JWTError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return token_data

    async def get_default_workspace(self) -> Workspace:
        """Get or create default workspace."""
        query = select(Workspace).where(Workspace.is_default == True)
        result = await self.db.execute(query)
        workspace = result.scalar_one_or_none()

        if workspace is None:
            # Create default workspace
            default_workspace = Workspace(
                name="Default Workspace",
                description="Default workspace for new users",
                is_default=True
            )
            self.db.add(default_workspace)
            await self.db.commit()
            await self.db.refresh(default_workspace)
            return default_workspace

        return workspace

    async def get_or_create_user(self, google_id: str, email: str, name: Optional[str] = None, picture: Optional[str] = None) -> User:
        """Get existing user or create new one with Google OAuth data."""
        # Try to find user by Google ID
        query = select(User).where(User.google_id == google_id)
        result = await self.db.execute(query)
        user = result.scalar_one_or_none()

        if user:
            # Update user info if needed
            if name and user.name != name:
                user.name = name
            if picture and user.picture != picture:
                user.picture = picture
            await self.db.commit()
            await self.db.refresh(user)
            return user

        # Try to find user by email (in case they signed up differently before)
        query = select(User).where(User.email == email)
        result = await self.db.execute(query)
        existing_user = result.scalar_one_or_none()

        if existing_user:
            # Link Google account to existing user
            existing_user.google_id = google_id
            if name and not existing_user.name:
                existing_user.name = name
            if picture and not existing_user.picture:
                existing_user.picture = picture
            await self.db.commit()
            await self.db.refresh(existing_user)
            return existing_user

        # Create new user
        default_workspace = await self.get_default_workspace()

        new_user = User(
            email=email,
            name=name,
            google_id=google_id,
            picture=picture,
            workspace_id=default_workspace.id
        )

        self.db.add(new_user)
        await self.db.commit()
        await self.db.refresh(new_user)
        return new_user

    async def create_user_with_password(self, email: str, password: str, name: Optional[str] = None) -> User:
        existing_query = select(User).where(User.email == email)
        existing_result = await self.db.execute(existing_query)
        existing_user = existing_result.scalar_one_or_none()

        if existing_user is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="An account with this email already exists",
            )

        default_workspace = await self.get_default_workspace()
        new_user = User(
            email=email,
            name=name,
            password_hash=self.get_password_hash(password),
            workspace_id=default_workspace.id,
        )

        self.db.add(new_user)
        await self.db.commit()
        await self.db.refresh(new_user)
        return new_user

    async def authenticate_with_password(self, email: str, password: str) -> User:
        query = select(User).where(User.email == email)
        result = await self.db.execute(query)
        user = result.scalar_one_or_none()

        if user is None or not user.password_hash:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
            )

        if not self.verify_password(password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
            )

        return user

    async def get_current_user(self, token: str) -> User:
        """Get current user from JWT token."""
        token_data = self.verify_token(token)

        query = select(User).where(User.email == token_data.email)
        result = await self.db.execute(query)
        user = result.scalar_one_or_none()

        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found",
            )

        return user


async def get_current_user(
    access_token: Optional[str] = Cookie(None),
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Get the current authenticated user from cookie or bearer token."""
    token = access_token

    if not token and authorization:
        scheme, _, credentials = authorization.partition(" ")
        if scheme.lower() == "bearer" and credentials:
            token = credentials

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    auth_service = AuthService(db)
    return await auth_service.get_current_user(token)
