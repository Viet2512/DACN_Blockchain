import {
  Component,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type ErrorInfo,
} from "react";
import { Link } from "react-router-dom";
import {
  statusLabels,
  dateText,
  eventLabels,
  roleLabels,
} from "../utils/permissions";
import type { Status, TraceEvent, Verification } from "../types";

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
      </div>
      <div className="actions">{children}</div>
    </div>
  );
}
export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`status status-${status.toLowerCase()}`}>
      {statusLabels[status] || "Chưa xác định"}
    </span>
  );
}
export function EmptyState({
  children = "Chưa có dữ liệu phù hợp.",
}: {
  children?: ReactNode;
}) {
  return <div className="empty-card">{children}</div>;
}
export function ErrorState({
  error,
  retry,
}: {
  error: Error;
  retry?: () => void;
}) {
  return (
    <div role="alert" className="error">
      <p>{error.message}</p>
      {retry && (
        <button className="secondary" onClick={retry}>
          Tải lại
        </button>
      )}
    </div>
  );
}
export function LoadingSkeleton() {
  return (
    <div className="skeleton" role="status" aria-live="polite">
      Đang tải dữ liệu…
      <div />
      <div />
      <div />
    </div>
  );
}
export function QueryState({
  pending,
  error,
  retry,
}: {
  pending: boolean;
  error: Error | null;
  retry?: () => void;
}) {
  return pending ? (
    <LoadingSkeleton />
  ) : error ? (
    <ErrorState error={error} retry={retry} />
  ) : null;
}
export function Modal({
  title,
  children,
  onClose,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <button
        type="button"
        className="close"
        aria-label="Đóng hộp thoại"
        disabled={busy}
        onClick={onClose}
      >
        ×
      </button>
      <h2>{title}</h2>
      {children}
    </dialog>
  );
}
export function Pagination({
  total,
  page,
  setPage,
  size = 10,
}: {
  total: number;
  page: number;
  setPage: (page: number) => void;
  size?: number;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <nav className="pagination" aria-label="Phân trang">
      <small>
        {total} bản ghi · Trang {Math.min(page, pages)}/{pages}
      </small>
      <button
        className="secondary"
        disabled={page <= 1}
        onClick={() => setPage(page - 1)}
      >
        Trước
      </button>
      <button
        className="secondary"
        disabled={page >= pages}
        onClick={() => setPage(page + 1)}
      >
        Sau
      </button>
    </nav>
  );
}
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  paginate = true,
}: {
  rows: T[];
  columns: { label: string; render: (row: T) => ReactNode }[];
  rowKey: (row: T) => string | number;
  paginate?: boolean;
}) {
  const [requestedPage, setPage] = useState(1);
  const page = Math.min(
    requestedPage,
    Math.max(1, Math.ceil(rows.length / 10)),
  );
  return !rows.length ? (
    <EmptyState />
  ) : (
    <>
      <div className="table-card" role="region" aria-label="Bảng dữ liệu" tabIndex={0}>
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th scope="col" key={c.label}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(paginate ? rows.slice((page - 1) * 10, page * 10) : rows).map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((c) => (
                  <td key={c.label}>{c.render(row)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {paginate && <Pagination total={rows.length} page={page} setPage={setPage} />}
    </>
  );
}
export function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: number | string;
  detail?: string;
}) {
  return (
    <article className="stat-card">
      <small>{label}</small>
      <strong>{value}</strong>
      {detail && <span>{detail}</span>}
    </article>
  );
}
export function EventTimeline({
  events,
  publicView = false,
}: {
  events: TraceEvent[];
  publicView?: boolean;
}) {
  return events.length ? (
    <div className="timeline">
      {[...events].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)).map((event) => (
        <article key={event.eventId}>
          <span className="dot" />
          <b>{event.eventType === "CTE_DISPATCH_RETAIL" ? "Ghi nhận tại điểm phân phối" : eventLabels[event.eventType] || event.eventType}</b>
          <small>
            {dateText(event.timestamp)} · {event.location}
          </small>
          <small>{event.businessOrganizationName || roleLabels[event.actorRole] || "Đơn vị thực hiện"}</small>
          {!publicView && event.data && <dl className="event-facts">{Object.entries({quantity: "Số lượng", unit: "Đơn vị", temperature: "Nhiệt độ (°C)", humidity: "Độ ẩm (%)", qualityResult: "Chất lượng", note: "Ghi chú"}).map(([key, label]) => {
            const value = event.data?.[key];
            if (value === undefined || value === null || value === "" || typeof value === "object") return null;
            return <div key={key}><dt>{label}</dt><dd>{key === "qualityResult" ? ({PASS: "Đạt", FAIL: "Không đạt", PENDING: "Chờ kiểm tra"} as Record<string,string>)[String(value)] || "Chưa xác định" : String(value)}</dd></div>;
          })}</dl>}
          {!publicView && <details>
            <summary>Chi tiết sự kiện & bằng chứng</summary>
            <code>Mã sự kiện: {event.eventId}</code>
            {event.previousEventId && <code>Sự kiện trước: {event.previousEventId}</code>}
            <code>Hash dữ liệu: {event.dataHash || "Chưa có"}</code>
            {event.businessOrganizationId && <code>Organization ID: {event.businessOrganizationId}</code>}
            {event.userId && <code>User ID: {event.userId}</code>}
            {event.actorOrg && <code>MSP: {event.actorOrg}</code>}
            {!event.userId && event.actorId && <code>Mã tác nhân lịch sử: {event.actorId}</code>}
            {event.signerId && <code>Danh tính ký: {event.signerId}</code>}
            {event.data && <pre>{JSON.stringify(event.data, null, 2)}</pre>}
          </details>}
        </article>
      ))}
    </div>
  ) : (
    <EmptyState>Chưa có lịch sử sự kiện.</EmptyState>
  );
}
export function VerificationResult({
  result,
  publicView = false,
}: {
  publicView?: boolean;
  result?: Verification | null;
}) {
  const valid = result?.checkedEvents === 0 ? null : result?.valid;
  return (
    <section
      className={`verification ${valid === true ? "success" : valid === false ? "error" : "notice"}`}
      aria-live="polite"
    >
      <h3>{valid === true ? "Lịch sử hợp lệ trong phạm vi kiểm tra" : valid === false ? "Phát hiện lịch sử không hợp lệ" : result ? "Không thể xác minh" : "Chưa kiểm tra lịch sử"}</h3>
      {result && <>
        <p>{result.checkedEvents ?? 0} sự kiện được kiểm tra. {result.source === "LOCAL" || result.scope === "HASH_AND_PREVIOUS_EVENT" ? "Chỉ đối chiếu hash và liên kết dữ liệu lưu ngoài blockchain." : ["IESH_V4", "IESH_BUSINESS_IDENTITY"].includes(result.scope || "") ? "Đã đối chiếu danh tính, sự kiện, trạng thái và bàn giao trên blockchain." : "Phạm vi kiểm tra phụ thuộc phiên bản lịch sử đã ghi."}</p>
        {!publicView && <details><summary>Phạm vi & kết quả chi tiết</summary>
          <p>Phạm vi: {result.scope || "Chưa được cung cấp"}</p>
          {result.anomalies?.map((item, i) => <p key={i}>{item.step} / {item.code}: {item.message}</p>)}
          {!!result.brokenLinks?.length && <p>Liên kết sai: {result.brokenLinks.join(", ")}</p>}
          {!!result.invalidHashes?.length && <p>Hash sai: {result.invalidHashes.join(", ")}</p>}
        </details>}
      </>}
      <small>Kết quả kiểm tra dữ liệu đã ghi, không chứng minh chất lượng thực tế của sản phẩm.</small>
    </section>
  );
}
export function LotLink({ id }: { id: string }) {
  return <Link to={`/lots/${encodeURIComponent(id)}`}>{id}</Link>;
}
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    /* Do not log payloads or credentials. */
  }
  render() {
    return this.state.failed ? (
      <main className="page">
        <h1>Không thể hiển thị trang</h1>
        <p>Vui lòng tải lại ứng dụng.</p>
        <button onClick={() => window.location.reload()}>Tải lại</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
