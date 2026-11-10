#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
mkdir -p backups
backup=$(mktemp "backups/mysql-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX.sql")
docker compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" exec mysqldump --user="$MYSQL_USER" --single-transaction --no-tablespaces --set-gtid-purged=OFF "$MYSQL_DATABASE"' > "$backup"
test -s "$backup"
sha256sum "$backup" > "$backup.sha256"
printf 'Backup completed: %s\n' "$backup"
