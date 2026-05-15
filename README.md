# MailAgent AI

An intelligent email assistant that summarizes your inbox and helps you reply to personal emails using Groq AI.

## Project Structure

- **backend/**: FastAPI application (Python 3.13)
- **frontend/**: Next.js application (TypeScript, Tailwind CSS)

## Setup Instructions

#### Backend (`/backend`)
1. Navigate to the `backend` directory: `cd backend`
2. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
3. Open `.env` and fill in your keys:
   - `GROQ_API_KEY`: Required for AI summaries and replies.
   - `GOOGLE_CLIENT_ID`: OAuth client ID for Gmail access.
   - `GOOGLE_CLIENT_SECRET`: OAuth client secret for Gmail access.
   - `REDIRECT_URI`: Usually `http://localhost:8000/api/auth/callback`.

#### Frontend (`/frontend`)
1. Navigate to the `frontend` directory: `cd frontend`
2. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
3. Open `.env` and configure:
   - `NEXT_PUBLIC_API_URL`: Point this to your running backend (e.g., `http://localhost:8000`).

## Key Features

- **AI Categorization**: Automatically identifies if an email is from a person or a brand.
- **Smart Summaries**: Get the gist of any email in 1-2 sentences.
- **Priority Detection**: Highlights important messages.
- **Premium UI**: Modern, glassmorphic design with smooth animations.
- **Quick Reply**: Draft replies with AI assistance.
