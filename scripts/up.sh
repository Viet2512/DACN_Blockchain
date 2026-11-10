#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if ! docker info >/dev/null 2>&1; then
  echo 'Docker Engine unavailable. On Windows, open Docker Desktop, wait for Engine running and enable WSL integration for this distro.' >&2
  exit 1
fi
bash scripts/start-fabric.sh
docker compose -f docker-compose.yml -f docker-compose.fabric.yml up -d --build --wait --wait-timeout 120 mysql fabric-operator backend frontend
echo "TraceChain: http://localhost:3001"
echo "API health: http://localhost:8080/api/health"
