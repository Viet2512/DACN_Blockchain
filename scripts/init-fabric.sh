#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../fabric-samples/test-network"
# Refuse to replace any existing network; use start-fabric.sh for preserved ledgers.
if docker container inspect orderer.example.com >/dev/null 2>&1 || test -d organizations/peerOrganizations; then
  echo 'Existing Fabric state detected. Resume it; initialization never resets a network.' >&2
  exit 1
fi
export PATH="$PWD/../bin:$PATH"
./network.sh up createChannel -ca -c tracechannel-v2
(cd addOrg3 && ./addOrg3.sh up -ca -c tracechannel-v2)
(cd ../.. && npm --prefix chaincode run build && node scripts/package-chaincode-offline.js)
./network.sh deployCC -c tracechannel-v2 -ccn traceability_v2 -ccp ../../backups/chaincode-business-package -ccl javascript -ccv 4.3 -ccs 1
