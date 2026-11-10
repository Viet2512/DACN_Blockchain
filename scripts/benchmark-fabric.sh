#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
TRACE_BENCHMARK=true node scripts/test-mysql.js --fabric
