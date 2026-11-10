const workflow = require('../chaincode/src/workflow');
const roles = ['SUPER_ADMIN', 'BUSINESS_ADMIN', 'FARMER', 'PROCESSOR', 'TRANSPORTER', 'DISTRIBUTOR'];
const eventPermissions = {CTE_HANDOVER_PROCESSOR:'HANDOVER_CREATE',CTE_RECEIVE_PROCESSOR:'HANDOVER_CONFIRM',CTE_HANDOVER_RETAIL:'HANDOVER_CREATE',CTE_TRANSPORT:'TRANSPORT_RECORD',CTE_CREATE: 'LOT_CREATE', CTE_HARVEST: 'LOT_HARVEST', CTE_PROCESS: 'LOT_PROCESS', CTE_HANDOVER_SHIP: 'HANDOVER_CREATE', CTE_RECEIVE_SHIP: 'HANDOVER_CONFIRM', CTE_DISPATCH_RETAIL: 'LOT_DISPATCH', CTE_DISPLAY_SALE: 'LOT_DISPLAY_SALE', CTE_RECALL: 'LOT_RECALL'};
const adminPermissions = ['USER_READ','USER_CREATE','USER_UPDATE','USER_DISABLE','ORGANIZATION_READ','ORGANIZATION_CREATE','ORGANIZATION_UPDATE','ORGANIZATION_DISABLE','BLOCKCHAIN_MONITOR','AUDIT_LOG_READ'];
const readPermissions = ['ORGANIZATION_READ','LOT_READ','TRACE_HISTORY_READ','TRACE_VALIDATE'];
const permissions = {
  SUPER_ADMIN: [...adminPermissions, 'IDENTITY_ISSUE','IDENTITY_DISABLE', 'LOT_READ','TRACE_HISTORY_READ','TRACE_VALIDATE'],
  BUSINESS_ADMIN: [...readPermissions,'USER_READ','USER_CREATE','USER_UPDATE','USER_DISABLE','IDENTITY_REQUEST','IDENTITY_ISSUE','IDENTITY_DISABLE'],
  FARMER: [...readPermissions,'LOT_CREATE','LOT_HARVEST','HANDOVER_CREATE','LOT_RECALL'],
  PROCESSOR: [...readPermissions,'LOT_PROCESS','HANDOVER_CREATE','HANDOVER_CONFIRM','LOT_RECALL'],
  TRANSPORTER: [...readPermissions,'HANDOVER_CONFIRM','HANDOVER_CREATE','TRANSPORT_RECORD','LOT_RECALL'],
  DISTRIBUTOR: [...readPermissions,'HANDOVER_CONFIRM','LOT_DISPATCH','LOT_DISPLAY_SALE','LOT_RECALL'],
};
for (const role of ['FARMER','PROCESSOR','TRANSPORTER','DISTRIBUTOR']) permissions[role].push('IDENTITY_REQUEST');
function canManageUser(actor, target) {
  return isAdmin(actor) || (actor?.role === 'BUSINESS_ADMIN' && !!actor.organizationId && actor.organizationId === target?.organizationId && organizationTypes[actor.organizationType]?.role === target.role && actor.username !== target.username);
}
const organizationTypes = {FARM: {msp: 'Org1MSP', role: 'FARMER'}, PROCESSING_FACILITY: {msp: 'Org1MSP', role: 'PROCESSOR'}, LOGISTICS_COMPANY: {msp: 'Org2MSP', role: 'TRANSPORTER'}, DISTRIBUTION_COMPANY: {msp: 'Org3MSP', role: 'DISTRIBUTOR'}};
const normalizeRole = role => role === 'ADMIN' ? 'SUPER_ADMIN' : role;
const isAdmin = user => normalizeRole(user?.role) === 'SUPER_ADMIN';
const hasPermission = (user, permission) => Array.isArray(user?.permissions) && user.permissions.includes(permission);
function relatedOrganizations(lot) {
  return [lot.ownerOrganizationId, lot.processorOrganizationId, lot.distributorOrganizationId, lot.currentHolderOrganizationId, lot.pendingToOrganizationId, ...(lot.participantOrganizationIds || []), ...(lot.events || []).map(event => event.businessOrganizationId)].filter(Boolean);
}
function canAccessLot(user, lot) {return isAdmin(user) || (!!user?.organizationId && relatedOrganizations(lot).includes(user.organizationId));}
function canWriteEvent(user, lot, eventType) {
  if (!hasPermission(user, eventPermissions[eventType]) || !canAccessLot(user, lot)) return false;
  if (lot.schemaVersion !== 4) return false;
  if (eventType === 'CTE_RECALL') return workflow.msps[user.role] === user.orgMsp;
  const rule=workflow.rules[eventType];
  if (!rule || rule[2] !== user.role || workflow.msps[user.role] !== user.orgMsp) return false;
  if (workflow.confirmations.includes(eventType)) return user.organizationId === lot.pendingToOrganizationId && user.orgMsp === lot.pendingTo && user.regionCode === lot.pendingToRegion;
  return user.organizationId === lot.currentHolderOrganizationId && user.regionCode === lot.regionCode;
}
module.exports = {canManageUser, roles, eventPermissions, permissions, organizationTypes, normalizeRole, isAdmin, hasPermission, relatedOrganizations, canAccessLot, canWriteEvent};
