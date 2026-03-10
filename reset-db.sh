#!/usr/bin/env bash
# Reset the development database by removing the Docker volume.
# Usage: ./reset-db.sh
set -euo pipefail

echo "Stopping containers and removing pgdata volume..."
docker compose down -v

echo "Done. Run 'docker compose up --build' to start fresh."
