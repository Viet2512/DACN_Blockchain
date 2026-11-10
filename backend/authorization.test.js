const {test}=require('node:test');const assert=require('node:assert/strict');const p=require('./authorization');
const base={role:'TRANSPORTER',userId:'driver-A',organizationId:'company-A',orgMsp:'Org2MSP',regionCode:'TG',permissions:p.permissions.TRANSPORTER};
const lot={schemaVersion:4,ownerOrganizationId:'farm',processorOrganizationId:'processor',distributorOrganizationId:'distributor',pendingToOrganizationId:'company-A',pendingTo:'Org2MSP',pendingToRegion:'TG'};
test('business scope rejects another company in the same MSP and ignores client identity claims',()=>{
 assert.equal(p.canWriteEvent(base,lot,'CTE_RECEIVE_SHIP'),true);
 const other={...base,userId:'driver-B',organizationId:'company-B'};assert.equal(p.canAccessLot(other,lot),false);assert.equal(p.canWriteEvent(other,lot,'CTE_RECEIVE_SHIP'),false);
 assert.equal(p.canWriteEvent({...base,permissions:[]},lot,'CTE_RECEIVE_SHIP'),false);
 assert.equal(p.canAccessLot(base,{regionCode:'TG'}),false);
 assert.equal(p.canWriteEvent({role:'SUPER_ADMIN',permissions:p.permissions.SUPER_ADMIN},lot,'CTE_RECEIVE_SHIP'),false);
});
test('role, business type and MSP mappings remain separate from application administration',()=>{
 assert.equal(p.organizationTypes.FARM.msp,p.organizationTypes.PROCESSING_FACILITY.msp);
 assert.ok(!p.permissions.FARMER.includes('LOT_PROCESS'));assert.ok(p.permissions.PROCESSOR.includes('LOT_PROCESS'));
 for(const permission of Object.values(p.eventPermissions))assert.ok(!p.permissions.SUPER_ADMIN.includes(permission));
 assert.equal(p.normalizeRole('ADMIN'),'SUPER_ADMIN');
});
test('business administrators can manage only their own business staff and have no event permissions',()=>{
 const admin={username:'boss',role:'BUSINESS_ADMIN',organizationId:'A',organizationType:'LOGISTICS_COMPANY'};
 assert.equal(p.canManageUser(admin,{username:'driver',role:'TRANSPORTER',organizationId:'A'}),true);
 for(const target of [{username:'driver',role:'TRANSPORTER',organizationId:'B'},{username:'boss',role:'BUSINESS_ADMIN',organizationId:'A'},{username:'other-admin',role:'BUSINESS_ADMIN',organizationId:'A'},{username:'farmer',role:'FARMER',organizationId:'A'}]) assert.equal(p.canManageUser(admin,target),false);
 for(const permission of Object.values(p.eventPermissions))assert.ok(!p.permissions.BUSINESS_ADMIN.includes(permission));
 assert.equal(p.canWriteEvent({...admin,permissions:p.permissions.BUSINESS_ADMIN},lot,'CTE_RECEIVE_SHIP'),false);
});
