const API = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

export async function request(path, options = {}) {
  const token = localStorage.getItem('tracechain-token');
  const {headers: optionHeaders = {}, ...requestOptions} = options;
  const response = await fetch(`${API}${path}`, {
    ...requestOptions,
    headers: {'Content-Type': 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {}), ...optionHeaders},
  });
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    const error = new Error(body?.message || body?.error || 'Không thể thực hiện yêu cầu');
    error.details = body;
    throw error;
  }
  return body;
}

export const lotService = {
  list: () => request('/lots'),
  get: (lotId, isPublic = false) => request(`${isPublic ? '/public' : ''}/lots/${encodeURIComponent(lotId)}`),
  create: (payload) => request('/lots', {method: 'POST', body: JSON.stringify(payload)}),
  addEvent: (lotId, payload) => request(`/lots/${encodeURIComponent(lotId)}/events`, {method: 'POST', body: JSON.stringify(payload)}),
  history: (lotId) => request(`/lots/${encodeURIComponent(lotId)}/history`),
  validate: (lotId) => request(`/lots/${encodeURIComponent(lotId)}/validate`),
  verifyDocuments: (lotId) => request(`/lots/${encodeURIComponent(lotId)}/verify-documents`),
  requestHandover: (lotId, payload) => request(`/lots/${encodeURIComponent(lotId)}/handover/request`, {method: 'POST', body: JSON.stringify(payload)}),
  confirmHandover: (lotId, payload) => request(`/lots/${encodeURIComponent(lotId)}/handover/confirm`, {method: 'POST', body: JSON.stringify(payload)}),
  recall: (lotId, payload) => request(`/lots/${encodeURIComponent(lotId)}/recall`, {method: 'POST', body: JSON.stringify(payload)}),
  qrUrl: (lotId) => `${API}/lots/${encodeURIComponent(lotId)}/qr`,
};

export const authService = {
  login: (credentials) => request('/auth/login', {method: 'POST', body: JSON.stringify(credentials)}),
  logout: () => request('/auth/logout', {method: 'POST'}),
  users: () => request('/users'),
  createUser: (payload) => request('/users', {method: 'POST', body: JSON.stringify(payload)}),
  setUserStatus: (username, status) => request(`/users/${encodeURIComponent(username)}/status`, {method: 'PATCH', body: JSON.stringify({status})}),
  resetPassword: (username, password) => request(`/users/${encodeURIComponent(username)}/reset-password`, {method: 'POST', body: JSON.stringify({password})}),
  audit: () => request('/admin/audit-log'),
};

export const actorService = {list: () => request('/actors')};

export async function uploadDocument(file, metadata = {}) {
  const form = new FormData();
  form.append('document', file);
  Object.entries(metadata).forEach(([key, value]) => form.append(key, value));
  const token = localStorage.getItem('tracechain-token');
  const response = await fetch(`${API}/documents`, {
    method: 'POST',
    headers: token ? {Authorization: `Bearer ${token}`} : {},
    body: form,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || body.error || 'Không thể tải chứng từ');
  return body;
}

export {API};
