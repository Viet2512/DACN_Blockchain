export type Role =
  "SUPER_ADMIN" | "BUSINESS_ADMIN" | "ADMIN" | "FARMER" | "PROCESSOR" | "TRANSPORTER" | "DISTRIBUTOR";
export type Status =
  | "WAITING_PROCESSOR" | "RECEIVED_PROCESSOR" | "WAITING_RETAIL"
  | "CREATED"
  | "HARVESTED"
  | "PROCESSED"
  | "WAITING_SHIP"
  | "IN_TRANSIT"
  | "IN_RETAIL"
  | "READY_FOR_SALE"
  | "RECALLED";
export type EventType =
  | "CTE_HANDOVER_PROCESSOR" | "CTE_RECEIVE_PROCESSOR" | "CTE_HANDOVER_RETAIL" | "CTE_TRANSPORT"
  | "CTE_CREATE"
  | "CTE_HARVEST"
  | "CTE_PROCESS"
  | "CTE_HANDOVER_SHIP"
  | "CTE_RECEIVE_SHIP"
  | "CTE_DISPATCH_RETAIL"
  | "CTE_DISPLAY_SALE"
  | "CTE_RECALL";
export interface User {
  userId?: string;
  organizationId?: string | null;
  organizationName?: string;
  organizationType?: string;
  fullName?: string;
  email?: string;
  phone?: string | null;
  legacyActorIds?: string[];
  permissions?: string[];
  fabricIdentityStatus?: string;
  username: string;
  role: Role;
  actorId: string | null;
  orgMsp: string | null;
  regionCode: string | null;
  displayName?: string;
  status?: "ACTIVE" | "INACTIVE" | "PENDING_ACTIVATION";
  createdAt?: string;
}
export interface TraceEvent {
  userId?: string;
  businessOrganizationId?: string;
  businessOrganizationName?: string;
  signerId?: string;
  fromOrganizationId?: string;
  toOrganizationId?: string;
  requestedBy?: string;
  confirmedBy?: string;
  eventId: string;
  lotId?: string;
  eventType: EventType;
  timestamp: string;
  location: string;
  actorId?: string;
  actorRole: Role;
  actorOrg?: string;
  actorRegion?: string;
  previousEventId: string | null;
  dataHash: string;
  integrityHash?: string;
  data?: Record<string, unknown>;
}
export interface Lot {
  source?: "LOCAL" | "FABRIC";
  schemaVersion?: number;
  participantOrganizationIds?: string[];
  ownerOrganizationId?: string;
  processorOrganizationId?: string;
  distributorOrganizationId?: string;
  currentHolderOrganizationId?: string;
  pendingToOrganizationId?: string;
  lotId: string;
  productName: string;
  origin: string;
  harvestDate: string;
  status: Status;
  currentHolder: string;
  regionCode: string;
  createdAt: string;
  lastEventId: string | null;
  pendingTo?: string;
  pendingToRegion?: string;
  eventCount: number;
  events?: TraceEvent[];
}
export interface Verification {
  valid: boolean | null;
  checkedEvents?: number;
  brokenLinks?: string[];
  invalidHashes?: string[];
  anomalies?: {
    step: string;
    code: string;
    message: string;
    eventId?: string;
  }[];
  source?: "LOCAL" | "FABRIC";
  scope?: string;
}
export interface PublicLot {
  organizations?: {organizationId:string;name:string;type:string;mspId:string}[];
  lotId: string;
  productName: string;
  origin: string;
  status: Status;
  harvestDate?: string;
  events: TraceEvent[];
  source: "LOCAL" | "FABRIC";
  integrity: Verification;
  notice?: string;
}
export interface Organization {
  organizationId: string | number;
  code?: string;
  type?: string;
  userCount?: number;
  email?: string;
  phone?: string;
  mspId: string;
  name: string;
  organizationType: string;
  address?: string;
  status: string;
}
export interface Audit {
  auditId: number;
  actorUsername: string;
  action: string;
  target?: string;
  details: Record<string, unknown>;
  createdAt: string;
}
export interface Health {
  status: string;
  mysql: "enabled" | "disabled";
  fabric: "enabled" | "disabled";
}
export interface DocumentResult {
  documentId: number;
  eventId?: string;
  originalName: string;
  fileHash: string;
  onChainHash?: string;
  actualHash?: string;
  valid: boolean;
}
export interface DocumentVerification {
  valid: boolean | null;
  documents: DocumentResult[];
}
export interface EventInput {
  eventType: EventType;
  location: string;
  previousEventId: string | null;
  toOrg?: string;
  toOrganizationId?: string;
  toRegion?: string;
  data: Record<string, unknown>;
}
export interface CreateLotInput {
  processorOrganizationId?: string;
  distributorOrganizationId?: string;
  lotId: string;
  productName: string;
  origin: string;
  harvestDate: string;
  location: string;
  regionCode: string;
}
export interface UserInput {
  userId?: string;
  organizationId?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  regionCode?: string;
  username: string;
  password: string;
  role: Role;
}
