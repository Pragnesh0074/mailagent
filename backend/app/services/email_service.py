import base64
import os.path
from email.mime.text import MIMEText
from email.utils import parseaddr
from typing import List

# pyrefly: ignore [missing-import]
from google.auth.transport.requests import Request
# pyrefly: ignore [missing-import]
from google.oauth2.credentials import Credentials
# pyrefly: ignore [missing-import]
from googleapiclient.discovery import build

# If modifying these SCOPES, delete the file token.json.
SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send']

class EmailService:
    _cached_authenticated_email = None

    def __init__(self):
        self.creds = self._get_credentials()
        self.service = build('gmail', 'v1', credentials=self.creds) if self.creds else None

    def _get_credentials(self):
        creds = None
        if os.path.exists('token.json'):
            creds = Credentials.from_authorized_user_file('token.json', SCOPES)
        
        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
                with open('token.json', 'w') as token_file:
                    token_file.write(creds.to_json())
            else:
                # If no valid credentials, we need the user to go through the /auth/login flow
                return None
        return creds

    async def fetch_recent_emails(self, max_results=10, page_token=None):
        if not self.creds:
            raise Exception("User not authenticated. Please visit /api/auth/login")
            
        try:
            results = self.service.users().messages().list(
                userId='me', 
                q='in:inbox', 
                maxResults=max_results,
                pageToken=page_token
            ).execute()
            
            messages = results.get('messages', [])
            next_page_token = results.get('nextPageToken')
            
            email_data = []
            for msg in messages:
                txt = self.service.users().messages().get(userId='me', id=msg['id']).execute()
                email_data.append(self._parse_message(txt))
            
            return {
                "emails": email_data,
                "next_page_token": next_page_token
            }
        except Exception as e:
            raise e

    async def get_email_details(self, email_id: str):
        if not self.creds:
            raise Exception("User not authenticated")
            
        message = self.service.users().messages().get(userId='me', id=email_id, format='full').execute()
        
        headers = message['payload'].get('headers', [])
        return {
            "id": email_id,
            "subject": self._get_header(headers, 'subject', "No Subject"),
            "sender": self._get_header(headers, 'from', "Unknown Sender"),
            "to": self._get_header(headers, 'to', "Me"),
            "date": self._get_header(headers, 'date', ""),
            "body": self._extract_body(message['payload'])
        }

    def _parse_message(self, message):
        payload = message['payload']
        headers = payload.get('headers', [])
        
        subject = self._get_header(headers, 'subject', "No Subject")
        sender = self._get_header(headers, 'from', "Unknown Sender")
        snippet = message.get('snippet', "")
        
        return {
            "id": message['id'],
            "subject": subject,
            "sender": sender,
            "snippet": snippet,
            "received_at": self._get_header(headers, 'date', "")
        }

    async def send_reply(self, original_id: str, body: str):
        if not self.creds:
            raise Exception("User not authenticated")
        if not body.strip():
            raise Exception("Reply body cannot be empty")

        original = self.service.users().messages().get(
            userId='me',
            id=original_id,
            format='metadata',
            metadataHeaders=['From', 'Reply-To', 'To', 'Subject', 'Message-ID', 'References']
        ).execute()

        headers = original.get('payload', {}).get('headers', [])
        sender = self._get_header(headers, 'reply-to') or self._get_header(headers, 'from', '')
        recipient = parseaddr(sender)[1] or sender
        if not recipient:
            raise Exception("Could not find a recipient for the reply")

        subject = self._get_header(headers, 'subject', "No Subject")
        if not subject.lower().startswith("re:"):
            subject = f"Re: {subject}"

        message = MIMEText(body.strip(), 'plain', 'utf-8')
        message['From'] = self._get_authenticated_email()
        message['To'] = recipient
        message['Subject'] = subject

        original_message_id = self._get_header(headers, 'message-id', '')
        references = self._get_header(headers, 'references', '')
        if original_message_id:
            message['In-Reply-To'] = original_message_id
            message['References'] = f"{references} {original_message_id}".strip() if references else original_message_id

        raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode()
        send_body = {'raw': raw_message}
        if original.get('threadId'):
            send_body['threadId'] = original['threadId']

        sent_message = self.service.users().messages().send(
            userId='me',
            body=send_body
        ).execute()
        return sent_message

    async def send_email(self, recipients: List[str], subject: str, body: str):
        if not self.creds:
            raise Exception("User not authenticated")

        normalized_recipients = self._normalize_recipients(recipients)
        if not normalized_recipients:
            raise Exception("At least one valid recipient is required")

        if not subject.strip():
            raise Exception("Subject cannot be empty")

        if not body.strip():
            raise Exception("Message body cannot be empty")

        message = MIMEText(body.strip(), 'plain', 'utf-8')
        message['From'] = self._get_authenticated_email()
        message['To'] = ", ".join(normalized_recipients)
        message['Subject'] = subject.strip()

        raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode()
        return self.service.users().messages().send(
            userId='me',
            body={'raw': raw_message}
        ).execute()

    def _normalize_recipients(self, recipients: List[str]):
        normalized = []
        seen = set()

        for recipient in recipients:
            _, address = parseaddr(recipient)
            address = (address or recipient).strip().lower()

            if not self._is_valid_email_address(address):
                raise Exception(f"Invalid recipient email: {recipient}")

            if address not in seen:
                normalized.append(address)
                seen.add(address)

        return normalized

    def _is_valid_email_address(self, address: str):
        local_part, separator, domain = address.partition("@")
        return bool(local_part and separator and "." in domain and " " not in address)

    def _get_header(self, headers, name: str, default: str = ""):
        return next((h['value'] for h in headers if h.get('name', '').lower() == name.lower()), default)

    def _get_authenticated_email(self):
        if EmailService._cached_authenticated_email:
            return EmailService._cached_authenticated_email

        profile = self.service.users().getProfile(userId='me').execute()
        email_address = profile.get('emailAddress')
        if not email_address:
            raise Exception("Could not determine authenticated Gmail address")

        EmailService._cached_authenticated_email = email_address
        return email_address

    def _extract_body(self, payload):
        plain_text = self._find_part_body(payload, 'text/plain')
        if plain_text:
            return plain_text
        return self._find_part_body(payload, 'text/html') or ""

    def _find_part_body(self, part, mime_type: str):
        if part.get('mimeType') == mime_type:
            data = part.get('body', {}).get('data')
            if data:
                return base64.urlsafe_b64decode(data).decode('utf-8', errors='replace')

        for child in part.get('parts', []):
            body = self._find_part_body(child, mime_type)
            if body:
                return body

        return ""
