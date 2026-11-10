import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useLots, useAllDetails } from "../../hooks/queries";
import { availableEvents, isAdmin, hasPermission, dateText, roleLabels, eventLabels } from "../../utils/permissions";
import { DataTable, LotLink, PageHeader, QueryState, StatCard, StatusBadge } from "../../components/Common";
export default function DashboardPage() {
  const { user } = useAuth();
  const query = useLots();
  const activity = useAllDetails();
  if (!user) return null;
  const lots = query.data || [];
  const count = (...statuses: string[]) => lots.filter(lot => statuses.includes(lot.status)).length;
  const admin = isAdmin(user);
  const tasks = lots.filter(lot => availableEvents(user, lot).some(event => event !== "CTE_RECALL"));
  const pending = lots.filter(lot => ["WAITING_PROCESSOR", "WAITING_SHIP", "WAITING_RETAIL"].includes(lot.status));
  const statistics: [string, number][] = admin ? [
    ["Tổng số lô", lots.length],
    ["Đang sản xuất / sơ chế", count("CREATED", "HARVESTED", "RECEIVED_PROCESSOR", "PROCESSED")],
    ["Đang vận chuyển", count("IN_TRANSIT")],
    ["Hoàn tất đưa lên kệ", count("READY_FOR_SALE")],
    ["Bàn giao chờ xác nhận", pending.length],
    ["Lô đã thu hồi", count("RECALLED")],
  ] : [
    ["Lô liên quan", lots.length], ["Có việc cần xử lý", tasks.length],
    ["Bàn giao chờ xác nhận", pending.length], ["Lô đã thu hồi", count("RECALLED")],
  ];
  const recent = [...(activity.data || [])].sort((a, b) => Date.parse(b.events?.at(-1)?.timestamp || b.createdAt) - Date.parse(a.events?.at(-1)?.timestamp || a.createdAt)).slice(0, 5);
  return <>
    <PageHeader title={`Tổng quan · ${roleLabels[user.role]}`} description={user.organizationName}>
      {user.role === "FARMER" && hasPermission(user, "LOT_CREATE") && <Link className="button" to="/lots/new">+ Khởi tạo lô</Link>}
    </PageHeader>
    <QueryState pending={query.isPending} error={query.error} retry={() => void query.refetch()} />
    {query.data && !query.error && <>
      <section className={`stats ${admin ? "stats-business" : ""}`}>{statistics.map(([label, value]) => <StatCard key={label} label={label} value={value} />)}</section>
      <section className="panel">
        <div className="section-heading"><h2>{admin ? "Bàn giao cần theo dõi" : "Công việc cần xử lý"}</h2><Link to="/handovers">Xem bàn giao →</Link></div>
        <DataTable rows={admin ? pending : tasks} rowKey={lot => lot.lotId} columns={[
          {label: "Lô hàng", render: lot => <><LotLink id={lot.lotId}/><small>{lot.productName}</small></>},
          {label: "Trạng thái", render: lot => <StatusBadge status={lot.status}/>},
          {label: "Bước tiếp theo", render: lot => admin ? "Chờ doanh nghiệp nhận xác nhận" : availableEvents(user, lot).filter(event => event !== "CTE_RECALL").map(event => eventLabels[event]).join(" · ")},
          {label: "Thao tác", render: lot => <Link to={`/lots/${encodeURIComponent(lot.lotId)}`}>{admin ? "Xem chi tiết" : "Mở xử lý"} →</Link>},
        ]}/>
      </section>
      <section className="panel">
        <div className="section-heading"><h2>Hoạt động gần đây</h2><Link to="/lots">Tất cả lô hàng →</Link></div>
        <QueryState pending={activity.isPending} error={activity.error} retry={() => void activity.refetch()} />
        {activity.data && !activity.error && <DataTable rows={recent} rowKey={lot => lot.lotId} columns={[
          {label: "Lô hàng", render: lot => <><LotLink id={lot.lotId}/><small>{lot.productName}</small></>},
          {label: "Hoạt động gần nhất", render: lot => lot.events?.at(-1) ? eventLabels[lot.events.at(-1)!.eventType] : "Khởi tạo lô"},
          {label: "Trạng thái hiện tại", render: lot => <StatusBadge status={lot.status}/>},
          {label: "Thời gian", render: lot => dateText(lot.events?.at(-1)?.timestamp || lot.createdAt)},
        ]}/> }
      </section>
    </>}
  </>;
}
