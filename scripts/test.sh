#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
(cd backend && npm test)
(cd chaincode && npm run build)
(cd frontend && npm run build)
