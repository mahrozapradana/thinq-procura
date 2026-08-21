#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${ENV_FILE:-.env.production}"
IMAGE_TAG_OVERRIDE="${IMAGE_TAG_OVERRIDE:-}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE"
  exit 1
fi

if [[ -n "$IMAGE_TAG_OVERRIDE" ]]; then
  export IMAGE_TAG="$IMAGE_TAG_OVERRIDE"
fi

docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file "$ENV_FILE" pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file "$ENV_FILE" up -d --build
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file "$ENV_FILE" ps