import secrets
from typing import Dict, Any
from urllib.parse import urlencode
import httpx
from fastapi import HTTPException

from app.core.config import settings
from app.core.logging import logger


class GoogleOAuthService:
    def __init__(self):
        self.client_id = settings.google_client_id
        self.client_secret = settings.google_client_secret
        self.redirect_uri = settings.google_redirect_uri

    def get_authorization_url(self, state: str = None) -> str:
        """Generate Google OAuth authorization URL."""
        if not state:
            state = secrets.token_urlsafe(32)

        base_url = "https://accounts.google.com/o/oauth2/v2/auth"
        params = {
            "client_id": self.client_id,
            "redirect_uri": self.redirect_uri,
            "scope": "openid email profile",
            "response_type": "code",
            "access_type": "offline",
            "state": state,
            "prompt": "consent"
        }

        query_string = urlencode(params)
        return f"{base_url}?{query_string}"

    async def exchange_code_for_token(self, code: str) -> Dict[str, Any]:
        """Exchange authorization code for access token."""
        token_url = "https://oauth2.googleapis.com/token"

        data = {
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": self.redirect_uri,
        }

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(token_url, data=data)
                response.raise_for_status()
                token_data = response.json()

                if "error" in token_data:
                    logger.error(f"Google OAuth error: {token_data}")
                    raise HTTPException(
                        status_code=400,
                        detail=f"OAuth error: {token_data.get('error_description', token_data['error'])}"
                    )

                return token_data
            except httpx.HTTPError as e:
                logger.error(f"HTTP error during token exchange: {e}")
                raise HTTPException(status_code=500, detail="Failed to exchange code for token")

    async def get_user_info(self, access_token: str) -> Dict[str, Any]:
        """Get user information from Google using access token."""
        userinfo_url = "https://www.googleapis.com/oauth2/v2/userinfo"

        headers = {
            "Authorization": f"Bearer {access_token}"
        }

        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(userinfo_url, headers=headers)
                response.raise_for_status()
                user_data = response.json()
                return user_data
            except httpx.HTTPError as e:
                logger.error(f"HTTP error getting user info: {e}")
                raise HTTPException(status_code=500, detail="Failed to get user information")

    async def authenticate_user(self, code: str) -> Dict[str, Any]:
        """Complete OAuth flow and return user information."""
        try:
            # Exchange code for token
            token_data = await self.exchange_code_for_token(code)
            access_token = token_data.get("access_token")

            if not access_token:
                raise HTTPException(status_code=400, detail="No access token received")

            # Get user info
            user_info = await self.get_user_info(access_token)

            # Validate required fields
            if not user_info.get("email"):
                raise HTTPException(status_code=400, detail="Email not provided by Google")

            return {
                "google_id": user_info.get("id"),
                "email": user_info["email"],
                "name": user_info.get("name"),
                "picture": user_info.get("picture"),
                "access_token": access_token,
                "token_data": token_data
            }

        except Exception as e:
            logger.error(f"OAuth authentication error: {e}")
            if isinstance(e, HTTPException):
                raise
            raise HTTPException(status_code=500, detail="Authentication failed")