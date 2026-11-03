import { useState } from 'react';
import { api } from '../api.js';
import { useAsync, useDebounced, useUI, useTitle, Modal, Pager, Spinner, ErrorBox, Empty, Chip, Badge, fmtDate } from '../ui.jsx';
import { optimize } from '../widgets.jsx';
import { ImageField } from './ImageField.jsx';

const live = r => <Badge kind={r.active ?? r.published ? 'ok' : ''}>{r.active ?? r.published ? 'Live' : 'Hidden'}</Badge>;
const thumb = (url, k = 'imageUrl') => r => (r[k] ? <img className="thumb" src={optimize(r[k], 160)} alt="" loading="lazy" /> : <span className="muted">–</span>);
const AUDIENCE = [['all', 'Everyone (visitors and students)'], ['public', 'Visitors only (front page)'], ['students', 'Signed-in students only (home page)']];

// fields: [key, label, type, extra]   types: text | textarea | checkbox | url | datetime-local | number | image | select
const CONFIG = {
  banners: { label: 'Banners', blank: { title: '', subtitle: '', imageUrl: '', linkUrl: '', ctaLabel: '', audience: 'all', position: 0, active: true },
    hint: 'Banners form the big slider on the front page and student home. Landscape images (about 1600×700) look best. With no banners, built-in slides are shown.',
    fields: [['title', 'Headline'], ['subtitle', 'Sub-headline', 'textarea'], ['imageUrl', 'Background image', 'image'], ['ctaLabel', 'Button text (e.g. Start now)'], ['linkUrl', 'Button link (https://… or /tests)'],
      ['audience', 'Show to', 'select', AUDIENCE], ['position', 'Order (smaller shows first)', 'number'], ['active', 'Visible', 'checkbox']],
    cols: [['Image', thumb()], ['Headline', r => <b>{r.title}</b>], ['Show to', r => r.audience], ['Order', r => r.position], ['Status', live]] },
  announcements: { label: 'Announcements', blank: { text: '', linkUrl: '', active: true },
    hint: 'A scrolling “Latest” strip at the top of the front page and student home.',
    fields: [['text', 'Announcement text', 'textarea'], ['linkUrl', 'Optional link (https://… or /tests)'], ['active', 'Visible', 'checkbox']],
    cols: [['Text', r => r.text], ['Status', live]], searchable: true },
  testimonials: { label: 'Testimonials', blank: { name: '', role: '', quote: '', photoUrl: '', position: 0, active: true },
    hint: 'Only add real feedback from real students (with their permission). The section appears on the front page once you add one.',
    fields: [['name', 'Student name'], ['role', 'Exam / result (e.g. JKSSB 2025 selected)'], ['quote', 'Feedback', 'textarea'], ['photoUrl', 'Photo (optional)', 'image'], ['position', 'Order', 'number'], ['active', 'Visible', 'checkbox']],
    cols: [['Photo', thumb('photoUrl')], ['Name', r => <b>{r.name}</b>], ['Role', r => r.role || '–'], ['Status', live]] },
  'current-affairs': { label: 'Current affairs', blank: { title: '', category: '', body: '', date: '', published: true },
    fields: [['title', 'Headline'], ['category', 'Category'], ['date', 'Publish date', 'datetime-local'], ['body', 'Summary / details', 'textarea'], ['published', 'Published', 'checkbox']],
    cols: [['Title', r => r.title], ['Category', r => r.category || '–'], ['Date', r => fmtDate(r.date)], ['Status', live]] },
  materials: { label: 'Study material', blank: { title: '', category: '', description: '', url: '', coverUrl: '', premium: false, downloadable: true },
    fields: [['title', 'Title'], ['category', 'Category'], ['description', 'Description', 'textarea'], ['url', 'File / PDF link (https://…)', 'url'], ['coverUrl', 'Cover image', 'image'], ['premium', 'Premium', 'checkbox'], ['downloadable', 'Downloadable', 'checkbox']],
    cols: [['Cover', thumb('coverUrl')], ['Title', r => r.title], ['Category', r => r.category || '–'], ['Access', r => <Badge kind={r.premium ? 'warn' : 'ok'}>{r.premium ? 'Premium' : 'Free'}</Badge>]] },
};
const toLocal = d => (d ? new Date(new Date(d).getTime() - new Date(d).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
const REQUIRED = new Set(['title', 'text', 'name', 'quote']);

function Editor({ kind, id, onClose, onSaved }) {
  const c = CONFIG[kind], { toast } = useUI();
  const [f, setF] = useState(c.blank), [loading, setLoading] = useState(!!id), [busy, setBusy] = useState(false);
  useAsync(async () => {
    if (id) {
      const r = await api(`/admin/${kind}/${id}`);
      setF({ ...c.blank, ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v ?? c.blank[k] ?? ''])), ...(kind === 'current-affairs' && { date: toLocal(r.date) }) });
    }
    setLoading(false); return 1;
  }, [id]);
  const save = async e => {
    e.preventDefault(); setBusy(true);
    const body = { ...f };
    if (kind === 'current-affairs') body.date = f.date ? new Date(f.date).toISOString() : null;
    for (const [k, , t] of c.fields) if (t === 'number') body[k] = f[k] === '' || f[k] === null ? undefined : Number(f[k]);
    try { await api(id ? `/admin/${kind}/${id}` : `/admin/${kind}`, { method: id ? 'PUT' : 'POST', body }); toast('Saved'); onSaved(); } catch (x) { toast(x.message, 'err'); } finally { setBusy(false); }
  };
  const set = k => v => setF(x => ({ ...x, [k]: v }));
  return (
    <Modal title={(id ? 'Edit ' : 'Add ') + c.label.toLowerCase()} onClose={onClose} wide={c.fields.some(x => x[2] === 'image')} footer={<><button className="ghost" onClick={onClose}>Cancel</button><button form="cform" disabled={busy || loading}>{busy ? 'Saving…' : 'Save'}</button></>}>
      {loading ? <Spinner /> : <form id="cform" onSubmit={save}>{c.fields.map(([k, l, t, extra]) => t === 'checkbox'
        ? <label key={k} className="check"><input type="checkbox" checked={!!f[k]} onChange={e => set(k)(e.target.checked)} /> {l}</label>
        : t === 'image' ? <ImageField key={k} label={l} value={f[k]} onChange={set(k)} />
        : t === 'select' ? <label key={k} className="field">{l}<select value={f[k]} onChange={e => set(k)(e.target.value)}>{extra.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></label>
        : <label key={k} className="field">{l}{t === 'textarea' ? <textarea rows={kind === 'announcements' ? 3 : 5} required={REQUIRED.has(k)} value={f[k] ?? ''} onChange={e => set(k)(e.target.value)} />
          : <input type={t || 'text'} required={REQUIRED.has(k)} value={f[k] ?? ''} onChange={e => set(k)(e.target.value)} />}</label>)}</form>}
    </Modal>
  );
}

