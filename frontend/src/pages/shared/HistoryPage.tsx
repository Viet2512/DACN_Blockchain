import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { hasPermission, isAdmin } from "../../utils/permissions";
import { useState } from "react";
import { useAllDetails, useOrganizations } from "../../hooks/queries";
import {
  DataTable,
  LotLink,
  PageHeader,
  QueryState,
  StatusBadge,
} from "../../components/Common";
import { dateText, eventLabels, roleLabels, receiver } from "../../utils/permissions";
export default function HistoryPage({
  handovers = false,
  recalls = false,
}: {
  handovers?: boolean;
  recalls?: boolean;
}) {
  const query = useAllDetails();
  const organizations = useOrganizations();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const events = (query.data || [])
    .flatMap((l) =>
      (l.events || []).map((e) => ({
        ...e,
        businessOrganizationName: e.businessOrganizationName || organizations.data?.find(org => String(org.organizationId) === e.businessOrganizationId)?.name,
        lotId: l.lotId,
        status: l.status,
        target: receiver(l),
      })),
    )
    .filter(
      (e) =>
        (!handovers ||
          ["CTE_HANDOVER_PROCESSOR","CTE_RECEIVE_PROCESSOR","CTE_HANDOVER_SHIP","CTE_RECEIVE_SHIP","CTE_HANDOVER_RETAIL","CTE_DISPATCH_RETAIL"].includes(e.eventType)) &&
        (!recalls || e.eventType === "CTE_RECALL") &&
        (!type || type === e.eventType) &&
        `${e.lotId} ${e.eventId} ${e.userId || ""} ${e.actorId || ""} ${e.businessOrganizationId || ""} ${e.businessOrganizationName || ""} ${e.location}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  return (
    <>
      <PageHeader
        title={
          handovers
            ? "Giám sát bàn giao"
            : recalls
              ? "Lịch sử thu hồi"
              : "Lịch sử truy xuất"
        }
      />
      {user && isAdmin(user) && <nav className="section-tabs" aria-label="Lịch sử"><Link aria-current={!handovers && !recalls ? "page" : undefined} to="/history">Tất cả sự kiện</Link><Link aria-current={handovers ? "page" : undefined} to="/admin/handovers">Bàn giao</Link><Link aria-current={recalls ? "page" : undefined} to="/admin/recalls">Thu hồi</Link>{hasPermission(user, "LOT_READ") && <Link to="/admin/reports">Xuất báo cáo</Link>}</nav>}
      <section className="filters">
        <label>
          Tìm mã lô, sự kiện, người thực hiện
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          Loại sự kiện
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Tất cả</option>
            {Object.entries(eventLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </section>
      <QueryState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      />
      {query.data && !query.error && (
        <DataTable
          key={`${search}:${type}`}
          rows={events}
          rowKey={(e) => e.eventId}
          columns={[
            {
              label: "Lô / Sự kiện",
              render: (e) => (
                <>
                  <LotLink id={e.lotId} />

                </>
              ),
            },
            {
              label: "Loại / Thời gian",
              render: (e) => (
                <>
                  {eventLabels[e.eventType]}
                  <small>{dateText(e.timestamp)}</small>
                </>
              ),
            },
            {
              label: "Người thực hiện / Địa điểm",
              render: (e) => (
                <>
                  {e.businessOrganizationName || roleLabels[e.actorRole]}
                  <small>{roleLabels[e.actorRole]}</small>
                  <small>{e.location}</small>
                </>
              ),
            },
            {label: "Trạng thái lô hiện tại", render: e => <StatusBadge status={e.status}/>},
            {label: "Chi tiết", render: e => <details><summary>Sự kiện & bằng chứng</summary><code>Mã sự kiện: {e.eventId}</code>{e.userId && <code>User ID: {e.userId}</code>}{e.actorOrg && <code>MSP: {e.actorOrg}</code>}<code>Hash: {e.dataHash}</code><code>Sự kiện trước: {e.previousEventId || "Sự kiện đầu tiên"}</code><pre>{JSON.stringify(e.data || {}, null, 2)}</pre></details>},
          ]}
        />
      )}

    </>
  );
}
