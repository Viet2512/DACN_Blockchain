import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { hasPermission } from "../../utils/permissions";
import { adminService, lotService, saveBlob, api } from "../../services/api";
import { useAllDetails, useHealth, useLots } from "../../hooks/queries";
import {
  dateText,
  eventLabels,
    statusLabels,
} from "../../utils/permissions";
import {
  DataTable,
  ErrorState,
  LotLink,
  PageHeader,
  QueryState,
  StatCard,
  VerificationResult,
} from "../../components/Common";

export function AuditPage() {
  const [legacy,setLegacy]=useState(false);
  const query = useQuery({ queryKey: ["audit",legacy], queryFn: () => legacy ? adminService.audit() : adminService.activity() });
  const [search, setSearch] = useState("");
  return (
    <>
      <PageHeader
        title="Nhật ký quản trị"
        description="Hoạt động quản trị ứng dụng, tối đa 500 bản ghi gần nhất."
      />
      <label>
        Tìm người thực hiện, hành động, đối tượng
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <label>Nguồn audit<select value={legacy ? "legacy":"current"} onChange={event=>setLegacy(event.target.value==="legacy")}><option value="current">Hoạt động hiện tại</option><option value="legacy">Nhật ký phiên bản cũ</option></select></label>
      <QueryState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      />
      {query.data && (
        <DataTable
          key={search}
          rows={query.data.filter((a) =>
            `${a.actorUsername} ${a.action} ${a.target || ""}`
              .toLowerCase()
              .includes(search.toLowerCase()),
          )}
          rowKey={(a) => a.auditId}
          columns={[
            { label: "Thời gian", render: (a) => dateText(a.createdAt) },
            { label: "Người thực hiện", render: (a) => a.actorUsername },
            {
              label: "Hành động",
              render: (a) =>
                a.action === "USER_CREATED_OR_UPDATED"
                  ? "Tạo / cập nhật tài khoản"
                  : a.action === "USER_STATUS_CHANGED"
                    ? "Thay đổi trạng thái tài khoản"
                    : a.action === "USER_PASSWORD_RESET"
                      ? "Đặt lại mật khẩu"
                      : a.action,
            },
            { label: "Đối tượng", render: (a) => a.target || "Không có" },
            {
              label: "Chi tiết",
              render: (a) => <details><summary>Xem chi tiết</summary><pre>{JSON.stringify(a.details, null, 2)}</pre></details>,
            },
          ]}
        />
      )}
    </>
  );
}
export function VerificationPage() {
  const lots = useLots();
  const [id, setId] = useState("");
  const query = useQuery({
    queryKey: ["verification", id],
    queryFn: () => lotService.validate(id),
    enabled: false,
  });
  return (
    <>
      <PageHeader
        title="Kiểm tra lịch sử IESH"
        description="Đối chiếu danh tính, sự kiện, trạng thái và bàn giao đã ghi."
      />
      <QueryState pending={lots.isEnabled && lots.isPending} error={lots.error} />
      <section className="panel">
        <label>
          Lô cần kiểm tra
          <select value={id} onChange={(e) => setId(e.target.value)}>
            <option value="">Chọn mã lô</option>
            {lots.data?.map((l) => (
              <option key={l.lotId} value={l.lotId}>
                {l.lotId} · {l.productName}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={!id || query.isFetching}
          onClick={() => void query.refetch()}
        >
          {query.isFetching ? "Đang xác minh…" : "Yêu cầu kiểm tra"}
        </button>
        {query.error && <ErrorState error={query.error} />}
        <VerificationResult result={query.error ? null : query.data} />
        {id && <LotLink id={id} />}
      </section>
      <details className="panel"><summary>Giới hạn của kiểm chứng</summary><p>Với lô theo quy trình hiện tại, hệ thống kiểm tra danh tính, sự kiện, dữ liệu công đoạn, trạng thái và các bước bàn giao. Lịch sử cũ có phạm vi kiểm tra riêng được ghi trong kết quả.</p><p>Kiểm tra hash chứng từ tại trang chi tiết lô. Kết quả không chứng minh dữ liệu đầu vào hay chất lượng hàng thực tế.</p></details>
    </>
  );
}
export function BlockchainPage() {
  const {user} = useAuth();
  const failures=useQuery({queryKey:['transaction-failures'],queryFn:()=>api.get<{id:number;userId:string;method:string;path:string;status:number;createdAt:string}[]>('/admin/transaction-failures').then(r=>r.data)});
  const benchmark=useQuery({queryKey:['benchmarks'],queryFn:()=>api.get<Record<string,unknown>|null>('/admin/benchmarks').then(r=>r.data)});
  const [transactionPage,setTransactionPage]=useState(1);
  const transactions = useQuery({queryKey:['transactions',transactionPage],queryFn:()=>adminService.transactions(transactionPage)});
  const query = useHealth();
  const readiness = useQuery({queryKey: ['dependency-readiness'], queryFn: async () => api.get<{mysql: boolean; fabric: {ready: boolean; channel?: string; chaincode?: string}}>('/health/dependencies').then(response => response.data)});
  const lots = useQuery({queryKey:["lots",user?.username],queryFn:lotService.list,enabled:!!user && hasPermission(user,"LOT_READ")});
  return (
    <>
      <PageHeader
        title="Kết nối và dữ liệu Blockchain"
        description="Kiểm tra kết nối thực tế và tra cứu bằng chứng giao dịch."
      />
      <QueryState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      />
      {query.data && (
        <section className="stats">
          <StatCard
            label="API"
            value={query.data.status === "ok" ? "Có phản hồi" : "Chưa xác định"}
          />
          <StatCard
            label="MySQL"
            value={
              query.data.mysql === "enabled" ? "Được cấu hình" : "Chưa bật"
            }
          />
          <StatCard
            label="Fabric"
            value={
              query.data.fabric === "enabled" ? "Được cấu hình" : "Chế độ local"
            }
          />
          <StatCard
            label="Sự kiện đã lưu"
            value={
              lots.data?.reduce((n, l) => n + Number(l.eventCount || 0), 0) ??
              "—"
            }
          />
        </section>
      )}
      <QueryState pending={readiness.isPending} error={readiness.error} retry={() => void readiness.refetch()} />
      {readiness.data && <section className="panel"><h2>Kết nối thực tế</h2><p>Blockchain: {readiness.data.fabric.ready ? 'Đã kết nối và truy vấn thành công' : 'Chưa sẵn sàng'}</p><p>Cơ sở dữ liệu: {readiness.data.mysql ? 'Đã kết nối' : 'Chưa bật'}</p><details><summary>Cấu hình mạng</summary><p>Channel: {readiness.data.fabric.channel} · Chaincode: {readiness.data.fabric.chaincode}</p></details></section>}
      <QueryState pending={lots.isEnabled && lots.isPending} error={lots.error} />
      <section className="panel"><h2>Giao dịch đã commit của lô trong ứng dụng</h2><QueryState pending={transactions.isPending} error={transactions.error} retry={()=>void transactions.refetch()}/>{transactions.data && !transactions.error && <DataTable paginate={false} rows={transactions.data.items} rowKey={row=>row.transactionId} columns={[
        {label:'Transaction / Lô',render:row=><><code>{row.transactionId}</code><LotLink id={row.lotId}/></>},{label:'User / Business Org / MSP',render:row=><>{row.userId || 'Legacy'}<small>{row.businessOrganizationId || 'Chưa xác minh doanh nghiệp'} · {row.mspId}</small></>},{label:'Sự kiện',render:row=>eventLabels[row.eventType as keyof typeof eventLabels] || row.eventType},{label:'Commit status',render:row=>row.status === 'VALID' ? 'Đã xác nhận' : row.status},{label:'Thời gian',render:row=>dateText(row.timestamp)},
      ]}/>}<button disabled={transactions.isFetching || transactionPage===1} onClick={()=>setTransactionPage(transactionPage-1)}>Trang trước</button><span> Trang {transactionPage} </span><button disabled={transactions.isFetching || !transactions.data || transactionPage*20>=transactions.data.total} onClick={()=>setTransactionPage(transactionPage+1)}>Trang sau</button></section>
      <section className="panel"><h2>Yêu cầu ghi bị từ chối hoặc lỗi</h2><QueryState pending={failures.isPending} error={failures.error}/>{failures.data && !failures.error && <DataTable rows={failures.data} rowKey={row=>row.id} columns={[{label:'Thời gian',render:row=>dateText(row.createdAt)},{label:'Người dùng',render:row=>row.userId},{label:'Thao tác',render:row=>`${row.method} ${row.path}`},{label:'HTTP',render:row=>row.status}]}/>}<p>Nhật ký ứng dụng; HTTP lỗi không tự chứng minh giao dịch ledger bị từ chối.</p></section>
      <section className="panel"><h2>Thực nghiệm Fabric</h2><QueryState pending={benchmark.isPending} error={benchmark.error}/>{benchmark.data ? <details><summary>Xem kết quả đo & cấu hình thực nghiệm</summary><pre>{JSON.stringify(benchmark.data,null,2)}</pre></details>:!benchmark.isPending && !benchmark.error && <p>Chưa có kết quả đo.</p>}</section>
      <details className="panel"><summary>Phạm vi & giới hạn giám sát</summary>
        <p>
          Kết quả benchmark chỉ phản ánh cấu hình và workload được ghi trong báo cáo; không suy ra TPS từ số lô. Nhật ký yêu cầu lỗi không phải danh sách toàn bộ transaction invalid trên channel.
        </p>
        <p>
          Gateway chọn certificate theo User ID, doanh nghiệp, role, MSP và vùng đã đăng ký.
          Tài khoản chưa được cấp certificate không thể ký; Admin ứng dụng không ký thay tác nhân.
        </p>
        <Link className="text-link" to="/admin/events">
          Xem sự kiện đã ghi →
        </Link>
      </details>
    </>
  );
}
export function ReportsPage() {
  const query = useAllDetails();
  const rows = Object.entries(statusLabels).map(([status, label]) => ({
    status,
    label,
    lots: query.data?.filter((l) => l.status === status).length || 0,
  }));
  const download = () => {
    if (!query.data) return;
    const report = {
      generatedAt: new Date().toISOString(),
      scope: "Các lô API cho Admin truy cập",
      totalLots: query.data.length,
      totalEvents: query.data.reduce(
        (sum, l) => sum + (l.events?.length || 0),
        0,
      ),
      statuses: rows,
      eventTypes: Object.keys(eventLabels).map((type) => ({
        type,
        count: query.data
          .flatMap((l) => l.events || [])
          .filter((e) => e.eventType === type).length,
      })),
    };
    saveBlob(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
      "tracechain-report.json",
    );
  };
  return (
    <>
      <PageHeader
        title="Báo cáo dữ liệu truy xuất"
        description="Tổng hợp tại thời điểm tải. Không bao gồm thống kê giao dịch thất bại hoặc dữ liệu hiệu năng."
      >
        <button disabled={!query.data || !!query.error} onClick={download}>
          Tải báo cáo JSON
        </button>
      </PageHeader>
      <QueryState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      />
      {query.data && !query.error && (
        <>
          <section className="stats">
            <StatCard label="Tổng lô" value={query.data.length} />
            <StatCard
              label="Tổng sự kiện"
              value={query.data.reduce(
                (n, l) => n + (l.events?.length || 0),
                0,
              )}
            />
          </section>
          <DataTable
            rows={rows}
            rowKey={(r) => r.status}
            columns={[
              { label: "Trạng thái", render: (r) => r.label },
              { label: "Số lô", render: (r) => r.lots },
            ]}
          />
          <section className="panel">
            <h2>Sự kiện theo loại</h2>
            {Object.entries(eventLabels).map(([key, label]) => (
              <p key={key}>
                {label}:{" "}
                <b>
                  {
                    query.data
                      .flatMap((l) => l.events || [])
                      .filter((e) => e.eventType === key).length
                  }
                </b>
              </p>
            ))}
          </section>
          <section className="panel">
            <h2>Số lô theo ngày tạo</h2>
            {[...new Set(query.data.map((l) => l.createdAt.slice(0, 10)))]
              .sort()
              .map((day) => (
                <p key={day}>
                  {day}:{" "}
                  <b>
                    {
                      query.data.filter((l) => l.createdAt.startsWith(day))
                        .length
                    }
                  </b>
                </p>
              ))}
          </section>
        </>
      )}
    </>
  );
}
