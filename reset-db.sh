#!/usr/bin/env bash
# Reset the development database by removing the Docker volume.
# Usage: ./reset-db.sh
set -euo pipefail

read -rp "This will wipe the dev database. Continue? [y/N] " confirm
if [[ "${confirm,,}" != "y" ]]; then
    echo "Aborted."
    exit 0
fi

echo "Stopping containers and removing pgdata volume..."
docker compose down -v

echo "Done. Run 'docker compose up --build' to start fresh."
