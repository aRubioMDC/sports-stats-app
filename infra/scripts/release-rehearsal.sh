#!/usr/bin/env bash
# Runs deploy -> rollback -> deploy and stores full output as release evidence.
# Usage: ./scripts/release-rehearsal.sh <rollback-tag> [forward-tag]
set -euo pipefail

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  echo "Usage: $0 <rollback-tag> [forward-tag]"
  echo "Example: $0 e00cb7d 1f6b805"
  exit 1
fi

ROLLBACK_TAG="$1"
FORWARD_TAG="${2:-}"

cd "$(dirname "$0")/.."

TS="$(date +%Y%m%d_%H%M%S)"
EVIDENCE_DIR="./rehearsals"
LOG_FILE="${EVIDENCE_DIR}/release_rehearsal_${TS}.log"

mkdir -p "$EVIDENCE_DIR"

echo "[rehearsal] Writing evidence to ${LOG_FILE}" | tee "$LOG_FILE"

action() {
  local label="$1"
  shift

  echo "[rehearsal] === ${label} ===" | tee -a "$LOG_FILE"
  if "$@" 2>&1 | tee -a "$LOG_FILE"; then
    echo "[rehearsal] OK: ${label}" | tee -a "$LOG_FILE"
  else
    echo "[rehearsal] FAILED: ${label}" | tee -a "$LOG_FILE"
    exit 1
  fi
}

action "Deploy current target tag" bash ./scripts/deploy.sh
action "Rollback to ${ROLLBACK_TAG}" bash ./scripts/rollback.sh "$ROLLBACK_TAG"

if [ -n "$FORWARD_TAG" ]; then
  action "Roll forward to ${FORWARD_TAG}" bash ./scripts/rollback.sh "$FORWARD_TAG"
else
  action "Redeploy current target tag" bash ./scripts/deploy.sh
fi

action "Final docker compose status" docker compose ps

echo "[rehearsal] COMPLETE" | tee -a "$LOG_FILE"
echo "[rehearsal] Evidence file: ${LOG_FILE}"
