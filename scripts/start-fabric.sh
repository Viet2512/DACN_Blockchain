#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FABRIC_DIR="$ROOT_DIR/fabric-samples/test-network"
CHANNEL_NAME="${CHANNEL_NAME:-tracechannel}"
CC_NAME="${CC_NAME:-traceability}"

cd "$FABRIC_DIR"
./network.sh down
./network.sh up createChannel -c "$CHANNEL_NAME" -ca
./network.sh deployCC -c "$CHANNEL_NAME" -ccn "$CC_NAME" -ccp "$ROOT_DIR/chaincode" -ccl typescript
echo "Fabric network is ready: channel=$CHANNEL_NAME chaincode=$CC_NAME"
