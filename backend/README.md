# Metis Orchestrate Backend

## Virtual Environment

Create venv:

```bash
python -m venv .venv
```

If `python` is unavailable, use `python3`.

Activate:

Linux/macOS:

```bash
source .venv/bin/activate
```

Windows PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
```

## Install Packages With `pipin`

The wrapper installs packages and regenerates `requirements.txt` using `pip-chill`.

```bash
python common_utils/scripts/pipin.py django djangorestframework
```

## Install Existing Dependencies

```bash
python -m pip install -r requirements.txt
```

## Optional `pipin` Shortcut

Linux/macOS:

```bash
alias pipin='python /path/to/ml-orchestrate/backend/common_utils/scripts/pipin.py'
```

Windows PowerShell:

```powershell
function pipin { python C:\path\to\ml-orchestrate\backend\common_utils\scripts\pipin.py $args }
```

## Run Locally

```bash
cd metis-orchestrate
python manage.py migrate
python manage.py runserver 127.0.0.1:8001
```

## Environment Settings

Shared backend env variables are loaded from `backend/.env`.

## Azure App Service Logs (If Using Azure)

Enable container logging:

```bash
az webapp log config \
  --name app-mi-be-prod-weu \
  --resource-group rg-metis-merchant-integration \
  --docker-container-logging filesystem
```

Tail logs:

```bash
az webapp log tail \
  --name app-mi-be-prod-weu \
  --resource-group rg-metis-merchant-integration
```

Portal log stream:
[Log Stream - app-mi-be-prod-weu](https://portal.azure.com/#@metislabs.eu/resource/subscriptions/b37b1a43-bec9-4e6f-964c-cd84710cfac6/resourceGroups/rg-metis-merchant-integration/providers/Microsoft.Web/sites/app-mi-be-prod-weu/logStream)

Screenshot reference:
![Azure App Service Log Stream](../docs/images/log-stream.png)

Download recent logs:

```bash
az webapp log download \
  --name app-mi-be-prod-weu \
  --resource-group rg-metis-merchant-integration \
  --log-file /tmp/appservice-logs.zip
```

## Production Secrets (Azure)

Update App Service environment variables in the Azure Portal and share updates
with DevOps as needed.

Portal link:
[Azure App Service Environment Variables](https://portal.azure.com/#@metislabs.eu/resource/subscriptions/b37b1a43-bec9-4e6f-964c-cd84710cfac6/resourceGroups/rg-metis-merchant-integration/providers/Microsoft.Web/sites/app-mi-be-prod-weu/environmentVariablesAppSettings)

Screenshot reference:
![Azure App Service Environment Variables](../docs/images/secrets-update.png)
