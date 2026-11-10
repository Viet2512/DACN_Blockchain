#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR/fabric-samples/test-network"
export PATH="$PWD/../bin:$PATH"
export FABRIC_CFG_PATH="$PWD/../config"
export OVERRIDE_ORG=""
export VERBOSE=false
source scripts/envVar.sh
setGlobals 1
current=$(peer lifecycle chaincode querycommitted -C tracechannel-v2 -n traceability_v2 --output json)
sequence=$(jq -r '.sequence' <<< "$current")
version=$(jq -r '.version' <<< "$current")
if [ "$version" = 4.3 ]; then
  echo "Workflow 4.3 is already committed at sequence $sequence."
  exit 0
fi
if ! [[ "$sequence" =~ ^[1-9][0-9]*$ ]] || ! [[ "$version" =~ ^(2[.]0|3[.]0|4[.][012])$ ]]; then
  echo 'Unexpected definition; inspect lifecycle before upgrading.' >&2
  exit 1
fi
next_sequence=$((sequence + 1))
package_id=$(peer lifecycle chaincode calculatepackageid traceability_v2.tar.gz)
for organization in 1 2 3; do
  setGlobals "$organization"
  if ! peer lifecycle chaincode queryinstalled --output json | jq -r '.installed_chaincodes[].package_id' | grep -Fxq "$package_id"; then
    peer lifecycle chaincode install traceability_v2.tar.gz
  fi
  approved=$(peer lifecycle chaincode queryapproved -C tracechannel-v2 -n traceability_v2 --sequence "$next_sequence" --output json 2>/dev/null || true)
  if jq -e --arg package "$package_id" '.version=="4.3" and (.source.local_package.package_id // .source.Type.LocalPackage.package_id)==$package' <<< "$approved" >/dev/null 2>&1; then
    continue
  fi
  peer lifecycle chaincode approveformyorg -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls --cafile "$ORDERER_CA" --channelID tracechannel-v2 --name traceability_v2 --version 4.3 --package-id "$package_id" --sequence "$next_sequence"
 done
setGlobals 1
peer lifecycle chaincode checkcommitreadiness --channelID tracechannel-v2 --name traceability_v2 --version 4.3 --sequence "$next_sequence" --output json | jq -e '.approvals.Org1MSP and .approvals.Org2MSP and .approvals.Org3MSP'
peer lifecycle chaincode commit -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls --cafile "$ORDERER_CA" --channelID tracechannel-v2 --name traceability_v2 --version 4.3 --sequence "$next_sequence" --peerAddresses localhost:7051 --tlsRootCertFiles "$PEER0_ORG1_CA" --peerAddresses localhost:9051 --tlsRootCertFiles "$PEER0_ORG2_CA" --peerAddresses localhost:11051 --tlsRootCertFiles "$PEER0_ORG3_CA"
for organization in 1 2 3; do setGlobals "$organization"; peer lifecycle chaincode querycommitted -C tracechannel-v2 -n traceability_v2; done
