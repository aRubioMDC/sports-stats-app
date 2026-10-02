#!/usr/bin/env bash
# Pulls the latest published images and recreates only the containers that
# changed. Run from infra/ (so docker compose picks up infra/.env).
set -euo pipefail
cd "$(dirname "$0")/.."

docker compose pull
docker compose up -d --remove-orphans
docker image prune -f

# Fail fast when runtime smoke checks fail after rollout.
bash ./scripts/post-deploy-smoke.sh

docker compose ps
