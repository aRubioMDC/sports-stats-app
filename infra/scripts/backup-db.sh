#!/usr/bin/env bash
# Nightly extra backup of the Supabase database on top of Supabase's own
# backups — cheap redundancy in case of accidental data loss/misconfiguration.
# Install via cron, e.g.: 0 3 * * * /home/admin/hitrate/infra/scripts/backup-db.sh
set -euo pipefail
cd "$(dirname "$0")/.."

# shellcheck disable=SC1091
source .env

BACKUP_DIR="./backups"
KEEP_DAYS=14
STAMP="$(date +%F)"

mkdir -p "$BACKUP_DIR"
pg_dump "$DATABASE_URL" | gzip > "$BACKUP_DIR/hitrate-$STAMP.sql.gz"

find "$BACKUP_DIR" -name "hitrate-*.sql.gz" -mtime "+$KEEP_DAYS" -delete

echo "Backup complete: $BACKUP_DIR/hitrate-$STAMP.sql.gz"
