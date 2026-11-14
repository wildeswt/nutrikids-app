#!/usr/bin/env bash
# Restore an encrypted backup made by backup.sh into a database (NK-44, RT-11).
# See docs/backups.md. Refuses to touch a non-empty target unless RESTORE_CLEAN=1.
#
# Usage: scripts/backup/restore.sh <backup-file.dump.gpg> <target-database>
#
# Required:
#   BACKUP_PASSPHRASE   the passphrase used by backup.sh
# Server (one of):
#   DOCKER_CONTAINER    restore inside this container (local dev: nutrikids-postgres)
#   DIRECT_URL          owner connection string; the target database name replaces the one in it
# Optional:
#   RESTORE_CLEAN=1     drop and recreate the target database first
#   POSTGRES_USER       used with DOCKER_CONTAINER (default: nutrikids)
set -euo pipefail

[[ $# -eq 2 ]] || { echo "Usage: $0 <backup-file.dump.gpg> <target-database>" >&2; exit 2; }
file="$1"
target="$2"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is required}"
[[ -f "$file" ]] || { echo "Backup not found: $file" >&2; exit 2; }
[[ "$target" =~ ^[a-z_][a-z0-9_]*$ ]] || { echo "Target database name must match [a-z_][a-z0-9_]*" >&2; exit 2; }

if [[ -n "${DOCKER_CONTAINER:-}" ]]; then
  user="${POSTGRES_USER:-nutrikids}"
  psql_admin=(docker exec -i "$DOCKER_CONTAINER" psql -U "$user" -d postgres -v ON_ERROR_STOP=1 -tA)
  restore=(docker exec -i "$DOCKER_CONTAINER" pg_restore -U "$user" -d "$target" --no-owner --exit-on-error)
elif [[ -n "${DIRECT_URL:-}" ]]; then
  base="${DIRECT_URL%%\?*}"
  admin_url="${base%/*}/postgres"
  target_url="${base%/*}/$target"
  psql_admin=(psql "$admin_url" -v ON_ERROR_STOP=1 -tA)
  restore=(pg_restore -d "$target_url" --no-owner --exit-on-error)
else
  echo "Set DOCKER_CONTAINER or DIRECT_URL" >&2
  exit 2
fi

# Verify the passphrase and integrity before touching any database.
gpg --batch --quiet --pinentry-mode loopback --passphrase-fd 3 --decrypt "$file" 3<<<"$BACKUP_PASSPHRASE" >/dev/null ||
  { echo "Cannot decrypt the backup (wrong passphrase or corrupted file)" >&2; exit 1; }

exists="$("${psql_admin[@]}" -c "SELECT 1 FROM pg_database WHERE datname = '$target'")"
if [[ -n "$exists" ]]; then
  if [[ "${RESTORE_CLEAN:-}" != "1" ]]; then
    echo "Database '$target' already exists. Use another name or set RESTORE_CLEAN=1 to recreate it." >&2
    exit 1
  fi
  "${psql_admin[@]}" -c "DROP DATABASE \"$target\" WITH (FORCE)"
fi
"${psql_admin[@]}" -c "CREATE DATABASE \"$target\""

gpg --batch --quiet --pinentry-mode loopback --passphrase-fd 3 --decrypt "$file" 3<<<"$BACKUP_PASSPHRASE" |
  "${restore[@]}"
echo "Restored $file into database '$target'"
