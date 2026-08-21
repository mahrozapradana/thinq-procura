#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${ENV_FILE:-.env.production}"

set -a
source "$ENV_FILE"
set +a

curl -fsS "https://${DOMAIN_NAME}/api/" >/dev/null
curl -fsS "https://${DOMAIN_NAME}/" >/dev/null

docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file "$ENV_FILE" ps