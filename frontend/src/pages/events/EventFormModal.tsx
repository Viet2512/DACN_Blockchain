import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminService, ApiError, lotService } from "../../services/api";
import {
  availableEvents, handoverRequests, handoverConfirmations,
  eventLabels,
  receiver,
  transitions,
} from "../../utils/permissions";
import { ErrorState, Modal } from "../../components/Common";
import type { EventInput, Lot, User } from "../../types";
export default function EventFormModal({
  lot,
  user,
  onClose,
  onSaved,
}: {
  lot: Lot;
  user: User;
  onClose: () => void;
  onSaved: () => void;
}) {
  const actions = availableEvents(user, lot);
  const [type, setType] = useState(actions[0]);
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [toOrganization, setToOrganization] = useState("");
  const [toRegion,setToRegion] = useState(lot.regionCode);
  const [documentHash, setDocumentHash] = useState("");
  const [uploading, setUploading] = useState(false);
  const [temperature,setTemperature]=useState("");
  const [humidity,setHumidity]=useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("kg");
  const [qualityResult,setQualityResult]=useState("");
  const [date, setDate] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const lock = useRef(false);
  const client = useQueryClient();
  const organizations = useQuery({
    queryKey: ["organizations"],
    queryFn: adminService.organizations,
    enabled: handoverRequests.includes(type),
  });
  const assignedTo = type === "CTE_HANDOVER_PROCESSOR" ? lot.processorOrganizationId : type === "CTE_HANDOVER_RETAIL" ? lot.distributorOrganizationId : "";
  const destinationType = type === "CTE_HANDOVER_PROCESSOR" ? "PROCESSING_FACILITY" : type === "CTE_HANDOVER_RETAIL" ? "DISTRIBUTION_COMPANY" : "LOGISTICS_COMPANY";
  const destinations = organizations.data?.filter(org => org.status === "ACTIVE" && org.type === destinationType && (!assignedTo || String(org.organizationId) === assignedTo)) || [];
  const selectedDestination = toOrganization || assignedTo || "";
  const target = destinations.find(org => String(org.organizationId) === selectedDestination);
  const hasQuantity = ["CTE_HARVEST", "CTE_PROCESS", "CTE_DISPATCH_RETAIL"].includes(type);
  const previousQuantity = [...(lot.events || [])].reverse().find(event => typeof event.data?.quantity === "number" && Number.isFinite(event.data.quantity) && event.data.quantity > 0 && ["kg", "tấn", "kiện"].includes(String(event.data.unit)))?.data;
  const locations = [...new Set([lot.origin, ...(lot.events || []).map(event => event.location)].filter(Boolean))];
  const mutation = useMutation({
    mutationFn: (payload: EventInput) => lotService.record(lot.lotId, payload),
  });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (lock.current || uncertain || uploading) return;
    lock.current = true;
    setError(null);
    try {
      if (!actions.includes(type) || !location.trim() || !confirmed)
        throw new Error(
          "Kiểm tra quyền, địa điểm và xác nhận thông tin trước khi gửi.",
        );
      if (type === "CTE_RECALL" && !note.trim())
        throw new Error("Nhập lý do thu hồi.");
      if (handoverRequests.includes(type) && !target)
        throw new Error("Chọn doanh nghiệp và mã vùng của bên nhận hàng.");
      const data = {
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(documentHash ? { documentHash } : {}),
        ...(hasQuantity && quantity ? { quantity: Number(quantity), unit } : {}),
        ...(hasQuantity && date ? { date } : {}),
        ...(type==="CTE_TRANSPORT" && temperature!=="" ? {temperature:Number(temperature)} : {}),
        ...(type==="CTE_TRANSPORT" && humidity!=="" ? {humidity:Number(humidity)} : {}),
        ...(["CTE_PROCESS","CTE_DISPLAY_SALE"].includes(type) ? {qualityResult} : {}),
        ...(target && handoverRequests.includes(type)
          ? { toOrg: target.mspId, toRegion, toOrganizationId: String(target.organizationId) }
          : {}),
      };
      const result = await mutation.mutateAsync({
        eventType: type,
        location: location.trim(),
        previousEventId: lot.lastEventId,
        data,
        ...(target && handoverRequests.includes(type) ? { toOrg: target.mspId, toRegion, toOrganizationId: String(target.organizationId) } : {}),
      });
      const nextStatus =
        type === "CTE_RECALL"
          ? "RECALLED"
          : transitions.find((t) => t.type === type)?.to;
      if (
        !result.lastEventId ||
        result.lastEventId === lot.lastEventId ||
        result.status !== nextStatus
      ) {
        setUncertain(true);
        throw new Error(
          "Phản hồi chưa xác nhận sự kiện mới. Đóng và tải lại lịch sử để đối chiếu.",
        );
      }
      await client.invalidateQueries();
      onSaved();
    } catch (e) {
      setError(e as Error);
      if (e instanceof ApiError && e.uncertain) setUncertain(true);
    } finally {
      lock.current = false;
    }
  };
  const upload = async (file?: File) => {
    if (!file) return;
    setDocumentHash("");
    if (
      file.size > 5 * 1024 * 1024 ||
      !/^(image\/(png|jpeg)|application\/pdf)$/.test(file.type)
    ) {
      setError(new Error("Chỉ nhận PDF, PNG hoặc JPEG, tối đa 5 MiB."));
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const result = await lotService.upload(lot.lotId, file);
      setDocumentHash(result.fileHash);
    } catch (e) {
      setError(e as Error);
    } finally {
      setUploading(false);
    }
  };
  return (
    <Modal
      title="Ghi nhận sự kiện"
      onClose={onClose}
      busy={mutation.isPending || uploading}
    >
      <p className="muted">
        Lô {lot.lotId} · Sự kiện đã ghi không thể chỉnh sửa.
      </p>
      {error && <ErrorState error={error} />}
      <form onSubmit={submit}>
        <fieldset disabled={mutation.isPending || uploading || uncertain}>
          <label>
            Loại sự kiện
            <select
              required
              value={type}
              onChange={(e) => {
                setType(e.target.value as typeof type);
                setToOrganization("");
                setQualityResult("");
                setConfirmed(false);
              }}
            >
              {actions.map((t) => (
                <option key={t} value={t}>
                  {eventLabels[t]}
                </option>
              ))}
            </select>
          </label>
          {handoverRequests.includes(type) && (
            <>
              <label>
                Bên nhận bàn giao
                <select
                  required
                  value={selectedDestination}
                  aria-describedby="handover-destination-hint"
                  onChange={(e) => setToOrganization(e.target.value)}
                >
                  <option value="">Chọn doanh nghiệp nhận</option>
                  {destinations.map((a) => (
                      <option value={String(a.organizationId)} key={a.organizationId}>
                        {a.name}
                      </option>
                    ))}
                </select>
              </label>
              <small id="handover-destination-hint">{organizations.isPending ? "Đang tải bên nhận…" : !destinations.length ? "Chưa có bên nhận đang hoạt động phù hợp. Liên hệ quản trị viên." : assignedTo ? "Bên nhận đã được phân công khi tạo lô; kiểm tra lại trước khi gửi." : "Chọn công ty vận chuyển đã thống nhất nhận lô. Chưa chuyển quyền nắm giữ khi gửi yêu cầu."}</small>
              {organizations.error && (
                <ErrorState
                  error={organizations.error}
                  retry={() => void organizations.refetch()}
                />
              )}
              <label>Vùng tiếp nhận<input required maxLength={80} pattern={"[A-Za-z0-9_\\-]+"} aria-describedby="handover-region-hint" placeholder="VD: TG-001" value={toRegion} onChange={event=>setToRegion(event.target.value)}/></label>
              <small id="handover-region-hint">Xác nhận mã vùng với bên nhận, ví dụ TG-001. Mã đang điền là vùng của lô; cần đổi nếu bên nhận ở vùng khác. Chỉ đúng doanh nghiệp và vùng tiếp nhận mới được xác nhận.</small>
            </>
          )}
          {handoverConfirmations.includes(type) && (
            <div className="notice">
              Bạn đang xác nhận nhận lô cho {user.organizationName || "doanh nghiệp của mình"} tại vùng {receiver(lot).region}. Đối
              chiếu hàng thực tế trước khi xác nhận.
            </div>
          )}
          <label>
            Địa điểm ghi nhận
            <input
              required
              maxLength={255}
              list="event-location-suggestions"
              placeholder="VD: Kho sơ chế Mỹ Tho, Tiền Giang"
              aria-describedby="event-location-hint"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </label>
          <datalist id="event-location-suggestions">{locations.map(value => <option key={value} value={value}/>)}</datalist>
          <small id="event-location-hint">Có thể chọn địa điểm từng ghi trong lô hoặc nhập nơi thực tế diễn ra sự kiện.</small>
          {hasQuantity && (
            <div className="two">
              <div>
              <label>
                Ngày nghiệp vụ
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <small>Chọn ngày thực tế của công đoạn; có thể để trống nếu không có ngày riêng trong hồ sơ.</small>
              </div>
              <div>
              <label>
                Khối lượng / Số lượng
                <input
                  required
                  type="number"
                  min="0.001"
                  step="any"
                  placeholder="VD: 100"
                  aria-describedby="event-quantity-hint"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </label>
              <small id="event-quantity-hint">Nhập lượng thực tế sau công đoạn, lớn hơn 0. {previousQuantity && <>Lần ghi gần nhất: {String(previousQuantity.quantity)} {String(previousQuantity.unit)}. <button type="button" className="secondary" onClick={()=>{setQuantity(String(previousQuantity.quantity));setUnit(String(previousQuantity.unit));setConfirmed(false);}}>Dùng số lượng trước</button></>}</small>
              </div>
              <label>
                Đơn vị
                <select value={unit} onChange={(e) => setUnit(e.target.value)}>
                  <option>kg</option>
                  <option>tấn</option>
                  <option>kiện</option>
                </select>
              </label>
            </div>
          )}
          {type==="CTE_TRANSPORT" && <><div className="two"><label>Nhiệt độ (°C)<input type="number" step="any" placeholder="VD: 8.5" aria-describedby="event-sensor-hint" value={temperature} onChange={e=>setTemperature(e.target.value)}/></label><label>Độ ẩm (%)<input type="number" min="0" max="100" step="any" placeholder="VD: 70" aria-describedby="event-sensor-hint" value={humidity} onChange={e=>setHumidity(e.target.value)}/></label></div><small id="event-sensor-hint">Nhập số đo thực tế; nhiệt độ có thể âm hoặc 0, độ ẩm từ 0 đến 100%. Không có số đo thì để trống.</small></>}
          {["CTE_PROCESS","CTE_DISPLAY_SALE"].includes(type) && <><label>Kết quả kiểm tra chất lượng<select required value={qualityResult} aria-describedby="event-quality-hint" onChange={e=>setQualityResult(e.target.value)}><option value="">Chọn kết quả thực tế</option><option value="PASS">Đạt</option><option value="FAIL">Không đạt — không được chuyển bước</option><option value="PENDING">Chờ kiểm tra</option></select></label><small id="event-quality-hint">Chỉ chọn Đạt sau khi đã kiểm tra. Không đạt hoặc chờ kiểm tra không được chuyển công đoạn.</small></>}
          <label>
            {type === "CTE_RECALL" ? "Lý do thu hồi" : "Ghi chú nghiệp vụ"}
            <textarea
              required={type === "CTE_RECALL"}
              maxLength={4000}
              placeholder={type === "CTE_RECALL" ? "VD: Phát hiện bao bì rách; cách ly lô để kiểm tra chất lượng." : "VD: Công đoạn đã thực hiện, tình trạng hàng và thông tin cần lưu ý."}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <label>
            Chứng từ PDF / ảnh (không bắt buộc)
            <input
              type="file"
              accept="application/pdf,image/png,image/jpeg"
              onChange={(e) => void upload(e.target.files?.[0])}
            />
          </label>
          <small>
            {uploading
              ? "Đang tải chứng từ…"
              : documentHash
                ? "Đã tải chứng từ, sẽ liên kết khi sự kiện được xác nhận."
                : "Tối đa 5 MiB. Chứng từ gắn với sự kiện sau khi Backend xác nhận."}
          </small>
          <label className="checkbox">
            <input
              type="checkbox"
              required
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            Tôi đã đối chiếu lô, bên nhận (nếu có) và nội dung gửi.
          </label>
        </fieldset>
        <div className="actions">
          <button
            disabled={
              mutation.isPending ||
              uploading ||
              uncertain ||
              !actions.length ||
              !confirmed
            }
          >
            {mutation.isPending
              ? "Đang xác nhận giao dịch…"
              : uncertain
                ? "Cần tải lại lịch sử"
                : "Xác nhận gửi sự kiện"}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={mutation.isPending || uploading}
            onClick={onClose}
          >
            Đóng
          </button>
        </div>
      </form>
    </Modal>
  );
}
