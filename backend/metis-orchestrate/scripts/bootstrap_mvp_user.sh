#!/usr/bin/env bash
set -euo pipefail

EMAIL="${BOOTSTRAP_EMAIL:-deepak.kushwaha@metislabs.eu}"
PASSWORD="${BOOTSTRAP_PASSWORD:-Admin@123456}"
TENANT_NAME="${BOOTSTRAP_TENANT_NAME:-Metis Orchestrate}"
WORKSPACE_NAME="${BOOTSTRAP_WORKSPACE_NAME:-Metis Orchestrate Workspace}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${PROJECT_DIR}"

python manage.py migrate --noinput

python manage.py bootstrap_mvp_user \
  --email "${EMAIL}" \
  --password "${PASSWORD}" \
  --tenant-name "${TENANT_NAME}" \
  --workspace-name "${WORKSPACE_NAME}"
