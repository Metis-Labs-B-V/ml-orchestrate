#!/bin/bash

echo "Checking Azure login status..."
if ! az account show > /dev/null 2>&1; then
  echo "No active Azure session found. Logging in to Azure..."
  az login
else
  echo "Already logged in to Azure."
fi
TEAMS_WEBHOOK="https://metislabs.webhook.office.com/webhookb2/82bb3923-b280-448e-be86-d163da43e3bc@cc955ae0-9d3c-4364-9bd6-84c1c1f3c0b5/IncomingWebhook/3738c4829ffa4d1e981eb38327b279d0/f15dd15f-4e6a-4599-bbf5-961bb4dcb045/V27RqsHsv1CwiGKi7QG7oSW7Ydx9y7f3dJBvgMWQFRjpE1"

notify_teams() {
  local message="$1"
  if [ -n "$TEAMS_WEBHOOK" ]; then
    curl -sS -H "Content-Type: application/json" \
      -d "{\"text\":\"$message\"}" \
      "$TEAMS_WEBHOOK" >/dev/null 2>&1 || true
  fi
}

REGISTRY_NAME="metissolutionsweu.azurecr.io"
APP_NAME="app-mi-fe-prod-weu"
RESOURCE_GROUP="rg-metis-merchant-integration"
IMAGE_NAME="$REGISTRY_NAME/metis-orchestrate-frontend:latest"

echo "Logging in to ACR..."
az acr login --name ${REGISTRY_NAME%%.*}

notify_teams "Frontend build started (metis-orchestrate)."
echo "Building Docker image..."
if ! docker build --platform=linux/amd64 -t $IMAGE_NAME .; then
  notify_teams "Frontend build failed (metis-orchestrate)."
  echo "❌ Docker build failed. Exiting."
  exit 1
fi

echo "Pushing Docker image to ACR..."
if ! docker push $IMAGE_NAME; then
  echo "❌ Docker push failed. Exiting."
  exit 1
fi
notify_teams "Frontend image pushed successfully (metis-orchestrate)."

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

notify_teams "Frontend deployment done (metis-orchestrate)."
echo "✅ Done. Visit: https://$APP_NAME.azurewebsites.net"
