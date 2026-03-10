# Feature: Email Templates

## Overview
Managed email template library with versioning, variable substitution, preview, and test-send. Templates can be used by scenario nodes or sent standalone. Supports transactional, sales, support, reminder, and internal notification categories.

## What's Implemented
- Template CRUD: name, slug, description, category, system flag
- Template content: subject, HTML body, text body, variables schema (JSON schema), sample payload
- Template versioning (EmailTemplateVersion): version number, published flag, change notes
- Duplicate template action
- Version history listing
- Variable substitution via template runtime (`{{variable}}` syntax)
- Inline preview with sample payload
- Test-send action: pick SMTP connection, specify to/cc/bcc/reply-to, inject payload
- Workspace and tenant scoping

## File Locations
| Layer | Path |
|---|---|
| Backend models | `backend/metis-orchestrate/app/models.py` (EmailTemplate, EmailTemplateVersion) |
| Template runtime | `backend/metis-orchestrate/app/services/template_runtime.py` |
| Backend views | `backend/metis-orchestrate/app/views.py` (EmailTemplateViewSet) |
| Frontend | `frontend/pages/dashboard/email-templates/index.tsx` |

## Pending / To Be Implemented

### P1 — High Priority
- [ ] **Rich HTML editor (WYSIWYG)** — current UI likely uses a raw textarea; a drag-and-drop or block editor (e.g. MJML, Unlayer) would improve usability
- [ ] **Template rendering error surfacing** — if a variable is missing at send time, error should be caught and reported clearly
- [ ] **Unsubscribe / opt-out token injection** — no automatic unsubscribe link support for marketing-type templates
- [ ] **Template-level SMTP connection binding** — no default connection per template; must specify at send time every time

### P2 — Medium Priority
- [ ] **Template folders / organization** — all templates in flat list; no folder or tag grouping
- [ ] **Template import / export** — no way to export a template as portable JSON or HTML
- [ ] **Scheduling a template send** — no scheduled email blast (send to list at specific time)
- [ ] **Recipient list / audience targeting** — test-send is to individual addresses; no bulk send to a list
- [ ] **Template analytics** — no open rate, click rate, or delivery tracking
- [ ] **HTML template validation** — no lint/check for broken HTML before publishing

### P3 — Low Priority
- [ ] **Multilingual template variants** — one template per language
- [ ] **A/B variant testing support**
- [ ] **Attachment support in templates**
