#!/usr/bin/env bash
# Pulls the latest published images and recreates only the containers that
# changed. Run from infra/ (so docker compose picks up infra/.env).
set -euo pipefail
cd "$(dirname "$0")/.."

docker compose pull
docker compose up -d --remove-orphans
docker image prune -f
docker compose ps
