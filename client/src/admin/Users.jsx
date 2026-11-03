import { useState } from 'react';
import { api } from '../api.js';
import { UserActivity } from './Activity.jsx';
import { useAsync, useDebounced, useUI, useTitle, Modal, Pager, Spinner, ErrorBox, Empty, Chip, Badge, fmtDate, fmtDateTime } from '../ui.jsx';

export default function Users({ me }) {
  useTitle('Admin · Users');
  const { toast, confirm } = useUI(), isSuper = me.role === 'super_admin';
  const [tab, setTab] = useState('student'), [q, setQ] = useState(''), dq = useDebounced(q), [page, setPage] = useState(1), [pw, setPw] = useState(null), [adding, setAdding] = useState(false), [view, setView] = useState(null), [pass, setPass] = useState(''), [nu, setNu] = useState({ name: '', email: '', password: '', role: 'content_admin' });
  const list = useAsync(() => api('/admin/users?' + new URLSearchParams({ role: tab, page, limit: 25, ...(dq && { search: dq }) })), [tab, page, dq]);
  const patch = async (u, body) => { try { await api('/admin/users/' + u.id, { method: 'PUT', body }); list.reload(); } catch (e) { toast(e.message, 'err'); } };
  const toggle = async u => { if (u.active && !(await confirm(`Deactivate ${u.name}? They will be signed out.`, { danger: true, okLabel: 'Deactivate' }))) return; patch(u, { active: !u.active }); };
  const reset = async e => { e.preventDefault(); try { await api(`/admin/users/${pw.id}/reset-password`, { method: 'POST', body: { password: pass } }); toast('Password reset. Share it with the student securely.'); setPw(null); setPass(''); } catch (x) { toast(x.message, 'err'); } };
  const add = async e => { e.preventDefault(); try { await api('/admin/users', { method: 'POST', body: nu }); toast('Account created'); setAdding(false); setNu({ name: '', email: '', password: '', role: 'content_admin' }); list.reload(); } catch (x) { toast(x.message, 'err'); } };
  return (
    <>
      <div className="row wrap toolbar">{isSuper && <>{[['student', 'Students'], ['staff', 'Staff']].map(([k, l]) => <Chip key={k} on={tab === k} onClick={() => { setTab(k); setPage(1); }}>{l}</Chip>)}</>}
        <input placeholder="Search name or email…" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} />{isSuper && <button onClick={() => setAdding(true)}>+ Add account</button>}</div>
      {list.loading && !list.data ? <Spinner /> : list.error ? <ErrorBox message={list.error} onRetry={list.reload} /> : !list.data.items.length ? <Empty icon="👥" title="No users found" /> :
        <div className="card table-wrap"><table><thead><tr><th>Name</th><th>Role</th><th>Tests</th><th>Joined</th><th>Last login</th><th>Status</th><th /></tr></thead><tbody>
          {list.data.items.map(u => <tr key={u.id}><td><b>{u.name}</b><br /><span className="muted small">{u.email}{u.targetExam ? ' · ' + u.targetExam : ''}</span></td>
            <td>{isSuper && u.id !== me.id ? <select value={u.role} onChange={e => patch(u, { role: e.target.value })}><option value="student">student</option><option value="content_admin">content_admin</option><option value="super_admin">super_admin</option></select> : u.role}</td>
            <td>{u.attempts}</td><td>{fmtDate(u.createdAt)}</td><td>{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : 'Never'}</td><td><Badge kind={u.active ? 'ok' : 'bad'}>{u.active ? 'Active' : 'Disabled'}</Badge></td>
            <td className="nowrap"><button className="ghost sm" onClick={() => setView(u.id)}>Activity</button> {u.id !== me.id && <><button className="ghost sm" onClick={() => toggle(u)}>{u.active ? 'Deactivate' : 'Activate'}</button> <button className="ghost sm" onClick={() => setPw(u)}>Reset password</button></>}</td></tr>)}</tbody></table></div>}
      {list.data && <Pager page={page} pages={list.data.pages} onPage={setPage} />}
      {view && <UserActivity id={view} onClose={() => setView(null)} />}
      {pw && <Modal title={'Reset password · ' + pw.name} small onClose={() => setPw(null)} footer={<><button className="ghost" onClick={() => setPw(null)}>Cancel</button><button form="pwform">Set password</button></>}>
        <form id="pwform" onSubmit={reset}><p className="muted small">This signs the user out everywhere.</p><input type="text" minLength={8} required placeholder="New password (8+ characters)" value={pass} onChange={e => setPass(e.target.value)} /></form></Modal>}
      {adding && <Modal title="Add account" small onClose={() => setAdding(false)} footer={<><button className="ghost" onClick={() => setAdding(false)}>Cancel</button><button form="addform">Create</button></>}>
        <form id="addform" onSubmit={add}><input required placeholder="Name" value={nu.name} onChange={e => setNu({ ...nu, name: e.target.value })} /><input type="email" required placeholder="Email" value={nu.email} onChange={e => setNu({ ...nu, email: e.target.value })} />
          <input required minLength={8} placeholder="Temporary password" value={nu.password} onChange={e => setNu({ ...nu, password: e.target.value })} />
          <select value={nu.role} onChange={e => setNu({ ...nu, role: e.target.value })}><option value="content_admin">content_admin (manage content)</option><option value="super_admin">super_admin (everything)</option><option value="student">student</option></select></form></Modal>}
    </>
  );
}
