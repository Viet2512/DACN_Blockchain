#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
case "${1:-check}" in check|seed|verify|test) ;; *) echo 'Usage: bash scripts/demo.sh check|seed|verify|test' >&2; exit 2 ;; esac
docker compose -f docker-compose.yml -f docker-compose.fabric.yml run --rm --no-deps -T \
  -e API_URL=http://backend:8080/api \
  -e DEMO_DATA_ENABLED="${DEMO_DATA_ENABLED:-false}" -e DEMO_REPORT_DIR=/demo-reports \
  -v "$PWD/backend/demo.js:/app/demo.js:ro" \
  -v "$PWD/backend/demo-data.js:/app/demo-data.js:ro" \
  -v "$PWD/reports:/demo-reports" \
  backend node demo.js "${1:-check}"
