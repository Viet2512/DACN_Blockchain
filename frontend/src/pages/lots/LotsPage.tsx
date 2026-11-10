import type { Lot } from "../../types";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useLots, useOrganizations, useAllDetails } from "../../hooks/queries";
import { useAuth } from "../../context/AuthContext";
import {
  availableEvents,
  hasPermission,
  dateText,
  statusLabels, handoverRequests, handoverConfirmations, eventLabels, isAdmin,
} from "../../utils/permissions";
import {
  DataTable,
  LotLink,
  PageHeader,
  QueryState,
  StatusBadge,
} from "../../components/Common";
export default function LotsPage({
  mode = "all",
}: {
  mode?: "all" | "handovers" | "recalls" | "work";
}) {
  const listing = useLots();
  const history = useAllDetails(mode === "handovers");
  const query = mode === "handovers" ? history : listing;
  const organizations = useOrganizations();
  const [params, setParams] = useSearchParams();
  const organization = params.get("organizationId") || "";
  const setOrganization = (value: string) => { const next = new URLSearchParams(params); if (value) next.set("organizationId", value); else next.delete("organizationId"); setParams(next); };
  const [handoverView, setHandoverView] = useState("pending");
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [region, setRegion] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState("newest");
  const lots = (query.data || [])
    .filter(
      (l) =>
        (!organization || [l.ownerOrganizationId,l.processorOrganizationId,l.distributorOrganizationId,l.currentHolderOrganizationId,l.pendingToOrganizationId].includes(organization)) &&
        (mode !== "work" || (user?.role === "PROCESSOR" ? l.status === "RECEIVED_PROCESSOR" : user?.role === "TRANSPORTER" ? l.status === "IN_TRANSIT" : user?.role === "DISTRIBUTOR" ? l.status === "IN_RETAIL" : false) && l.currentHolderOrganizationId === user?.organizationId) &&
        (mode !== "handovers" || (handoverView === "pending" ? ["WAITING_PROCESSOR", "WAITING_SHIP", "WAITING_RETAIL"].includes(l.status)
          : handoverView === "incoming" ? ["WAITING_PROCESSOR", "WAITING_SHIP", "WAITING_RETAIL"].includes(l.status) && l.pendingToOrganizationId === user?.organizationId
          : handoverView === "send" ? !!user && availableEvents(user, l).some(event => handoverRequests.includes(event))
          : !!l.events?.some(event => handoverConfirmations.includes(event.eventType)))) &&
        (mode !== "recalls" || l.status === "RECALLED") &&
        `${l.lotId} ${l.productName}`
          .toLocaleLowerCase("vi")
          .includes(search.toLocaleLowerCase("vi")) &&
        (!status || l.status === status) &&
        (!region || l.regionCode === region) &&
        (!from || l.createdAt?.slice(0, 10) >= from) &&
        (!to || l.createdAt?.slice(0, 10) <= to),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.productName.localeCompare(b.productName, "vi")
        : sort === "oldest"
          ? Date.parse(a.createdAt) - Date.parse(b.createdAt)
          : Date.parse(b.createdAt) - Date.parse(a.createdAt),
    );
  return (
    <>
      <PageHeader
        title={
          mode === "handovers"
            ? "Bàn giao & tiếp nhận"
            : mode === "recalls"
              ? "Cảnh báo và thu hồi"
              : mode === "work" ? (user?.role === "PROCESSOR" ? "Xử lý / Sơ chế" : user?.role === "TRANSPORTER" ? "Lô đang vận chuyển" : "Phân phối") : "Quản lý lô hàng"
        }
        description={
          mode === "handovers"
            ? "Gửi yêu cầu, sau đó bên nhận kiểm tra hàng và xác nhận tiếp nhận."
            : undefined
        }
      >
        {user?.role === "FARMER" && hasPermission(user,"LOT_CREATE") && mode === "all" && (
          <Link className="button" to="/lots/new">
            + Khởi tạo lô
          </Link>
        )}
        <button className="secondary" onClick={() => void query.refetch()}>
          Tải lại
        </button>
      </PageHeader>
      {mode === "handovers" && <nav className="section-tabs" aria-label="Trạng thái bàn giao">{[
        ["pending", "Đang chờ xác nhận"], ...(!user || isAdmin(user) ? [] : [["incoming", "Chờ tôi nhận"], ["send", "Có thể gửi đi"]]), ["completed", "Đã có tiếp nhận"],
      ].map(([value, label]) => <button key={value} className={handoverView === value ? "active" : ""} aria-pressed={handoverView === value} onClick={() => setHandoverView(value)}>{label}</button>)}</nav>}
      {mode === "recalls" && <p className="muted">Mở chi tiết lô để xem lý do thu hồi. Để thu hồi một lô khác, chọn lô trong danh sách và thực hiện thao tác được cấp quyền.</p>}
      <section className="filters" aria-label="Bộ lọc lô hàng">
        <label>
          Tìm kiếm
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Mã lô hoặc tên sản phẩm"
          />
        </label>
        <label>
          Trạng thái
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Tất cả trạng thái</option>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <details className="filter-more"><summary>Bộ lọc bổ sung</summary><div className="filters">
          <label>Doanh nghiệp<select value={organization} onChange={event => setOrganization(event.target.value)}><option value="">Tất cả</option>{organizations.data?.map(org => <option key={org.organizationId} value={org.organizationId}>{org.name}</option>)}{organization && !organizations.data?.some(org => String(org.organizationId) === organization) && <option value={organization}>{organization}</option>}</select></label>
        <label>
          Mã vùng
          <select value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="">Tất cả mã vùng</option>
            {[...new Set(query.data?.map((l) => l.regionCode))].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label>
          Từ ngày
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          Đến ngày
          <input
            type="date"
            min={from}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label>
          Sắp xếp
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="newest">Mới nhất</option>
            <option value="oldest">Cũ nhất</option>
            <option value="name">Tên sản phẩm</option>
          </select>
        </label>
        </div></details>
      </section>
      <QueryState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      />
      {query.data && !query.error && (
        <DataTable
          key={`${search}:${status}:${region}:${from}:${to}:${sort}:${organization}:${handoverView}`}
          rows={lots}
          rowKey={(l) => l.lotId}
          columns={[
            {
              label: "Mã lô / Sản phẩm",
              render: (l) => (
                <>
                  <LotLink id={l.lotId} />
                  <small>{l.productName}</small>
                </>
              ),
            },
            {
              label: "Trạng thái",
              render: (l) => <StatusBadge status={l.status} />,
            },
            {
              label: "Nguồn gốc / Vùng",
              render: (l) => (
                <>
                  {l.origin}
                  <small>{l.regionCode}</small>
                </>
              ),
            },
            { label: "Đơn vị đang giữ", render: (l) => organizations.data?.find(org => String(org.organizationId) === l.currentHolderOrganizationId)?.name || l.events?.slice().reverse().find(event => event.businessOrganizationId === l.currentHolderOrganizationId)?.businessOrganizationName || "Xem chi tiết" },
            { label: "Khởi tạo", render: (l) => dateText(l.createdAt) },
            ...(mode === "handovers" ? [{label: "Tiếp theo", render: (l: Lot) => user && availableEvents(user, l).filter(event => handoverRequests.includes(event) || handoverConfirmations.includes(event)).map(event => eventLabels[event]).join(" · ") || (l.pendingToOrganizationId ? "Chờ bên nhận xác nhận" : "Xem lịch sử tiếp nhận")}] : []),
            {
              label: "Nghiệp vụ",
              render: (l) => (
                <Link to={`/lots/${encodeURIComponent(l.lotId)}`}>
                  {user &&
                  availableEvents(user, l).some((e) => e !== "CTE_RECALL")
                    ? "Xử lý →"
                    : "Chi tiết →"}
                </Link>
              ),
            },
          ]}
        />
      )}

    </>
  );
}
