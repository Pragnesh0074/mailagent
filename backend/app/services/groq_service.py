from groq import Groq
from app.core.config import settings
import re

class GroqService:
    def __init__(self):
        self.client = Groq(api_key=settings.GROQ_API_KEY)
        self.models = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"]

    async def categorize_and_summarize(self, email_content: str, sender: str, subject: str):
        prompt = f"""
        Analyze the following email and return a JSON object with:
        "summary": A concise one-sentence summary of the main point.
        "category": Choose exactly ONE from: "Personal", "Business", "Ad", "Social", "Spam".
        "is_important": Boolean (true if this is a human asking a question, an interview/job update, or requires a personal response).
        
        Rules:
        - "Personal": Interviews, HR, job results, 1-on-1 human conversations, questions from people.
        - "Business": SaaS tools, invoices, technical updates, project management.
        - "Social": LinkedIn, social networks, platform messages, profile updates, connection/message notifications.
        - "Ad": Marketing, bank offers, promotions.
        - Automated platform emails, no-reply senders, digests, notifications, and LinkedIn/job-board alerts are NOT important.
        
        CRITICAL: Set "is_important" to true if:
        1. It's from a real human email address AND contains a question or request.
        2. It's from a real human recruiter/HR email address about a job, interview, or selection.
        
        CRITICAL: Set "is_important" to false for LinkedIn, no-reply, noreply, notification, digest, alert, job-board, promotional, or automated emails even if they mention jobs or interviews.
        
        Sender: {sender}
        Subject: {subject}
        Content: {email_content}
        
        Return ONLY valid JSON like: {{"summary": "...", "category": "...", "is_important": true/false}}
        """
        
        for model in self.models:
            try:
                response = self.client.chat.completions.create(
                    messages=[
                        {"role": "system", "content": "You are an expert email assistant that speaks only in JSON."},
                        {"role": "user", "content": prompt}
                    ],
                    model=model,
                    response_format={"type": "json_object"}
                )
                
                import json
                result = json.loads(response.choices[0].message.content)
                return {
                    "summary": result.get("summary", ""),
                    "category": result.get("category", "Personal"),
                    "is_important": result.get("is_important", False)
                }
            except Exception as e:
                continue
        
        raise Exception("All AI models reached rate limit or failed")

    async def generate_reply(
        self,
        email_content: str,
        user_instructions: str = "Be polite and professional",
        sender: str = "",
        subject: str = "",
    ):
        prompt = f"""
        Draft a real email reply based on these instructions: "{user_instructions}"

        Hard rules:
        - Never use placeholders, bracketed text, template variables, or examples like [Name], [Job Title], <date>, or XXX.
        - If a name, job title, date, time, attachment, or other detail is missing, do not invent it.
        - If missing details are needed, ask for them naturally in the reply.
        - If the recipient name is unknown, use a generic greeting like "Hello,".
        - Use only information present in the email metadata or body.
        - Keep the reply concise, polite, and ready to send.
        - Return only the email body. Do not include analysis or notes.
        
        Email metadata:
        Sender: {sender or "Unknown"}
        Subject: {subject or "No Subject"}

        Original email content:
        {email_content}
        
        Ready-to-send reply:
        """
        
        for model in self.models:
            try:
                response = self.client.chat.completions.create(
                    messages=[
                        {"role": "system", "content": "You draft safe, natural, ready-to-send email replies. You never use placeholders."},
                        {"role": "user", "content": prompt}
                    ],
                    model=model,
                )
                reply = response.choices[0].message.content.strip()
                if self._contains_placeholder(reply):
                    continue
                return reply
            except Exception as e:
                continue
        
        return (
            "Hello,\n\n"
            "Thank you for your email. I have received your message and will review the details. "
            "If there is any additional information you need from me, please let me know.\n\n"
            "Best regards"
        )

    def _contains_placeholder(self, text: str):
        placeholder_patterns = [
            r"\[[^\]]+\]",
            r"<[^>\n]+>",
            r"\{[^}]+\}",
            r"\bXXX\b",
            r"\bTBD\b",
        ]
        return any(re.search(pattern, text, flags=re.IGNORECASE) for pattern in placeholder_patterns)
