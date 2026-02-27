#!/bin/bash

# Exit immediately if any command fails
set -e

echo "Running database migrations..."
python manage.py migrate --noinput


echo "Starting supervisord for metis-orchestrate..."
exec supervisord -c /etc/supervisor/conf.d/supervisord.conf
