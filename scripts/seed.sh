#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose exec -T backend node -e "fetch('http://localhost:8080/api/health/dependencies').then(r=>{if(!r.ok)process.exit(1)})"
docker compose exec -T -e API_URL=http://backend:8080/api backend node seed-demo.js --accounts
# New accounts need certificates before a Fabric lot can be submitted.
if docker compose exec -T backend node -e "process.exit(process.env.FABRIC_ENABLED==='true'?0:1)"; then
  node scripts/enroll-fabric-users.js --pending
fi
docker compose exec -T -e API_URL=http://backend:8080/api -e DEMO_LOT_PREFIX="${DEMO_LOT_PREFIX:-LOT-MAU}" backend node seed-demo.js --lots
