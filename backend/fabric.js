const fs = require('node:fs');
const path = require('node:path');
const grpc = require('@grpc/grpc-js');
const {
  connect,
  signers,
} = require('@hyperledger/fabric-gateway');

let gateway;
let client;
let contract;

function enabled() {
  return process.env.FABRIC_ENABLED === 'true';
}

function required(name, value) {
  if (!value) throw new Error(`Missing Fabric configuration: ${name}`);
  return value;
}

function readFirstFile(directory, name) {
  const file = path.join(directory, name);
  if (!fs.existsSync(file)) throw new Error(`Fabric credential not found: ${file}`);
  return fs.readFileSync(file);
}

function connectFabric() {
  if (!enabled()) return null;
  if (contract) return contract;

  const networkRoot = path.resolve(process.env.FABRIC_NETWORK_ROOT || path.join(__dirname, '..', 'fabric-samples', 'test-network'));
  const org = process.env.FABRIC_ORG || 'org1.example.com';
  const mspId = process.env.FABRIC_MSP_ID || 'Org1MSP';
  const peerEndpoint = process.env.FABRIC_PEER_ENDPOINT || 'localhost:7051';
  const peerHostAlias = process.env.FABRIC_PEER_HOST_ALIAS || 'peer0.org1.example.com';
  const channelName = process.env.FABRIC_CHANNEL || 'tracechannel';
  const chaincodeName = process.env.FABRIC_CHAINCODE || 'traceability';
  const userName = process.env.FABRIC_USER || 'User1@org1.example.com';
  const orgRoot = path.join(networkRoot, 'organizations', 'peerOrganizations', org);
  const userRoot = path.join(orgRoot, 'users', userName, 'msp');
  const keyDirectory = path.join(userRoot, 'keystore');
  const keyName = fs.readdirSync(keyDirectory).find((name) => name.endsWith('_sk'));
  const certificate = readFirstFile(path.join(userRoot, 'signcerts'), 'cert.pem');
  const privateKey = readFirstFile(keyDirectory, required('FABRIC private key', keyName));
  const tlsCaDirectory = path.join(orgRoot, 'peers', peerHostAlias, 'tls', 'tlscacerts');
  const credentials = grpc.credentials.createSsl(readFirstFile(
    tlsCaDirectory,
    fs.readdirSync(tlsCaDirectory)[0],
  ));
  const clientConnection = new grpc.Client(peerEndpoint, credentials, {
    'grpc.ssl_target_name_override': peerHostAlias,
  });
  const identity = { mspId, credentials: certificate };
  const signer = signers.newPrivateKeySigner(require('node:crypto').createPrivateKey(privateKey));
  gateway = connect({ client: clientConnection, identity, signer });
  client = clientConnection;
  contract = gateway.getNetwork(channelName).getContract(chaincodeName);
  return contract;
}

function parse(result) {
  return JSON.parse(Buffer.from(result).toString('utf8'));
}

async function submitCreateLot(input) {
  const activeContract = connectFabric();
  if (!activeContract) return null;
  const result = await activeContract.submitTransaction(
    'CreateLot',
    input.lotId,
    input.productName,
    input.origin,
    input.harvestDate,
    input.location,
    input.regionCode,
    JSON.stringify(input.data || {}),
  );
  return parse(result);
}

async function submitEvent(lotId, input) {
  const activeContract = connectFabric();
  if (!activeContract) return null;
  const result = await activeContract.submitTransaction(
    'RecordEvent',
    lotId,
    input.eventType,
    input.location,
    input.actorRole,
    JSON.stringify(input.data || {}),
    input.previousEventId || '',
  );
  return parse(result);
}

async function requestHandover(lotId, input) {
  const activeContract = connectFabric();
  if (!activeContract) return null;
  return parse(await activeContract.submitTransaction(
    'RequestHandover', lotId, input.toOrg, input.toRegion, input.location, input.dataHash || 'not-provided',
    JSON.stringify(input.data || {}), input.previousEventId || '',
  ));
}

async function confirmHandover(lotId, input) {
  const activeContract = connectFabric();
  if (!activeContract) return null;
  return parse(await activeContract.submitTransaction(
    'ConfirmHandover', lotId, input.location, input.dataHash || 'not-provided',
    JSON.stringify(input.data || {}), input.previousEventId || '',
  ));
}

async function readLot(lotId) {
  const activeContract = connectFabric();
  if (!activeContract) return null;
  return parse(await activeContract.evaluateTransaction('ReadLot', lotId));
}

async function history(lotId) {
  const activeContract = connectFabric();
  if (!activeContract) return null;
  return parse(await activeContract.evaluateTransaction('GetLotHistory', lotId));
}

async function validateHistory(lotId) {
  const activeContract = connectFabric();
  if (!activeContract) return null;
  return parse(await activeContract.evaluateTransaction('ValidateTraceHistory', lotId));
}

async function close() {
  if (gateway) gateway.close();
  if (client) client.close();
  gateway = undefined;
  client = undefined;
  contract = undefined;
}

module.exports = {
  enabled, connect: connectFabric, submitCreateLot, submitEvent, requestHandover,
  confirmHandover, readLot, history, validateHistory, close,
};
