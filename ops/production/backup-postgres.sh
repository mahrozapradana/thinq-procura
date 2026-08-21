#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${ENV_FILE:-.env.production}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
TIMESTAMP="$(date +%F_%H%M%S)"

mkdir -p "$BACKUP_DIR"

set -a
source "$ENV_FILE"
set +a

docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file "$ENV_FILE" exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "$BACKUP_DIR/postgres_${TIMESTAMP}.dump"

find "$BACKUP_DIR" -type f -name 'postgres_*.dump' -mtime +14 -delete