#!/usr/bin/env bash
# Build a concise markdown report from a release rehearsal log.
# Usage: ./scripts/rehearsal-report.sh <path-to-rehearsal-log>
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <path-to-rehearsal-log>"
  echo "Example: $0 ./rehearsals/release_rehearsal_20261001_220501.log"
  exit 1
fi

LOG_FILE="$1"
if [ ! -f "$LOG_FILE" ]; then
  echo "Log file not found: ${LOG_FILE}"
  exit 1
fi

ABS_LOG_PATH="$(cd "$(dirname "$LOG_FILE")" && pwd)/$(basename "$LOG_FILE")"
REPORT_FILE="${LOG_FILE%.log}.md"

if grep -q "\[rehearsal\] FAILED:" "$LOG_FILE"; then
  RESULT="FAILED"
else
  RESULT="PASSED"
fi

if grep -q "\[rehearsal\] COMPLETE" "$LOG_FILE"; then
  COMPLETE_FLAG="yes"
else
  COMPLETE_FLAG="no"
  RESULT="FAILED"
fi

START_LINE="$(grep -m1 "\[rehearsal\] Writing evidence" "$LOG_FILE" || true)"
START_TIME="$(date +%Y-%m-%dT%H:%M:%S%z)"
OK_COUNT="$(grep -c "\[rehearsal\] OK:" "$LOG_FILE" || true)"
SMOKE_PASS_COUNT="$(grep -c "\[smoke\] all smoke checks passed" "$LOG_FILE" || true)"

{
  echo "# Release Rehearsal Report"
  echo
  echo "- Result: ${RESULT}"
  echo "- Completed marker present: ${COMPLETE_FLAG}"
  echo "- Generated at: ${START_TIME}"
  echo "- Source log: ${ABS_LOG_PATH}"
  if [ -n "$START_LINE" ]; then
    echo "- Log header: ${START_LINE}"
  fi
  echo "- Successful action steps: ${OK_COUNT}"
  echo "- Smoke pass markers: ${SMOKE_PASS_COUNT}"
  echo
  echo "## Action Results"
  grep "\[rehearsal\] \(===\|OK:\|FAILED:\|COMPLETE\)" "$LOG_FILE" || true
  echo
  echo "## Smoke Results"
  grep "\[smoke\]" "$LOG_FILE" || true
  echo
  echo "## Final Compose Status"
  awk '
    /\[rehearsal\] === Final docker compose status ===/ {capture=1; next}
    capture && /\[rehearsal\] OK: Final docker compose status/ {capture=0}
    capture {print}
  ' "$LOG_FILE"
} > "$REPORT_FILE"

echo "Report written: ${REPORT_FILE}"
if [ "$RESULT" != "PASSED" ]; then
  exit 1
fi
