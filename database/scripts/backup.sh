#!/usr/bin/env bash
# Docker volume backup of the MySQL database.
set -euo pipefail

STAMP=$(date +%Y%m%d_%H%M%S)
OUT_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$OUT_DIR"

docker-compose exec -T mysql \
  mysqldump -uroot -p"${MYSQL_ROOT_PASSWORD:-root_secret}" --single-transaction school_db \
  | gzip > "$OUT_DIR/school_db_${STAMP}.sql.gz"

echo "Backup written: $OUT_DIR/school_db_${STAMP}.sql.gz"