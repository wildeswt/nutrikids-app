#!/usr/bin/env bash
# Encrypted PostgreSQL backup with retention (NK-44, RT-11). See docs/backups.md.
#
# The dump is piped straight into `gpg --symmetric` (AES-256, integrity-protected), so no
# unencrypted copy is ever written to disk.
#
# Required:
#   BACKUP_PASSPHRASE   passphrase for the encryption (keep it OUTSIDE the backup directory)
# Database (one of):
#   DOCKER_CONTAINER    run pg_dump inside this container (local dev: nutrikids-postgres)
#   DIRECT_URL          owner connection string, used with the local pg_dump
# Optional:
#   BACKUP_DIR          where backups are stored          (default: ./backups)
#   BACKUP_RETENTION_DAYS  delete backups older than this (default: 30)
#   POSTGRES_USER / POSTGRES_DB   used with DOCKER_CONTAINER (default: nutrikids)
set -euo pipefail

: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is required}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
[[ "$RETENTION_DAYS" =~ ^[1-9][0-9]*$ ]] || { echo "BACKUP_RETENTION_DAYS must be a positive integer" >&2; exit 2; }

if [[ -n "${DOCKER_CONTAINER:-}" ]]; then
  dump=(docker exec -i "$DOCKER_CONTAINER" pg_dump -U "${POSTGRES_USER:-nutrikids}" -d "${POSTGRES_DB:-nutrikids}" --format=custom --no-owner)
elif [[ -n "${DIRECT_URL:-}" ]]; then
  # pg_dump rejects Prisma's `?schema=public` suffix, so strip the query string.
  dump=(pg_dump "${DIRECT_URL%%\?*}" --format=custom --no-owner)
else
  echo "Set DOCKER_CONTAINER or DIRECT_URL" >&2
  exit 2
fi

mkdir -p "$BACKUP_DIR"
file="$BACKUP_DIR/nutrikids-$(date -u +%Y%m%dT%H%M%SZ).dump.gpg"
tmp="$file.partial"
trap 'rm -f "$tmp"' EXIT

"${dump[@]}" | gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-fd 3 \
  --symmetric --cipher-algo AES256 --output "$tmp" 3<<<"$BACKUP_PASSPHRASE"

[[ -s "$tmp" ]] || { echo "Backup is empty, aborting" >&2; exit 1; }
mv "$tmp" "$file"
echo "Backup written: $file ($(wc -c <"$file") bytes)"

# Retention: remove backups older than RETENTION_DAYS (only our own file pattern).
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'nutrikids-*.dump.gpg' -mtime "+$RETENTION_DAYS" -print -delete |
  sed 's/^/Expired backup removed: /'
