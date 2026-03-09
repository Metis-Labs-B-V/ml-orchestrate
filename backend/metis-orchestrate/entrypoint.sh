#!/bin/bash

# Exit immediately if any command fails
set -e

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "Running database migrations..."
  python manage.py migrate --noinput
fi

if [ "$#" -eq 0 ]; then
  set -- python manage.py runserver 0.0.0.0:8001
fi

echo "Starting process: $*"
exec "$@"
