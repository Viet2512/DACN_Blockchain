import type { User } from "../types";
import { hasPermission, homeFor, isAdmin } from "./permissions";

export const adminSections = [
  {label:"Doanh nghiệp & người dùng",links:[
    ["/admin/organizations","Doanh nghiệp","ORGANIZATION_READ"],
    ["/admin/users","Người dùng","USER_READ"],
    ["/admin/roles","Phân quyền","USER_READ"],
  ]},
  {label:"Quản lý chuỗi cung ứng",links:[
    ["/lots","Lô hàng","LOT_READ"], ["/handovers","Bàn giao","LOT_READ"],
    ["/history","Lịch sử","TRACE_HISTORY_READ"], ["/recalls","Cảnh báo & thu hồi","LOT_READ"],
  ]},
  {label:"Kiểm chứng blockchain",links:[
    ["/admin/verification","Kiểm chứng IESH","TRACE_VALIDATE"],
    ["/admin/blockchain","Giao dịch & hạ tầng","BLOCKCHAIN_MONITOR"],
    ["/admin/fabric-organizations","Tổ chức Fabric","BLOCKCHAIN_MONITOR"],
    ["/admin/fabric-identities","Danh tính Fabric","BLOCKCHAIN_MONITOR"],
  ]},
  {label:"Cài đặt",links:[
    ["/profile","Tài khoản",""], ["/admin/audit-logs","Nhật ký quản trị","AUDIT_LOG_READ"],
    ["/admin/reports","Báo cáo dữ liệu","LOT_READ"],
  ]},
];
export function navigationFor(user: User) {
  if (user.role === "BUSINESS_ADMIN") return [
    {to:homeFor(user),label:"Tổng quan"}, {to:"/business/staff",label:"Nhân viên"},
    {to:"/lots",label:"Lô hàng"}, {to:"/business/activity",label:"Hoạt động doanh nghiệp",paths:["/business/activity","/business/organization"]}, {to:"/profile",label:"Tài khoản"},
  ];
  const admin = isAdmin(user);
  if (admin) return [
    {to:homeFor(user),label:"Tổng quan",paths:[homeFor(user)]},
    ...adminSections.map(section=>{
      const visible=section.links.filter(([, , permission])=>!permission || hasPermission(user,permission));
      return {to:visible[0]?.[0] || "",label:section.label,paths:section.links.map(([to])=>to)};
    }).filter(link=>link.to),
  ];
  const links: {to: string; label: string; permission?: string; paths?: string[]}[] = [
    { to: homeFor(user), label: "Tổng quan" },
    { to: "/lots", label: user.role === "FARMER" ? "Lô hàng của tôi" : "Lô liên quan", permission: "LOT_READ" },
    ...(user.role === "FARMER" ? [{ to: "/lots/new", label: "Tạo lô", permission: "LOT_CREATE" }] : []),
    ...(user.role !== "FARMER" ? [{ to: "/work", label: user.role === "PROCESSOR" ? "Xử lý / Sơ chế" : user.role === "TRANSPORTER" ? "Lô đang vận chuyển" : "Phân phối", permission: "LOT_READ" }] : []),
    { to: "/handovers", label: user.role === "TRANSPORTER" ? "Yêu cầu & bàn giao" : "Bàn giao & tiếp nhận", permission: "LOT_READ" },
    { to: "/history", label: "Lịch sử truy xuất", permission: "TRACE_HISTORY_READ", paths: ["/history", "/admin/events", "/admin/handovers", "/admin/recalls"] },
    { to: "/recalls", label: "Cảnh báo & thu hồi", permission: "LOT_READ" },

  ];
  return links.filter(link => link.to && (!link.permission || hasPermission(user, link.permission)));
}
