#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
# Resume only: network.sh down/restart deletes the existing ledger and crypto.
for name in ca_orderer ca_org1 ca_org2 orderer.example.com peer0.org1.example.com peer0.org2.example.com ca_org3 peer0.org3.example.com; do
  if ! docker container inspect "$name" >/dev/null 2>&1; then
    echo "Missing existing container: $name. See docs/FABRIC_STARTUP.md; no network was reset." >&2
    exit 1
  fi
done
docker start ca_orderer ca_org1 ca_org2 orderer.example.com peer0.org1.example.com peer0.org2.example.com ca_org3 peer0.org3.example.com
if ! docker network inspect tracechain_ca_operator >/dev/null 2>&1; then
  docker network create --internal tracechain_ca_operator >/dev/null
fi
for entry in 'ca_org1 org1.example.com' 'ca_org2 org2.example.com' 'ca_org3 org3.example.com'; do
  set -- $entry
  if ! docker network inspect tracechain_ca_operator --format '{{range .Containers}}{{println .Name}}{{end}}' | grep -qx "$1"; then
    docker network connect --alias "$2" tracechain_ca_operator "$1"
  fi
done
echo 'Existing Fabric containers resumed. Run GET /api/health/dependencies to verify the Gateway.'
