#!/usr/bin/env bash
# Backup of the PostgreSQL database running in docker-compose (gzip-compressed pg_dump).
set -euo pipefail

STAMP=$(date +%Y%m%d_%H%M%S)
OUT_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$OUT_DIR"

docker compose exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-postgres}" --no-owner "${POSTGRES_DB:-school_db}" \
  | gzip > "$OUT_DIR/school_db_${STAMP}.sql.gz"

echo "Backup written: $OUT_DIR/school_db_${STAMP}.sql.gz"
echo "Restore with: gunzip -c <file> | docker compose exec -T postgres psql -U ${POSTGRES_USER:-postgres} ${POSTGRES_DB:-school_db}"
