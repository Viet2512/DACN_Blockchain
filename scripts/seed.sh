#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose run --rm --no-deps -e API_URL=http://backend:8080/api backend node seed-demo.js
