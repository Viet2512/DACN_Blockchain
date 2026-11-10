import axios from "axios";
import type {
  Audit,
  CreateLotInput,
  DocumentVerification,
  EventInput,
  Health,
  Lot,
  Organization,
  PublicLot,
  User,
  UserInput,
  Verification,
} from "../types";

export const API = (
  import.meta.env.VITE_API_URL ||
  import.meta.env.REACT_APP_API_URL ||
  "/api"
).replace(/\/$/, "");
export const TOKEN_KEY = "tracechain-token";
export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public uncertain = false,
    public step?: string,
    public code?: string,
  ) {
    super(message);
  }
}
export const api = axios.create({ baseURL: API, timeout: 30000 });
api.interceptors.request.use((config) => {
  if (!config.url?.startsWith("/public/") && config.url !== "/auth/login") {
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (!axios.isAxiosError(error)) return Promise.reject(error);
    const status = error.response?.status;
    const body: unknown = error.response?.data;
    const details =
      body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const isWrite = !["get", "head", "options"].includes(
      error.config?.method || "get",
    );
    const uncertain = isWrite && (!status || status >= 500);
    if (status === 401 && error.config?.url !== "/auth/login") {
      sessionStorage.removeItem(TOKEN_KEY);
      window.dispatchEvent(new Event("tracechain-session-expired"));
    }
    let message =
      status === 401
        ? "Phiên đăng nhập không hợp lệ hoặc tài khoản đã bị khóa."
        : status === 403
          ? ["FABRIC_IDENTITY_REQUIRED", "FABRIC_IDENTITY_MISMATCH"].includes(String(details.code)) && typeof details.message === "string"
            ? details.message
            : "Bạn không có quyền thực hiện thao tác này."
          : status === 404
            ? "Không tìm thấy dữ liệu yêu cầu."
            : typeof details.message === "string"
              ? details.message
              : typeof details.error === "string"
                ? details.error
                : "Không thể kết nối API. Kiểm tra mạng và thử tải lại.";
    if (error.config?.url === "/auth/login" && status === 401)
      message =
        "Tên đăng nhập hoặc mật khẩu không đúng, hoặc tài khoản đã bị khóa.";
    if (uncertain)
      message =
        "Chưa xác định kết quả ghi. Có thể Backend đã ghi nhận. Tải lại và đối chiếu lịch sử trước khi gửi tiếp.";
    if (details.ledgerCommitted === true) message=`Ledger đã commit giao dịch ${String(details.transactionId || "")}. Cần đồng bộ lại bản lưu MySQL trước khi thao tác tiếp.`;
    return Promise.reject(
      new ApiError(
        message,
        status,
        uncertain,
        String(details.step || ""),
        String(details.code || ""),
      ),
    );
  },
);
const get = async <T>(path: string): Promise<T> =>
  (await api.get<T>(path)).data;
const post = async <T>(path: string, data?: unknown): Promise<T> =>
  (await api.post<T>(path, data)).data;
const lotPath = (id: string) => `/lots/${encodeURIComponent(id)}`;
export const lotService = {
  list: () => get<Lot[]>("/lots"),
  reconcile: (id: string) => post<Lot>(`/fabric/lots/${encodeURIComponent(id)}/reconcile`, {}),
  get: (id: string) => get<Lot>(lotPath(id)),
  publicTrace: (id: string) =>
    get<PublicLot>(`/public/trace/${encodeURIComponent(id)}`),
  create: (data: CreateLotInput) => post<Lot>("/lots", data),
  record: (id: string, data: EventInput) => {
    const suffix =
      ["CTE_HANDOVER_PROCESSOR","CTE_HANDOVER_SHIP","CTE_HANDOVER_RETAIL"].includes(data.eventType)
        ? "/handover/request"
        : ["CTE_RECEIVE_PROCESSOR","CTE_RECEIVE_SHIP","CTE_DISPATCH_RETAIL"].includes(data.eventType)
          ? "/handover/confirm"
          : data.eventType === "CTE_RECALL"
            ? "/recall"
            : "/events";
    return post<Lot>(`${lotPath(id)}${suffix}`, data);
  },
  validate: (id: string) => get<Verification>(`${lotPath(id)}/validate`),
  documents: (id: string) =>
    get<DocumentVerification>(`${lotPath(id)}/verify-documents`),
  qrUrl: (id: string) => `${API}${lotPath(id)}/qr`,
  upload: async (id: string, file: File) => {
    const form = new FormData();
    form.append("document", file);
    form.append("lotId", id);
    return post<{ fileHash: string; fileName: string }>("/documents", form);
  },
  downloadDocument: async (id: string, documentId: number) =>
    (
      await api.get<Blob>(`${lotPath(id)}/documents/${documentId}`, {
        responseType: "blob",
      })
    ).data,
};
export const authService = {
  acceptInvitation: (token: string, password: string) => post<void>("/auth/accept-invitation", {token,password}),
  login: (data: { username: string; password: string }) =>
    post<{ token: string; user: User }>("/auth/login", data),
  me: () => get<User>("/auth/me"),
  logout: () => post<void>("/auth/logout"),
  changePassword: (data: {currentPassword: string; newPassword: string}) => post<void>("/auth/change-password", data),
};
export const adminService = {
  invite: (data: UserInput) => post<{activationToken?:string;message:string}>("/users/invitations",data),
  reissue: (username:string) => post<{activationToken?:string;message:string}>(`/users/${encodeURIComponent(username)}/invitation`),
  identity: (username:string,operation:'request'|'disable'|'issue') => post<void>(`/users/${encodeURIComponent(username)}/fabric-identity/${operation}`),
  businessActivity: () => get<Audit[]>("/business/activity"),
  identityRequests: () => get<{userId:string;username:string;organizationId:string;organizationName:string;role:string;mspId:string;status:string}[]>("/fabric-identity-requests"),
  users: () => get<User[]>("/users"),
  saveUser: (data: UserInput) => data.userId ? api.patch<User>(`/users/${encodeURIComponent(data.username)}`,data).then(response=>response.data) : post<User>("/users", data),
  status: async (username: string, status: string) =>
    (
      await api.patch<User>(`/users/${encodeURIComponent(username)}/status`, {
        status,
      })
    ).data,
  password: (username: string, password: string) =>
    post(`/users/${encodeURIComponent(username)}/reset-password`, { password }),
  organizations: () => get<Organization[]>("/business-organizations"),
  fabricOrganizations: () => get<{id:number; mspId:string; name:string; status:string; businessCount:number}[]>("/fabric-organizations"),
  saveOrganization: (data: Partial<Organization> & {mspId:string; type:string}, id?: string) => id ? api.patch<Organization>(`/business-organizations/${encodeURIComponent(id)}`,data).then(response => response.data) : post<Organization>("/business-organizations",data),
  permissions: () => get<{roles:{code:string;name:string}[]; permissions:{code:string;description:string}[];grants:{role:string;permission:string}[]}>("/admin/permissions"),
  identities: () => get<{id:string;userId:string;username:string;organizationName:string;mspId:string;role:string;enrollmentId:string;status:string;fingerprint:string}[]>("/admin/fabric-identities"),
  transactions: (page=1) => get<{items:{transactionId:string;lotId:string;userId:string;businessOrganizationId:string;mspId:string;eventType:string;timestamp:string;status:string}[];total:number;scope:string}>(`/admin/transactions?page=${page}`),
  activity: (userId?: string) => get<Audit[]>(`/admin/activity${userId ? `?userId=${encodeURIComponent(userId)}` : ''}`),
  audit: () => get<Audit[]>("/admin/audit-log"),
};
export const healthService = () => get<Health>("/health");
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
