# HubSpot CRM Integration Scope

This document captures the HubSpot integration implemented in Metis Orchestrate.

## Current Status
- Implemented in backend adapter: `backend/metis-orchestrate/app/integrations/hubspot.py`
- Integrated into flow execution: `app/services/execution.py`
- Added to integration catalog/module picker: `app/catalog.py`
- Connection create/test supported in API + scenario UI

## Primary Focus
- Connection + Authentication
- Module picker grouping and operations aligned with provided reference screens

## Planned Groups and Operations

### CRM Objects
- Search for CRM Objects
- Add Members to a List
- Delete Members from a List

### Records (Deals, Contacts, Companies)
- Get a Record Property

### Custom Objects
- Create a Custom Object Record
- Get a Custom Object Record
- Update a Custom Object Record
- Delete a Custom Object Record

### Contacts
- Create a Contact
- Update a Contact
- Get a Contact
- Search for Contacts
- Merge Contacts
- Delete a Contact

### Deals
- Create a Deal
- Update a Deal
- Get a Deal
- Search for Deals
- Delete a Deal

### Companies
- Create a Company
- Update a Company
- Get a Company
- Search for Companies
- Delete a Company

### Engagements
- Create an Engagement
- Delete an Engagement

### Events and Notifications
- Create a Timeline Event
- List Timeline Event Templates

### Files
- Create a Folder
- List Files
- Upload a File
- Update File Properties
- Delete a Folder

### Users
- Get an Owner
- List Owners

### Tickets
- Create a Ticket
- Update a Ticket
- Get a Ticket
- Search for Tickets
- Delete a Ticket

### Forms
- Get a File Uploaded via Form
- List Forms
- Submit Data to a Form

### Workflows
- Add a Contact to a Workflow
- Remove a Contact from a Workflow

### Subscriptions
- Subscribe Contact
- Unsubscribe a Contact

### Quotes
- Get a Quote
- Update a Quote
- Delete a Quote

### Other
- Make an API Call

## Delivery Notes
- Build in adapter-first style (same pattern as Jira/HTTP/Jenkins).
- Preserve raw API output for mapping and downstream usage.
- Keep module definitions catalog-driven for quick additions/removals.

## Connection Payload (Current MVP)
- Provider: `hubspot`
- Auth type: `apiToken`
- `secret_payload` supports:
  - `accessToken` (recommended)
  - `privateAppToken`
  - `apiToken`
  - optional `serviceUrl` (defaults to `https://api.hubapi.com`)

Example:
```json
{
  "provider": "hubspot",
  "auth_type": "apiToken",
  "display_name": "HubSpot CRM connection",
  "secret_payload": {
    "serviceUrl": "https://api.hubapi.com",
    "accessToken": "pat-xxxx"
  }
}
```

## Execution and Mapping
- HubSpot nodes execute with resolved mapped tokens from upstream nodes.
- Raw and normalized outputs are stored in run steps for downstream mapping.
- Generic fallback node `hubspot.api.call` is available for unsupported endpoints.
