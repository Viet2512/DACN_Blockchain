import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import App from "./App";
import {
  authService,
  adminService,
  healthService,
  lotService,
  TOKEN_KEY,
} from "./services/api";
import { VerificationResult, EventTimeline } from "./components/Common";
import type { TraceEvent, User } from "./types";
vi.mock("./services/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("./services/api")>();
  return {
    ...original,
    authService: { login: vi.fn(), me: vi.fn(), logout: vi.fn(), changePassword: vi.fn(), acceptInvitation: vi.fn() },
    lotService: { ...original.lotService, list: vi.fn(), get: vi.fn(), publicTrace: vi.fn() },
    healthService: vi.fn(),
    adminService: {...original.adminService, users: vi.fn(), organizations: vi.fn(), permissions: vi.fn(), saveUser: vi.fn(), invite: vi.fn(), reissue: vi.fn(), identity: vi.fn(), identities: vi.fn(), identityRequests: vi.fn()},
  };
});
const farmer: User = {
  username: "farmer",
  userId: "f1-user",
  organizationId: "FARMER-org",
  permissions:["LOT_READ","LOT_CREATE","LOT_HARVEST","LOT_RECALL","TRACE_HISTORY_READ","TRACE_VALIDATE","ORGANIZATION_READ"],
  role: "FARMER",
  actorId: "f1",
  orgMsp: "Org1MSP",
  regionCode: "TG-001",
  status: "ACTIVE",
};
function mount(path: string) {
  window.history.replaceState({}, "", path);
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <App />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  HTMLDialogElement.prototype.showModal = function () {this.setAttribute('open','');};
  vi.mocked(adminService.users).mockResolvedValue([]);
  vi.mocked(adminService.organizations).mockResolvedValue([]);
  vi.mocked(adminService.permissions).mockResolvedValue({roles:[{code:'FARMER',name:'FARMER'}],permissions:[],grants:[]});
  vi.mocked(adminService.identities).mockResolvedValue([]);
  vi.mocked(adminService.identityRequests).mockResolvedValue([]);
  vi.mocked(lotService.list).mockResolvedValue([]);
  vi.mocked(lotService.get).mockImplementation(async id => (await lotService.list()).find(lot => lot.lotId === id)!);
  vi.mocked(healthService).mockResolvedValue({
    status: "ok",
    mysql: "enabled",
    fabric: "disabled",
  });
});
it('redirects legacy actor management to users and removes duplicate sidebar CRUD', async () => {
  sessionStorage.setItem(TOKEN_KEY, 'session');
  vi.mocked(authService.me).mockResolvedValue({...farmer,role:'SUPER_ADMIN',permissions:['USER_READ','USER_CREATE','ORGANIZATION_READ']});
  vi.mocked(adminService.users).mockResolvedValue([{...farmer,legacyActorIds:['farmer-legacy']}]);
  mount('/admin/actors');
  expect(await screen.findByRole('heading',{name:'Người dùng theo doanh nghiệp'})).toBeInTheDocument();
  expect(window.location.pathname).toBe('/admin/users');
  expect(screen.queryByRole('link',{name:'Tác nhân'})).not.toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Lưu tác nhân'})).not.toBeInTheDocument();
  expect(await screen.findByText('farmer-legacy')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Tìm tài khoản'),{target:{value:'farmer-legacy'}});
  expect(screen.getByText('farmer-legacy')).toBeInTheDocument();
});
it('invites a business admin without assigning an initial password', async () => {
  sessionStorage.setItem(TOKEN_KEY, 'session');
  vi.mocked(authService.me).mockResolvedValue({...farmer,role:'SUPER_ADMIN',permissions:['USER_READ','USER_CREATE','ORGANIZATION_READ']});
  vi.mocked(adminService.permissions).mockResolvedValue({roles:[{code:'BUSINESS_ADMIN',name:'Business admin'}],permissions:[],grants:[]});
  vi.mocked(adminService.organizations).mockResolvedValue([{organizationId:'farm-A',name:'Nông hộ A',type:'FARM',organizationType:'FARM',mspId:'Org1MSP',status:'ACTIVE'}]);
  vi.mocked(adminService.invite).mockResolvedValue({message:'Đã tạo lời mời',activationToken:'a'.repeat(64)});
  mount('/admin/users');
  fireEvent.click(await screen.findByRole('button',{name:'+ Mời tài khoản'}));
  const dialog=within(screen.getByRole('dialog',{name:'Mời tài khoản'}));
  await dialog.findByRole('option',{name:'Nông hộ A'});
  fireEvent.change(screen.getByLabelText('Tên đăng nhập'),{target:{value:'boss-new'}});
  fireEvent.change(screen.getByLabelText('Họ tên'),{target:{value:'Quản trị mới'}});
  fireEvent.change(screen.getByLabelText('Email'),{target:{value:'boss@example.test'}});
  fireEvent.change(dialog.getByLabelText('Doanh nghiệp'),{target:{value:'farm-A'}});
  expect(screen.queryByLabelText('Mã vùng')).not.toBeInTheDocument();
  expect(dialog.queryByLabelText('Mật khẩu khởi tạo')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Lưu người dùng'}));
  await waitFor(()=>expect(adminService.invite).toHaveBeenCalledWith(expect.objectContaining({username:'boss-new',role:'BUSINESS_ADMIN',organizationId:'farm-A',password:''})));
  expect(adminService.saveUser).not.toHaveBeenCalled();
  expect(await screen.findByLabelText('Liên kết kích hoạt')).toHaveValue(`${window.location.origin}/activate#${'a'.repeat(64)}`);
});
it("redirects without session, shows blank credentials and public lookup", async () => {
  mount("/lots");
  expect(
    await screen.findByRole("heading", { name: "Đăng nhập tác nhân" }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("Tên đăng nhập")).toHaveValue("");
  expect(screen.getByLabelText("Mật khẩu")).toHaveValue("");
  expect(authService.me).not.toHaveBeenCalled();
  expect(
    screen.getByRole("link", { name: "Tra cứu không cần đăng nhập" }),
  ).toHaveAttribute("href", "/trace");
});
it('shows certificate mappings only for the selected user', async () => {
  sessionStorage.setItem(TOKEN_KEY,'session');
  vi.mocked(authService.me).mockResolvedValue({...farmer,role:'SUPER_ADMIN',permissions:['USER_READ','BLOCKCHAIN_MONITOR']});
  const identity={id:'identity-a',userId:'user-a',username:'driver-a',organizationName:'Vận tải A',mspId:'Org2MSP',role:'TRANSPORTER',enrollmentId:'enrollment-a',status:'ACTIVE',fingerprint:'fingerprint-a'};
  vi.mocked(adminService.identities).mockResolvedValue([identity,{...identity,id:'identity-b',userId:'user-b',username:'driver-b',enrollmentId:'enrollment-b'}]);
  mount('/admin/fabric-identities?userId=user-a');
  expect(await screen.findByText('enrollment-a')).toBeInTheDocument();
  expect(screen.queryByText('enrollment-b')).not.toBeInTheDocument();
  expect(screen.getByRole('link',{name:'Xem tất cả danh tính'})).toHaveAttribute('href','/admin/fabric-identities');
});
it('allows an authorized admin to issue a pending Fabric identity without exposing CA input', async () => {
  sessionStorage.setItem(TOKEN_KEY,'session');
  vi.mocked(authService.me).mockResolvedValue({...farmer,role:'SUPER_ADMIN',permissions:['BLOCKCHAIN_MONITOR','IDENTITY_ISSUE']});
  vi.mocked(adminService.identityRequests).mockResolvedValue([{userId:'user-a',username:'driver-a',organizationId:'org-a',organizationName:'Vận tải A',role:'TRANSPORTER',mspId:'Org2MSP',status:'PENDING'}]);
  vi.mocked(adminService.identity).mockResolvedValue(undefined);
  mount('/admin/fabric-identities');
  fireEvent.click(await screen.findByRole('button',{name:'Cấp chứng thư'}));
  await waitFor(()=>expect(adminService.identity).toHaveBeenCalledWith('driver-a','issue'));
  expect(screen.queryByLabelText(/MSP|private key|registrar/i)).not.toBeInTheDocument();
});
it('does not claim a signer is active when issuance was only queued', async () => {
  sessionStorage.setItem(TOKEN_KEY,'session');
  vi.mocked(authService.me).mockResolvedValue({...farmer,role:'SUPER_ADMIN',permissions:['USER_READ','USER_CREATE','IDENTITY_ISSUE']});
  vi.mocked(adminService.users).mockResolvedValue([{...farmer,username:'pending-farmer',fabricIdentityStatus:'PENDING'}]);
  vi.mocked(adminService.identity).mockResolvedValue(undefined);
  mount('/admin/users');
  fireEvent.click(await screen.findByRole('button',{name:'Cấp chứng thư'}));
  expect(await screen.findByText(/Đã duyệt yêu cầu; CA operator đang cấp chứng thư/)).toBeInTheDocument();
  expect(screen.queryByText('Đã cấp chứng thư Fabric và kích hoạt signer.')).not.toBeInTheDocument();
});
it("restores server role and rejects another role route despite forged cached identity", async () => {
  sessionStorage.setItem(TOKEN_KEY, "session");
  localStorage.setItem(
    "tracechain-auth",
    JSON.stringify({ ...farmer, role: "ADMIN" }),
  );
  vi.mocked(authService.me).mockResolvedValue(farmer);
  mount("/admin/users");
  expect(
    await screen.findByRole("heading", { name: "Không có quyền truy cập" }),
  ).toBeInTheDocument();
  expect(authService.me).toHaveBeenCalledOnce();
  expect(localStorage.getItem("tracechain-auth")).toBeNull();
});
it("renders farmer dashboard with actual empty state", async () => {
  sessionStorage.setItem(TOKEN_KEY, "session");
  vi.mocked(authService.me).mockResolvedValue(farmer);
  mount("/farmer/dashboard");
  expect(
    await screen.findByRole("heading", { name: "Tổng quan · Nông hộ" }),
  ).toBeInTheDocument();
  await waitFor(() => expect(lotService.list).toHaveBeenCalled());
  expect(
    await screen.findAllByText("Chưa có dữ liệu phù hợp."),
  ).not.toHaveLength(0);
});
it("prevents repeated login submits and displays server error", async () => {
  let reject!: (error: Error) => void;
  vi.mocked(authService.login).mockImplementation(
    () =>
      new Promise((_resolve, no) => {
        reject = no;
      }),
  );
  mount("/login");
  fireEvent.change(screen.getByLabelText("Tên đăng nhập"), {
    target: { value: "farmer" },
  });
  fireEvent.change(screen.getByLabelText("Mật khẩu"), {
    target: { value: "wrong" },
  });
  const button = screen.getByRole("button", { name: "Đăng nhập →" });
  fireEvent.click(button);
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(authService.login).toHaveBeenCalledOnce();
  reject(new Error("Sai mật khẩu"));
  expect(await screen.findByRole("alert")).toHaveTextContent("Sai mật khẩu");
});
it("does not equate HTTP success to verified history", () => {
  render(<VerificationResult result={{ valid: null, checkedEvents: 5 }} />);
  expect(screen.getByText("Không thể xác minh")).toBeInTheDocument();
});
it("public timeline omits arbitrary data and actor IDs", () => {
  const event: TraceEvent = {
    eventId: "e",
    eventType: "CTE_CREATE",
    timestamp: "2026-10-28",
    location: "TG",
    actorRole: "FARMER",
    actorId: "private-actor-id",
    previousEventId: null,
    dataHash: "hash",
    data: { contract: "private-contract" },
  };
  render(<EventTimeline events={[event]} publicView />);
  expect(screen.queryByText(/private-actor-id|private-contract/)).toBeNull();
});
it("public recall shows local-source warning without authentication", async () => {
  vi.mocked(lotService.publicTrace).mockResolvedValue({
    lotId: "LOT",
    productName: "Xoài",
    origin: "TG",
    status: "RECALLED",
    source: "LOCAL",
    events: [],
    integrity: { valid: false, checkedEvents: 0 },
  });
  mount("/trace/LOT");
  expect(
    await screen.findByRole("heading", { name: "Xoài" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("đã bị thu hồi");
  expect(
    screen.getByText(/chưa có bằng chứng giao dịch Fabric/),
  ).toBeInTheDocument();
  expect(authService.me).not.toHaveBeenCalled();
});

it.each([
  ['PROCESSOR', 'Thu mua / Sơ chế'], ['TRANSPORTER', 'Vận chuyển'],
  ['DISTRIBUTOR', 'Phân phối'], ['ADMIN', 'Quản trị viên'],
] as const)('renders the %s dashboard with server role', async (role, label) => {
  sessionStorage.setItem(TOKEN_KEY, 'session');
  vi.mocked(authService.me).mockResolvedValue({...farmer, role});
  mount(`/${role.toLowerCase()}/dashboard`);
  expect(await screen.findByRole('heading', {name: `Tổng quan · ${label}`})).toBeInTheDocument();
  await waitFor(() => expect(lotService.list).toHaveBeenCalled());
});
it('searches and paginates API lots, then filters by status', async () => {
  sessionStorage.setItem(TOKEN_KEY, 'session'); vi.mocked(authService.me).mockResolvedValue(farmer);
  vi.mocked(lotService.list).mockResolvedValue(Array.from({length: 12}, (_, i) => ({lotId: `LOT-${i + 1}`, productName: i === 11 ? 'Thanh long' : 'Xoài', origin: 'TG', harvestDate: '2026-10-28', status: i === 11 ? 'RECALLED' : 'CREATED', currentHolder: 'f1', regionCode: 'TG-001', createdAt: '2026-10-28', lastEventId: String(i), eventCount: 1})));
  mount('/lots'); await screen.findByRole('link', {name: 'LOT-1'});
  expect(screen.queryByRole('link', {name: 'LOT-12'})).toBeNull();
  fireEvent.click(screen.getByRole('button', {name: 'Sau'}));
  expect(screen.getByRole('link', {name: 'LOT-12'})).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Tìm kiếm'), {target: {value: 'Thanh long'}});
  expect(screen.getByRole('link', {name: 'LOT-12'})).toBeInTheDocument();
  expect(screen.queryByRole('link', {name: 'LOT-11'})).toBeNull();
  fireEvent.change(screen.getByLabelText('Trạng thái'), {target: {value: 'CREATED'}});
  expect(screen.getByText('Chưa có dữ liệu phù hợp.')).toBeInTheDocument();
});

it('groups admin navigation and hides infrastructure links from the main menu', async () => {
  sessionStorage.setItem(TOKEN_KEY, 'session');
  vi.mocked(authService.me).mockResolvedValue({...farmer,role:'SUPER_ADMIN',permissions:['LOT_READ','TRACE_HISTORY_READ','TRACE_VALIDATE','USER_READ','ORGANIZATION_READ','BLOCKCHAIN_MONITOR','AUDIT_LOG_READ']});
  mount('/admin/users');
  const navigation=within(await screen.findByRole('navigation',{name:'Điều hướng chính'}));
  expect(navigation.getAllByRole('link')).toHaveLength(5);
  expect(navigation.getByRole('link',{name:'Doanh nghiệp & người dùng'})).toHaveAttribute('href','/admin/organizations');
  expect(navigation.getByRole('link',{name:'Quản lý chuỗi cung ứng'})).toHaveAttribute('href','/lots');
  expect(navigation.queryByRole('link',{name:'Danh tính Fabric'})).not.toBeInTheDocument();
  expect(within(screen.getByRole('navigation',{name:'Doanh nghiệp & người dùng'})).getByRole('link',{name:'Phân quyền'})).toBeInTheDocument();
  expect(navigation.queryByRole('link',{name:'Tạo lô'})).not.toBeInTheDocument();
});
it('allows an organization administrator without unrelated USER_READ permission', async () => {
  sessionStorage.setItem(TOKEN_KEY,'session');
  vi.mocked(authService.me).mockResolvedValue({...farmer,role:'SUPER_ADMIN',permissions:['ORGANIZATION_READ']});
  mount('/admin/organizations');
  expect(await screen.findByRole('heading',{name:'Doanh nghiệp'})).toBeInTheDocument();
  expect(adminService.users).not.toHaveBeenCalled();
});
it('rejects a direct admin URL when the page permission is missing', async () => {
  sessionStorage.setItem(TOKEN_KEY,'session');
  vi.mocked(authService.me).mockResolvedValue({...farmer,role:'SUPER_ADMIN',permissions:['USER_READ']});
  mount('/admin/fabric-identities');
  expect(await screen.findByRole('heading',{name:'Không có quyền truy cập'})).toBeInTheDocument();
  expect(adminService.identities).not.toHaveBeenCalled();
});
it('keeps personal information separate and does not present an admin identity as pending', async () => {
  sessionStorage.setItem(TOKEN_KEY,'session');
  vi.mocked(authService.me).mockResolvedValue({...farmer,role:'SUPER_ADMIN',fullName:'Nguyễn An',fabricIdentityStatus:'PENDING',orgMsp:null,regionCode:'GLOBAL'});
  mount('/profile');
  expect(await screen.findByRole('heading',{name:'Thông tin cá nhân'})).toBeInTheDocument();
  const advanced=screen.getByText('Thông tin nâng cao').closest('details')!;
  expect(advanced).not.toHaveAttribute('open');
  expect(within(advanced).getByText(/không cần chứng thư/)).toBeInTheDocument();
  expect(screen.queryByText('PENDING')).not.toBeInTheDocument();
  expect(screen.queryByText('GLOBAL')).not.toBeInTheDocument();
  expect(screen.queryByText('Không được cung cấp')).not.toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Đổi mật khẩu và đăng xuất'})).toBeInTheDocument();
});
it('never shows zero statistics when the dashboard API fails', async () => {
  sessionStorage.setItem(TOKEN_KEY,'session');vi.mocked(authService.me).mockResolvedValue(farmer);
  vi.mocked(lotService.list).mockRejectedValue(new Error('Chưa thể tải lô hàng'));
  mount('/farmer/dashboard');
  expect(await screen.findByRole('alert')).toHaveTextContent('Chưa thể tải lô hàng');
  expect(screen.queryByText('Lô liên quan')).not.toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Tải lại'})).toBeInTheDocument();
});
it('filters pending handovers by the actual receiving organization', async () => {
  const driver: User={...farmer,role:'TRANSPORTER',organizationId:'logistics-a',orgMsp:'Org2MSP',permissions:['LOT_READ','HANDOVER_CONFIRM']};
  sessionStorage.setItem(TOKEN_KEY,'session');vi.mocked(authService.me).mockResolvedValue(driver);
  const base={productName:'Xoài',origin:'TG',harvestDate:'2026-11-08',status:'WAITING_SHIP' as const,currentHolder:'processor',currentHolderOrganizationId:'processor',regionCode:'TG-001',createdAt:'2026-11-08',lastEventId:'request',eventCount:4};
  vi.mocked(lotService.list).mockResolvedValue([{...base,lotId:'TO-ME',pendingToOrganizationId:'logistics-a'},{...base,lotId:'TO-OTHER',pendingToOrganizationId:'logistics-b'}]);
  mount('/handovers');await screen.findByRole('link',{name:'TO-ME'});
  expect(screen.getByRole('link',{name:'TO-OTHER'})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Chờ tôi nhận'}));
  expect(screen.getByRole('link',{name:'TO-ME'})).toBeInTheDocument();
  expect(screen.queryByRole('link',{name:'TO-OTHER'})).not.toBeInTheDocument();
});
it('traps focus in the mobile menu and restores it when Escape closes it', async () => {
  sessionStorage.setItem(TOKEN_KEY,'session');vi.mocked(authService.me).mockResolvedValue(farmer);
  mount('/lots');
  const toggle=await screen.findByRole('button',{name:'Mở hoặc đóng điều hướng'});
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded','true');
  const sidebar=screen.getByRole('complementary',{name:'Thanh điều hướng'});
  const first=within(sidebar).getAllByRole('link')[0];
  expect(first).toHaveFocus();
  fireEvent.keyDown(document,{key:'Tab',shiftKey:true});
  expect(within(sidebar).getByRole('link',{name:'Tra cứu công khai ↗'})).toHaveFocus();
  fireEvent.keyDown(document,{key:'Escape'});
  expect(toggle).toHaveAttribute('aria-expanded','false');
  expect(toggle).toHaveFocus();
});
it('omits diagnostic identifiers from public verification even when the API includes anomalies', () => {
  render(<VerificationResult publicView result={{valid:false,checkedEvents:2,scope:'IESH_V4',anomalies:[{step:'Identity',code:'PRIVATE_CODE',message:'private-user-id'}]}}/>);
  expect(screen.getByText('Phát hiện lịch sử không hợp lệ')).toBeInTheDocument();
  expect(screen.queryByText(/private-user-id|PRIVATE_CODE/)).not.toBeInTheDocument();
});

it('counts admin business statistics from API states rather than role fallbacks', async () => {
  sessionStorage.setItem(TOKEN_KEY,'session');vi.mocked(authService.me).mockResolvedValue({...farmer,role:'SUPER_ADMIN'});
  const base={productName:'Xoài',origin:'TG',harvestDate:'2026-11-08',currentHolder:'user',regionCode:'TG-001',createdAt:'2026-11-08',lastEventId:'event',eventCount:1};
  vi.mocked(lotService.list).mockResolvedValue(['CREATED','IN_TRANSIT','WAITING_SHIP','READY_FOR_SALE','RECALLED'].map((status,i)=>({...base,lotId:`STAT-${i}`,status:status as import('./types').Status})));
  mount('/super_admin/dashboard');await screen.findByText('Tổng số lô');
  expect(screen.getByText('Tổng số lô').closest('article')).toHaveTextContent('5');
  for (const label of ['Đang sản xuất / sơ chế','Đang vận chuyển','Hoàn tất đưa lên kệ','Bàn giao chờ xác nhận','Lô đã thu hồi']) expect(screen.getByText(label,{selector:'small'}).closest('article')).toHaveTextContent('1');
  expect(adminService.users).not.toHaveBeenCalled();
});

it('loads actual last events for recent activity instead of treating every summary as creation', async () => {
  sessionStorage.setItem(TOKEN_KEY,'session');vi.mocked(authService.me).mockResolvedValue({...farmer,role:'SUPER_ADMIN'});
  const summary={lotId:'ACTIVITY-LOT',productName:'Xoài',origin:'TG',harvestDate:'2026-11-08',status:'RECALLED' as const,currentHolder:'user',regionCode:'TG-001',createdAt:'2026-11-01',lastEventId:'recall',eventCount:2};
  vi.mocked(lotService.list).mockResolvedValue([summary]);
  vi.mocked(lotService.get).mockResolvedValue({...summary,events:[{eventId:'recall',eventType:'CTE_RECALL',actorRole:'FARMER',timestamp:'2026-11-08T10:00:00Z',location:'Vườn',previousEventId:'create',dataHash:'hash',data:{note:'Bao bì hỏng'}}]});
  mount('/super_admin/dashboard');
  expect(await screen.findByText('Thu hồi lô')).toBeInTheDocument();
  expect(lotService.get).toHaveBeenCalledWith('ACTIVITY-LOT');
  expect(screen.queryByText('Khởi tạo lô')).not.toBeInTheDocument();
});

it('clears the local session after password change even when the revoked session cannot log out on the server', async () => {
  sessionStorage.setItem(TOKEN_KEY,'session');vi.mocked(authService.me).mockResolvedValue(farmer);
  vi.mocked(authService.changePassword).mockResolvedValue(undefined);
  vi.mocked(authService.logout).mockRejectedValue(new Error('Session already revoked'));
  mount('/profile');
  fireEvent.change(await screen.findByLabelText('Mật khẩu hiện tại'),{target:{value:'previous-test-password'}});
  fireEvent.change(screen.getByLabelText('Mật khẩu mới'),{target:{value:'updated-test-password'}});
  fireEvent.click(screen.getByRole('button',{name:'Đổi mật khẩu và đăng xuất'}));
  expect(await screen.findByRole('heading',{name:'Đăng nhập tác nhân'})).toBeInTheDocument();
  expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
  expect(vi.mocked(authService.changePassword).mock.calls[0][0]).toEqual({currentPassword:'previous-test-password',newPassword:'updated-test-password'});
});

it('business admin gets a scoped staff route and no system administration route', async () => {
  sessionStorage.setItem(TOKEN_KEY,'session');
  vi.mocked(authService.me).mockResolvedValue({...farmer,role:'BUSINESS_ADMIN',organizationType:'FARM',permissions:['USER_READ','USER_CREATE','USER_UPDATE','USER_DISABLE','ORGANIZATION_READ','LOT_READ']});
  mount('/business/staff');
  expect(await screen.findByRole('heading',{name:'Nhân viên doanh nghiệp'})).toBeInTheDocument();
  const nav=within(screen.getByRole('navigation',{name:'Điều hướng chính'}));
  expect(nav.getAllByRole('link')).toHaveLength(5);
  expect(nav.getByRole('link',{name:'Nhân viên'})).toHaveAttribute('href','/business/staff');
  expect(nav.getByRole('link',{name:'Lô hàng'})).toHaveAttribute('href','/lots');
  expect(nav.queryByRole('link',{name:'Kiểm chứng blockchain'})).not.toBeInTheDocument();
});
it('staff and business administrators cannot open system user management', async () => {
  sessionStorage.setItem(TOKEN_KEY,'session');
  vi.mocked(authService.me).mockResolvedValue({...farmer,role:'BUSINESS_ADMIN',permissions:['USER_READ']});
  mount('/admin/users');
  expect(await screen.findByRole('heading',{name:'Không có quyền truy cập'})).toBeInTheDocument();
  expect(adminService.users).not.toHaveBeenCalled();
});
it('activation clears token from the address and requires matching passwords', async () => {
  vi.mocked(authService.acceptInvitation).mockResolvedValue(undefined);
  mount('/activate#'+'b'.repeat(64));
  expect(window.location.hash).toBe('');
  fireEvent.change(screen.getByLabelText('Mật khẩu mới'),{target:{value:'new-secure-password'}});
  fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu'),{target:{value:'different-password'}});
  fireEvent.click(screen.getByRole('button',{name:'Kích hoạt'}));
  expect(screen.getByRole('alert')).toHaveTextContent('chưa khớp');expect(authService.acceptInvitation).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu'),{target:{value:'new-secure-password'}});
  fireEvent.click(screen.getByRole('button',{name:'Kích hoạt'}));
  await waitFor(()=>expect(authService.acceptInvitation).toHaveBeenCalledWith('b'.repeat(64),'new-secure-password'));
  expect(await screen.findByRole('link',{name:'Đăng nhập'})).toHaveAttribute('href','/login');
});
