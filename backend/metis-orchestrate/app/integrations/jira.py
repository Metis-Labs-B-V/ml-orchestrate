import base64
import binascii
import re
from typing import Any, Callable

import requests
from django.conf import settings


class JiraExecutionError(Exception):
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


class JiraAdapter:
    def __init__(
        self,
        secret_payload: dict[str, Any],
        *,
        auth_type: str = "apiToken",
    ):
        self.auth_type = str(auth_type or "apiToken")
        self.service_url = str(
            secret_payload.get("serviceUrl") or secret_payload.get("resourceUrl") or ""
        ).rstrip("/")
        self.username = str(secret_payload.get("username") or "")
        self.api_token = str(secret_payload.get("apiToken") or "")
        self.access_token = str(secret_payload.get("accessToken") or "")
        self.cloud_id = str(
            secret_payload.get("cloudId") or secret_payload.get("cloud_id") or ""
        ).strip()
        self.timeout = int(getattr(settings, "JIRA_API_TIMEOUT_SECONDS", 30))

        if self.auth_type == "oauth":
            if not self.access_token:
                raise JiraExecutionError("Jira OAuth connection is missing accessToken.")
            if not self.cloud_id:
                raise JiraExecutionError("Jira OAuth connection is missing cloudId.")
            self.api_base_url = f"https://api.atlassian.com/ex/jira/{self.cloud_id}"
            self.default_headers = {
                "Authorization": f"Bearer {self.access_token}",
                "Accept": "application/json",
                "Content-Type": "application/json",
            }
        else:
            if not self.service_url:
                raise JiraExecutionError("Jira connection is missing serviceUrl.")
            if not self.username:
                raise JiraExecutionError("Jira connection is missing username.")
            if not self.api_token:
                raise JiraExecutionError("Jira connection is missing apiToken.")

            basic = base64.b64encode(f"{self.username}:{self.api_token}".encode("utf-8")).decode(
                "utf-8"
            )
            self.default_headers = {
                "Authorization": f"Basic {basic}",
                "Accept": "application/json",
                "Content-Type": "application/json",
            }
        self.session = requests.Session()

    def _build_url(self, path: str) -> str:
        if path.startswith("http://") or path.startswith("https://"):
            return path
        if not path.startswith("/"):
            path = f"/{path}"
        if self.auth_type == "oauth":
            if path.startswith("/ex/jira/"):
                return f"https://api.atlassian.com{path}"
            return f"{self.api_base_url}{path}"
        return f"{self.service_url}{path}"

    def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json_body: Any = None,
        data: Any = None,
        files: Any = None,
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
            json=json_body if files is None and data is None else None,
            data=data,
            files=files,
            timeout=self.timeout,
        )

        if response.status_code == 204:
            return {"ok": True, "status_code": 204}

        try:
            payload = response.json()
        except ValueError:
            if response.text:
                payload = {"raw": response.text}
            else:
                payload = {"ok": True, "status_code": response.status_code}

        if response.status_code >= 400:
            message = None
            if isinstance(payload, dict):
                error_messages = payload.get("errorMessages")
                if isinstance(error_messages, list) and error_messages:
                    message = error_messages[0]
                message = message or payload.get("message")
            if not message:
                message = f"Jira API request failed with status {response.status_code}."
            raise JiraExecutionError(
                message,
                status_code=response.status_code,
                details=payload,
            )
        return payload

    @staticmethod
    def _is_set(value: Any) -> bool:
        return value not in (None, "")

    def _collect_params(self, config: dict[str, Any], *keys: str) -> dict[str, Any]:
        params: dict[str, Any] = {}
        for key in keys:
            if self._is_set(config.get(key)):
                params[key] = config.get(key)
        return params

    def _require(self, config: dict[str, Any], *keys: str) -> str:
        for key in keys:
            value = config.get(key)
            if self._is_set(value):
                return str(value)
        raise JiraExecutionError(f"{keys[0]} is required.")

    def _issue_id(self, config: dict[str, Any]) -> str:
        return self._require(config, "issueIdOrKey", "issueKey", "issue_id_or_key")

    def _comment_id(self, config: dict[str, Any]) -> str:
        return self._require(config, "commentId", "comment_id")

    def _field_id(self, config: dict[str, Any]) -> str:
        return self._require(config, "fieldId", "field_id")

    def _context_id(self, config: dict[str, Any]) -> str:
        return self._require(config, "contextId", "context_id")

    def _option_id(self, config: dict[str, Any]) -> str:
        return self._require(config, "optionId", "option_id")

    def _project_id(self, config: dict[str, Any]) -> str:
        return self._require(config, "projectIdOrKey", "project_id_or_key", "projectKey")

    def _component_id(self, config: dict[str, Any]) -> str:
        return self._require(config, "componentId", "component_id")

    def _version_id(self, config: dict[str, Any]) -> str:
        return self._require(config, "versionId", "version_id")

    def _attachment_id(self, config: dict[str, Any]) -> str:
        return self._require(config, "attachmentId", "attachment_id")

    def _link_id(self, config: dict[str, Any]) -> str:
        return self._require(config, "linkId", "issueLinkId", "link_id")

    def _account_id(self, config: dict[str, Any]) -> str:
        return self._require(config, "accountId", "account_id")

    def list_users(self, config: dict[str, Any]) -> Any:
        params = self._collect_params(
            config,
            "query",
            "startAt",
            "maxResults",
            "accountId",
            "property",
        )
        if self._is_set(config.get("includeActive")):
            params["includeActive"] = config.get("includeActive")
        if self._is_set(config.get("includeInactive")):
            params["includeInactive"] = config.get("includeInactive")
        return self._request("GET", "/rest/api/3/users/search", params=params or None)

    def search_users(self, config: dict[str, Any]) -> Any:
        return self.list_users(config)

    @staticmethod
    def _is_unbounded_jql_error(message: str, details: Any) -> bool:
        marker = "Unbounded JQL queries are not allowed here"
        if marker in str(message or ""):
            return True
        if isinstance(details, dict):
            if marker in str(details.get("message") or ""):
                return True
            error_messages = details.get("errorMessages")
            if isinstance(error_messages, list):
                return any(marker in str(item or "") for item in error_messages)
        return False

    @staticmethod
    def _with_updated_time_bound(jql: str, *, window: str = "-15m") -> str:
        text = str(jql or "").strip()
        if not text:
            return f"updated >= {window} ORDER BY updated DESC"

        if re.search(r"\bupdated\s*[><]=?\s*-[0-9]+[mhdw]\b", text, flags=re.IGNORECASE):
            return text

        order_by_match = re.search(r"\border\s+by\b", text, flags=re.IGNORECASE)
        if order_by_match:
            query_part = text[: order_by_match.start()].strip()
            order_part = text[order_by_match.start() :].strip()
            if not query_part:
                return f"updated >= {window} ORDER BY updated DESC"
            return f"({query_part}) AND updated >= {window} {order_part}"

        return f"({text}) AND updated >= {window} ORDER BY updated DESC"

    def _search_jql(self, config: dict[str, Any], default_jql: str) -> Any:
        params = self._collect_params(
            config,
            "jql",
            "startAt",
            "maxResults",
            "fields",
            "expand",
            "fieldsByKeys",
            "validateQuery",
            "failFast",
            "nextPageToken",
            "properties",
            "reconcileIssues",
        )
        if not params.get("jql"):
            params["jql"] = default_jql
        return self._request("GET", "/rest/api/3/search/jql", params=params or None)

    def watch_issues(self, config: dict[str, Any]) -> Any:
        configured_jql = str(config.get("jql") or "").strip()
        bounded_default = "updated >= -15m ORDER BY updated DESC"
        if not configured_jql:
            return self._search_jql(config, bounded_default)

        try:
            return self._search_jql(config, bounded_default)
        except JiraExecutionError as exc:
            if (
                exc.status_code == 400
                and self._is_unbounded_jql_error(exc.message, exc.details)
            ):
                bounded_config = dict(config)
                bounded_config["jql"] = self._with_updated_time_bound(configured_jql, window="-15m")
                return self._search_jql(bounded_config, bounded_default)
            raise

    def get_issue(self, config: dict[str, Any]) -> Any:
        issue_id_or_key = self._issue_id(config)
        params = self._collect_params(config, "fields", "expand", "properties", "updateHistory")
        return self._request("GET", f"/rest/api/3/issue/{issue_id_or_key}", params=params or None)

    def search_issues(self, config: dict[str, Any]) -> Any:
        return self._search_jql(config, "created >= -30d ORDER BY created DESC")

    def create_issue(self, config: dict[str, Any]) -> Any:
        fields = config.get("fields")
        if not isinstance(fields, dict):
            raise JiraExecutionError("fields object is required for jira.issue.create.")
        payload: dict[str, Any] = {"fields": fields}
        if isinstance(config.get("update"), dict):
            payload["update"] = config.get("update")
        return self._request("POST", "/rest/api/3/issue", json_body=payload)

    def update_issue(self, config: dict[str, Any]) -> Any:
        issue_id_or_key = self._issue_id(config)

        body: dict[str, Any] = {}
        if isinstance(config.get("fields"), dict):
            body["fields"] = config.get("fields")
        if isinstance(config.get("update"), dict):
            body["update"] = config.get("update")
        if not body:
            raise JiraExecutionError(
                "Either fields or update payload is required for jira.issue.update."
            )

        return self._request("PUT", f"/rest/api/3/issue/{issue_id_or_key}", json_body=body)

    def delete_issue(self, config: dict[str, Any]) -> Any:
        issue_id_or_key = self._issue_id(config)
        params = self._collect_params(config, "deleteSubtasks")
        return self._request("DELETE", f"/rest/api/3/issue/{issue_id_or_key}", params=params or None)

    def list_transitions(self, config: dict[str, Any]) -> Any:
        issue_id_or_key = self._issue_id(config)
        params = self._collect_params(config, "expand", "transitionId", "skipRemoteOnlyCondition")
        return self._request(
            "GET",
            f"/rest/api/3/issue/{issue_id_or_key}/transitions",
            params=params or None,
        )

    def transition_issue(self, config: dict[str, Any]) -> Any:
        issue_id_or_key = self._issue_id(config)
        transition = config.get("transition")
        if isinstance(transition, dict):
            payload = dict(config.get("body") or {})
            payload.setdefault("transition", transition)
        else:
            transition_id = self._require(config, "transitionId", "transition_id")
            payload = dict(config.get("body") or {})
            payload.setdefault("transition", {"id": str(transition_id)})
        return self._request("POST", f"/rest/api/3/issue/{issue_id_or_key}/transitions", json_body=payload)

    def assign_issue(self, config: dict[str, Any]) -> Any:
        issue_id_or_key = self._issue_id(config)
        account_id = self._account_id(config)
        return self._request(
            "PUT",
            f"/rest/api/3/issue/{issue_id_or_key}/assignee",
            json_body={"accountId": account_id},
        )

    def unassign_issue(self, config: dict[str, Any]) -> Any:
        issue_id_or_key = self._issue_id(config)
        return self._request(
            "PUT",
            f"/rest/api/3/issue/{issue_id_or_key}/assignee",
            json_body={"accountId": None},
        )

    def list_changelog(self, config: dict[str, Any]) -> Any:
        issue_id_or_key = self._issue_id(config)
        params = self._collect_params(config, "startAt", "maxResults")
        return self._request(
            "GET",
            f"/rest/api/3/issue/{issue_id_or_key}/changelog",
            params=params or None,
        )

    def create_comment(self, config: dict[str, Any]) -> Any:
        issue_id_or_key = self._issue_id(config)

        body = config.get("body")
        if isinstance(body, dict):
            payload = body
        else:
            text = config.get("comment") or config.get("text") or body
            if not text:
                raise JiraExecutionError("Comment body is required for jira.issue.comment.create.")
            payload = {"body": str(text)}

        return self._request(
            "POST",
            f"/rest/api/3/issue/{issue_id_or_key}/comment",
            json_body=payload,
        )

    def list_comments(self, config: dict[str, Any]) -> Any:
        issue_id_or_key = self._issue_id(config)
        params = self._collect_params(config, "startAt", "maxResults", "expand")
        return self._request("GET", f"/rest/api/3/issue/{issue_id_or_key}/comment", params=params or None)

    def get_comment(self, config: dict[str, Any]) -> Any:
        issue_id_or_key = self._issue_id(config)
        comment_id = self._comment_id(config)
        params = self._collect_params(config, "expand")
        return self._request(
            "GET",
            f"/rest/api/3/issue/{issue_id_or_key}/comment/{comment_id}",
            params=params or None,
        )

    def update_comment(self, config: dict[str, Any]) -> Any:
        issue_id_or_key = self._issue_id(config)
        comment_id = self._comment_id(config)
        body = config.get("body")
        if not isinstance(body, dict):
            text = config.get("comment") or config.get("text")
            if not text:
                raise JiraExecutionError("body or comment text is required for jira.issue.comment.update.")
            body = {"body": str(text)}
        return self._request(
            "PUT",
            f"/rest/api/3/issue/{issue_id_or_key}/comment/{comment_id}",
            json_body=body,
        )

    def delete_comment(self, config: dict[str, Any]) -> Any:
        issue_id_or_key = self._issue_id(config)
        comment_id = self._comment_id(config)
        return self._request("DELETE", f"/rest/api/3/issue/{issue_id_or_key}/comment/{comment_id}")

    def create_issue_link(self, config: dict[str, Any]) -> Any:
        body = config.get("body")
        if not isinstance(body, dict):
            raise JiraExecutionError("body object is required for jira.issue.link.create.")
        return self._request("POST", "/rest/api/3/issueLink", json_body=body)

    def get_issue_link(self, config: dict[str, Any]) -> Any:
        link_id = self._link_id(config)
        return self._request("GET", f"/rest/api/3/issueLink/{link_id}")

    def delete_issue_link(self, config: dict[str, Any]) -> Any:
        link_id = self._link_id(config)
        return self._request("DELETE", f"/rest/api/3/issueLink/{link_id}")

    def list_watchers(self, config: dict[str, Any]) -> Any:
        issue_id_or_key = self._issue_id(config)
        return self._request("GET", f"/rest/api/3/issue/{issue_id_or_key}/watchers")

    def add_watcher(self, config: dict[str, Any]) -> Any:
        issue_id_or_key = self._issue_id(config)
        account_id = self._account_id(config)
        return self._request(
            "POST",
            f"/rest/api/3/issue/{issue_id_or_key}/watchers",
            json_body=account_id,
        )

    def remove_watcher(self, config: dict[str, Any]) -> Any:
        issue_id_or_key = self._issue_id(config)
        account_id = self._account_id(config)
        return self._request(
            "DELETE",
            f"/rest/api/3/issue/{issue_id_or_key}/watchers",
            params={"accountId": account_id},
        )

    def add_attachment(self, config: dict[str, Any]) -> Any:
        issue_id_or_key = self._issue_id(config)
        filename = self._require(config, "fileName", "filename")
        encoded_content = self._require(config, "fileContentBase64", "contentBase64")
        content_type = str(config.get("contentType") or "application/octet-stream")
        try:
            binary = base64.b64decode(encoded_content, validate=True)
        except (binascii.Error, ValueError):
            raise JiraExecutionError("fileContentBase64 must be valid base64.")
        return self._request(
            "POST",
            f"/rest/api/3/issue/{issue_id_or_key}/attachments",
            headers={"X-Atlassian-Token": "no-check"},
            files={"file": (filename, binary, content_type)},
        )

    def get_attachment(self, config: dict[str, Any]) -> Any:
        attachment_id = self._attachment_id(config)
        return self._request("GET", f"/rest/api/3/attachment/{attachment_id}")

    def get_attachment_content(self, config: dict[str, Any]) -> Any:
        attachment_id = self._attachment_id(config)
        return self._request("GET", f"/rest/api/3/attachment/content/{attachment_id}")

    def delete_attachment(self, config: dict[str, Any]) -> Any:
        attachment_id = self._attachment_id(config)
        return self._request("DELETE", f"/rest/api/3/attachment/{attachment_id}")

    def list_fields(self, config: dict[str, Any]) -> Any:
        params = self._collect_params(config, "type", "id", "query", "startAt", "maxResults")
        return self._request("GET", "/rest/api/3/field/search", params=params or None)

    def create_field(self, config: dict[str, Any]) -> Any:
        body = config.get("body")
        if not isinstance(body, dict):
            raise JiraExecutionError("body object is required for jira.field.create.")
        return self._request("POST", "/rest/api/3/field", json_body=body)

    def update_field(self, config: dict[str, Any]) -> Any:
        field_id = self._field_id(config)
        body = config.get("body")
        if not isinstance(body, dict):
            raise JiraExecutionError("body object is required for jira.field.update.")
        return self._request("PUT", f"/rest/api/3/field/{field_id}", json_body=body)

    def delete_field(self, config: dict[str, Any]) -> Any:
        field_id = self._field_id(config)
        return self._request("DELETE", f"/rest/api/3/field/{field_id}")

    def list_field_options(self, config: dict[str, Any]) -> Any:
        field_id = self._field_id(config)
        context_id = self._context_id(config)
        params = self._collect_params(config, "startAt", "maxResults", "onlyOptions")
        return self._request(
            "GET",
            f"/rest/api/3/field/{field_id}/context/{context_id}/option",
            params=params or None,
        )

    def create_field_options(self, config: dict[str, Any]) -> Any:
        field_id = self._field_id(config)
        context_id = self._context_id(config)
        body = config.get("body")
        if not isinstance(body, dict):
            raise JiraExecutionError("body object is required for jira.field.option.create.")
        return self._request(
            "POST",
            f"/rest/api/3/field/{field_id}/context/{context_id}/option",
            json_body=body,
        )

    def update_field_options(self, config: dict[str, Any]) -> Any:
        field_id = self._field_id(config)
        context_id = self._context_id(config)
        body = config.get("body")
        if not isinstance(body, dict):
            raise JiraExecutionError("body object is required for jira.field.option.update.")
        return self._request(
            "PUT",
            f"/rest/api/3/field/{field_id}/context/{context_id}/option",
            json_body=body,
        )

    def delete_field_option(self, config: dict[str, Any]) -> Any:
        field_id = self._field_id(config)
        context_id = self._context_id(config)
        option_id = self._option_id(config)
        return self._request(
            "DELETE",
            f"/rest/api/3/field/{field_id}/context/{context_id}/option/{option_id}",
        )

    def reorder_field_options(self, config: dict[str, Any]) -> Any:
        field_id = self._field_id(config)
        context_id = self._context_id(config)
        body = config.get("body")
        if not isinstance(body, dict):
            raise JiraExecutionError("body object is required for jira.field.option.reorder.")
        return self._request(
            "PUT",
            f"/rest/api/3/field/{field_id}/context/{context_id}/option/move",
            json_body=body,
        )

    def list_project_components(self, config: dict[str, Any]) -> Any:
        project_id_or_key = self._project_id(config)
        params = self._collect_params(config, "componentSource")
        return self._request(
            "GET",
            f"/rest/api/3/project/{project_id_or_key}/components",
            params=params or None,
        )

    def create_project_component(self, config: dict[str, Any]) -> Any:
        body = config.get("body")
        if not isinstance(body, dict):
            raise JiraExecutionError("body object is required for jira.project.component.create.")
        return self._request("POST", "/rest/api/3/component", json_body=body)

    def get_project_component(self, config: dict[str, Any]) -> Any:
        component_id = self._component_id(config)
        return self._request("GET", f"/rest/api/3/component/{component_id}")

    def update_project_component(self, config: dict[str, Any]) -> Any:
        component_id = self._component_id(config)
        body = config.get("body")
        if not isinstance(body, dict):
            raise JiraExecutionError("body object is required for jira.project.component.update.")
        return self._request("PUT", f"/rest/api/3/component/{component_id}", json_body=body)

    def delete_project_component(self, config: dict[str, Any]) -> Any:
        component_id = self._component_id(config)
        params = self._collect_params(config, "moveIssuesTo")
        return self._request("DELETE", f"/rest/api/3/component/{component_id}", params=params or None)

    def list_project_versions(self, config: dict[str, Any]) -> Any:
        project_id_or_key = self._project_id(config)
        params = self._collect_params(config, "expand")
        return self._request(
            "GET",
            f"/rest/api/3/project/{project_id_or_key}/versions",
            params=params or None,
        )

    def create_project_version(self, config: dict[str, Any]) -> Any:
        body = config.get("body")
        if not isinstance(body, dict):
            raise JiraExecutionError("body object is required for jira.project.version.create.")
        return self._request("POST", "/rest/api/3/version", json_body=body)

    def get_project_version(self, config: dict[str, Any]) -> Any:
        version_id = self._version_id(config)
        params = self._collect_params(config, "expand")
        return self._request("GET", f"/rest/api/3/version/{version_id}", params=params or None)

    def update_project_version(self, config: dict[str, Any]) -> Any:
        version_id = self._version_id(config)
        body = config.get("body")
        if not isinstance(body, dict):
            raise JiraExecutionError("body object is required for jira.project.version.update.")
        return self._request("PUT", f"/rest/api/3/version/{version_id}", json_body=body)

    def delete_project_version(self, config: dict[str, Any]) -> Any:
        version_id = self._version_id(config)
        params = self._collect_params(config, "moveFixIssuesTo", "moveAffectedIssuesTo")
        return self._request("DELETE", f"/rest/api/3/version/{version_id}", params=params or None)

    def api_call(self, config: dict[str, Any]) -> Any:
        method = str(config.get("method") or "GET").upper()
        path = str(config.get("path") or "")
        if not path:
            raise JiraExecutionError("path is required for jira.api.call.")
        params = config.get("params")
        headers = config.get("headers")
        body = config.get("body")
        if params is not None and not isinstance(params, dict):
            raise JiraExecutionError("params must be an object for jira.api.call.")
        if headers is not None and not isinstance(headers, dict):
            raise JiraExecutionError("headers must be an object for jira.api.call.")

        return self._request(
            method,
            path,
            params=params,
            json_body=body,
            headers=headers,
        )

    def execute(self, node_type: str, config: dict[str, Any]) -> Any:
        handlers: dict[str, Callable[[dict[str, Any]], Any]] = {
            "jira.watch.issues": self.watch_issues,
            "jira.users.list": self.list_users,
            "jira.users.search": self.search_users,
            "jira.issue.get": self.get_issue,
            "jira.issue.search": self.search_issues,
            "jira.issue.create": self.create_issue,
            "jira.issue.update": self.update_issue,
            "jira.issue.delete": self.delete_issue,
            "jira.issue.transitions.list": self.list_transitions,
            "jira.issue.transition.list": self.list_transitions,
            "jira.issue.status.update": self.transition_issue,
            "jira.issue.transition.perform": self.transition_issue,
            "jira.issue.assign": self.assign_issue,
            "jira.issue.unassign": self.unassign_issue,
            "jira.issue.changelog.list": self.list_changelog,
            "jira.issue.comment.create": self.create_comment,
            "jira.issue.comment.add": self.create_comment,
            "jira.issue.comment.list": self.list_comments,
            "jira.issue.comment.get": self.get_comment,
            "jira.issue.comment.update": self.update_comment,
            "jira.issue.comment.delete": self.delete_comment,
            "jira.issue.link.create": self.create_issue_link,
            "jira.issue.link.get": self.get_issue_link,
            "jira.issue.link.delete": self.delete_issue_link,
            "jira.issue.watcher.list": self.list_watchers,
            "jira.issue.watcher.add": self.add_watcher,
            "jira.issue.watcher.remove": self.remove_watcher,
            "jira.issue.attachment.add": self.add_attachment,
            "jira.issue.attachment.get": self.get_attachment,
            "jira.issue.attachment.content": self.get_attachment_content,
            "jira.issue.attachment.delete": self.delete_attachment,
            "jira.field.list": self.list_fields,
            "jira.field.create": self.create_field,
            "jira.field.update": self.update_field,
            "jira.field.delete": self.delete_field,
            "jira.field.option.list": self.list_field_options,
            "jira.field.option.create": self.create_field_options,
            "jira.field.option.update": self.update_field_options,
            "jira.field.option.delete": self.delete_field_option,
            "jira.field.option.reorder": self.reorder_field_options,
            "jira.project.component.list": self.list_project_components,
            "jira.project.component.create": self.create_project_component,
            "jira.project.component.get": self.get_project_component,
            "jira.project.component.update": self.update_project_component,
            "jira.project.component.delete": self.delete_project_component,
            "jira.project.version.list": self.list_project_versions,
            "jira.project.version.create": self.create_project_version,
            "jira.project.version.get": self.get_project_version,
            "jira.project.version.update": self.update_project_version,
            "jira.project.version.delete": self.delete_project_version,
            "jira.api.call": self.api_call,
        }
        handler = handlers.get(node_type)
        if not handler:
            raise JiraExecutionError(f"Unsupported Jira node type: {node_type}")
        return handler(config)
