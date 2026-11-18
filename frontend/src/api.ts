export type User = { id: number; full_name?: string; fullName?: string; email: string };
export type Project = { id: number; project_code: string; project_name: string; client_name?: string | null; currency_code?: string | null; role_key?: string; role_name?: string; permissions: string[] };
export type UserAssignment = { project_id: number; role_id: number; project_code: string; project_name: string; role_key: string; role_name: string };
export type ManagedUser = { id: number; full_name: string; email: string; is_active: boolean; last_login_at?: string | null; created_at?: string; assignments: UserAssignment[] };
export type UserManagementMeta = { success: boolean; projects: { id: number; project_code: string; project_name: string }[]; roles: { id: number; role_key: string; role_name: string; description?: string | null }[] };
export type PageResult<T> = { success: boolean; data: T[]; pagination?: { page: number; limit: number; total: number; total_pages: number } };
export type DocumentRow = { id: number; document_no: string; title: string; document_type?: string | null; discipline_name?: string | null; progress_percent?: number | null; manhours?: number | null };
export type TransmittalRow = { id: number; transmittal_no: string; transmittal_date?: string; recipient?: string; purpose?: string; discipline_label?: string; document_count?: number; remarks?: string };
export type InvoiceRow = { id: number; invoice_no: string; invoice_date?: string | null; bill_to?: string | null; currency_code?: string | null; earned_to_date?: number | string | null; previously_invoiced?: number | string | null; amount_due?: number | string | null; vat_amount?: number | string | null; gross_amount?: number | string | null; status?: string | null; item_count?: number };
export type Detail<T> = { success: boolean; data: T };
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
const TOKEN_KEY = 'mdr_access_token';
export const tokenStore = { get: () => sessionStorage.getItem(TOKEN_KEY), set: (v: string) => sessionStorage.setItem(TOKEN_KEY, v), clear: () => sessionStorage.removeItem(TOKEN_KEY) };
export class ApiError extends Error { constructor(message: string, public status: number) { super(message); this.name = 'ApiError'; } }
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = tokenStore.get();
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) { if (response.status === 401) { tokenStore.clear(); if (!path.startsWith('/auth/login')) window.dispatchEvent(new Event('mdr:unauthorized')); } throw new ApiError(payload.message || `Request failed (${response.status})`, response.status); }
  return payload as T;
}
export const api = {
  login: (email: string, password: string) => request<{ success: boolean; token: string; user: User; projects: Project[] }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => request<{ success: boolean; user: User; projects: Project[] }>('/auth/me'),
  logout: () => request<{ success: boolean }>('/auth/logout', { method: 'POST' }),
  usersMeta: () => request<UserManagementMeta>('/users/meta'),
  users: () => request<{ success: boolean; data: ManagedUser[] }>('/users'),
  createUser: (data: { full_name: string; email: string; password: string; assignments: { project_id: number; role_id: number }[] }) => request<{ success: boolean; message: string }>('/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id: number, data: { full_name: string; email: string; password?: string; is_active: boolean; assignments: { project_id: number; role_id: number }[] }) => request<{ success: boolean; message: string }>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  documents: (id: number, page = 1, search = '', discipline = '') => { const q = new URLSearchParams({ page: String(page), limit: '50' }); if (search.trim()) q.set('search', search.trim()); if (discipline) q.set('discipline', discipline); return request<PageResult<DocumentRow>>(`/projects/${id}/documents?${q}`); },
  disciplines: (id: number) => request<{ success: boolean; data: { id: number; discipline_key: string; discipline_name: string }[] }>(`/projects/${id}/disciplines`),
  transmittals: (id: number, page = 1) => request<PageResult<TransmittalRow>>(`/projects/${id}/transmittals?page=${page}&limit=50`),
  transmittalDocs: (id: number, tid: number) => request<{ success: boolean; data: { document_no: string; title: string; revision_code?: string; discipline_name?: string }[] }>(`/projects/${id}/transmittals/${tid}/documents`),
  transmittalRevisions: (id: number, tid: number) => request<{ success: boolean; data: { revision_code: string; issue_code?: string; revision_date?: string; description?: string }[] }>(`/projects/${id}/transmittals/${tid}/revisions`),
  invoices: (id: number, page = 1) => request<PageResult<InvoiceRow>>(`/projects/${id}/invoices?page=${page}&limit=50`),
  invoiceItems: (id: number, iid: number) => request<{ success: boolean; data: Record<string, unknown>[] }>(`/projects/${id}/invoices/${iid}/items`)
};