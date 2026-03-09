import base64
import imaplib
import re
import smtplib
import ssl
from email import policy
from email.message import EmailMessage
from email.parser import BytesParser
from email.utils import getaddresses, make_msgid
from typing import Any, Callable

from django.conf import settings


class EmailExecutionError(Exception):
    """Email integration execution error with structured payload."""

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        details: Any = None,
    ):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.details = details

    def as_dict(self) -> dict[str, Any]:
        return {
            "message": self.message,
            "status_code": self.status_code,
            "details": self.details,
        }


class EmailAdapter:
    def __init__(self, secret_payload: dict[str, Any], *, auth_type: str = "apiToken"):
        self.auth_type = str(auth_type or "apiToken")
        self.username = str(secret_payload.get("username") or secret_payload.get("email") or "").strip()
        self.default_from_email = str(
            secret_payload.get("fromEmail")
            or secret_payload.get("defaultFromEmail")
            or self.username
        ).strip()

        smtp_use_ssl = self._to_bool(secret_payload.get("smtpUseSsl"), False)
        self.smtp_host = str(secret_payload.get("smtpHost") or secret_payload.get("host") or "").strip()
        self.smtp_port = self._to_int(
            secret_payload.get("smtpPort"),
            465 if smtp_use_ssl else 587,
        )
        self.smtp_use_ssl = smtp_use_ssl
        self.smtp_use_starttls = self._to_bool(
            secret_payload.get("smtpUseStarttls"),
            not smtp_use_ssl,
        )
        self.smtp_password = str(
            secret_payload.get("smtpPassword") or secret_payload.get("password") or ""
        )
        self.smtp_access_token = str(
            secret_payload.get("smtpAccessToken") or secret_payload.get("accessToken") or ""
        )

        self.imap_host = str(secret_payload.get("imapHost") or secret_payload.get("inboxHost") or "").strip()
        self.imap_port = self._to_int(secret_payload.get("imapPort"), 993)
        self.imap_use_ssl = self._to_bool(secret_payload.get("imapUseSsl"), True)
        self.imap_password = str(secret_payload.get("imapPassword") or self.smtp_password or "")
        self.imap_access_token = str(
            secret_payload.get("imapAccessToken") or self.smtp_access_token or ""
        )
        self.default_mailbox = str(secret_payload.get("mailbox") or "INBOX").strip() or "INBOX"

        self.timeout = int(
            getattr(
                settings,
                "ORCHESTRATE_EMAIL_TIMEOUT_SECONDS",
                getattr(settings, "ORCHESTRATE_HTTP_TIMEOUT_SECONDS", 30),
            )
        )

    @staticmethod
    def _to_bool(value: Any, default: bool) -> bool:
        if value is None:
            return default
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return bool(value)
        text = str(value).strip().lower()
        if text in {"1", "true", "yes", "on"}:
            return True
        if text in {"0", "false", "no", "off"}:
            return False
        return default

    @staticmethod
    def _to_int(value: Any, default: int) -> int:
        try:
            return int(value)
        except (TypeError, ValueError):
            return default

    @staticmethod
    def _is_set(value: Any) -> bool:
        return value not in (None, "")

    @staticmethod
    def _normalize_list(value: Any) -> list[str]:
        if value is None:
            return []
        if isinstance(value, str):
            parts = re.split(r"[,;]", value)
            return [part.strip() for part in parts if part.strip()]
        if isinstance(value, list):
            normalized: list[str] = []
            for item in value:
                text = str(item or "").strip()
                if text:
                    normalized.append(text)
            return normalized
        text = str(value).strip()
        return [text] if text else []

    @staticmethod
    def _extract_text_message(message_obj) -> tuple[str, str]:
        plain_parts: list[str] = []
        html_parts: list[str] = []
        if message_obj.is_multipart():
            for part in message_obj.walk():
                disposition = str(part.get("Content-Disposition") or "").lower()
                if "attachment" in disposition:
                    continue
                content_type = str(part.get_content_type() or "").lower()
                try:
                    content = part.get_content()
                except Exception:
                    continue
                if isinstance(content, bytes):
                    content = content.decode(part.get_content_charset() or "utf-8", errors="replace")
                text = str(content or "")
                if content_type == "text/plain":
                    plain_parts.append(text)
                elif content_type == "text/html":
                    html_parts.append(text)
        else:
            try:
                content = message_obj.get_content()
            except Exception:
                content = ""
            if isinstance(content, bytes):
                content = content.decode(message_obj.get_content_charset() or "utf-8", errors="replace")
            content_type = str(message_obj.get_content_type() or "").lower()
            if content_type == "text/html":
                html_parts.append(str(content or ""))
            else:
                plain_parts.append(str(content or ""))
        return "\n".join(plain_parts).strip(), "\n".join(html_parts).strip()

    @staticmethod
    def _parse_email(raw_bytes: bytes, *, sequence_number: str, uid: str = "") -> dict[str, Any]:
        parsed = BytesParser(policy=policy.default).parsebytes(raw_bytes)
        plain_text, html_text = EmailAdapter._extract_text_message(parsed)
        to_addresses = [addr for _, addr in getaddresses(parsed.get_all("to", []))]
        cc_addresses = [addr for _, addr in getaddresses(parsed.get_all("cc", []))]
        bcc_addresses = [addr for _, addr in getaddresses(parsed.get_all("bcc", []))]
        from_addresses = [addr for _, addr in getaddresses(parsed.get_all("from", []))]
        return {
            "sequenceNumber": sequence_number,
            "uid": uid,
            "messageId": str(parsed.get("message-id") or "").strip(),
            "subject": str(parsed.get("subject") or ""),
            "from": from_addresses[0] if from_addresses else "",
            "to": to_addresses,
            "cc": cc_addresses,
            "bcc": bcc_addresses,
            "date": str(parsed.get("date") or ""),
            "text": plain_text,
            "html": html_text,
        }

    def _require_smtp(self):
        if not self.smtp_host:
            raise EmailExecutionError("Email connection is missing smtpHost.")
        if not self.username:
            raise EmailExecutionError("Email connection is missing username.")
        if self.auth_type == "oauth":
            if not self.smtp_access_token:
                raise EmailExecutionError("Email OAuth connection is missing smtp access token.")
        else:
            if not self.smtp_password:
                raise EmailExecutionError("Email connection is missing smtp password.")

    def _require_imap(self):
        if not self.imap_host:
            raise EmailExecutionError("Email connection is missing imapHost.")
        if not self.username:
            raise EmailExecutionError("Email connection is missing username.")
        if self.auth_type == "oauth":
            if not self.imap_access_token:
                raise EmailExecutionError("Email OAuth connection is missing imap access token.")
        else:
            if not self.imap_password:
                raise EmailExecutionError("Email connection is missing imap password.")

    def _oauth_auth_bytes(self, token: str) -> bytes:
        auth_value = f"user={self.username}\x01auth=Bearer {token}\x01\x01"
        return auth_value.encode("utf-8")

    def _connect_smtp(self):
        self._require_smtp()
        try:
            if self.smtp_use_ssl:
                client = smtplib.SMTP_SSL(self.smtp_host, self.smtp_port, timeout=self.timeout)
            else:
                client = smtplib.SMTP(self.smtp_host, self.smtp_port, timeout=self.timeout)
                client.ehlo()
                if self.smtp_use_starttls:
                    context = ssl.create_default_context()
                    client.starttls(context=context)
                    client.ehlo()

            if self.auth_type == "oauth":
                auth_b64 = base64.b64encode(self._oauth_auth_bytes(self.smtp_access_token)).decode("utf-8")
                code, _ = client.docmd("AUTH", f"XOAUTH2 {auth_b64}")
                if int(code) not in {235, 250}:
                    raise EmailExecutionError(
                        "SMTP OAuth authentication failed.",
                        details={"smtp_code": int(code)},
                    )
            else:
                client.login(self.username, self.smtp_password)
            return client
        except EmailExecutionError:
            raise
        except Exception as exc:
            raise EmailExecutionError("Unable to connect/authenticate to SMTP server.", details={"error": str(exc)})

    def _connect_imap(self):
        self._require_imap()
        try:
            if self.imap_use_ssl:
                client = imaplib.IMAP4_SSL(self.imap_host, self.imap_port)
            else:
                client = imaplib.IMAP4(self.imap_host, self.imap_port)

            if self.auth_type == "oauth":
                client.authenticate("XOAUTH2", lambda _: self._oauth_auth_bytes(self.imap_access_token))
            else:
                client.login(self.username, self.imap_password)
            return client
        except Exception as exc:
            raise EmailExecutionError("Unable to connect/authenticate to IMAP server.", details={"error": str(exc)})

    def _prepare_attachments(self, attachments: Any) -> list[dict[str, Any]]:
        if not isinstance(attachments, list):
            return []
        prepared: list[dict[str, Any]] = []
        for item in attachments:
            if not isinstance(item, dict):
                continue
            filename = str(item.get("filename") or item.get("fileName") or "").strip()
            content_b64 = str(item.get("contentBase64") or "").strip()
            if not filename or not content_b64:
                continue
            try:
                content = base64.b64decode(content_b64)
            except Exception:
                raise EmailExecutionError(
                    "Attachment contentBase64 must be valid base64.",
                    details={"filename": filename},
                )
            mime_type = str(item.get("mimeType") or "application/octet-stream").strip().lower()
            if "/" in mime_type:
                maintype, subtype = mime_type.split("/", 1)
            else:
                maintype, subtype = "application", "octet-stream"
            prepared.append(
                {
                    "filename": filename,
                    "content": content,
                    "maintype": maintype,
                    "subtype": subtype,
                }
            )
        return prepared

    def send_email(self, config: dict[str, Any]) -> Any:
        from_email = str(
            config.get("from")
            or config.get("fromEmail")
            or self.default_from_email
            or self.username
        ).strip()
        to_emails = self._normalize_list(config.get("to"))
        cc_emails = self._normalize_list(config.get("cc"))
        bcc_emails = self._normalize_list(config.get("bcc"))
        recipients = to_emails + cc_emails + bcc_emails
        if not recipients:
            raise EmailExecutionError("At least one recipient is required in `to`, `cc`, or `bcc`.")

        subject = str(config.get("subject") or "").strip()
        body_payload = config.get("body")
        body_text = str(config.get("bodyText") or config.get("text") or "").strip()
        body_html = str(config.get("bodyHtml") or config.get("html") or "").strip()
        if isinstance(body_payload, dict):
            if not body_text:
                body_text = str(body_payload.get("text") or "").strip()
            if not body_html:
                body_html = str(body_payload.get("html") or "").strip()

        message = EmailMessage()
        message["Message-ID"] = str(config.get("messageId") or make_msgid())
        message["From"] = from_email
        message["To"] = ", ".join(to_emails)
        if cc_emails:
            message["Cc"] = ", ".join(cc_emails)
        if self._is_set(config.get("replyTo")):
            message["Reply-To"] = str(config.get("replyTo"))
        if subject:
            message["Subject"] = subject

        if body_html and body_text:
            message.set_content(body_text)
            message.add_alternative(body_html, subtype="html")
        elif body_html:
            message.set_content(" ")
            message.add_alternative(body_html, subtype="html")
        else:
            message.set_content(body_text or "")

        for attachment in self._prepare_attachments(config.get("attachments")):
            message.add_attachment(
                attachment["content"],
                maintype=attachment["maintype"],
                subtype=attachment["subtype"],
                filename=attachment["filename"],
            )

        headers = config.get("headers")
        if isinstance(headers, dict):
            for key, value in headers.items():
                key_text = str(key or "").strip()
                if not key_text:
                    continue
                message[key_text] = str(value or "")

        smtp_client = self._connect_smtp()
        try:
            smtp_client.send_message(message, from_addr=from_email, to_addrs=recipients)
        except Exception as exc:
            raise EmailExecutionError("SMTP send failed.", details={"error": str(exc)})
        finally:
            try:
                smtp_client.quit()
            except Exception:
                pass

        return {
            "ok": True,
            "from": from_email,
            "to": to_emails,
            "cc": cc_emails,
            "bcc": bcc_emails,
            "subject": subject,
            "messageId": str(message.get("Message-ID") or ""),
            "recipientCount": len(recipients),
        }

    @staticmethod
    def _extract_uid(fetch_data: Any) -> str:
        if not isinstance(fetch_data, list):
            return ""
        for item in fetch_data:
            if isinstance(item, tuple) and item and isinstance(item[0], (bytes, bytearray)):
                text = item[0].decode("utf-8", errors="ignore")
                match = re.search(r"UID (\d+)", text)
                if match:
                    return match.group(1)
        return ""

    def _fetch_messages(
        self,
        *,
        mailbox: str,
        search_criteria: str,
        max_messages: int,
        mark_as_seen: bool,
    ) -> dict[str, Any]:
        client = self._connect_imap()
        try:
            status, _ = client.select(mailbox, readonly=not mark_as_seen)
            if status != "OK":
                raise EmailExecutionError(
                    f"Unable to select mailbox '{mailbox}'.",
                    details={"status": status},
                )
            status, data = client.search(None, search_criteria)
            if status != "OK":
                raise EmailExecutionError(
                    "IMAP search failed.",
                    details={"status": status, "criteria": search_criteria},
                )
            message_ids = []
            if data and isinstance(data[0], (bytes, bytearray)):
                message_ids = [item for item in data[0].split() if item]
            selected = message_ids[-max_messages:]
            messages: list[dict[str, Any]] = []
            for seq in selected:
                sequence_number = seq.decode("utf-8", errors="ignore")
                fetch_status, fetch_data = client.fetch(seq, "(RFC822 UID FLAGS)")
                if fetch_status != "OK":
                    continue
                raw_message = b""
                if isinstance(fetch_data, list):
                    for item in fetch_data:
                        if isinstance(item, tuple) and len(item) >= 2 and isinstance(item[1], (bytes, bytearray)):
                            raw_message = bytes(item[1])
                            break
                if not raw_message:
                    continue
                uid = self._extract_uid(fetch_data)
                parsed = self._parse_email(raw_message, sequence_number=sequence_number, uid=uid)
                messages.append(parsed)
                if mark_as_seen:
                    client.store(seq, "+FLAGS", "\\Seen")
            return {
                "ok": True,
                "mailbox": mailbox,
                "searchCriteria": search_criteria,
                "count": len(messages),
                "messages": messages,
            }
        except EmailExecutionError:
            raise
        except Exception as exc:
            raise EmailExecutionError("Unable to read messages from IMAP mailbox.", details={"error": str(exc)})
        finally:
            try:
                client.close()
            except Exception:
                pass
            try:
                client.logout()
            except Exception:
                pass

    def watch_inbox(self, config: dict[str, Any]) -> Any:
        mailbox = str(config.get("mailbox") or self.default_mailbox).strip() or "INBOX"
        search_criteria = str(config.get("search") or config.get("criteria") or "UNSEEN").strip() or "UNSEEN"
        max_messages = max(1, min(self._to_int(config.get("maxMessages"), 20), 100))
        mark_as_seen = self._to_bool(config.get("markAsSeen"), True)
        return self._fetch_messages(
            mailbox=mailbox,
            search_criteria=search_criteria,
            max_messages=max_messages,
            mark_as_seen=mark_as_seen,
        )

    def search_messages(self, config: dict[str, Any]) -> Any:
        mailbox = str(config.get("mailbox") or self.default_mailbox).strip() or "INBOX"
        search_criteria = str(config.get("search") or config.get("criteria") or "ALL").strip() or "ALL"
        max_messages = max(1, min(self._to_int(config.get("maxMessages"), 20), 100))
        return self._fetch_messages(
            mailbox=mailbox,
            search_criteria=search_criteria,
            max_messages=max_messages,
            mark_as_seen=False,
        )

    def get_message(self, config: dict[str, Any]) -> Any:
        mailbox = str(config.get("mailbox") or self.default_mailbox).strip() or "INBOX"
        sequence_number = str(config.get("sequenceNumber") or "").strip()
        uid = str(config.get("uid") or "").strip()
        if not sequence_number and not uid:
            raise EmailExecutionError("Either sequenceNumber or uid is required for email.get.message.")

        client = self._connect_imap()
        try:
            status, _ = client.select(mailbox, readonly=True)
            if status != "OK":
                raise EmailExecutionError(
                    f"Unable to select mailbox '{mailbox}'.",
                    details={"status": status},
                )

            target_seq = sequence_number
            if uid and not target_seq:
                uid_status, uid_data = client.uid("SEARCH", None, f"UID {uid}")
                if uid_status != "OK" or not uid_data or not uid_data[0]:
                    raise EmailExecutionError(
                        f"Message with uid '{uid}' not found.",
                        details={"uid_status": uid_status},
                    )
                target_seq = uid_data[0].split()[-1].decode("utf-8", errors="ignore")

            fetch_status, fetch_data = client.fetch(target_seq.encode("utf-8"), "(RFC822 UID FLAGS)")
            if fetch_status != "OK":
                raise EmailExecutionError(
                    f"Unable to fetch message '{target_seq}'.",
                    details={"status": fetch_status},
                )
            raw_message = b""
            if isinstance(fetch_data, list):
                for item in fetch_data:
                    if isinstance(item, tuple) and len(item) >= 2 and isinstance(item[1], (bytes, bytearray)):
                        raw_message = bytes(item[1])
                        break
            if not raw_message:
                raise EmailExecutionError(f"Message '{target_seq}' has no retrievable body.")

            resolved_uid = uid or self._extract_uid(fetch_data)
            message_payload = self._parse_email(
                raw_message,
                sequence_number=target_seq,
                uid=resolved_uid,
            )
            return {"ok": True, "mailbox": mailbox, "message": message_payload}
        finally:
            try:
                client.close()
            except Exception:
                pass
            try:
                client.logout()
            except Exception:
                pass

    def test_connection(self) -> dict[str, Any]:
        tested_protocols: list[str] = []
        if self.smtp_host:
            smtp_client = self._connect_smtp()
            try:
                smtp_client.noop()
            finally:
                try:
                    smtp_client.quit()
                except Exception:
                    pass
            tested_protocols.append("smtp")
        if self.imap_host:
            imap_client = self._connect_imap()
            try:
                status, _ = imap_client.select(self.default_mailbox, readonly=True)
                if status != "OK":
                    raise EmailExecutionError(
                        f"Unable to access mailbox '{self.default_mailbox}' during test.",
                        details={"status": status},
                    )
            finally:
                try:
                    imap_client.close()
                except Exception:
                    pass
                try:
                    imap_client.logout()
                except Exception:
                    pass
            tested_protocols.append("imap")

        if not tested_protocols:
            raise EmailExecutionError("Email connection must include SMTP or IMAP host settings.")
        return {"ok": True, "testedProtocols": tested_protocols}

    def execute(self, node_type: str, config: dict[str, Any]) -> Any:
        handlers: dict[str, Callable[[dict[str, Any]], Any]] = {
            "email.send": self.send_email,
            "email.watch.inbox": self.watch_inbox,
            "email.search.messages": self.search_messages,
            "email.get.message": self.get_message,
        }
        handler = handlers.get(node_type)
        if not handler:
            raise EmailExecutionError(f"Unsupported Email node type: {node_type}")
        return handler(config)
