import { useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { ApiError, lotService, adminService } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useLots } from "../../hooks/queries";
import { ErrorState, PageHeader } from "../../components/Common";
import { hasPermission } from "../../utils/permissions";
import type { CreateLotInput } from "../../types";
export default function CreateLotPage() {
  const { user } = useAuth();
  const lots = useLots();
  const navigate = useNavigate();
  const client = useQueryClient();
  const organizations = useQuery({queryKey:["organizations"],queryFn:adminService.organizations});
  const lock = useRef(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [form, setForm] = useState<CreateLotInput>({
    lotId: "",
    processorOrganizationId: "",
    distributorOrganizationId: "",
    productName: "",
    origin: "",
    harvestDate: "",
    location: "",
    regionCode: user?.regionCode || "",
  });
  const hints = {
    lotId: "Chỉ dùng chữ không dấu, số, - hoặc _. Mã sẽ được chuyển thành chữ hoa.",
    productName: "Chọn gợi ý từ lô đã có hoặc nhập sản phẩm khác.",
    origin: "Ghi rõ trang trại/vùng trồng và địa phương nơi sản xuất.",
    harvestDate: "Chọn đúng ngày thu hoạch trong hồ sơ; đây chưa phải xác nhận đã thu hoạch.",
    location: "Ghi địa điểm thực tế tạo lô, có thể dùng tên cơ sở kèm địa chỉ.",
  };
  const placeholders = {
    lotId: "VD: LOT-XOAI-001", productName: "VD: Xoài cát Hòa Lộc",
    origin: "VD: Vùng trồng Cái Bè, Tiền Giang", harvestDate: "",
    location: "VD: Nông trại Mekong Xanh, Cái Bè",
  };
  const suggestions = {
    productName: [...new Set((lots.data || []).map(lot => lot.productName))],
    origin: [...new Set((lots.data || []).map(lot => lot.origin))],
    location: [...new Set((lots.data || []).flatMap(lot => [lot.origin, ...(lot.events || []).map(event => event.location)]).filter(Boolean))],
  };
  function suggestLotId() {
    const today = new Date();
    const date = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, "0"), String(today.getDate()).padStart(2, "0")].join("");
    const suffix = Array.from(crypto.getRandomValues(new Uint8Array(4)), byte => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
    setForm(current => ({...current, lotId: `LOT-${date}-${suffix}`}));
  }
  const mutation = useMutation({
    mutationFn: lotService.create,
    onSuccess: async (lot) => {
      if (lot.status !== "CREATED" || !lot.lastEventId) {
        setUncertain(true);
        throw new Error(
          "Phản hồi chưa xác nhận lô được tạo. Hãy đối chiếu danh sách lô.",
        );
      }
      await client.invalidateQueries();
      navigate(`/lots/${encodeURIComponent(lot.lotId)}`);
    },
  });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (lock.current || uncertain) return;
    lock.current = true;
    setError(null);
    try {
      const payload = {
        ...form,
        lotId: form.lotId.trim().toUpperCase(),
        productName: form.productName.trim(),
        origin: form.origin.trim(),
        location: form.location.trim(),
      };
      if (
        Object.values(payload).some((v) => !v) ||
        payload.regionCode === "GLOBAL"
      )
        throw new Error(
          "Điền đủ thông tin và sử dụng tài khoản có mã vùng cụ thể.",
        );
      await mutation.mutateAsync(payload);
    } catch (e) {
      setError(e as Error);
      if (e instanceof ApiError && e.uncertain) setUncertain(true);
    } finally {
      lock.current = false;
    }
  };
  return (
    <>
      <PageHeader
        title="Khởi tạo lô nông sản"
        description="Nhập thông tin nguồn gốc và chọn các đơn vị sẽ tiếp nhận lô."
      />
      <section className="form-card narrow">
        {error && <ErrorState error={error} />}
        {uncertain && user && hasPermission(user, "TRACE_VALIDATE") && <button className="secondary" disabled={mutation.isPending} onClick={async () => {
          try {const lot = await lotService.reconcile(form.lotId.trim()); await client.invalidateQueries(); navigate(`/lots/${encodeURIComponent(lot.lotId)}`);}
          catch (e) {setError(e as Error);}
        }}>Kiểm tra kết quả & khôi phục bản lưu</button>}
        <form onSubmit={submit}><fieldset disabled={mutation.isPending || uncertain}>
          <div className="two">
            {(
              [
                ["lotId", "Mã lô", "text"],
                ["productName", "Tên sản phẩm", "text"],
                ["origin", "Nguồn gốc", "text"],
                ["harvestDate", "Ngày thu hoạch theo hồ sơ lô", "date"],
                ["location", "Địa điểm ghi nhận", "text"],
              ] as const
            ).map(([key, label, type]) => (
              <div key={key}>
              <label>
                {label}
                <input
                  required
                  type={type}
                  pattern={key === "lotId" ? "[A-Za-z0-9][A-Za-z0-9_\\-]*" : undefined}
                  maxLength={key === "lotId" ? 120 : 255}
                  placeholder={placeholders[key]}
                  aria-describedby={`create-${key}-hint`}
                  list={key === "productName" || key === "origin" || key === "location" ? `create-${key}-suggestions` : undefined}
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
              </label>
              <small id={`create-${key}-hint`}>{hints[key]}</small>
              {key === "lotId" && <button type="button" className="secondary" disabled={mutation.isPending || uncertain} onClick={suggestLotId}>Gợi ý mã lô</button>}
              </div>
            ))}
            {([['processorOrganizationId','Doanh nghiệp sơ chế','PROCESSING_FACILITY'],['distributorOrganizationId','Doanh nghiệp phân phối','DISTRIBUTION_COMPANY']] as const).map(([key,label,type])=><div key={key}><label>{label}<select required value={form[key]} aria-describedby={`create-${key}-hint`} onChange={event=>setForm({...form,[key]:event.target.value})}><option value="">Chọn doanh nghiệp được phân công</option>{organizations.data?.filter(org=>org.type===type && org.status==='ACTIVE').map(org=><option key={org.organizationId} value={org.organizationId}>{org.name}</option>)}</select></label><small id={`create-${key}-hint`}>{organizations.isPending ? 'Đang tải doanh nghiệp…' : organizations.data?.some(org=>org.type===type && org.status==='ACTIVE') ? 'Chọn đơn vị thực tế sẽ tiếp nhận lô ở công đoạn này.' : 'Chưa có đơn vị đang hoạt động. Liên hệ quản trị viên để bổ sung.'}</small></div>)}
            {organizations.error && <ErrorState error={organizations.error}/>}
            <label>
              Mã vùng tài khoản
              <input readOnly value={form.regionCode} />
            </label>
          </div>
          {Object.entries(suggestions).map(([key, values]) => <datalist id={`create-${key}-suggestions`} key={key}>{values.map(value => <option key={value} value={value}/>)}</datalist>)}
          <p className="muted">
            Tạo lô chưa phải ghi nhận sự kiện thu hoạch. Bước thu hoạch được
            thực hiện sau khi lô có trạng thái Đã khởi tạo.
          </p>
          <div className="actions">
            <button
              disabled={
                mutation.isPending ||
                uncertain ||
                !form.regionCode ||
                form.regionCode === "GLOBAL"
              }
            >
              {mutation.isPending ? "Đang ghi nhận…" : "Tạo lô"}
            </button>
            <Link to="/lots">
              {uncertain
                ? "Đối chiếu danh sách trước khi gửi tiếp →"
                : "Về danh sách"}
            </Link>
          </div>
        </fieldset></form>
      </section>
    </>
  );
}
