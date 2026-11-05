const labels = {
  CREATED: 'Đã khởi tạo', HARVESTED: 'Đã thu hoạch', PROCESSED: 'Đã sơ chế',
  WAITING_SHIP: 'Chờ bàn giao', IN_TRANSIT: 'Đang vận chuyển', IN_RETAIL: 'Tại điểm bán',
  READY_FOR_SALE: 'Sẵn sàng bán', RECALLED: 'Đã thu hồi',
};

export default function StatusBadge({ status }) {
  return <span className={`status status-${String(status || '').toLowerCase()}`}>{labels[status] || status}</span>;
}
