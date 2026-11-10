import {useState, type FormEvent} from "react";
import {useMutation} from "@tanstack/react-query";
import {authService,adminService} from "../../services/api";
import {ErrorState} from "../../components/Common";
import { useAuth } from "../../context/AuthContext";
import { roleLabels, isAdmin, hasPermission } from "../../utils/permissions";
import { PageHeader } from "../../components/Common";
export default function ProfilePage() {
  const { user, logout } = useAuth();
  const identity=useMutation({mutationFn:()=>adminService.identity(user!.username,'request')});
  const [success, setSuccess] = useState(false);
  const mutation = useMutation({mutationFn: authService.changePassword, onSuccess: async () => {
    setSuccess(true);
    // Password change revokes server sessions; logout still clears local state if the API rejects it.
    await logout().catch(() => undefined);
  }});
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (mutation.isPending) return;
    const values = new FormData(event.currentTarget);
    mutation.mutate({currentPassword: String(values.get('currentPassword')), newPassword: String(values.get('newPassword'))});
  }
  if (!user) return null;
  return (
    <>
      <PageHeader title="Thông tin tài khoản" />
      <section className="panel narrow">
        <h2>Thông tin cá nhân</h2>
        <dl className="profile-grid">
          {[
            ["Họ tên", user.fullName || user.displayName],
            ["Tên đăng nhập", user.username],
            ["Email", user.email], ["Điện thoại", user.phone],
            ["Vai trò", roleLabels[user.role]],
            ["Doanh nghiệp", user.organizationName],
            ["Trạng thái", user.status === "ACTIVE" ? "Đang hoạt động" : user.status === "INACTIVE" ? "Đã khóa" : "Chưa xác định"],
          ].filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
        <details className="advanced">
          <summary>Thông tin nâng cao</summary>
          {(isAdmin(user) || user.role==='BUSINESS_ADMIN') && <p className="muted">Tài khoản quản trị ứng dụng không cần chứng thư ký giao dịch nghiệp vụ.</p>}
          <dl className="profile-grid">
            {[
              ["User ID", user.userId], ["Organization ID", user.organizationId],
              ["MSP", user.orgMsp],
              ["Danh tính Fabric", (isAdmin(user) || user.role==='BUSINESS_ADMIN') ? null : ({ACTIVE: "Đã sẵn sàng ký", PENDING: "Chưa được cấp chứng thư", REVOKED: "Đã thu hồi chứng thư", DISABLED: "Backend đã ngừng sử dụng chứng thư", INACTIVE: "Chứng thư không hoạt động"} as Record<string,string>)[user.fabricIdentityStatus || ""] || "Chưa xác định"],
              ["Phạm vi vùng", user.regionCode === "GLOBAL" ? "Toàn hệ thống" : user.regionCode],
              ["Mã quyền", user.permissions?.join(", ")],
              ["Mã tác nhân lịch sử", user.legacyActorIds?.join(", ")],
            ].filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
          </dl>
          {hasPermission(user,'IDENTITY_REQUEST') && user.role!=='BUSINESS_ADMIN' && <><button disabled={identity.isPending} onClick={()=>identity.mutate()}>Yêu cầu cấp danh tính Fabric</button>{identity.isSuccess && <p role="status">Đã gửi yêu cầu đến người vận hành CA.</p>}{identity.error && <ErrorState error={identity.error}/>}</>}
        </details>
        <form onSubmit={submit}>
          <h2>Đổi mật khẩu</h2><p className="muted">Sau khi đổi mật khẩu, bạn cần đăng nhập lại trên các thiết bị.</p>
          <label>Mật khẩu hiện tại<input type="password" name="currentPassword" autoComplete="current-password" required disabled={mutation.isPending}/></label>
          <label>Mật khẩu mới<input type="password" name="newPassword" autoComplete="new-password" minLength={12} maxLength={1024} required disabled={mutation.isPending}/></label>
          <button disabled={mutation.isPending}>{mutation.isPending ? 'Đang lưu…' : 'Đổi mật khẩu và đăng xuất'}</button>
          {mutation.error && <ErrorState error={mutation.error}/>}{success && <p role="status">Đã đổi mật khẩu.</p>}
        </form>
      </section>
    </>
  );
}
