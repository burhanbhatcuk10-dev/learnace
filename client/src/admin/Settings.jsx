import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useUI, useTitle, Spinner, ErrorBox } from '../ui.jsx';

const FIELDS = [
  ['upiId', 'UPI ID for manual payments (e.g. yourname@okaxis)', 'text'], ['upiName', 'Name shown in UPI apps', 'text'],
  ['about', 'Short “about” text (footer)', 'textarea'], ['contactEmail', 'Contact email', 'email'], ['phone', 'Phone number', 'tel'],
  ['whatsapp', 'WhatsApp link (https://wa.me/…)', 'url'], ['telegram', 'Telegram link', 'url'], ['instagram', 'Instagram link', 'url'], ['youtube', 'YouTube link', 'url'], ['facebook', 'Facebook link', 'url'],
];

export default function Settings() {
  useTitle('Admin · Settings');
  const { toast } = useUI();
  const [f, setF] = useState(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { api('/admin/settings').then(d => setF(Object.fromEntries(FIELDS.map(([k]) => [k, d[k] || ''])))).catch(e => setErr(e.message)); }, []);
  if (err) return <ErrorBox message={err} />;
  if (!f) return <Spinner />;
  const save = async e => {
    e.preventDefault(); setBusy(true);
    try { await api('/admin/settings', { method: 'PUT', body: f }); toast('Settings saved'); } catch (x) { toast(x.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <form className="card" onSubmit={save}>
      <h3>Site details</h3>
      <p className="muted small">Shown in the footer of every page. Leave a field empty to hide it.</p>
      <div className="form-grid">{FIELDS.map(([k, l, t]) => (
        <label key={k} className="field" style={t === 'textarea' ? { gridColumn: '1 / -1' } : undefined}>{l}
          {t === 'textarea' ? <textarea rows={3} maxLength={1000} value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} /> : <input type={t} value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} />}
        </label>))}</div>
      <button disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button>
    </form>
  );
}
