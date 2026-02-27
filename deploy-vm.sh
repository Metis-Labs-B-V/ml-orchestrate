#!/usr/bin/env bash
#
# Deploy services on the VM via Docker Compose with guardrails to avoid mistakes.
# Usage:
#   ./deploy-vm.sh                 # deploys frontend + backend
#   ./deploy-vm.sh frontend         # deploys only frontend
#   ./deploy-vm.sh backend          # deploys only backend (metis-orchestrate)
#
# Notes:
# - This script runs `docker compose down` only for full deployments.
# - For single-service deploys, it stops/removes only that service.
# - It will fetch fresh env values via get-updated-env.sh before deploying.

set -euo pipefail

TEAMS_WEBHOOK="https://metislabs.webhook.office.com/webhookb2/82bb3923-b280-448e-be86-d163da43e3bc@cc955ae0-9d3c-4364-9bd6-84c1c1f3c0b5/IncomingWebhook/3738c4829ffa4d1e981eb38327b279d0/f15dd15f-4e6a-4599-bbf5-961bb4dcb045/V27RqsHsv1CwiGKi7QG7oSW7Ydx9y7f3dJBvgMWQFRjpE1"
KEYVAULT_NAME="kv-metis-mi-prod-weu"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$SCRIPT_DIR"

log() {
  echo "[deploy-vm] $*"
}

wait_for_targets() {
  local timeout="${1:-90}"
  local interval="${2:-3}"
  local start
  start="$(date +%s)"

  while true; do
    local missing=()
    for svc in "${TARGETS[@]}"; do
      if ! docker compose ps --services --status=running | grep -qx "$svc"; then
        missing+=("$svc")
      fi
    done

    if [[ "${#missing[@]}" -eq 0 ]]; then
      log "All target services are running."
      return 0
    fi

    if (( "$(date +%s)" - start >= timeout )); then
      log "Timed out waiting for services to start: ${missing[*]}"
      log "docker compose ps:"
      docker compose ps || true
      for svc in "${missing[@]}"; do
        log "Last 200 log lines for $svc:"
        docker compose logs --tail=200 "$svc" || true
      done
      return 1
    fi

    sleep "$interval"
  done
}

send_teams() {
  # Fire-and-forget Teams notification; do not fail the deployment if this fails.
  local message="$1"
  curl -sS -X POST -H "Content-Type: application/json" \
    -d "{\"text\": \"${message}\"}" \
    "$TEAMS_WEBHOOK" >/dev/null 2>&1 || true
}

usage() {
  cat <<'USAGE'
Usage:
  ./deploy-vm.sh                 # deploys frontend + backend
  ./deploy-vm.sh frontend         # deploys only frontend
  ./deploy-vm.sh backend          # deploys only backend (metis-orchestrate)
USAGE
}

trap 'send_teams "Deployment FAILED on VM. Check logs in the terminal running deploy-vm.sh.";' ERR

cd "$ROOT_DIR"

TARGETS=()
if [[ "$#" -eq 0 ]]; then
  TARGETS=("frontend" "metis-orchestrate")
else
  for arg in "$@"; do
    case "$arg" in
      frontend)
        TARGETS+=("frontend")
        ;;
      backend)
        TARGETS+=("metis-orchestrate")
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        log "Unknown argument: $arg"
        usage
        exit 1
        ;;
    esac
  done
fi

log "Starting deployment for: ${TARGETS[*]}"
send_teams "Deployment started on VM for: ${TARGETS[*]}"

if [[ "${#TARGETS[@]}" -eq 2 ]]; then
  log "Refreshing env for frontend + backend via get-updated-env.sh."
  ./get-updated-env.sh "$KEYVAULT_NAME"
elif [[ "${TARGETS[0]}" == "frontend" ]]; then
  log "Refreshing env for frontend via get-updated-env.sh."
  ./get-updated-env.sh --frontend-only "$KEYVAULT_NAME"
else
  log "Refreshing env for backend via get-updated-env.sh."
  ./get-updated-env.sh --backend-only "$KEYVAULT_NAME"
fi

if [[ "${#TARGETS[@]}" -eq 2 ]]; then
  log "Stopping existing services (docker compose down)."
  docker compose down
  log "Deploying frontend + backend (docker compose up --build -d)."
  docker compose up --build -d
else
  log "Stopping selected services: ${TARGETS[*]} (docker compose stop ...)."
  docker compose stop "${TARGETS[@]}"
  log "Removing selected service containers: ${TARGETS[*]} (docker compose rm -f ...)."
  docker compose rm -f "${TARGETS[@]}"
  log "Deploying selected services: ${TARGETS[*]} (docker compose up --build -d ...)."
  docker compose up --build -d "${TARGETS[@]}"
fi

log "Waiting for services to be running."
wait_for_targets

log "Deployment complete for: ${TARGETS[*]}"
send_teams "Deployment succeeded on VM for: ${TARGETS[*]}"
