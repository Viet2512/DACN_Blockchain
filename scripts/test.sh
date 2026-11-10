#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
(cd backend && npm test)
(cd chaincode && npm test)
(cd frontend && npm test && npm run build)
