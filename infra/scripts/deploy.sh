#!/usr/bin/env bash
# Pulls the latest published images and recreates only the containers that
# changed. Run from infra/ (so docker compose picks up infra/.env).
set -euo pipefail
cd "$(dirname "$0")/.."

docker compose pull
docker compose up -d --remove-orphans
docker image prune -f

# Fail fast when the API is not healthy after rollout.
docker compose exec -T backend python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health', timeout=5)"

docker compose ps
