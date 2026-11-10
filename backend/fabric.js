const fs = require('node:fs');
const path = require('node:path');
const {createPrivateKey, X509Certificate} = require('node:crypto');
const grpc = require('@grpc/grpc-js');
const {connect, signers} = require('@hyperledger/fabric-gateway');
const connections = new Map();
const enabled = () => process.env.FABRIC_ENABLED === 'true';
const configurationError = message => Object.assign(new Error(message), {statusCode: 503});
async function connectFabric(user) {
  if (!enabled()) return null;
  const root = path.resolve(process.env.FABRIC_NETWORK_ROOT || path.join(__dirname, '..', 'fabric-samples', 'test-network'));
  let identity;
  if (user) {
    const mapping = await require('./storage').getSigningIdentity(user);
    const certificatePath = path.resolve(root,mapping.certificateReference);
    const privateKeyPath = path.resolve(root,mapping.privateKeyReference);
    if (!certificatePath.startsWith(root + path.sep) || !privateKeyPath.startsWith(root + path.sep)) throw configurationError('Identity reference is outside the credential store');
    const certificate = fs.readFileSync(certificatePath);
    const x509 = new X509Certificate(certificate);
    if (x509.fingerprint256.replace(/:/g,'').toLowerCase() !== mapping.certificateSha256 || Date.now() >= Date.parse(x509.validTo) || Date.now() < Date.parse(x509.validFrom)) throw configurationError('Identity certificate fingerprint or validity mismatch');
    identity = {...mapping,certificate,privateKey: fs.readFileSync(privateKeyPath),user: mapping.enrollmentId};
  } else identity = {mspId: 'Org1MSP', org: 'org1.example.com', user: 'User1@org1.example.com'};
  const key = `${identity.userId || "reader"}/${identity.organizationId || ""}/${identity.role || ""}/${identity.mspId}/${identity.user}/${identity.certificateSha256 || "reader"}`;
  if (connections.has(key)) return connections.get(key).contract;
  let certificate = identity.certificate, privateKey = identity.privateKey;
  if (!user) {
    const userRoot = path.join(root,'organizations/peerOrganizations/org1.example.com/users',identity.user,'msp');
    const keys = fs.readdirSync(path.join(userRoot,'keystore'));
    if (keys.length !== 1) throw configurationError('Expected exactly one read identity key');
    certificate = fs.readFileSync(path.join(userRoot,'signcerts/cert.pem'));
    privateKey = fs.readFileSync(path.join(userRoot,'keystore',keys[0]));
  }
  const host = process.env.FABRIC_PEER_HOST_ALIAS || 'peer0.org1.example.com';
  const tls = fs.readFileSync(path.join(root, 'organizations', 'peerOrganizations', 'org1.example.com', 'peers', host, 'tls', 'ca.crt'));
  const client = new grpc.Client(process.env.FABRIC_PEER_ENDPOINT || 'localhost:7051', grpc.credentials.createSsl(tls), {'grpc.ssl_target_name_override': host});
  const gateway = connect({client, identity: {mspId: identity.mspId, credentials: certificate}, signer: signers.newPrivateKeySigner(createPrivateKey(privateKey)),
    evaluateOptions: () => ({deadline: Date.now() + 15000}), endorseOptions: () => ({deadline: Date.now() + 15000}), submitOptions: () => ({deadline: Date.now() + 15000}), commitStatusOptions: () => ({deadline: Date.now() + 60000})});
  const contract = gateway.getNetwork(process.env.FABRIC_CHANNEL || 'tracechannel-v2').getContract(process.env.FABRIC_CHAINCODE || 'traceability_v2');
  if (user) {
    try {
      const actual = parse(await contract.evaluateTransaction('GetSignerIdentity'));
      if (actual.userId !== user.userId || actual.businessOrg !== user.organizationId || actual.org !== user.orgMsp || actual.role !== user.role || actual.region !== user.regionCode) throw Object.assign(new Error('Certificate does not bind the authenticated user, role and business organization'), {statusCode: 403});
    } catch(error) {gateway.close();client.close();throw error;}
  }
  connections.set(key, {contract, gateway, client});
  return contract;
}
const parse = result => JSON.parse(Buffer.from(result).toString('utf8'));
async function submitCreateLot(input, user) {
  const contract = await connectFabric(user); if (!contract) return null;
  return parse(await contract.submitTransaction('CreateLot', input.lotId.trim(), input.productName, input.origin, input.harvestDate, input.location, input.regionCode, JSON.stringify(input.data || {})));
}
async function submitEvent(lotId, input, user) {
  const contract = await connectFabric(user); if (!contract) return null;
  return parse(await contract.submitTransaction('RecordEvent', lotId, input.eventType, input.location, input.actorRole, JSON.stringify(input.data || {}), input.previousEventId || ''));
}
async function requestHandover(lotId, input, user) {
  return submitEvent(lotId, {...input, eventType: 'CTE_HANDOVER_SHIP', data: {...input.data, toOrg: input.toOrg, toRegion: input.toRegion}}, user);
}
async function confirmHandover(lotId, input, user) {
  return submitEvent(lotId, {...input, eventType: 'CTE_RECEIVE_SHIP'}, user);
}
async function readLot(id) { const c = await connectFabric(); return c ? parse(await c.evaluateTransaction('QueryLot', id)) : null; }
async function history(id) { const c = await connectFabric(); return c ? parse(await c.evaluateTransaction('GetHistory', id)) : null; }
async function validateHistory(id) { const c = await connectFabric(); return c ? parse(await c.evaluateTransaction('ValidateTraceHistory', id)) : null; }
async function commitStatus(transactionId) {
  if (!enabled()) throw configurationError('Fabric is disabled');
  if (typeof transactionId !== 'string' || !/^[a-f0-9]{64}$/.test(transactionId)) throw Object.assign(new Error('Invalid Fabric transaction ID'), {statusCode: 400});
  await connectFabric();
  const reader = [...connections.entries()].find(([key]) => key.startsWith('reader/'))[1];
  const channel = process.env.FABRIC_CHANNEL || 'tracechannel-v2';
  const bytes = await reader.gateway.getNetwork(channel).getContract('qscc').evaluateTransaction('GetTransactionByID', channel, transactionId);
  const validationCode = require('@hyperledger/fabric-protos').peer.ProcessedTransaction.deserializeBinary(bytes).getValidationcode();
  return {transactionId, validationCode, successful: validationCode === 0};
}
async function readiness() {
  if (!enabled()) return {ready: false, reason: 'disabled'};
  const result = parse(await (await connectFabric()).evaluateTransaction('org.hyperledger.fabric:GetMetadata'));
  const names = result.contracts?.TraceabilityContract?.transactions?.map(item => item.name) || [];
  const required = ['CreateLot', 'RecordEvent', 'QueryLot', 'GetHistory', 'ValidateTraceHistory'];
  if (!required.every(name => names.includes(name))) throw configurationError('Deployed chaincode ABI is incompatible');
  const capabilities = parse(await (await connectFabric()).evaluateTransaction('GetCapabilities'));
  if (capabilities.schemaVersion !== 4 || !capabilities.businessOrganizationAuthorization) throw configurationError('Chaincode workflow v4 upgrade required');
  return {ready: true, schemaVersion: capabilities.schemaVersion, channel: process.env.FABRIC_CHANNEL || 'tracechannel-v2', chaincode: process.env.FABRIC_CHAINCODE || 'traceability_v2'};
}
async function close() { for (const {gateway, client} of connections.values()) { gateway.close(); client.close(); } connections.clear(); }
module.exports = {enabled, connect: connectFabric, submitCreateLot, submitEvent, requestHandover, confirmHandover, readLot, history, validateHistory, commitStatus, readiness, close};