export default function Content() {
  useTitle('Admin · Content');
  const { toast, confirm } = useUI();
  const [kind, setKind] = useState('banners'), [page, setPage] = useState(1), [q, setQ] = useState(''), dq = useDebounced(q), [edit, setEdit] = useState(null);
  const c = CONFIG[kind];
  const list = useAsync(() => api(`/admin/${kind}?` + new URLSearchParams({ page, limit: 20, ...(dq && { search: dq }) })), [kind, page, dq]);
  const label = r => r.title || r.name || r.text;
  const del = async r => { if (await confirm(`Delete "${String(label(r)).slice(0, 80)}"?`, { danger: true, okLabel: 'Delete' })) { try { await api(`/admin/${kind}/${r.id}`, { method: 'DELETE' }); toast('Deleted'); list.reload(); } catch (e) { toast(e.message, 'err'); } } };
  return (
    <>
      <div className="row wrap seg">{Object.entries(CONFIG).map(([k, v]) => <Chip key={k} on={kind === k} onClick={() => { setKind(k); setPage(1); setQ(''); }}>{v.label}</Chip>)}</div>
      {c.hint && <p className="muted small">{c.hint}</p>}
      <div className="row wrap toolbar"><input placeholder="Search…" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} /><button onClick={() => setEdit({})}>+ Add</button></div>
      {list.loading && !list.data ? <Spinner /> : list.error ? <ErrorBox message={list.error} onRetry={list.reload} /> : !list.data.items.length ? <Empty icon="🗂️" title={'No ' + c.label.toLowerCase() + ' yet'} /> :
        <div className="card table-wrap"><table><thead><tr>{c.cols.map(([h]) => <th key={h}>{h}</th>)}<th /></tr></thead><tbody>
          {list.data.items.map(r => <tr key={r.id}>{c.cols.map(([h, fn]) => <td key={h}>{fn(r)}</td>)}<td className="nowrap"><button className="ghost sm" onClick={() => setEdit(r)}>Edit</button> <button className="ghost sm danger-t" onClick={() => del(r)}>Delete</button></td></tr>)}</tbody></table></div>}
      {list.data && <Pager page={page} pages={list.data.pages} onPage={setPage} />}
      {edit && <Editor key={kind + (edit.id || 'new')} kind={kind} id={edit.id} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); list.reload(); }} />}
    </>
  );
}
