import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { useLot, useOrganizations } from "../../hooks/queries";
import { lotService, saveBlob } from "../../services/api";
import { availableEvents, dateText, eventLabels, hasPermission, receiver } from "../../utils/permissions";
import {
  DataTable,
  ErrorState,
  EventTimeline,
  PageHeader,
  QueryState,
  StatusBadge,
  VerificationResult,
} from "../../components/Common";
import LotRecords from "./LotRecords";
import EventFormModal from "../events/EventFormModal";
export function QRCodeDisplay({ id }: { id: string }) {
  const [error, setError] = useState<Error | null>(null);
  const [failed, setFailed] = useState(false);
  const download = async () => {
    try {
      const response = await fetch(lotService.qrUrl(id));
      if (!response.ok)
        throw new Error("Không thể tải QR. Kiểm tra API và mã lô.");
      saveBlob(
        await response.blob(),
        `${id.replace(/[^a-zA-Z0-9_-]/g, "_")}-qr.png`,
      );
    } catch (e) {
      setError(e as Error);
    }
  };
  return (
    <section className="panel qr-panel">
      <h2>QR truy xuất</h2>
      <p className="lot-code">{id}</p>
      {failed ? (
        <div><p role="alert">Không tải được mã QR.</p><button className="secondary" onClick={() => setFailed(false)}>Thử tải lại QR</button></div>
      ) : (
        <img
          width="180"
          height="180"
          src={lotService.qrUrl(id)}
          alt={`Mã QR truy xuất lô ${id}`}
          onError={() => setFailed(true)}
        />
      )}

      {error && <ErrorState error={error} />}
      <div className="actions">
        <button className="secondary" onClick={() => void download()}>
          Tải PNG
        </button>
        <button className="secondary" onClick={() => window.print()}>
          In QR
        </button>
        <Link to={`/trace/${encodeURIComponent(id)}`}>Xem truy xuất ↗</Link>
      </div>
    </section>
  );
}
export default function LotDetailPage() {
  const { lotId = "" } = useParams();
  const { user } = useAuth();
  const query = useLot(lotId);
  const organizations = useOrganizations();
  const [reconciling, setReconciling] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState<Error | null>(null);
  const verification = useQuery({
    queryKey: ["verification", lotId, query.data?.lastEventId],
    queryFn: () => lotService.validate(lotId),
    enabled: false,
  });
  const documents = useQuery({
    queryKey: ["documents", lotId, query.data?.lastEventId],
    queryFn: () => lotService.documents(lotId),
    enabled: false,
  });
  const lot = query.data;
  const organizationName = (id?: string) => organizations.data?.find(org => String(org.organizationId) === id)?.name || lot?.events?.slice().reverse().find(event => event.businessOrganizationId === id)?.businessOrganizationName || "Chưa có tên đơn vị";
  const actions = user && lot ? availableEvents(user, lot) : [];
  const businessActions = actions.filter(event => event !== "CTE_RECALL");
  const nextAction = businessActions[0];
  const download = async (id: number, name: string) => {
    try {
      saveBlob(await lotService.downloadDocument(lotId, id), name);
    } catch (e) {
      setError(e as Error);
    }
  };
  return (
    <>
      <Link className="back" to="/lots">
        ← Danh sách lô
      </Link>
      <QueryState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      />
      {lot && !query.error && user && (
        <>
          <PageHeader
            title={lot.productName}
            description={`Mã lô: ${lot.lotId}`}
          >
            {!!actions.length && (
              <button
                onClick={() => {
                  setSuccess("");
                  setShowForm(true);
                }}
              >
                {businessActions.length > 1 ? "Ghi nhận sự kiện" : nextAction ? eventLabels[nextAction] : "Thu hồi lô"}
              </button>
            )}
            <button
              className="secondary"
              onClick={() => {
                setSuccess("");
                void query.refetch();
              }}
            >
              Tải lại lịch sử
            </button>
          </PageHeader>
          {success && (
            <div role="status" className="success">
              {success}
            </div>
          )}
          {error && <ErrorState error={error} />}
          {lot.status === "RECALLED" && (
            <div className="error" role="alert">
              Lô đã thu hồi. Các thao tác nghiệp vụ bị khóa; kiểm tra lý do
              trong lịch sử.
            </div>
          )}
          {lot.schemaVersion !== 4 && <p className="notice">Lô này thuộc quy trình cũ, chỉ có thể xem lịch sử.</p>}
          <section className="panel">
            <div className="detail-grid">
              <div>
                <small>Trạng thái</small>
                <StatusBadge status={lot.status} />
              </div>
              <div>
                <small>Nguồn gốc</small>
                <b>{lot.origin}</b>
              </div>
              <div>
                <small>Mã vùng</small>
                <b>{lot.regionCode}</b>
              </div>
              <div><small>Đơn vị nguồn gốc</small><b>{organizationName(lot.ownerOrganizationId)}</b></div>
              <div><small>Đơn vị sơ chế</small><b>{organizationName(lot.processorOrganizationId)}</b></div>
              <div><small>Đơn vị phân phối</small><b>{organizationName(lot.distributorOrganizationId)}</b></div>
              <div><small>Đơn vị đang giữ lô</small><b>{organizationName(lot.currentHolderOrganizationId)}</b></div>
              <div>
                <small>Ngày thu hoạch theo hồ sơ</small>
                <b>{dateText(lot.harvestDate)}</b>
              </div>
              <div>
                <small>Khởi tạo</small>
                <b>{dateText(lot.createdAt)}</b>
              </div>
            </div>
            {["WAITING_PROCESSOR","WAITING_SHIP","WAITING_RETAIL"].includes(lot.status) && (
              <div className="notice">
                Đang chờ {organizationName(lot.pendingToOrganizationId)} xác nhận tiếp nhận. {nextAction ? "Bạn có thể kiểm tra hàng và thực hiện bước tiếp theo." : "Quyền nắm giữ chỉ chuyển sau khi bên nhận xác nhận."}
              </div>
            )}
            <details className="advanced"><summary>Thông tin kỹ thuật & đối soát</summary>
              <p>{lot.source === "FABRIC" ? "Lịch sử ghi trên Hyperledger Fabric." : lot.source === "LOCAL" ? "Lịch sử lưu ngoài blockchain, chưa có bằng chứng giao dịch Fabric." : "Chưa xác định nguồn dữ liệu."}</p>
              <dl className="profile-grid">{[["Phiên bản quy trình", lot.schemaVersion], ["Doanh nghiệp nguồn (ID)", lot.ownerOrganizationId], ["Doanh nghiệp đang giữ (ID)", lot.currentHolderOrganizationId], ["Người giữ (ID)", lot.currentHolder], ["Doanh nghiệp chờ nhận (ID)", lot.pendingToOrganizationId], ["MSP chờ nhận", receiver(lot).org], ["Vùng chờ nhận", receiver(lot).region]].filter(([, value]) => value).map(([label,value]) => <div key={String(label)}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
              {lot.source === "FABRIC" && hasPermission(user, "TRACE_VALIDATE") && <button className="secondary" disabled={reconciling} onClick={async () => {
                setReconciling(true); setError(null); setSuccess("");
                try {await lotService.reconcile(lotId); await query.refetch(); setSuccess("Đã đối chiếu và đồng bộ bản lưu từ blockchain.");}
                catch (e) {setError(e as Error);} finally {setReconciling(false);}
              }}>{reconciling ? "Đang đồng bộ…" : "Đối chiếu & đồng bộ bản lưu"}</button>}
            </details>
          </section>
          <div className="detail-columns">
            <section className="panel">
              <h2>Lịch sử hành trình</h2>
              {hasPermission(user, "TRACE_HISTORY_READ") ? <EventTimeline events={(lot.events || []).map(event => ({...event, businessOrganizationName: event.businessOrganizationName || organizations.data?.find(org => String(org.organizationId) === event.businessOrganizationId)?.name}))} /> : <p className="muted">Tài khoản chưa được cấp quyền xem lịch sử chi tiết.</p>}
            </section>
            <div>
              <QRCodeDisplay id={lotId} />
              {hasPermission(user, "TRACE_VALIDATE") && <section className="panel">
                <h2>Kiểm chứng lịch sử</h2>
                <button
                  className="secondary"
                  disabled={verification.isFetching}
                  onClick={() => void verification.refetch()}
                >
                  {verification.isFetching
                    ? "Đang kiểm tra…"
                    : "Kiểm tra tính hợp lệ"}
                </button>
                {verification.error && (
                  <ErrorState error={verification.error} />
                )}
                <VerificationResult
                  result={verification.error ? null : verification.data}
                />
              </section>}
            </div>
          </div>
          <section className="panel">
            <h2>Chứng từ đính kèm</h2>
            <button
              className="secondary"
              disabled={documents.isFetching}
              onClick={() => void documents.refetch()}
            >
              {documents.isFetching
                ? "Đang đối soát…"
                : "Tải và đối soát chứng từ"}
            </button>
            {documents.error && <ErrorState error={documents.error} />}
            {documents.data && (
              <>
                <p>
                  {documents.data.valid === true
                    ? "Hash file khớp với hash sự kiện."
                    : documents.data.valid === false
                      ? "Có chứng từ thiếu liên kết hoặc hash không khớp."
                      : "Chưa có chứng từ để kiểm chứng."}
                </p>
                <DataTable
                  rows={documents.data.documents}
                  rowKey={(d) => d.documentId}
                  columns={[
                    { label: "Chứng từ", render: (d) => d.originalName },
                    {
                      label: "Bằng chứng",
                      render: (d) => <details><summary>Hash chứng từ</summary><code>{d.fileHash}</code></details>,
                    },
                    {
                      label: "Đối soát",
                      render: (d) =>
                        d.valid ? "Khớp" : "Không khớp / chưa gắn sự kiện",
                    },
                    {
                      label: "Tệp",
                      render: (d) => (
                        <button
                          className="secondary"
                          onClick={() =>
                            void download(d.documentId, d.originalName)
                          }
                        >
                          Tải xuống
                        </button>
                      ),
                    },
                  ]}
                />
              </>
            )}
          </section>
          <LotRecords lot={lot} user={user} />
          {showForm && (
            <EventFormModal
              key={`${lotId}:${lot.lastEventId}`}
              lot={lot}
              user={user}
              onClose={() => {
                setShowForm(false);
                void query.refetch();
              }}
              onSaved={() => {
                setShowForm(false);
                setSuccess(
                  lot.source === "FABRIC"
                    ? "Giao dịch đã được xác nhận trên blockchain."
                    : "Đã lưu sự kiện ngoài blockchain.",
                );
              }}
            />
          )}
        </>
      )}
    </>
  );
}
