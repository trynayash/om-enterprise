#!/usr/bin/env bash
# One-off backup to ./backups using DATABASE_URL (works with Supabase/Neon/self-hosted).
#   DATABASE_URL=postgres://... scripts/backup.sh
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
mkdir -p backups
stamp="$(date +%Y%m%d-%H%M%S)"
pg_dump "$DATABASE_URL" --format=custom --no-owner --file="backups/om-${stamp}.dump"
if [ -d "${UPLOAD_DIR:-storage/uploads}" ]; then
  tar -czf "backups/uploads-${stamp}.tar.gz" -C "${UPLOAD_DIR:-storage/uploads}" .
fi
echo "Backup written: backups/om-${stamp}.dump"
echo "Copy it off this machine (e.g. to Google Drive / S3) — a backup on the same disk is not a backup."
