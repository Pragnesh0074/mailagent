from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    PROJECT_NAME: str = "MailAgent AI"
    GROQ_API_KEY: Optional[str] = None
    GOOGLE_CLIENT_ID: Optional[str] = None
    GOOGLE_CLIENT_SECRET: Optional[str] = None
    REDIRECT_URI: str = "http://localhost:8000/api/auth/callback"
    
    class Config:
        env_file = ".env"

settings = Settings()
