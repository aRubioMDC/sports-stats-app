#!/usr/bin/env bash
# Roll back frontend/backend images to a previous IMAGE_TAG and recreate stack.
# Usage: ./scripts/rollback.sh <image-tag>
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <image-tag>"
  echo "Example: $0 87e9c8f"
  exit 1
fi

TARGET_TAG="$1"
cd "$(dirname "$0")/.."

echo "Rolling back stack to IMAGE_TAG=${TARGET_TAG}"
IMAGE_TAG="${TARGET_TAG}" docker compose pull frontend backend
IMAGE_TAG="${TARGET_TAG}" docker compose up -d --remove-orphans

# Verify full runtime surface after rollback before reporting success.
bash ./scripts/post-deploy-smoke.sh

echo "Rollback successful: IMAGE_TAG=${TARGET_TAG}"
docker compose ps
