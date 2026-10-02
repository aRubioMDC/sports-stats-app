#!/usr/bin/env bash
# Runtime smoke checks executed after deploy/rollback.
# Verifies reverse-proxy routing, core API endpoints, and frontend shell routes.
set -euo pipefail

cd "$(dirname "$0")/.."

MAX_ATTEMPTS="${SMOKE_MAX_ATTEMPTS:-20}"
SLEEP_SECONDS="${SMOKE_SLEEP_SECONDS:-3}"

log() {
  echo "[smoke] $*"
}

request_through_nginx() {
  local path="$1"
  docker compose exec -T nginx sh -lc "wget -qO- 'http://localhost${path}'"
}

retry_until_ready() {
  local label="$1"
  local path="$2"
  local attempt=1

  while [ "$attempt" -le "$MAX_ATTEMPTS" ]; do
    if request_through_nginx "$path" >/dev/null 2>&1; then
      log "${label} ready (${path})"
      return 0
    fi

    log "waiting for ${label} (${path}) attempt ${attempt}/${MAX_ATTEMPTS}"
    sleep "$SLEEP_SECONDS"
    attempt=$((attempt + 1))
  done

  log "FAILED: ${label} did not become ready"
  return 1
}

assert_contains() {
  local label="$1"
  local path="$2"
  local expected="$3"

  local payload
  payload="$(request_through_nginx "$path")"
  if [[ "$payload" == *"$expected"* ]]; then
    log "ok: ${label}"
    return 0
  fi

  log "FAILED: ${label} did not contain expected marker '${expected}'"
  return 1
}

log "starting post-deploy smoke checks"

retry_until_ready "api health" "/api/health"
retry_until_ready "home page" "/"

assert_contains "api health reports ok" "/api/health" '"status":"ok"'
assert_contains "sports list includes nfl" "/api/sports" '"nfl"'
assert_contains "sports list includes nhl" "/api/sports" '"nhl"'
assert_contains "nfl config endpoint" "/api/nfl/config" '"sport":"nfl"'
assert_contains "nhl config endpoint" "/api/nhl/config" '"sport":"nhl"'

# SPA shell checks: these routes should resolve to the same app shell HTML.
assert_contains "home app shell" "/" '<div id="root"></div>'
assert_contains "trends app shell" "/trends" '<div id="root"></div>'

log "all smoke checks passed"
