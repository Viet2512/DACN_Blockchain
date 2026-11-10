import type { EventType, Lot, Role, User } from "../types";

export const roleLabels: Record<Role, string> = {
  BUSINESS_ADMIN: "Quản trị doanh nghiệp",
  SUPER_ADMIN: "Quản trị hệ thống",
  ADMIN: "Quản trị viên",
  FARMER: "Nông hộ",
  PROCESSOR: "Thu mua / Sơ chế",
  TRANSPORTER: "Vận chuyển",
  DISTRIBUTOR: "Phân phối",
};
export const statusLabels = {
  WAITING_PROCESSOR:"Chờ sơ chế nhận",RECEIVED_PROCESSOR:"Sơ chế đã nhận",WAITING_RETAIL:"Chờ phân phối nhận",
  CREATED: "Đã khởi tạo",
  HARVESTED: "Đã thu hoạch",
  PROCESSED: "Đã sơ chế",
  WAITING_SHIP: "Chờ vận chuyển nhận",
  IN_TRANSIT: "Đang vận chuyển",
  IN_RETAIL: "Tại điểm bán",
  READY_FOR_SALE: "Sẵn sàng bán",
  RECALLED: "Đã thu hồi",
};
export const eventLabels: Record<EventType, string> = {
  CTE_HANDOVER_PROCESSOR:"Giao sang sơ chế",CTE_RECEIVE_PROCESSOR:"Sơ chế xác nhận nhận",CTE_HANDOVER_RETAIL:"Giao sang phân phối",CTE_TRANSPORT:"Ghi nhận vận chuyển",
  CTE_CREATE: "Khởi tạo lô",
  CTE_HARVEST: "Thu hoạch",
  CTE_PROCESS: "Sơ chế và đóng gói",
  CTE_HANDOVER_SHIP: "Yêu cầu bàn giao",
  CTE_RECEIVE_SHIP: "Xác nhận nhận hàng",
  CTE_DISPATCH_RETAIL: "Xác nhận nhận tại điểm phân phối",
  CTE_DISPLAY_SALE: "Đưa lên kệ",
  CTE_RECALL: "Thu hồi lô",
};
export const transitions: {
  type: EventType;
  role: Role;
  from: string;
  to: string;
}[] = [
  {type:"CTE_HANDOVER_PROCESSOR",role:"FARMER",from:"HARVESTED",to:"WAITING_PROCESSOR"},
  {type:"CTE_RECEIVE_PROCESSOR",role:"PROCESSOR",from:"WAITING_PROCESSOR",to:"RECEIVED_PROCESSOR"},
  {type:"CTE_HANDOVER_RETAIL",role:"TRANSPORTER",from:"IN_TRANSIT",to:"WAITING_RETAIL"},
  {type:"CTE_TRANSPORT",role:"TRANSPORTER",from:"IN_TRANSIT",to:"IN_TRANSIT"},
  { type: "CTE_HARVEST", role: "FARMER", from: "CREATED", to: "HARVESTED" },
  {
    type: "CTE_PROCESS",
    role: "PROCESSOR",
    from: "RECEIVED_PROCESSOR",
    to: "PROCESSED",
  },
  {
    type: "CTE_HANDOVER_SHIP",
    role: "PROCESSOR",
    from: "PROCESSED",
    to: "WAITING_SHIP",
  },
  {
    type: "CTE_RECEIVE_SHIP",
    role: "TRANSPORTER",
    from: "WAITING_SHIP",
    to: "IN_TRANSIT",
  },
  {
    type: "CTE_DISPATCH_RETAIL",
    role: "DISTRIBUTOR",
    from: "WAITING_RETAIL",
    to: "IN_RETAIL",
  },
  {
    type: "CTE_DISPLAY_SALE",
    role: "DISTRIBUTOR",
    from: "IN_RETAIL",
    to: "READY_FOR_SALE",
  },
];
export function receiver(lot: Lot) {
  const last = lot.events
    ?.slice()
    .reverse()
    .find(
      (e) =>
        handoverRequests.includes(e.eventType) || handoverConfirmations.includes(e.eventType),
    );
  return {
    org:
      lot.pendingTo ||
      (last && handoverRequests.includes(last.eventType)
        ? String(last.data?.toOrg || "")
        : ""),
    region:
      lot.pendingToRegion ||
      (last && handoverRequests.includes(last.eventType)
        ? String(last.data?.toRegion || "")
        : ""),
  };
}
export const isAdmin = (user: User) => ['ADMIN','SUPER_ADMIN'].includes(user.role);
export const hasPermission = (user: User, permission: string) => user.permissions?.includes(permission) === true;
export const handoverRequests: EventType[]=["CTE_HANDOVER_PROCESSOR","CTE_HANDOVER_SHIP","CTE_HANDOVER_RETAIL"];
export const handoverConfirmations: EventType[]=["CTE_RECEIVE_PROCESSOR","CTE_RECEIVE_SHIP","CTE_DISPATCH_RETAIL"];
const eventPermissions: Record<EventType,string> = {CTE_HANDOVER_PROCESSOR:"HANDOVER_CREATE",CTE_RECEIVE_PROCESSOR:"HANDOVER_CONFIRM",CTE_HANDOVER_RETAIL:"HANDOVER_CREATE",CTE_TRANSPORT:"TRANSPORT_RECORD",CTE_CREATE:'LOT_CREATE',CTE_HARVEST:'LOT_HARVEST',CTE_PROCESS:'LOT_PROCESS',CTE_HANDOVER_SHIP:'HANDOVER_CREATE',CTE_RECEIVE_SHIP:'HANDOVER_CONFIRM',CTE_DISPATCH_RETAIL:'LOT_DISPATCH',CTE_DISPLAY_SALE:'LOT_DISPLAY_SALE',CTE_RECALL:'LOT_RECALL'};
export function availableEvents(user: User, lot: Lot): EventType[] {
  if (lot.schemaVersion !== 4 || isAdmin(user) || lot.status === "RECALLED" || !lot.ownerOrganizationId || !user.organizationId) return [];
  const sameRegion = !!user.regionCode && user.regionCode === lot.regionCode;
  const actions = transitions
    .filter((rule) => {
      if (rule.role !== user.role || rule.from !== lot.status || !hasPermission(user,eventPermissions[rule.type])) return false;
      const receiving=handoverConfirmations.includes(rule.type);
      if (user.organizationId !== (receiving ? lot.pendingToOrganizationId : lot.currentHolderOrganizationId)) return false;
      if (!receiving) return sameRegion;
      const target = receiver(lot);
      return (
        !!target.org &&
        target.org === user.orgMsp &&
        target.region === user.regionCode
      );
    })
    .map((rule) => rule.type);
  if (({FARMER:"Org1MSP",PROCESSOR:"Org1MSP",TRANSPORTER:"Org2MSP",DISTRIBUTOR:"Org3MSP"} as Record<string,string>)[user.role]===user.orgMsp && hasPermission(user,"LOT_RECALL") && [lot.ownerOrganizationId,lot.processorOrganizationId,lot.distributorOrganizationId,lot.currentHolderOrganizationId,lot.pendingToOrganizationId,...(lot.participantOrganizationIds || [])].includes(user.organizationId)) actions.push("CTE_RECALL");
  return actions;
}
export const homeFor = (user: User) => `/${isAdmin(user) ? "super_admin" : user.role.toLowerCase()}/dashboard`;
export function dateText(value?: string) {
  if (!value) return "Chưa có dữ liệu";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Thời gian không hợp lệ"
    : date.toLocaleString("vi-VN");
}

