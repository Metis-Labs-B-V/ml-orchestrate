#!/bin/bash

echo "Checking Azure login status..."
if ! az account show > /dev/null 2>&1; then
  echo "No active Azure session found. Logging in to Azure..."
  az login
else
  echo "Already logged in to Azure."
fi

APP_NAME="app-mi-be-prod-weu"
RESOURCE_GROUP="rg-metis-merchant-integration"

echo "🔁 Restarting App Service..."
az webapp restart --name "$APP_NAME" --resource-group "$RESOURCE_GROUP"

echo "⏳ Waiting for app to restart..."
sleep 10

echo "🧪 Checking app status..."
az webapp show \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query "{status: state, defaultHostName: defaultHostName}" \
  --output table

echo "✅ Done. Visit: https://api.mi.metissolutions.nl/health/"
