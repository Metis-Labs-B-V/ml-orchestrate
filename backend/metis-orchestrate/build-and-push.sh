#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMON_UTILS_SRC="../common_utils"
COMMON_UTILS_DEST="./common_utils"
TEAMS_WEBHOOK="https://metislabs.webhook.office.com/webhookb2/82bb3923-b280-448e-be86-d163da43e3bc@cc955ae0-9d3c-4364-9bd6-84c1c1f3c0b5/IncomingWebhook/3738c4829ffa4d1e981eb38327b279d0/f15dd15f-4e6a-4599-bbf5-961bb4dcb045/V27RqsHsv1CwiGKi7QG7oSW7Ydx9y7f3dJBvgMWQFRjpE1"

notify_teams() {
  local message="$1"
  if [ -n "$TEAMS_WEBHOOK" ]; then
    curl -sS -H "Content-Type: application/json" \
      -d "{\"text\":\"$message\"}" \
      "$TEAMS_WEBHOOK" >/dev/null 2>&1 || true
  fi
}


echo "Preparing build context..."
if [ ! -d "$COMMON_UTILS_SRC" ]; then
  echo "❌ common_utils not found at $COMMON_UTILS_SRC"
  exit 1
fi

rm -rf "$COMMON_UTILS_DEST"
mkdir -p "$COMMON_UTILS_DEST"
cp -a "$COMMON_UTILS_SRC"/. "$COMMON_UTILS_DEST"/

echo "Checking Azure login status..."
if ! az account show > /dev/null 2>&1; then
  echo "No active Azure session found. Logging in to Azure..."
  az login
else
  echo "Already logged in to Azure."
fi
REGISTRY_NAME="metissolutionsweu.azurecr.io"
APP_NAME="app-mi-be-prod-weu"
RESOURCE_GROUP="rg-metis-merchant-integration"
IMAGE_NAME="$REGISTRY_NAME/metis-orchestrate-backend:latest"

echo "Logging in to ACR..."
az acr login --name ${REGISTRY_NAME%%.*}

notify_teams "Backend build started (metis-orchestrate)."
echo "Building Docker image..."
if ! docker build --platform=linux/amd64 -t $IMAGE_NAME .; then
  notify_teams "Backend build failed (metis-orchestrate)."
  echo "❌ Docker build failed. Exiting."
  exit 1
fi

echo "Pushing Docker image to ACR..."
if ! docker push $IMAGE_NAME; then
  notify_teams "Backend build failed, Docker push failed (metis-orchestrate)."
  echo "❌ Docker push failed. Exiting."
  exit 1
fi
notify_teams "Backend image pushed successfully (metis-orchestrate)."

echo "✅ Done. Image pushed to ACR. App Service should pull 'latest' automatically."

echo "🔁 Restarting App Service to trigger pull..."
az webapp restart --name $APP_NAME --resource-group $RESOURCE_GROUP

echo "⏳ Waiting for app to restart..."
sleep 10

echo "🧪 Checking app status..."
az webapp show \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --query "{status: state, defaultHostName: defaultHostName}" \
  --output table

notify_teams "Backend deployment done (metis-orchestrate)."
echo "✅ Done. Visit: https://api.mi.metissolutions.nl/health/"
