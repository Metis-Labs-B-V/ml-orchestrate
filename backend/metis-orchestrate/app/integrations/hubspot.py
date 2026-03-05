import base64
import binascii
import json
from typing import Any, Callable

import requests
from django.conf import settings


class HubspotExecutionError(Exception):
    """HubSpot module execution error with structured payload."""

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


class HubspotAdapter:
    def __init__(self, secret_payload: dict[str, Any], *, auth_type: str = "apiToken"):
        self.auth_type = str(auth_type or "apiToken")
        self.service_url = str(
            secret_payload.get("serviceUrl")
            or secret_payload.get("apiBaseUrl")
            or "https://api.hubapi.com"
        ).rstrip("/")
        self.access_token = str(
            secret_payload.get("accessToken")
            or secret_payload.get("privateAppToken")
            or secret_payload.get("apiToken")
            or ""
        ).strip()
        self.timeout = int(
            getattr(
                settings,
                "ORCHESTRATE_HTTP_TIMEOUT_SECONDS",
                getattr(settings, "JIRA_API_TIMEOUT_SECONDS", 30),
            )
        )
        if not self.service_url:
            raise HubspotExecutionError("HubSpot connection is missing serviceUrl.")
        if not self.access_token:
            raise HubspotExecutionError(
                "HubSpot connection is missing accessToken/privateAppToken."
            )

        self.session = requests.Session()
        self.default_headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Accept": "application/json",
        }

    @staticmethod
    def _is_set(value: Any) -> bool:
        return value not in (None, "")

    @staticmethod
    def _safe_int(value: Any, default: int) -> int:
        try:
            return int(value)
        except (TypeError, ValueError):
            return default

    def _require(self, config: dict[str, Any], *keys: str) -> str:
        for key in keys:
            value = config.get(key)
            if self._is_set(value):
                return str(value)
        raise HubspotExecutionError(f"{keys[0]} is required.")

    def _collect_params(self, config: dict[str, Any], *keys: str) -> dict[str, Any]:
        params: dict[str, Any] = {}
        for key in keys:
            if self._is_set(config.get(key)):
                params[key] = config.get(key)
        return params

    def _build_url(self, path: str) -> str:
        if path.startswith("http://") or path.startswith("https://"):
            return path
        if not path.startswith("/"):
            path = f"/{path}"
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
        if files is not None or data is not None:
            merged_headers.pop("Content-Type", None)
        elif json_body is not None:
            merged_headers.setdefault("Content-Type", "application/json")

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
            payload = {"raw": response.text or ""}

        if response.status_code >= 400:
            message = None
            if isinstance(payload, dict):
                message = payload.get("message") or payload.get("error")
                if not message and isinstance(payload.get("errors"), list):
                    first = payload.get("errors")[0] if payload.get("errors") else None
                    if isinstance(first, dict):
                        message = first.get("message")
            if not message:
                message = f"HubSpot API request failed with status {response.status_code}."
            raise HubspotExecutionError(
                str(message),
                status_code=response.status_code,
                details=payload,
            )
        return payload

    def _object_path(self, object_type: str) -> str:
        return f"/crm/v3/objects/{object_type}"

    def _build_object_create_body(self, config: dict[str, Any]) -> dict[str, Any]:
        body = config.get("body")
        if isinstance(body, dict):
            return body

        properties = config.get("properties")
        if not isinstance(properties, dict):
            raise HubspotExecutionError("body or properties object is required.")

        payload: dict[str, Any] = {"properties": properties}
        associations = config.get("associations")
        if isinstance(associations, list):
            payload["associations"] = associations
        return payload

    def _search_object(self, config: dict[str, Any], object_type: str) -> Any:
        body = config.get("body")
        if isinstance(body, dict):
            payload = body
        else:
            payload: dict[str, Any] = {}
            if self._is_set(config.get("query")):
                payload["query"] = str(config.get("query"))
            if isinstance(config.get("filterGroups"), list):
                payload["filterGroups"] = config.get("filterGroups")
            if isinstance(config.get("sorts"), list):
                payload["sorts"] = config.get("sorts")
            if isinstance(config.get("properties"), list):
                payload["properties"] = config.get("properties")
            if self._is_set(config.get("limit")):
                payload["limit"] = self._safe_int(config.get("limit"), 100)
            if self._is_set(config.get("after")):
                payload["after"] = self._safe_int(config.get("after"), 0)
            if not payload:
                payload = {"limit": 100}
        return self._request("POST", f"{self._object_path(object_type)}/search", json_body=payload)

    # CRM Objects
    def search_crm_objects(self, config: dict[str, Any]) -> Any:
        object_type = self._require(config, "objectType", "object_type")
        return self._search_object(config, object_type)

    def add_members_to_list(self, config: dict[str, Any]) -> Any:
        list_id = self._require(config, "listId", "list_id")
        body = config.get("body")
        if not isinstance(body, dict):
            body = {
                "recordIds": config.get("recordIds") or config.get("ids") or [],
                "objectTypeId": config.get("objectTypeId") or "0-1",
            }
        return self._request("POST", f"/crm/v3/lists/{list_id}/memberships/add", json_body=body)

    def delete_members_from_list(self, config: dict[str, Any]) -> Any:
        list_id = self._require(config, "listId", "list_id")
        body = config.get("body")
        if not isinstance(body, dict):
            body = {
                "recordIds": config.get("recordIds") or config.get("ids") or [],
                "objectTypeId": config.get("objectTypeId") or "0-1",
            }
        return self._request("POST", f"/crm/v3/lists/{list_id}/memberships/remove", json_body=body)

    # Records metadata
    def get_record_property(self, config: dict[str, Any]) -> Any:
        object_type = self._require(config, "objectType", "object_type")
        property_name = self._require(config, "propertyName", "property_name")
        return self._request("GET", f"/crm/v3/properties/{object_type}/{property_name}")

    # Custom Objects
    def create_custom_object_record(self, config: dict[str, Any]) -> Any:
        object_type = self._require(config, "objectType", "object_type")
        body = self._build_object_create_body(config)
        return self._request("POST", self._object_path(object_type), json_body=body)

    def get_custom_object_record(self, config: dict[str, Any]) -> Any:
        object_type = self._require(config, "objectType", "object_type")
        record_id = self._require(config, "recordId", "record_id", "id")
        params = self._collect_params(config, "properties", "associations", "idProperty")
        return self._request(
            "GET",
            f"{self._object_path(object_type)}/{record_id}",
            params=params or None,
        )

    def update_custom_object_record(self, config: dict[str, Any]) -> Any:
        object_type = self._require(config, "objectType", "object_type")
        record_id = self._require(config, "recordId", "record_id", "id")
        body = self._build_object_create_body(config)
        return self._request(
            "PATCH",
            f"{self._object_path(object_type)}/{record_id}",
            json_body=body,
        )

    def delete_custom_object_record(self, config: dict[str, Any]) -> Any:
        object_type = self._require(config, "objectType", "object_type")
        record_id = self._require(config, "recordId", "record_id", "id")
        return self._request("DELETE", f"{self._object_path(object_type)}/{record_id}")

    # Contacts
    def create_contact(self, config: dict[str, Any]) -> Any:
        return self._request(
            "POST",
            self._object_path("contacts"),
            json_body=self._build_object_create_body(config),
        )

    def update_contact(self, config: dict[str, Any]) -> Any:
        contact_id = self._require(config, "contactId", "recordId", "id")
        return self._request(
            "PATCH",
            f"{self._object_path('contacts')}/{contact_id}",
            json_body=self._build_object_create_body(config),
        )

    def get_contact(self, config: dict[str, Any]) -> Any:
        contact_id = self._require(config, "contactId", "recordId", "id")
        params = self._collect_params(config, "properties", "associations", "idProperty")
        return self._request("GET", f"{self._object_path('contacts')}/{contact_id}", params=params or None)

    def search_contacts(self, config: dict[str, Any]) -> Any:
        return self._search_object(config, "contacts")

    def merge_contacts(self, config: dict[str, Any]) -> Any:
        body = config.get("body")
        if not isinstance(body, dict):
            primary_id = self._require(config, "primaryObjectId", "primary_id")
            merge_id = self._require(config, "objectIdToMerge", "merge_id")
            body = {
                "primaryObjectId": primary_id,
                "objectIdToMerge": merge_id,
            }
        return self._request("POST", f"{self._object_path('contacts')}/merge", json_body=body)

    def delete_contact(self, config: dict[str, Any]) -> Any:
        contact_id = self._require(config, "contactId", "recordId", "id")
        return self._request("DELETE", f"{self._object_path('contacts')}/{contact_id}")

    # Deals
    def create_deal(self, config: dict[str, Any]) -> Any:
        return self._request("POST", self._object_path("deals"), json_body=self._build_object_create_body(config))

    def update_deal(self, config: dict[str, Any]) -> Any:
        deal_id = self._require(config, "dealId", "recordId", "id")
        return self._request(
            "PATCH",
            f"{self._object_path('deals')}/{deal_id}",
            json_body=self._build_object_create_body(config),
        )

    def get_deal(self, config: dict[str, Any]) -> Any:
        deal_id = self._require(config, "dealId", "recordId", "id")
        params = self._collect_params(config, "properties", "associations", "idProperty")
        return self._request("GET", f"{self._object_path('deals')}/{deal_id}", params=params or None)

    def search_deals(self, config: dict[str, Any]) -> Any:
        return self._search_object(config, "deals")

    def delete_deal(self, config: dict[str, Any]) -> Any:
        deal_id = self._require(config, "dealId", "recordId", "id")
        return self._request("DELETE", f"{self._object_path('deals')}/{deal_id}")

    # Companies
    def create_company(self, config: dict[str, Any]) -> Any:
        return self._request(
            "POST",
            self._object_path("companies"),
            json_body=self._build_object_create_body(config),
        )

    def update_company(self, config: dict[str, Any]) -> Any:
        company_id = self._require(config, "companyId", "recordId", "id")
        return self._request(
            "PATCH",
            f"{self._object_path('companies')}/{company_id}",
            json_body=self._build_object_create_body(config),
        )

    def get_company(self, config: dict[str, Any]) -> Any:
        company_id = self._require(config, "companyId", "recordId", "id")
        params = self._collect_params(config, "properties", "associations", "idProperty")
        return self._request(
            "GET",
            f"{self._object_path('companies')}/{company_id}",
            params=params or None,
        )

    def search_companies(self, config: dict[str, Any]) -> Any:
        return self._search_object(config, "companies")

    def delete_company(self, config: dict[str, Any]) -> Any:
        company_id = self._require(config, "companyId", "recordId", "id")
        return self._request("DELETE", f"{self._object_path('companies')}/{company_id}")

    # Engagements
    def create_engagement(self, config: dict[str, Any]) -> Any:
        body = config.get("body")
        if not isinstance(body, dict):
            raise HubspotExecutionError("body object is required for hubspot.engagement.create.")
        return self._request("POST", "/engagements/v1/engagements", json_body=body)

    def delete_engagement(self, config: dict[str, Any]) -> Any:
        engagement_id = self._require(config, "engagementId", "engagement_id", "id")
        return self._request("DELETE", f"/engagements/v1/engagements/{engagement_id}")

    # Events and Notifications
    def create_timeline_event(self, config: dict[str, Any]) -> Any:
        body = config.get("body")
        if not isinstance(body, dict):
            raise HubspotExecutionError("body object is required for hubspot.timeline.event.create.")
        return self._request("POST", "/integrators/timeline/v3/events", json_body=body)

    def list_timeline_event_templates(self, config: dict[str, Any]) -> Any:
        app_id = self._require(config, "appId", "app_id")
        return self._request("GET", f"/integrators/timeline/v3/{app_id}/event-templates")

    # Files
    def create_folder(self, config: dict[str, Any]) -> Any:
        body = config.get("body")
        if not isinstance(body, dict):
            raise HubspotExecutionError("body object is required for hubspot.file.folder.create.")
        return self._request("POST", "/files/v3/folders", json_body=body)

    def list_files(self, config: dict[str, Any]) -> Any:
        params = self._collect_params(config, "limit", "after", "sort", "direction", "path")
        return self._request("GET", "/files/v3/files", params=params or None)

    def upload_file(self, config: dict[str, Any]) -> Any:
        files_data = config.get("files")
        if files_data is not None and isinstance(files_data, dict):
            form_data = config.get("data")
            return self._request(
                "POST",
                "/files/v3/files",
                files=files_data,
                data=form_data if isinstance(form_data, dict) else None,
            )

        file_base64 = str(config.get("fileBase64") or config.get("file_base64") or "").strip()
        file_name = str(config.get("fileName") or config.get("file_name") or "upload.bin").strip()
        if not file_base64:
            body = config.get("body")
            if isinstance(body, dict):
                return self._request("POST", "/files/v3/files", json_body=body)
            raise HubspotExecutionError(
                "fileBase64 is required for hubspot.file.upload when files/body is not provided."
            )

        try:
            decoded = base64.b64decode(file_base64)
        except (binascii.Error, ValueError):
            raise HubspotExecutionError("fileBase64 is not valid base64.")

        options = config.get("options")
        folder_id = config.get("folderId") or config.get("folder_id")
        charset = config.get("charset")

        data: dict[str, Any] = {}
        if isinstance(options, dict):
            data["options"] = json.dumps(options)
        if self._is_set(folder_id):
            data["folderId"] = str(folder_id)
        if self._is_set(charset):
            data["charsetHunch"] = str(charset)

        files = {"file": (file_name or "upload.bin", decoded)}
        return self._request("POST", "/files/v3/files", files=files, data=data or None)

    def update_file_properties(self, config: dict[str, Any]) -> Any:
        file_id = self._require(config, "fileId", "file_id", "id")
        body = config.get("body")
        if not isinstance(body, dict):
            raise HubspotExecutionError("body object is required for hubspot.file.update.")
        return self._request("PATCH", f"/files/v3/files/{file_id}", json_body=body)

    def delete_folder(self, config: dict[str, Any]) -> Any:
        folder_id = self._require(config, "folderId", "folder_id", "id")
        return self._request("DELETE", f"/files/v3/folders/{folder_id}")

    # Users / Owners
    def get_owner(self, config: dict[str, Any]) -> Any:
        owner_id = self._require(config, "ownerId", "owner_id", "id")
        params = self._collect_params(config, "idProperty", "email")
        return self._request("GET", f"/crm/v3/owners/{owner_id}", params=params or None)

    def list_owners(self, config: dict[str, Any]) -> Any:
        params = self._collect_params(config, "email", "after", "limit")
        if self._is_set(config.get("archived")):
            params["archived"] = config.get("archived")
        return self._request("GET", "/crm/v3/owners", params=params or None)

    # Tickets
    def create_ticket(self, config: dict[str, Any]) -> Any:
        return self._request(
            "POST",
            self._object_path("tickets"),
            json_body=self._build_object_create_body(config),
        )

    def update_ticket(self, config: dict[str, Any]) -> Any:
        ticket_id = self._require(config, "ticketId", "recordId", "id")
        return self._request(
            "PATCH",
            f"{self._object_path('tickets')}/{ticket_id}",
            json_body=self._build_object_create_body(config),
        )

    def get_ticket(self, config: dict[str, Any]) -> Any:
        ticket_id = self._require(config, "ticketId", "recordId", "id")
        params = self._collect_params(config, "properties", "associations", "idProperty")
        return self._request("GET", f"{self._object_path('tickets')}/{ticket_id}", params=params or None)

    def search_tickets(self, config: dict[str, Any]) -> Any:
        return self._search_object(config, "tickets")

    def delete_ticket(self, config: dict[str, Any]) -> Any:
        ticket_id = self._require(config, "ticketId", "recordId", "id")
        return self._request("DELETE", f"{self._object_path('tickets')}/{ticket_id}")

    # Forms
    def get_file_uploaded_via_form(self, config: dict[str, Any]) -> Any:
        file_id = self._require(config, "fileId", "file_id", "id")
        return self._request("GET", f"/forms/v2/uploads/files/{file_id}")

    def list_forms(self, config: dict[str, Any]) -> Any:
        params = self._collect_params(config, "formType", "limit", "offset")
        return self._request("GET", "/forms/v2/forms", params=params or None)

    def submit_data_to_form(self, config: dict[str, Any]) -> Any:
        portal_id = self._require(config, "portalId", "portal_id")
        form_guid = self._require(config, "formGuid", "form_guid")
        body = config.get("body")
        if not isinstance(body, dict):
            raise HubspotExecutionError("body object is required for hubspot.form.submit.")
        return self._request(
            "POST",
            f"/submissions/v3/integration/submit/{portal_id}/{form_guid}",
            json_body=body,
        )

    # Workflows
    def add_contact_to_workflow(self, config: dict[str, Any]) -> Any:
        workflow_id = self._require(config, "workflowId", "workflow_id")
        email = self._require(config, "email", "contactEmail", "contact_email")
        return self._request(
            "POST",
            f"/automation/v2/workflows/{workflow_id}/enrollments/contacts/{email}",
            json_body=config.get("body") if isinstance(config.get("body"), dict) else None,
        )

    def remove_contact_from_workflow(self, config: dict[str, Any]) -> Any:
        workflow_id = self._require(config, "workflowId", "workflow_id")
        email = self._require(config, "email", "contactEmail", "contact_email")
        return self._request(
            "DELETE",
            f"/automation/v2/workflows/{workflow_id}/enrollments/contacts/{email}",
        )

    # Subscriptions
    def subscribe_contact(self, config: dict[str, Any]) -> Any:
        body = config.get("body")
        if not isinstance(body, dict):
            raise HubspotExecutionError("body object is required for hubspot.subscription.contact.subscribe.")
        return self._request("POST", "/communication-preferences/v3/subscribe", json_body=body)

    def unsubscribe_contact(self, config: dict[str, Any]) -> Any:
        body = config.get("body")
        if not isinstance(body, dict):
            raise HubspotExecutionError("body object is required for hubspot.subscription.contact.unsubscribe.")
        return self._request("POST", "/communication-preferences/v3/unsubscribe", json_body=body)

    # Quotes
    def get_quote(self, config: dict[str, Any]) -> Any:
        quote_id = self._require(config, "quoteId", "recordId", "id")
        params = self._collect_params(config, "properties", "associations", "idProperty")
        return self._request("GET", f"{self._object_path('quotes')}/{quote_id}", params=params or None)

    def update_quote(self, config: dict[str, Any]) -> Any:
        quote_id = self._require(config, "quoteId", "recordId", "id")
        return self._request(
            "PATCH",
            f"{self._object_path('quotes')}/{quote_id}",
            json_body=self._build_object_create_body(config),
        )

    def delete_quote(self, config: dict[str, Any]) -> Any:
        quote_id = self._require(config, "quoteId", "recordId", "id")
        return self._request("DELETE", f"{self._object_path('quotes')}/{quote_id}")

    # Generic API call
    def api_call(self, config: dict[str, Any]) -> Any:
        method = str(config.get("method") or "GET").upper()
        path = str(config.get("path") or "").strip()
        if not path:
            raise HubspotExecutionError("path is required for hubspot.api.call.")

        params = config.get("params")
        headers = config.get("headers")
        body = config.get("body")

        if params is not None and not isinstance(params, dict):
            raise HubspotExecutionError("params must be an object for hubspot.api.call.")
        if headers is not None and not isinstance(headers, dict):
            raise HubspotExecutionError("headers must be an object for hubspot.api.call.")

        return self._request(
            method,
            path,
            params=params,
            json_body=body,
            headers=headers,
        )

    def execute(self, node_type: str, config: dict[str, Any]) -> Any:
        handlers: dict[str, Callable[[dict[str, Any]], Any]] = {
            "hubspot.crm.objects.search": self.search_crm_objects,
            "hubspot.crm.list.members.add": self.add_members_to_list,
            "hubspot.crm.list.members.delete": self.delete_members_from_list,
            "hubspot.crm.record.property.get": self.get_record_property,
            "hubspot.custom_object.record.create": self.create_custom_object_record,
            "hubspot.custom_object.record.get": self.get_custom_object_record,
            "hubspot.custom_object.record.update": self.update_custom_object_record,
            "hubspot.custom_object.record.delete": self.delete_custom_object_record,
            "hubspot.contact.create": self.create_contact,
            "hubspot.contact.update": self.update_contact,
            "hubspot.contact.get": self.get_contact,
            "hubspot.contact.search": self.search_contacts,
            "hubspot.contact.merge": self.merge_contacts,
            "hubspot.contact.delete": self.delete_contact,
            "hubspot.deal.create": self.create_deal,
            "hubspot.deal.update": self.update_deal,
            "hubspot.deal.get": self.get_deal,
            "hubspot.deal.search": self.search_deals,
            "hubspot.deal.delete": self.delete_deal,
            "hubspot.company.create": self.create_company,
            "hubspot.company.update": self.update_company,
            "hubspot.company.get": self.get_company,
            "hubspot.company.search": self.search_companies,
            "hubspot.company.delete": self.delete_company,
            "hubspot.engagement.create": self.create_engagement,
            "hubspot.engagement.delete": self.delete_engagement,
            "hubspot.timeline.event.create": self.create_timeline_event,
            "hubspot.timeline.event_templates.list": self.list_timeline_event_templates,
            "hubspot.file.folder.create": self.create_folder,
            "hubspot.file.list": self.list_files,
            "hubspot.file.upload": self.upload_file,
            "hubspot.file.update": self.update_file_properties,
            "hubspot.file.folder.delete": self.delete_folder,
            "hubspot.owner.get": self.get_owner,
            "hubspot.owner.list": self.list_owners,
            "hubspot.ticket.create": self.create_ticket,
            "hubspot.ticket.update": self.update_ticket,
            "hubspot.ticket.get": self.get_ticket,
            "hubspot.ticket.search": self.search_tickets,
            "hubspot.ticket.delete": self.delete_ticket,
            "hubspot.form.uploaded_file.get": self.get_file_uploaded_via_form,
            "hubspot.form.list": self.list_forms,
            "hubspot.form.submit": self.submit_data_to_form,
            "hubspot.workflow.contact.add": self.add_contact_to_workflow,
            "hubspot.workflow.contact.remove": self.remove_contact_from_workflow,
            "hubspot.subscription.contact.subscribe": self.subscribe_contact,
            "hubspot.subscription.contact.unsubscribe": self.unsubscribe_contact,
            "hubspot.quote.get": self.get_quote,
            "hubspot.quote.update": self.update_quote,
            "hubspot.quote.delete": self.delete_quote,
            "hubspot.api.call": self.api_call,
        }
        handler = handlers.get(node_type)
        if not handler:
            raise HubspotExecutionError(f"Unsupported HubSpot node type: {node_type}")
        return handler(config)
