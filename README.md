# MailAgent AI

An intelligent email assistant that summarizes your inbox and helps you reply to personal emails using Groq AI.

## Project Structure
- **backend/**: FastAPI application (Python 3.13)
- **frontend/**: Next.js application (TypeScript, Tailwind CSS)

## Setup Instructions

### Backend
1. Navigate to the `backend` directory.
2. Create a `.env` file from the template and add your `GROQ_API_KEY`.
3. Activate the virtual environment:
   ```bash
   source venv/bin/activate
   ```
4. Run the server:
   ```bash
   uvicorn app.main:app --reload
   ```

### Frontend
1. Navigate to the `frontend` directory.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```

## Key Features
- **AI Categorization**: Automatically identifies if an email is from a person or a brand.
- **Smart Summaries**: Get the gist of any email in 1-2 sentences.
- **Priority Detection**: Highlights important messages.
- **Premium UI**: Modern, glassmorphic design with smooth animations.
- **Quick Reply**: Draft replies with AI assistance.
