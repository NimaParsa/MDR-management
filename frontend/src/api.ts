export type User = { id: number; full_name?: string; fullName?: string; email: string };
export type Project = { id: number; project_code: string; project_name: string; client_name?: string | null; currency_code?: string | null; previous_invoiced_amount?: number | string | null; role_key?: string; role_name?: string; permissions: string[] };
export type UserAssignment = { project_id: number; role_id: number; project_code: string; project_name: string; role_key: string; role_name: string };
export type ManagedUser = { id: number; full_name: string; email: string; is_active: boolean; last_login_at?: string | null; created_at?: string; assignments: UserAssignment[] };
export type UserManagementMeta = { success: boolean; projects: { id: number; project_code: string; project_name: string }[]; roles: { id: number; role_key: string; role_name: string; description?: string | null; permissions: string[] }[] };
export type PageResult<T> = { success: boolean; data: T[]; pagination?: { page: number; limit: number; total: number; total_pages: number } };
export type DocumentRow = { id: number; discipline_id?: number | null; discipline_key?: string | null; discipline_name?: string | null; document_no: string; title: string; document_type?: string | null; weight_factor_manual?: number | null; legacy_weight_factor?: number | null; effective_weight_factor?: number | null; manhours?: number | null; manhour_rate?: number | null; progress_percent?: number | null; document_status?: string | null; planned_issue_date?: string | null; actual_issue_date?: string | null; revision_code?: string | null; remarks?: string | null };
export type TransmittalRow = { id: number; transmittal_no: string; transmittal_date?: string; recipient?: string; purpose?: string; discipline_label?: string; document_count?: number; remarks?: string };
export type InvoiceRow = { id: number; invoice_no: string; invoice_date?: string | null; bill_to?: string | null; contractor_name?: string | null; period_from?: string | null; period_to?: string | null; invoice_basis?: 'earned'|'full'; claim_basis_amount?: number | string | null; currency_code?: string | null; earned_to_date?: number | string | null; previously_invoiced?: number | string | null; amount_due?: number | string | null; vat_percent?: number | string | null; vat_amount?: number | string | null; gross_amount?: number | string | null; status?: string | null; notes?: string | null; item_count?: number };
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
  mdrSummary: (id: number) => request<{ success: boolean; project: { id: number; currency_code: string; weight_factor_mode: 'automatic'|'manual' }; data: DocumentRow[]; metrics: { documentCount: number; totalWeight: number; plannedManhours: number; contractValue: number; earnedValue: number; remainingValue: number; weightedProgress: number; earnedValuePercent: number; disciplines: { discipline: string; documents: number; totalWeight: number; weightShare: number; plannedManhours: number; contractValue: number; earnedValue: number; remainingValue: number; progress: number }[] } }>(`/projects/${id}/mdr-summary`),
  createDocument: (id: number, data: Record<string, unknown>) => request<{ success: boolean; id: number; message: string }>(`/projects/${id}/documents`, { method: 'POST', body: JSON.stringify(data) }),
  updateDocument: (projectId: number, documentId: number, data: Record<string, unknown>) => request<{ success: boolean; message: string }>(`/projects/${projectId}/documents/${documentId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteDocument: (projectId: number, documentId: number) => request<{ success: boolean; message: string }>(`/projects/${projectId}/documents/${documentId}`, { method: 'DELETE' }),
  importDocuments: (id: number, mode: 'append'|'replace'|'merge', documents: Record<string, unknown>[]) => request<{ success: boolean; imported: number; mode: string; message: string }>(`/projects/${id}/documents/import`, { method: 'POST', body: JSON.stringify({ mode, documents }) }),
  invoiceSettings: (id: number) => request<{ success: boolean; data: { client?: string; contractor?: string; invoiceNo?: string; invoiceDate?: string; periodFrom?: string; periodTo?: string; currency?: string; tax?: number; invoiceBasis?: 'earned'|'full' } }>(`/projects/${id}/invoice-settings`),
  saveInvoiceSettings: (id: number, data: Record<string, unknown>) => request<{ success: boolean }>(`/projects/${id}/invoice-settings`, { method: 'PUT', body: JSON.stringify(data) }),
  createInvoice: (id: number, data: Record<string, unknown>) => request<{ success: boolean; id: number; calculation: Record<string, unknown>; message: string }>(`/projects/${id}/invoices`, { method: 'POST', body: JSON.stringify(data) }),
  documents: (id: number, page = 1, search = '', discipline = '') => { const q = new URLSearchParams({ page: String(page), limit: '50' }); if (search.trim()) q.set('search', search.trim()); if (discipline) q.set('discipline', discipline); return request<PageResult<DocumentRow>>(`/projects/${id}/documents?${q}`); },
  disciplines: (id: number) => request<{ success: boolean; data: { id: number; discipline_key: string; discipline_name: string }[] }>(`/projects/${id}/disciplines`),
  createDiscipline: (id: number, discipline_name: string) => request<{ success: boolean; data: { id: number; discipline_key: string; discipline_name: string } }>(`/projects/${id}/disciplines`, { method: 'POST', body: JSON.stringify({ discipline_name }) }),
  transmittals: (id: number, page = 1) => request<PageResult<TransmittalRow>>(`/projects/${id}/transmittals?page=${page}&limit=50`),
  transmittalDocs: (id: number, tid: number) => request<{ success: boolean; data: { document_no: string; title: string; revision_code?: string; discipline_name?: string }[] }>(`/projects/${id}/transmittals/${tid}/documents`),
  transmittalRevisions: (id: number, tid: number) => request<{ success: boolean; data: { revision_code: string; issue_code?: string; revision_date?: string; description?: string }[] }>(`/projects/${id}/transmittals/${tid}/revisions`),
  invoices: (id: number, page = 1) => request<PageResult<InvoiceRow>>(`/projects/${id}/invoices?page=${page}&limit=50`),
  invoiceItems: (id: number, iid: number) => request<{ success: boolean; data: Record<string, unknown>[] }>(`/projects/${id}/invoices/${iid}/items`)
};