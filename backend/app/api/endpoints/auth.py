from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import RedirectResponse
from google_auth_oauthlib.flow import Flow
from app.core.config import settings
import os
import json

router = APIRouter()

@router.get("/status")
async def auth_status():
    return {"authenticated": os.path.exists('token.json')}

# Scopes required for the application
SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'openid',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
]

@router.get("/login")
async def login():
    import urllib.parse
    
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.REDIRECT_URI,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "include_granted_scopes": "true",
        "prompt": "consent"
    }
    
    auth_base_url = "https://accounts.google.com/o/oauth2/auth"
    authorization_url = f"{auth_base_url}?{urllib.parse.urlencode(params)}"
    
    return RedirectResponse(authorization_url)

@router.get("/callback")
async def callback(code: str):
    import requests
    
    # Direct exchange of code for tokens
    token_url = "https://oauth2.googleapis.com/token"
    data = {
        "code": code,
        "client_id": settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_CLIENT_SECRET,
        "redirect_uri": settings.REDIRECT_URI,
        "grant_type": "authorization_code",
    }
    
    try:
        response = requests.post(token_url, data=data)
        token_data = response.json()
        
        if "error" in token_data:
            raise Exception(token_data.get("error_description", token_data["error"]))
            
        # Add client info for the Credentials object later
        token_data['client_id'] = settings.GOOGLE_CLIENT_ID
        token_data['client_secret'] = settings.GOOGLE_CLIENT_SECRET
        
        # Save the credentials to token.json
        with open('token.json', 'w') as token_file:
            json.dump(token_data, token_file)
            
        return RedirectResponse("http://localhost:3000")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Authentication failed: {str(e)}")

@router.get("/logout")
async def logout():
    try:
        if os.path.exists('token.json'):
            os.remove('token.json')
        return RedirectResponse("http://localhost:3000")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Logout failed: {str(e)}")
