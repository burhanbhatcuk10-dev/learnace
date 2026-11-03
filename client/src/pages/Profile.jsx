import { useState } from 'react';
import { api } from '../api.js';
import { useAuth, useUI, useTitle } from '../ui.jsx';

export function Profile() {
  useTitle('Profile');
  const { user, setUser, logout } = useAuth(), { toast, confirm } = useUI();
  const [f, setF] = useState({ name: user.name || '', phone: user.phone || '', targetExam: user.targetExam || '', dailyGoal: user.dailyGoal || 20 });
  const [pw, setPw] = useState({ current: '', next: '' });
  const saveProfile = async e => { e.preventDefault(); try { setUser(await api('/auth/me', { method: 'PUT', body: { ...f, dailyGoal: +f.dailyGoal } })); toast('Profile saved'); } catch (x) { toast(x.message, 'err'); } };
  const changePw = async e => { e.preventDefault(); try { await api('/auth/me/password', { method: 'POST', body: pw }); setPw({ current: '', next: '' }); toast('Password changed. Other devices were signed out.'); } catch (x) { toast(x.message, 'err'); } };
  const all = async () => { if (await confirm('Sign out on every device, including this one?', { okLabel: 'Sign out everywhere' })) { await api('/auth/logout-all', { method: 'POST' }).catch(() => {}); logout(); } };
  return (
    <>
      <h2>Profile</h2>
      <div className="grid g2">
        <form className="card" onSubmit={saveProfile}><h3>Your details</h3>
          <label className="field">Name<input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required minLength={2} /></label>
          <label className="field">Email<input value={user.email} disabled /></label>
          <label className="field">Phone<input value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /></label>
          <label className="field">Target exam<input value={f.targetExam} onChange={e => setF({ ...f, targetExam: e.target.value })} /></label>
          <label className="field">Daily question goal<input type="number" min="1" max="500" value={f.dailyGoal} onChange={e => setF({ ...f, dailyGoal: e.target.value })} /></label>
          <button>Save changes</button></form>
        <div>
          <form className="card" onSubmit={changePw}><h3>Change password</h3>
            <input type="password" placeholder="Current password" autoComplete="current-password" required value={pw.current} onChange={e => setPw({ ...pw, current: e.target.value })} />
            <input type="password" placeholder="New password (8+ characters)" autoComplete="new-password" minLength={8} required value={pw.next} onChange={e => setPw({ ...pw, next: e.target.value })} />
            <button>Update password</button></form>
          <div className="card"><h3>Security</h3><p className="muted small">Lost a device? Sign out everywhere.</p><button className="ghost" onClick={all}>Sign out of all devices</button></div>
        </div>
      </div>
    </>
  );
}
