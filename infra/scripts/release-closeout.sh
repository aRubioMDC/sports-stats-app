#!/usr/bin/env bash
# One-shot release validation: rehearsal run + report generation + closeout checks.
# Usage: ./scripts/release-closeout.sh <rollback-tag> [forward-tag]
set -euo pipefail

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  echo "Usage: $0 <rollback-tag> [forward-tag]"
  echo "Example: $0 e00cb7d a3f6153"
  exit 1
fi

ROLLBACK_TAG="$1"
FORWARD_TAG="${2:-}"

cd "$(dirname "$0")/.."

run_and_capture() {
  local tmp_output
  tmp_output="$(mktemp)"

  if [ -n "$FORWARD_TAG" ]; then
    bash ./scripts/release-rehearsal.sh "$ROLLBACK_TAG" "$FORWARD_TAG" | tee "$tmp_output"
  else
    bash ./scripts/release-rehearsal.sh "$ROLLBACK_TAG" | tee "$tmp_output"
  fi

  local log_path
  log_path="$(grep -m1 "\[rehearsal\] Evidence file:" "$tmp_output" | sed -E 's/^.*Evidence file: //')"
  rm -f "$tmp_output"

  if [ -z "$log_path" ]; then
    echo "[closeout] Could not detect rehearsal log path from script output."
    exit 1
  fi

  echo "$log_path"
}

LOG_FILE="$(run_and_capture)"
if [ ! -f "$LOG_FILE" ]; then
  echo "[closeout] Rehearsal log file not found: $LOG_FILE"
  exit 1
fi

bash ./scripts/rehearsal-report.sh "$LOG_FILE"
REPORT_FILE="${LOG_FILE%.log}.md"
if [ ! -f "$REPORT_FILE" ]; then
  echo "[closeout] Expected report file missing: $REPORT_FILE"
  exit 1
fi

if ! grep -q -- "- Result: PASSED" "$REPORT_FILE"; then
  echo "[closeout] Report result is not PASSED."
  exit 1
fi

if ! grep -q -- "- Completed marker present: yes" "$REPORT_FILE"; then
  echo "[closeout] Completed marker missing in report."
  exit 1
fi

echo "[closeout] SUCCESS"
echo "[closeout] Rehearsal log: $LOG_FILE"
echo "[closeout] Rehearsal report: $REPORT_FILE"
