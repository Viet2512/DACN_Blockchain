import {useState,type FormEvent} from 'react';
import {Link} from 'react-router-dom';
import {useMutation} from '@tanstack/react-query';
import {authService} from '../../services/api';
import {ErrorState} from '../../components/Common';
export default function ActivationPage() {
  const [token]=useState(()=>{const value=location.hash.slice(1);history.replaceState(null,'',location.pathname);return value;});
  const [password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[error,setError]=useState('');
  const activation=useMutation({mutationFn:()=>authService.acceptInvitation(token,password)});
  function submit(event:FormEvent){event.preventDefault();if(password!==confirmation){setError('Mật khẩu xác nhận chưa khớp');return;}setError('');if(!activation.isPending)activation.mutate();}
  return <main className="page"><section className="panel narrow"><h1>Kích hoạt tài khoản</h1>{activation.isSuccess?<p role="status">Tài khoản đã kích hoạt. <Link to="/login">Đăng nhập</Link></p>:!token?<p>Lời mời không có token. Liên hệ quản trị viên để nhận liên kết mới.</p>:<form onSubmit={submit}><label>Mật khẩu mới<input type="password" autoComplete="new-password" minLength={12} maxLength={1024} required value={password} onChange={event=>setPassword(event.target.value)}/></label><label>Xác nhận mật khẩu<input type="password" autoComplete="new-password" minLength={12} maxLength={1024} required value={confirmation} onChange={event=>setConfirmation(event.target.value)}/></label>{error && <p role="alert">{error}</p>}{activation.error && <ErrorState error={activation.error}/>}<button disabled={activation.isPending}>{activation.isPending?'Đang kích hoạt…':'Kích hoạt'}</button></form>}</section></main>;
}
