#!/usr/bin/env bash
# Runs inside the `backup` compose service: nightly pg_dump + uploads archive with retention.
set -euo pipefail
RETENTION_DAYS="${RETENTION_DAYS:-30}"
while true; do
  stamp="$(date +%Y%m%d-%H%M%S)"
  pg_dump -h db -U om -d om --format=custom --file="/backups/om-${stamp}.dump"
  tar -czf "/backups/uploads-${stamp}.tar.gz" -C /uploads . 2>/dev/null || true
  find /backups -name 'om-*.dump' -mtime "+${RETENTION_DAYS}" -delete
  find /backups -name 'uploads-*.tar.gz' -mtime "+${RETENTION_DAYS}" -delete
  echo "[backup] ${stamp} done"
  sleep 86400
done
