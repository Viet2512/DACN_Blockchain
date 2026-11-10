#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Stop in dependency order; never remove containers, certificates or volumes.
docker compose -f docker-compose.yml -f docker-compose.fabric.yml stop frontend backend fabric-operator mysql
docker stop peer0.org3.example.com peer0.org2.example.com peer0.org1.example.com orderer.example.com ca_org3 ca_org2 ca_org1 ca_orderer
echo 'TraceChain stopped. MySQL volumes and Fabric ledger retained; resume with bash scripts/up.sh.'