export const permissionLabels: Record<string, string> = {
  USER_READ: "Xem người dùng", USER_CREATE: "Tạo người dùng", USER_UPDATE: "Cập nhật người dùng", USER_DISABLE: "Khóa tài khoản",
  IDENTITY_REQUEST: "Yêu cầu chứng thư", IDENTITY_ISSUE: "Cấp chứng thư", IDENTITY_DISABLE: "Ngừng ký Fabric",
  ORGANIZATION_READ: "Xem doanh nghiệp và tổ chức", ORGANIZATION_CREATE: "Thêm doanh nghiệp", ORGANIZATION_UPDATE: "Cập nhật doanh nghiệp", ORGANIZATION_DISABLE: "Vô hiệu hóa doanh nghiệp",
  BLOCKCHAIN_MONITOR: "Giám sát blockchain", AUDIT_LOG_READ: "Xem nhật ký quản trị", LOT_READ: "Xem lô hàng", LOT_CREATE: "Tạo lô", LOT_HARVEST: "Ghi nhận thu hoạch", LOT_PROCESS: "Ghi nhận sơ chế",
  HANDOVER_CREATE: "Gửi yêu cầu bàn giao", HANDOVER_CONFIRM: "Xác nhận tiếp nhận", TRANSPORT_RECORD: "Ghi nhận vận chuyển", LOT_DISPATCH: "Tiếp nhận tại điểm phân phối", LOT_DISPLAY_SALE: "Đưa lên kệ", LOT_RECALL: "Thu hồi lô", TRACE_HISTORY_READ: "Xem lịch sử truy xuất", TRACE_VALIDATE: "Kiểm chứng lịch sử",
};
