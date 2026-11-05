#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose up -d --build mysql backend frontend
echo "TraceChain: http://localhost:3001"
echo "API health: http://localhost:8080/api/health"
