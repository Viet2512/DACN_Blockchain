import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import EventFormModal from "./EventFormModal";
import { adminService, ApiError, lotService } from "../../services/api";
import type { Organization, Lot, User } from "../../types";
vi.mock("../../services/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../services/api")>();
  return {
    ...original,
    lotService: { ...original.lotService, record: vi.fn() },
    adminService: { ...original.adminService, organizations: vi.fn() },
  };
});
const lot: Lot = {schemaVersion:4,currentHolderOrganizationId:"PROCESSOR-org",
  lotId: "LOT",
  ownerOrganizationId: "FARMER-org",
  processorOrganizationId: "PROCESSOR-org",
  distributorOrganizationId: "DISTRIBUTOR-org",
  productName: "Xoài",
  origin: "TG",
  harvestDate: "2026-10-28",
  status: "PROCESSED",
  regionCode: "TG-001",
  currentHolder: "processor",
  createdAt: "2026-10-28",
  eventCount: 3,
  lastEventId: "prev",
};
const user: User = {
  username: "processor",
  userId: "PROCESSOR-user",
  organizationId: "PROCESSOR-org",
  permissions:["HANDOVER_CREATE","LOT_RECALL"],
  role: "PROCESSOR",
  actorId: "processor",
  orgMsp: "Org1MSP",
  regionCode: "TG-001",
};
const target: Organization = {organizationId:'transport',name:'Vận tải',mspId:'Org2MSP',organizationType:'LOGISTICS_COMPANY',type:'LOGISTICS_COMPANY',status:'ACTIVE'};
beforeEach(() => {
  vi.clearAllMocks();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  vi.mocked(adminService.organizations).mockResolvedValue([target]);
});
function mount(currentLot=lot,currentUser=user) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const saved = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <EventFormModal lot={currentLot} user={currentUser} onClose={vi.fn()} onSaved={saved} />
    </QueryClientProvider>,
  );
  return { saved, invalidate: vi.spyOn(client, "invalidateQueries") };
}
async function fill() {
  await screen.findByRole("option", { name: "Vận tải" });
  fireEvent.change(screen.getByLabelText("Bên nhận bàn giao"), {
    target: { value: "transport" },
  });
  fireEvent.change(screen.getByLabelText("Địa điểm ghi nhận"), {
    target: { value: "Kho TG" },
  });
  fireEvent.change(screen.getByLabelText("Vùng tiếp nhận"), {target:{value:"HN"}});
  fireEvent.click(screen.getByRole("checkbox"));
}
it("posts handover contract in both top-level and data and blocks double-submit", async () => {
  let resolve!: (lot: Lot) => void;
  vi.mocked(lotService.record).mockImplementation(
    () =>
      new Promise((yes) => {
        resolve = yes;
      }),
  );
  const { saved, invalidate } = mount();
  await fill();
  const button = screen.getByRole("button", { name: "Xác nhận gửi sự kiện" });
  fireEvent.click(button);
  fireEvent.click(button);
  await waitFor(() => expect(lotService.record).toHaveBeenCalledOnce());
  expect(lotService.record).toHaveBeenCalledWith(
    "LOT",
    expect.objectContaining({
      eventType: "CTE_HANDOVER_SHIP",
      previousEventId: "prev",
      toOrg: "Org2MSP",
      toRegion: "HN",
      toOrganizationId: "transport",
      data: { toOrg: "Org2MSP", toRegion: "HN", toOrganizationId: "transport" },
    }),
  );
  expect(saved).not.toHaveBeenCalled();
  resolve({ ...lot, status: "WAITING_SHIP", lastEventId: "new" });
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(invalidate).toHaveBeenCalledOnce();
});
it("does not mark timeout as success or allow blind retry", async () => {
  vi.mocked(lotService.record).mockRejectedValue(
    new ApiError("Chưa xác định kết quả ghi", undefined, true),
  );
  const { saved, invalidate } = mount();
  await fill();
  fireEvent.click(screen.getByRole("button", { name: "Xác nhận gửi sự kiện" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Chưa xác định");
  expect(
    screen.getByRole("button", { name: "Cần tải lại lịch sử" }),
  ).toBeDisabled();
  expect(saved).not.toHaveBeenCalled();
  expect(invalidate).not.toHaveBeenCalled();
  expect(lotService.record).toHaveBeenCalledOnce();
});
it("does not accept an unchanged event ID as confirmed", async () => {
  vi.mocked(lotService.record).mockResolvedValue({
    ...lot,
    status: "WAITING_SHIP",
  });
  const { saved } = mount();
  await fill();
  fireEvent.click(screen.getByRole("button", { name: "Xác nhận gửi sự kiện" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("chưa xác nhận");
  expect(saved).not.toHaveBeenCalled();
});

it('records a signed transport checkpoint with zero sensor values',async()=>{
 const transportLot={...lot,status:'IN_TRANSIT' as const,currentHolderOrganizationId:'logistics'};
 const driver={...user,role:'TRANSPORTER' as const,organizationId:'logistics',orgMsp:'Org2MSP',permissions:['TRANSPORT_RECORD']};
 vi.mocked(lotService.record).mockResolvedValue({...transportLot,lastEventId:'checkpoint'});
 const {saved}=mount(transportLot,driver);
 fireEvent.change(screen.getByLabelText('Địa điểm ghi nhận'),{target:{value:'Depot'}});
 fireEvent.change(screen.getByLabelText('Nhiệt độ (°C)'),{target:{value:'0'}});
 fireEvent.change(screen.getByLabelText('Độ ẩm (%)'),{target:{value:'0'}});
 fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Xác nhận gửi sự kiện'}));
 await waitFor(()=>expect(saved).toHaveBeenCalledOnce());
 expect(lotService.record).toHaveBeenCalledWith('LOT',expect.objectContaining({eventType:'CTE_TRANSPORT',data:{temperature:0,humidity:0}}));
});

it('selects the assigned processor and suggests existing locations without inventing quantities', async()=>{
 const source={...lot,status:'HARVESTED' as const,currentHolderOrganizationId:'FARMER-org',events:[{eventId:'harvest',eventType:'CTE_HARVEST' as const,actorRole:'FARMER' as const,timestamp:'2026-11-08T00:00:00Z',location:'Vườn Cái Bè',previousEventId:null,dataHash:'hash',data:{quantity:100,unit:'kg'}}]};
 const farmer={...user,role:'FARMER' as const,organizationId:'FARMER-org'};
 vi.mocked(adminService.organizations).mockResolvedValue([{...target,organizationId:'PROCESSOR-org',name:'Sơ chế A',type:'PROCESSING_FACILITY',mspId:'Org1MSP'},{...target,organizationId:'processor-other',name:'Sơ chế khác',type:'PROCESSING_FACILITY',mspId:'Org1MSP'}]);
 mount(source,farmer);
 await screen.findByRole('option',{name:'Sơ chế A'});
 expect(screen.getByLabelText('Bên nhận bàn giao')).toHaveValue('PROCESSOR-org');
 expect(screen.queryByRole('option',{name:'Sơ chế khác'})).not.toBeInTheDocument();
 const location=screen.getByLabelText('Địa điểm ghi nhận');
 expect(location).toHaveValue('');
 expect(document.getElementById(location.getAttribute('list')!)!.querySelector('option[value="Vườn Cái Bè"]')).not.toBeNull();
 expect(lotService.record).not.toHaveBeenCalled();
});

it('copies a previous quantity only on request and requires an explicit quality result',async()=>{
 const processing={...lot,status:'RECEIVED_PROCESSOR' as const,events:[{eventId:'harvest',eventType:'CTE_HARVEST' as const,actorRole:'FARMER' as const,timestamp:'2026-11-08T00:00:00Z',location:'Vườn',previousEventId:null,dataHash:'hash',data:{quantity:0.5,unit:'tấn'}}]};
 mount(processing,{...user,permissions:['LOT_PROCESS','LOT_RECALL']});
 expect(screen.getByLabelText('Khối lượng / Số lượng')).toHaveValue(null);
 expect(screen.getByLabelText('Kết quả kiểm tra chất lượng')).toHaveValue('');
 fireEvent.click(screen.getByRole('button',{name:'Dùng số lượng trước'}));
 expect(screen.getByLabelText('Khối lượng / Số lượng')).toHaveValue(0.5);
 expect(screen.getByLabelText('Đơn vị')).toHaveValue('tấn');
 expect(screen.getByRole('checkbox')).not.toBeChecked();
 fireEvent.change(screen.getByLabelText('Loại sự kiện'),{target:{value:'CTE_RECALL'}});
 fireEvent.change(screen.getByLabelText('Địa điểm ghi nhận'),{target:{value:'Kho thực tế'}});
 fireEvent.change(screen.getByLabelText('Lý do thu hồi'),{target:{value:'Bao bì bị hỏng'}});
 vi.mocked(lotService.record).mockResolvedValue({...processing,status:'RECALLED',lastEventId:'recall'});
 fireEvent.click(screen.getByRole('checkbox'));
 fireEvent.click(screen.getByRole('button',{name:'Xác nhận gửi sự kiện'}));
 await waitFor(()=>expect(lotService.record).toHaveBeenCalledOnce());
 expect(lotService.record).toHaveBeenCalledWith('LOT',expect.objectContaining({eventType:'CTE_RECALL',data:{note:'Bao bì bị hỏng'}}));
});

it('rejects an unsupported image before sending a document to the backend', async()=>{
 const upload=vi.spyOn(lotService,'upload');
 mount();
 fireEvent.change(screen.getByLabelText('Chứng từ PDF / ảnh (không bắt buộc)'),{target:{files:[new File(['<svg/>'],'drawing.svg',{type:'image/svg+xml'})]}});
 expect(await screen.findByRole('alert')).toHaveTextContent('Chỉ nhận PDF, PNG hoặc JPEG');
 expect(upload).not.toHaveBeenCalled();
 upload.mockRestore();
});

it('uses a native v-pattern that accepts hyphenated regions and rejects spaces',async()=>{
 mount();await screen.findByRole('option',{name:'Vận tải'});
 const input=screen.getByLabelText('Vùng tiếp nhận') as HTMLInputElement;
 const pattern=new RegExp(`^(?:${input.pattern})$`,'v');
 expect(pattern.test('TG-001')).toBe(true);expect(pattern.test('TG 001')).toBe(false);
});
