#!/usr/bin/env bash
# Restore a pg_dump backup into an EMPTY database (never over live data).
#   DATABASE_URL=postgres://.../om_restore scripts/restore.sh backups/om-YYYYMMDD-HHMMSS.dump
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
file="${1:?usage: scripts/restore.sh <backup.dump>}"
count="$(psql "$DATABASE_URL" -Atc "select count(*) from information_schema.tables where table_schema='public'")"
if [ "$count" != "0" ]; then
  echo "Refusing: target database is not empty ($count tables). Restore into a fresh database, verify, then switch over." >&2
  exit 1
fi
pg_restore --no-owner --exit-on-error --dbname="$DATABASE_URL" "$file"
echo "Restored $file. Verify with: psql \"\$DATABASE_URL\" -c 'select count(*) from documents'"
