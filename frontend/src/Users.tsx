import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Plus, Search, ShieldCheck, UserRound, X } from 'lucide-react';
import { api, type ManagedUser, type UserManagementMeta } from './api';

type AssignmentDraft = { project_id: number; role_id: number };
const dateLabel = (value?: string | null) => value ? new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export default function Users() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [meta, setMeta] = useState<UserManagementMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [u, m] = await Promise.all([api.users(), api.usersMeta()]);
      setUsers(u.data); setMeta(m);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load user management.');
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter(u => !q || u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.assignments.some(a => a.project_name.toLowerCase().includes(q)));
  }, [users, search]);

  const close = () => { setEditing(null); setCreating(false); };
  const saved = async () => { close(); await load(); };

  return <>
    <div className="heading">
      <div><small className="kicker">ACCESS CONTROL</small><h1>User management</h1><p>Create accounts and manage each user’s project access and role.</p></div>
      <button className="primary" onClick={() => { setEditing(null); setCreating(true); }}><Plus size={16}/> Add user</button>
    </div>
    <section className="panel data-panel">
      <div className="toolbar">
        <div className="search"><Search size={17}/><input aria-label="Search users" placeholder="Search name, email or project…" value={search} onChange={e => setSearch(e.target.value)}/></div>
        <span className="count-chip">{filtered.length} users</span>
      </div>
      {error && <div className="error-box" role="alert">{error}<button onClick={() => void load()}>Try again</button></div>}
      {loading ? <div className="loading">Loading users…</div> : <div className="table-scroll">
        <table aria-label="User accounts"><thead><tr><th>User</th><th>Email</th><th>Project assignments</th><th>Status</th><th>Last login</th><th/></tr></thead>
          <tbody>{filtered.map(user => <tr key={user.id}>
            <td className="strong"><span className="user-cell"><span className="avatar user-avatar">{user.full_name.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase()}</span>{user.full_name}</span></td>
            <td>{user.email}</td>
            <td><div className="assignment-summary">{user.assignments.length ? user.assignments.map(a => <span key={a.project_id}>{a.project_code} · {a.role_name}</span>) : <span className="muted">No project access</span>}</div></td>
            <td><span className={`pill ${user.is_active ? 'green' : 'neutral'}`}>{user.is_active ? 'Active' : 'Inactive'}</span></td>
            <td>{dateLabel(user.last_login_at)}</td>
            <td><button className="link-btn" onClick={() => setEditing(user)}>Manage ↗</button></td>
          </tr>)}</tbody>
        </table>
        {!filtered.length && <div className="empty"><UserRound size={18}/>No users match your search.</div>}
      </div>}
    </section>
    <div className="hint"><ShieldCheck size={16}/> Roles are assigned separately for each project. A user can have different roles in different projects.</div>
    {(creating || editing) && meta && <UserEditor user={editing} meta={meta} onClose={close} onSaved={saved}/>}
  </>;
}

function UserEditor({ user, meta, onClose, onSaved }: { user: ManagedUser | null; meta: UserManagementMeta; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(user?.full_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [password, setPassword] = useState('');
  const [active, setActive] = useState(user?.is_active ?? true);
  const [assignments, setAssignments] = useState<AssignmentDraft[]>(user?.assignments.map(a => ({ project_id: Number(a.project_id), role_id: Number(a.role_id) })) || []);
  const [projectToAdd, setProjectToAdd] = useState('');
  const [roleToAdd, setRoleToAdd] = useState(String(meta.roles[0]?.id || ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const assignedIds = new Set(assignments.map(a => a.project_id));
  const availableProjects = meta.projects.filter(p => !assignedIds.has(Number(p.id)));

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      if (user) {
        await api.updateUser(user.id, { full_name: name.trim(), email: email.trim(), password: password || undefined, is_active: active, assignments });
      } else {
        await api.createUser({ full_name: name.trim(), email: email.trim(), password, assignments });
      }
      await onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save user.'); }
    finally { setBusy(false); }
  };

  return <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="modal user-editor" role="dialog" aria-modal="true" aria-labelledby="user-editor-title">
      <header><div><small className="kicker">{user ? 'ACCOUNT SETTINGS' : 'NEW ACCOUNT'}</small><h2 id="user-editor-title">{user ? 'Manage user' : 'Create user'}</h2></div><button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><X/></button></header>
      <form onSubmit={submit}>
        <div className="user-form-grid">
          <label>Full name<input required maxLength={160} value={name} onChange={e=>setName(e.target.value)} placeholder="Full name"/></label>
          <label>Email address<input required type="email" maxLength={190} value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@company.com"/></label>
          <label className="wide">{user ? 'New password (leave blank to keep current)' : 'Initial password (minimum 12 characters)'}<input type="password" minLength={12} maxLength={1024} required={!user} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder={user ? 'Leave blank to keep current password' : 'At least 12 characters'}/></label>
        </div>
        {user && <label className="status-toggle"><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)}/> Account active</label>}
        <div className="assignment-editor-head"><div><h3>Project access</h3><p>Choose one role for each assigned project.</p></div></div>
        {assignments.map((assignment, index) => {
          const project = meta.projects.find(p => Number(p.id) === assignment.project_id);
          return <div className="assignment-row" key={assignment.project_id}>
            <div className="assignment-project"><b>{project?.project_code || 'Project'}</b><small>{project?.project_name || ''}</small></div>
            <select aria-label={`Role for ${project?.project_name || 'project'}`} value={assignment.role_id} onChange={e=>setAssignments(old=>old.map((a,i)=>i===index?{...a,role_id:Number(e.target.value)}:a))}>
              {meta.roles.map(role=><option key={role.id} value={role.id}>{role.role_name}</option>)}
            </select>
            <button type="button" className="link-btn danger-link" onClick={()=>setAssignments(old=>old.filter((_,i)=>i!==index))}>Remove</button>
          </div>;
        })}
        {availableProjects.length > 0 && <div className="add-assignment">
          <select aria-label="Project to assign" value={projectToAdd} onChange={e=>setProjectToAdd(e.target.value)}><option value="">Select project…</option>{availableProjects.map(p=><option key={p.id} value={p.id}>{p.project_code} · {p.project_name}</option>)}</select>
          <select aria-label="Role to assign" value={roleToAdd} onChange={e=>setRoleToAdd(e.target.value)}>{meta.roles.map(role=><option key={role.id} value={role.id}>{role.role_name}</option>)}</select>
          <button type="button" className="secondary" disabled={!projectToAdd || !roleToAdd} onClick={()=>{setAssignments(old=>[...old,{project_id:Number(projectToAdd),role_id:Number(roleToAdd)}]);setProjectToAdd('');}}>Add project</button>
        </div>}
        {!assignments.length && <p className="muted small-note">No projects assigned. This account will not see project data until access is granted.</p>}
        <div className="role-reference"><b>Available roles</b>{meta.roles.map(role=><span key={role.id}><strong>{role.role_name}</strong>{role.description ? ` — ${role.description}` : ''}</span>)}</div>
        {error && <div className="error" role="alert">{error}</div>}
        <div className="editor-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save user'}</button></div>
      </form>
    </section>
  </div>;
}
