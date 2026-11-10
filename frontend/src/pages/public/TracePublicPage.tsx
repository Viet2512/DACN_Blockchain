import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { lotService } from "../../services/api";
import { dateText } from "../../utils/permissions";
import {
  EventTimeline,
  QueryState,
  StatusBadge,
  VerificationResult,
} from "../../components/Common";
export default function TracePublicPage() {
  const { lotId = "" } = useParams();
  const [search, setSearch] = useState(lotId);
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["public-trace", lotId],
    queryFn: () => lotService.publicTrace(lotId),
    enabled: !!lotId,
    retry: false,
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (search.trim()) navigate(`/trace/${encodeURIComponent(search.trim())}`);
  };
  const lot = query.data;
  return (
    <main className="public-page">
      <header className="public-header">
        <Link className="brand" to="/trace">
          TRACE<span>CHAIN</span>
        </Link>
        <Link to="/login">Đăng nhập tác nhân →</Link>
      </header>
      <section className="public-intro">
        <p className="eyebrow">NGUỒN GỐC MINH BẠCH</p>
        <h1>
          Hiểu rõ hành trình
          <br />
          nông sản bạn chọn.
        </h1>
        <p className="muted">Nhập mã trên sản phẩm hoặc quét QR để tra cứu.</p>
        <form className="trace-search" onSubmit={submit}>
          <label>
            Mã lô sản phẩm
            <input
              required
              maxLength={120}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nhập mã lô cần tra cứu"
            />
          </label>
          <button>Tra cứu →</button>
        </form>
      </section>
      {lotId && (
        <QueryState
          pending={query.isPending}
          error={query.error}
          retry={() => void query.refetch()}
        />
      )}
      {lot && (
        <>
          <section className="public-card product-card">
            <p className="eyebrow">HỒ SƠ SẢN PHẨM</p>
            <h2>{lot.productName}</h2>
            <p className="lot-code">{lot.lotId}</p>
            <StatusBadge status={lot.status} />
            <div className="public-meta">
              {lot.organizations?.map(org=><span key={org.organizationId}><small>{({FARM:"Nông hộ",PROCESSING_FACILITY:"Đơn vị sơ chế",LOGISTICS_COMPANY:"Đơn vị vận chuyển",DISTRIBUTION_COMPANY:"Nhà phân phối"} as Record<string,string>)[org.type] || org.type}</small><b>{org.name}</b></span>)}
              <span>
                <small>Nguồn gốc</small>
                <b>{lot.origin}</b>
              </span>
              {lot.harvestDate && (
                <span>
                  <small>Ngày thu hoạch theo hồ sơ</small>
                  <b>{dateText(lot.harvestDate)}</b>
                </span>
              )}
            </div>
            {lot.status === "RECALLED" && (
              <div role="alert" className="error">
                CẢNH BÁO: Lô hàng đã bị thu hồi. Không tiếp tục phân phối hoặc
                sử dụng; liên hệ điểm bán.
              </div>
            )}
            {lot.status !== "READY_FOR_SALE" && lot.status !== "RECALLED" && (
              <div className="notice">
                Hành trình chưa hoàn tất bước đưa lên kệ bán.
              </div>
            )}
            <p className="muted">
              {lot.source === "LOCAL"
                ? "Nguồn dữ liệu: chế độ local / off-chain, chưa có bằng chứng giao dịch Fabric."
                : "Hành trình được lưu trên blockchain và kiểm tra tính nhất quán."}
            </p>
          </section>
          <section className="public-card">
            <h2>Hành trình sản phẩm</h2>
            <EventTimeline events={lot.events} publicView />
          </section>
          <VerificationResult result={lot.integrity} publicView />
          {lot.notice && <details className="advanced"><summary>Thông tin về phạm vi truy xuất</summary><p className="muted">{lot.notice}</p></details>}
        </>
      )}
      <footer className="public-footer">
        TraceChain · Truy xuất nguồn gốc chuỗi cung ứng nông sản
      </footer>
    </main>
  );
}
