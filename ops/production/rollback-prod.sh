#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${ENV_FILE:-.env.production}"
ROLLBACK_TAG="${1:-}"

if [[ -z "$ROLLBACK_TAG" ]]; then
	echo "Usage: $0 <image-tag>"
	exit 1
fi

echo "Rollback SOP:"
echo "1. Pastikan backup terbaru tersedia."
echo "2. Menggunakan image tag: $ROLLBACK_TAG"
echo "3. Redeploy stack dengan tag stabil."
echo "5. Verifikasi /api/, /, dan login admin."

IMAGE_TAG_OVERRIDE="$ROLLBACK_TAG" ENV_FILE="$ENV_FILE" ./ops/production/deploy-prod.sh