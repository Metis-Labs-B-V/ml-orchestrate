#!/usr/bin/env bash
set -euo pipefail

DRY_RUN=false
VAULT_NAME=""
FRONTEND_ONLY=false
BACKEND_ONLY=false

usage() {
  echo "Usage: $(basename "$0") [-n|--dry-run] [--frontend-only|--backend-only] <keyvault-name>" >&2
  echo "Or set KEYVAULT_NAME env var." >&2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -n|--dry-run)
      DRY_RUN=true
      shift
      ;;
    --frontend-only)
      FRONTEND_ONLY=true
      shift
      ;;
    --backend-only)
      BACKEND_ONLY=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    -*)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
    *)
      if [[ -z "$VAULT_NAME" ]]; then
        VAULT_NAME="$1"
      else
        echo "Unexpected argument: $1" >&2
        usage
        exit 1
      fi
      shift
      ;;
  esac
done

VAULT_NAME="${VAULT_NAME:-${KEYVAULT_NAME:-}}"

if [[ -z "${VAULT_NAME}" ]]; then
  usage
  exit 1
fi

if [[ "$FRONTEND_ONLY" == "true" && "$BACKEND_ONLY" == "true" ]]; then
  echo "Cannot use both --frontend-only and --backend-only." >&2
  exit 1
fi

if ! command -v az >/dev/null 2>&1; then
  echo "Azure CLI (az) is required but not found in PATH." >&2
  exit 1
fi

escape_env_value() {
  local val="$1"
  val=${val//\\/\\\\}
  val=${val//$'\n'/\\n}
  val=${val//"/\\"}
  printf '"%s"' "$val"
}

write_env_file() {
  local target_dir="$1"
  local filter_query="$2"
  local target_file="${target_dir}/.env"
  local tmp_file
  tmp_file="$(mktemp)"

  mkdir -p "$target_dir"

  # Fetch secret names filtered by tags
  local names
  names=$(az keyvault secret list \
    --vault-name "$VAULT_NAME" \
    --query "$filter_query" \
    -o tsv)

  if [[ -z "${names}" ]]; then
    echo "No secrets matched for ${target_dir}." >&2
    : > "$tmp_file"
  else
    while IFS= read -r name; do
      [[ -z "$name" ]] && continue
      local value
      value=$(az keyvault secret show \
        --vault-name "$VAULT_NAME" \
        --name "$name" \
        --query value \
        -o tsv)

      local key
      key=$(printf '%s' "$name" | tr '-' '_')
      printf '%s=%s\n' "$key" "$(escape_env_value "$value")" >> "$tmp_file"
    done <<< "$names"
  fi

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "Dry run: ${target_file} ($(wc -l < "$tmp_file") entries)"
    cat "$tmp_file"
    rm -f "$tmp_file"
  else
    mv "$tmp_file" "$target_file"
    echo "Wrote ${target_file}"
  fi
}

if [[ "$BACKEND_ONLY" != "true" ]]; then
  # Frontend: only secrets tagged isFrontend=true
  write_env_file "frontend" "[?tags.isFrontend=='true'].name"
fi

if [[ "$FRONTEND_ONLY" != "true" ]]; then
  # Backend: all others (isFrontend != 'true' or tag missing)
  write_env_file "backend" "[?tags.isFrontend!='true'].name"
fi
