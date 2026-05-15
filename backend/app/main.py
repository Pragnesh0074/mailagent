import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.endpoints import email, auth
from app.services.auto_reply_service import AutoReplyScheduler

logging.getLogger("uvicorn.access").disabled = True

auto_reply_scheduler = AutoReplyScheduler()

@asynccontextmanager
async def lifespan(app: FastAPI):
    await auto_reply_scheduler.start()
    try:
        yield
    finally:
        await auto_reply_scheduler.stop()

app = FastAPI(
    title="MailAgent AI",
    description="AI-powered email assistant summarizing and responding to personal emails.",
    version="1.0.0",
    lifespan=lifespan,
)

# Set up CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust this in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(email.router, prefix="/api/emails", tags=["emails"])

@app.get("/")
async def root():
    return {"message": "Welcome to MailAgent AI API"}
