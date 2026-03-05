import base64
import json
from typing import Any

import requests
from django.conf import settings


class HttpExecutionError(Exception):
    """HTTP module execution error with structured payload."""

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


class HttpAdapter:
    def __init__(self):
        self.timeout = int(
            getattr(
                settings,
                "ORCHESTRATE_HTTP_TIMEOUT_SECONDS",
                getattr(settings, "JIRA_API_TIMEOUT_SECONDS", 30),
            )
        )
        self.session = requests.Session()

    @staticmethod
    def _is_set(value: Any) -> bool:
        return value not in (None, "")

    @staticmethod
    def _normalize_map(value: Any, field_name: str) -> dict[str, Any]:
        if value in (None, ""):
            return {}
        if isinstance(value, dict):
            return {str(key): val for key, val in value.items() if str(key).strip()}
        if isinstance(value, list):
            normalized: dict[str, Any] = {}
            for item in value:
                if not isinstance(item, dict):
                    continue
                key = str(item.get("key") or item.get("name") or "").strip()
                if not key:
                    continue
                normalized[key] = item.get("value")
            return normalized
        raise HttpExecutionError(f"{field_name} must be an object or key/value list.")

    @staticmethod
    def _parse_bool(config: dict[str, Any], key: str, default: bool) -> bool:
        value = config.get(key)
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

    def _parse_timeout(self, config: dict[str, Any]) -> int:
        value = config.get("timeoutSeconds", self.timeout)
        try:
            timeout = int(value)
        except (TypeError, ValueError):
            raise HttpExecutionError("timeoutSeconds must be an integer between 1 and 300.")
        if timeout < 1 or timeout > 300:
            raise HttpExecutionError("timeoutSeconds must be an integer between 1 and 300.")
        return timeout

    @staticmethod
    def _parse_json_string(value: str) -> Any:
        try:
            return json.loads(value)
        except ValueError:
            return value

    def _resolve_request_body(
        self,
        config: dict[str, Any],
        method: str,
        headers: dict[str, Any],
    ) -> tuple[Any, Any]:
        body_type = str(config.get("bodyType") or "").strip().lower()
        body_value = config.get("body", config.get("requestBody"))

        if method in {"GET", "HEAD", "OPTIONS"} and body_type in {"", "none"} and body_value in (
            None,
            "",
        ):
            return None, None

        if body_type in {"none"}:
            return None, None

        if body_type in {"json", "application/json"}:
            if isinstance(body_value, str):
                parsed = self._parse_json_string(body_value)
                if parsed is body_value:
                    headers.setdefault("Content-Type", "application/json")
                    return None, body_value
                return parsed, None
            if body_value in (None, ""):
                return {}, None
            return body_value, None

        if body_type in {"text", "raw", "plain"}:
            headers.setdefault("Content-Type", "text/plain")
            return None, "" if body_value is None else str(body_value)

        if body_type in {"form", "x-www-form-urlencoded"}:
            payload = self._normalize_map(body_value, "body")
            headers.setdefault("Content-Type", "application/x-www-form-urlencoded")
            return None, payload

        if body_type in {"binary", "base64"}:
            if not isinstance(body_value, str) or not body_value.strip():
                raise HttpExecutionError("Binary body must be a non-empty base64 string.")
            try:
                decoded = base64.b64decode(body_value)
            except (ValueError, TypeError):
                raise HttpExecutionError("Binary body is not valid base64.")
            return None, decoded

        if isinstance(body_value, (dict, list, int, float, bool)):
            return body_value, None
        if body_value in (None, ""):
            return None, None
        return None, str(body_value)

    @staticmethod
    def _resolve_auth(
        config: dict[str, Any],
        headers: dict[str, Any],
        params: dict[str, Any],
    ) -> tuple[str, str] | None:
        auth_type = str(config.get("authType") or "none").strip().lower()
        if auth_type in {"none", "noauth", "no_authentication", "no authentication"}:
            return None
        if auth_type == "basic":
            username = str(config.get("basicUsername") or "").strip()
            password = str(config.get("basicPassword") or "")
            if not username:
                raise HttpExecutionError("basicUsername is required for basic authentication.")
            return (username, password)
        if auth_type == "bearer":
            token = str(config.get("bearerToken") or "").strip()
            if not token:
                raise HttpExecutionError("bearerToken is required for bearer authentication.")
            headers["Authorization"] = f"Bearer {token}"
            return None
        if auth_type in {"apikey", "api_key"}:
            key_name = str(config.get("apiKeyName") or "").strip()
            key_value = str(config.get("apiKeyValue") or "")
            key_in = str(config.get("apiKeyIn") or "header").strip().lower()
            if not key_name:
                raise HttpExecutionError("apiKeyName is required for API key authentication.")
            if not key_value:
                raise HttpExecutionError("apiKeyValue is required for API key authentication.")
            if key_in == "query":
                params[key_name] = key_value
            else:
                headers[key_name] = key_value
            return None
        raise HttpExecutionError(f"Unsupported authentication type '{auth_type}'.")

    @staticmethod
    def _build_response_payload(response: requests.Response, method: str, parse_response: bool) -> Any:
        raw_text = response.text or ""
        content_type = str(response.headers.get("Content-Type") or "")
        parsed_body: Any = raw_text

        if parse_response:
            looks_like_json = raw_text.strip().startswith("{") or raw_text.strip().startswith("[")
            if "json" in content_type.lower() or looks_like_json:
                try:
                    parsed_body = response.json()
                except ValueError:
                    parsed_body = raw_text

        return {
            "ok": response.ok,
            "statusCode": response.status_code,
            "reason": response.reason,
            "method": method,
            "url": response.url,
            "headers": dict(response.headers),
            "contentType": content_type,
            "body": parsed_body,
            "text": raw_text,
            "sizeBytes": len(response.content or b""),
        }

    def make_request(self, config: dict[str, Any]) -> Any:
        method = str(config.get("method") or "GET").strip().upper()
        url = str(config.get("url") or config.get("endpoint") or "").strip()
        if not url:
            raise HttpExecutionError("url is required for http.make_request.")
        if not (url.startswith("https://") or url.startswith("http://")):
            raise HttpExecutionError("url must start with http:// or https://")

        headers = self._normalize_map(config.get("headers"), "headers")
        params = self._normalize_map(config.get("query", config.get("params")), "query")
        parse_response = self._parse_bool(config, "parseResponse", True)
        fail_on_http_error = self._parse_bool(config, "failOnHttpError", True)
        allow_redirects = self._parse_bool(config, "allowRedirects", True)
        timeout = self._parse_timeout(config)

        auth = self._resolve_auth(config, headers, params)
        json_body, data_body = self._resolve_request_body(config, method, headers)

        try:
            response = self.session.request(
                method=method,
                url=url,
                params=params or None,
                headers=headers or None,
                auth=auth,
                json=json_body,
                data=data_body,
                allow_redirects=allow_redirects,
                timeout=timeout,
            )
        except requests.RequestException as exc:
            raise HttpExecutionError("HTTP request failed to execute.", details={"error": str(exc)})

        payload = self._build_response_payload(response, method, parse_response)
        if fail_on_http_error and response.status_code >= 400:
            raise HttpExecutionError(
                f"HTTP request failed with status {response.status_code}.",
                status_code=response.status_code,
                details=payload,
            )
        return payload

    def download_file(self, config: dict[str, Any]) -> Any:
        url = str(config.get("url") or "").strip()
        if not url:
            raise HttpExecutionError("url is required for http.download_file.")
        if not (url.startswith("https://") or url.startswith("http://")):
            raise HttpExecutionError("url must start with http:// or https://")

        timeout = self._parse_timeout(config)
        allow_redirects = self._parse_bool(config, "allowRedirects", True)
        fail_on_http_error = self._parse_bool(config, "failOnHttpError", True)
        headers = self._normalize_map(config.get("headers"), "headers")
        params = self._normalize_map(config.get("query", config.get("params")), "query")

        try:
            response = self.session.get(
                url,
                params=params or None,
                headers=headers or None,
                timeout=timeout,
                allow_redirects=allow_redirects,
            )
        except requests.RequestException as exc:
            raise HttpExecutionError("HTTP download failed.", details={"error": str(exc)})

        if fail_on_http_error and response.status_code >= 400:
            raise HttpExecutionError(
                f"HTTP download failed with status {response.status_code}.",
                status_code=response.status_code,
                details={"url": response.url, "statusCode": response.status_code},
            )

        file_name = str(config.get("fileName") or "").strip() or "download.bin"
        content_disposition = str(response.headers.get("Content-Disposition") or "")
        if "filename=" in content_disposition:
            inferred_name = content_disposition.split("filename=", 1)[1].strip().strip('"')
            if inferred_name:
                file_name = inferred_name

        return {
            "ok": response.ok,
            "statusCode": response.status_code,
            "url": response.url,
            "fileName": file_name,
            "contentType": str(response.headers.get("Content-Type") or ""),
            "sizeBytes": len(response.content or b""),
            "contentBase64": base64.b64encode(response.content or b"").decode("utf-8"),
            "headers": dict(response.headers),
        }

    def resolve_url(self, config: dict[str, Any]) -> Any:
        url = str(config.get("url") or "").strip()
        if not url:
            raise HttpExecutionError("url is required for http.resolve_url.")
        if not (url.startswith("https://") or url.startswith("http://")):
            raise HttpExecutionError("url must start with http:// or https://")

        timeout = self._parse_timeout(config)
        allow_redirects = self._parse_bool(config, "allowRedirects", True)
        headers = self._normalize_map(config.get("headers"), "headers")
        params = self._normalize_map(config.get("query", config.get("params")), "query")
        method = str(config.get("method") or "GET").strip().upper()
        if method not in {"GET", "HEAD"}:
            method = "GET"

        try:
            response = self.session.request(
                method=method,
                url=url,
                params=params or None,
                headers=headers or None,
                timeout=timeout,
                allow_redirects=allow_redirects,
            )
        except requests.RequestException as exc:
            raise HttpExecutionError("HTTP resolve URL failed.", details={"error": str(exc)})

        return {
            "ok": response.ok,
            "statusCode": response.status_code,
            "method": method,
            "inputUrl": url,
            "finalUrl": response.url,
            "history": [item.url for item in response.history],
            "headers": dict(response.headers),
        }

