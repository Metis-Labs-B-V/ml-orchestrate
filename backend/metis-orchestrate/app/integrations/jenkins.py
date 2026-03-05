from typing import Any

import requests
from django.conf import settings


class JenkinsExecutionError(Exception):
    """Provider-specific execution error with structured payload."""

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


class JenkinsAdapter:
    def __init__(self, secret_payload: dict[str, Any]):
        self.base_url = str(
            secret_payload.get("baseUrl")
            or secret_payload.get("serviceUrl")
            or ""
        ).rstrip("/")
        self.access_token = str(secret_payload.get("accessToken") or "")
        self.timeout = int(getattr(settings, "JIRA_API_TIMEOUT_SECONDS", 30))

        if not self.base_url:
            raise JenkinsExecutionError("Jenkins connection is missing baseUrl.")
        if not self.access_token:
            raise JenkinsExecutionError("Jenkins OAuth accessToken is missing.")

        self.default_headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        self.session = requests.Session()

    def _build_url(self, path: str) -> str:
        if path.startswith("http://") or path.startswith("https://"):
            return path
        if not path.startswith("/"):
            path = f"/{path}"
        return f"{self.base_url}{path}"

    def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json_body: Any = None,
        headers: dict[str, Any] | None = None,
    ) -> Any:
        merged_headers = dict(self.default_headers)
        if headers:
            merged_headers.update(headers)

        response = self.session.request(
            method=method.upper(),
            url=self._build_url(path),
            headers=merged_headers,
            params=params,
            json=json_body,
            timeout=self.timeout,
        )

        try:
            payload = response.json()
        except ValueError:
            payload = {"raw": response.text}

        if response.status_code >= 400:
            message = None
            if isinstance(payload, dict):
                message = payload.get("message")
            if not message:
                message = f"Jenkins API request failed with status {response.status_code}."
            raise JenkinsExecutionError(
                message,
                status_code=response.status_code,
                details=payload,
            )
        return payload

    def api_call(self, config: dict[str, Any]) -> Any:
        method = str(config.get("method") or "GET").upper()
        path = str(config.get("path") or "")
        if not path:
            raise JenkinsExecutionError("path is required for jenkins.api.call.")

        params = config.get("params")
        headers = config.get("headers")
        body = config.get("body")
        if params is not None and not isinstance(params, dict):
            raise JenkinsExecutionError("params must be an object for jenkins.api.call.")
        if headers is not None and not isinstance(headers, dict):
            raise JenkinsExecutionError("headers must be an object for jenkins.api.call.")

        return self._request(
            method,
            path,
            params=params,
            json_body=body,
            headers=headers,
        )
