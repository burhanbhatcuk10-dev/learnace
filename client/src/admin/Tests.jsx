import { useEffect, useState } from 'react';
import { api, download } from '../api.js';
import { useAsync, useDebounced, useUI, useTitle, Modal, Pager, Spinner, ErrorBox, Empty, Badge, fmtDur, fmtDateTime, fmtINR } from '../ui.jsx';
import { questionsFromCSV, CSV_TEMPLATE } from '../csv.js';

const toLocal = d => (d ? new Date(new Date(d).getTime() - new Date(d).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
const fromLocal = v => (v ? new Date(v).toISOString() : null);

function Picker({ selected, setSelected }) {
  const [q, setQ] = useState(''), dq = useDebounced(q), [page, setPage] = useState(1), [only, setOnly] = useState(false);
  const list = useAsync(() => (only ? (selected.length ? api('/admin/questions?limit=300&ids=' + selected.join(',')) : Promise.resolve({ items: [], pages: 1 })) : api('/admin/questions?' + new URLSearchParams({ page, limit: 10, ...(dq && { search: dq }) }))), [page, dq, only]);
  const toggle = id => setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));
  return (
    <div className="picker"><div className="row wrap"><input placeholder="Search questions to add…" value={q} onChange={e => { setQ(e.target.value); setPage(1); setOnly(false); }} />
      <button type="button" className={'chip' + (only ? ' on' : '')} onClick={() => setOnly(!only)}>Selected ({selected.length})</button>
      {selected.length > 0 && <button type="button" className="ghost sm" onClick={() => setSelected([])}>Clear</button>}</div>
      <div className="bank">{list.loading && !list.data ? <Spinner /> : (list.data?.items || []).map(x => <label key={x.id} className="check"><input type="checkbox" checked={selected.includes(x.id)} onChange={() => toggle(x.id)} /> <span>{x.text.slice(0, 90)} <span className="muted small">{x.subject}</span></span></label>)}
        {!list.loading && !list.data?.items.length && <p className="muted small">No questions.</p>}</div>
      {!only && list.data && <Pager page={page} pages={list.data.pages} onPage={setPage} />}</div>
  );
}

function CsvImport({ onAdd }) {
  const { toast } = useUI(), [busy, setBusy] = useState(false), [exclusive, setExclusive] = useState(true), [msg, setMsg] = useState('');
  const template = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([CSV_TEMPLATE], { type: 'text/csv' })); a.download = 'questions-template.csv'; a.click(); URL.revokeObjectURL(a.href); };
  const pick = async e => {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
    setBusy(true); setMsg('');
    try {
      const { items, errors } = questionsFromCSV(await file.text());
      if (!items.length) throw new Error(errors[0] || 'No valid questions found in the file.');
      const ids = []; let added = 0, dup = 0, bad = 0;
      for (let i = 0; i < items.length; i += 500) {
        const r = await api('/admin/questions/bulk', { method: 'POST', body: { questions: items.slice(i, i + 500), ...(exclusive && { published: false }) } });
        ids.push(...r.ids); added += r.inserted; dup += r.duplicates; bad += r.invalidCount;
      }
      onAdd(ids);
      const text = `${ids.length} question(s) added to this test (${added} new, ${dup} already in bank)` + (bad + errors.length ? ` · ${bad + errors.length} row(s) skipped` : '') + '.';
      setMsg(text + (errors.length ? ' First issue: ' + errors[0] : '')); toast(text);
    } catch (x) { toast(x.message, 'err'); setMsg(x.message); } finally { setBusy(false); }
  };
  return (
    <div className="csv-box">
      <div className="row wrap"><label className={'btn gold sm' + (busy ? ' disabled' : '')}>{busy ? 'Importing…' : '⬆ Upload CSV of questions'}<input type="file" accept=".csv,text/csv" hidden disabled={busy} onChange={pick} /></label>
        <button type="button" className="ghost sm" onClick={template}>Download template</button>
        <label className="check"><input type="checkbox" checked={exclusive} onChange={e => setExclusive(e.target.checked)} /> Keep new questions exam-only (hidden from Practice)</label></div>
      <p className="muted small" style={{ margin: '6px 0 0' }}>Columns: text, option_a–option_d, answer (A–D), explanation, subject, topic. Thousands of rows are fine; every question in the file is added to this test.{msg && <> <b>{msg}</b></>}</p>
    </div>
  );
}

function TestForm({ id, onClose, onSaved }) {
  const { toast } = useUI();
  const [f, setF] = useState({ title: '', exam: '', description: '', instructions: '', durationMin: 60, marksPerQ: 1, negative: 0, startsAt: '', endsAt: '', maxAttempts: '', shuffle: false, active: true, premium: false, price: '' });
  const [sel, setSel] = useState([]), [loading, setLoading] = useState(!!id), [busy, setBusy] = useState(false);
  useEffect(() => { if (id) api('/admin/tests/' + id).then(t => { setF({ ...t, exam: t.exam || '', description: t.description || '', instructions: t.instructions || '', startsAt: toLocal(t.startsAt), endsAt: toLocal(t.endsAt), maxAttempts: t.maxAttempts || '', premium: !!t.premium, price: t.pricePaise ? t.pricePaise / 100 : '' }); setSel(t.questions); }).catch(e => toast(e.message, 'err')).finally(() => setLoading(false)); }, [id]); // eslint-disable-line
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const save = async e => {
    e.preventDefault(); setBusy(true);
    const body = { title: f.title, exam: f.exam, description: f.description, instructions: f.instructions, durationMin: +f.durationMin, marksPerQ: +f.marksPerQ, negative: +f.negative,
      startsAt: fromLocal(f.startsAt), endsAt: fromLocal(f.endsAt), maxAttempts: f.maxAttempts === '' ? null : +f.maxAttempts, shuffle: f.shuffle, active: f.active, premium: !!f.premium, pricePaise: f.premium ? Math.round((+f.price || 0) * 100) : 0, questions: sel };
    try { await api(id ? '/admin/tests/' + id : '/admin/tests', { method: id ? 'PUT' : 'POST', body }); toast('Test saved'); onSaved(); } catch (x) { toast(x.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <Modal title={id ? 'Edit test' : 'New test'} onClose={onClose} wide footer={<><button className="ghost" onClick={onClose}>Cancel</button><button form="tform" disabled={busy || loading}>{busy ? 'Saving…' : 'Save test'}</button></>}>
      {loading ? <Spinner /> : <form id="tform" onSubmit={save}>
        <div className="form-grid">
          <label className="field">Title<input required value={f.title} onChange={set('title')} /></label><label className="field">Exam<input value={f.exam} onChange={set('exam')} /></label>
          <div className="field"><span>Test time (minutes)</span><input type="number" min="1" max="600" required value={f.durationMin} onChange={set('durationMin')} />
            <div className="row wrap">{[15, 30, 45, 60, 90, 120, 180].map(m => <button type="button" key={m} className={'chip' + (+f.durationMin === m ? ' on' : '')} onClick={() => setF({ ...f, durationMin: m })}>{m >= 60 ? (m / 60) + ' h' : m + ' min'}</button>)}</div></div>
          <label className="field">Marks per question<input type="number" step="any" min="0.01" required value={f.marksPerQ} onChange={set('marksPerQ')} /></label>
          <label className="field">Negative marks<input type="number" step="any" min="0" value={f.negative} onChange={set('negative')} /></label>
          <label className="field">Max attempts (blank = unlimited)<input type="number" min="1" value={f.maxAttempts} onChange={set('maxAttempts')} /></label>
          <label className="field">Opens at<input type="datetime-local" value={f.startsAt} onChange={set('startsAt')} /></label>
          <label className="field">Closes at<input type="datetime-local" value={f.endsAt} onChange={set('endsAt')} /></label>
        </div>
        <p className="muted small">Each student gets the full test time from the moment they press Start; the server auto-submits when it runs out. “Opens/Closes at” limits when a test can be started. Correct answers are never shown until the student submits.</p>
        <label className="field">Description<textarea rows={2} value={f.description} onChange={set('description')} /></label>
        <label className="field">Extra instructions<textarea rows={2} value={f.instructions} onChange={set('instructions')} /></label>
        <div className="row wrap"><label className="check"><input type="checkbox" checked={f.shuffle} onChange={e => setF({ ...f, shuffle: e.target.checked })} /> Shuffle question order</label>
          <label className="check"><input type="checkbox" checked={f.active} onChange={e => setF({ ...f, active: e.target.checked })} /> Visible to students</label></div>
        <div className={'prem-box' + (f.premium ? ' on' : '')}><label className="check"><input type="checkbox" checked={f.premium} onChange={e => setF({ ...f, premium: e.target.checked })} /> <b>★ Premium mock</b> — students need access (purchase or admin grant)</label>
          {f.premium && <label className="field">Price in ₹ (0 = not for sale, admin grants only)<input type="number" min="0" step="1" value={f.price} onChange={set('price')} placeholder="e.g. 99" /></label>}
          {f.premium && <p className="muted small" style={{ margin: 0 }}>{id ? 'Use the “Access” button in the tests list to choose which students get it free or to remove someone.' : 'Save the test first, then use “Access” to choose students.'}</p>}</div>
        <h4>Questions <span className="muted small">· {sel.length} selected · {+(sel.length * (+f.marksPerQ || 0)).toFixed(2)} total marks</span></h4>
        <p className="muted small">Tip: set a question to “unpublished” in the Questions tab to keep it exclusive to tests — it will never appear in Practice.</p>
        <CsvImport onAdd={ids => setSel(s => [...new Set([...s, ...ids])])} />
        <Picker selected={sel} setSelected={setSel} />
      </form>}
    </Modal>
  );
}

function Generate({ onClose, onSaved }) {
  const { toast } = useUI(), [f, setF] = useState({ title: '', exam: '', subject: '', topic: '', difficulty: '', count: 20, negative: 0.25 }), [busy, setBusy] = useState(false);
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const go = async e => { e.preventDefault(); setBusy(true); try { const r = await api('/admin/tests/generate', { method: 'POST', body: { ...f, count: +f.count, negative: +f.negative, difficulty: f.difficulty || null } }); toast(`Created with ${r.questionCount} questions` + (r.questionCount < r.requested ? ` (only ${r.questionCount} matched)` : '')); onSaved(); } catch (x) { toast(x.message, 'err'); } finally { setBusy(false); } };
  return (
    <Modal title="Auto-generate a test" onClose={onClose} footer={<><button className="ghost" onClick={onClose}>Cancel</button><button form="gform" disabled={busy}>Generate</button></>}>
      <form id="gform" onSubmit={go}><p className="muted small">Picks random published questions that match the filters.</p>
        <label className="field">Title<input required value={f.title} onChange={set('title')} /></label>
        <div className="form-grid"><label className="field">Subject<input value={f.subject} onChange={set('subject')} /></label><label className="field">Topic<input value={f.topic} onChange={set('topic')} /></label>
          <label className="field">Exam<input value={f.exam} onChange={set('exam')} /></label><label className="field">Difficulty<select value={f.difficulty} onChange={set('difficulty')}><option value="">Any</option><option>easy</option><option>moderate</option><option>difficult</option></select></label>
          <label className="field">Questions<input type="number" min="1" max="200" required value={f.count} onChange={set('count')} /></label><label className="field">Negative marks<input type="number" step="any" min="0" value={f.negative} onChange={set('negative')} /></label></div></form>
    </Modal>
  );
}

function Access({ test, onClose, onChanged }) {
  const { toast, confirm } = useUI(), list = useAsync(() => api(`/admin/tests/${test.id}/access`), [test.id]);
  const [emails, setEmails] = useState(''), [busy, setBusy] = useState(false), [missing, setMissing] = useState([]);
  const grant = async body => {
    setBusy(true);
    try { const r = await api(`/admin/tests/${test.id}/access`, { method: 'POST', body }); setMissing(r.notFound || []); toast(`Access granted to ${r.granted} student(s)`); setEmails(''); list.reload(); onChanged(); }
    catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const all = async () => { if (await confirm('Give every active student free access to this test?', { okLabel: 'Grant to all' })) grant({ all: true }); };
  const revoke = async u => { try { await api(`/admin/tests/${test.id}/access/${u.id}`, { method: 'DELETE' }); toast('Access removed'); list.reload(); onChanged(); } catch (e) { toast(e.message, 'err'); } };
  return (
    <Modal title={'Access · ' + test.title} onClose={onClose} wide footer={<button onClick={onClose}>Done</button>}>
      <p className="muted small">{test.premium ? 'Only the students below (plus anyone who buys it) can open this premium test. Staff always can.' : 'This test is not premium, so everyone can open it. Tick “Premium mock” in Edit to restrict it.'}</p>
      <label className="field">Add students by email (one per line or comma-separated)<textarea rows={3} value={emails} onChange={e => setEmails(e.target.value)} placeholder={'student1@gmail.com\nstudent2@gmail.com'} /></label>
      <div className="row wrap"><button disabled={busy || !emails.trim()} onClick={() => grant({ emails })}>Grant access</button><button className="ghost" disabled={busy} onClick={all}>Grant to all students</button></div>
      {missing.length > 0 && <p className="err-t small">No account found for: {missing.join(', ')}</p>}
      <h4>Students with access {list.data && <span className="muted small">· {list.data.items.length}</span>}</h4>
      {list.loading && !list.data ? <Spinner /> : !list.data?.items.length ? <p className="muted small">Nobody yet.</p> :
        <div className="table-wrap"><table><thead><tr><th>Student</th><th>How</th><th /></tr></thead><tbody>{list.data.items.map(u => <tr key={u.id}><td>{u.name}<br /><span className="muted small">{u.email}</span></td><td><Badge kind={u.source === 'purchase' ? 'ok' : 'info'}>{u.source === 'purchase' ? 'Purchased' : 'Admin'}</Badge></td><td className="nowrap"><button className="ghost sm danger-t" onClick={() => revoke(u)}>Remove</button></td></tr>)}</tbody></table></div>}
    </Modal>
  );
}

function Results({ test, onClose }) {
  const { toast } = useUI(), r = useAsync(() => api(`/admin/tests/${test.id}/results`), [test.id]);
  return (
    <Modal title={'Results · ' + test.title} onClose={onClose} wide footer={<><button className="ghost" onClick={() => download(`/admin/tests/${test.id}/results?format=csv`, `results-${test.id}.csv`).catch(e => toast(e.message, 'err'))}>Export CSV</button><button onClick={onClose}>Close</button></>}>
      {r.loading ? <Spinner /> : !r.data.items.length ? <p className="muted">No submissions yet.</p> : <div className="table-wrap"><table><thead><tr><th>#</th><th>Student</th><th>Score</th><th>Acc.</th><th>Time</th><th>Tab sw.</th><th>Submitted</th></tr></thead><tbody>
        {r.data.items.map(x => <tr key={x.email + x.submittedAt}><td>{x.rank}</td><td>{x.name}<br /><span className="muted small">{x.email}</span></td><td>{x.score}/{x.maxMarks}</td><td>{x.accuracy}%</td><td>{fmtDur(x.timeTaken)}</td><td>{x.tabSwitches}</td><td>{fmtDateTime(x.submittedAt)}{x.late && ' ⚠'}</td></tr>)}</tbody></table></div>}
    </Modal>
  );
}

export default function AdminTests() {
  useTitle('Admin · Tests');
  const { toast, confirm } = useUI(), [page, setPage] = useState(1), [edit, setEdit] = useState(null), [gen, setGen] = useState(false), [res, setRes] = useState(null), [acc, setAcc] = useState(null);
  const list = useAsync(() => api('/admin/tests?limit=20&page=' + page), [page]);
  const del = async t => { if (await confirm(`Delete "${t.title}" and all ${t.attempts} student attempt(s)?`, { danger: true, okLabel: 'Delete' })) { try { await api('/admin/tests/' + t.id, { method: 'DELETE' }); toast('Deleted'); list.reload(); } catch (e) { toast(e.message, 'err'); } } };
  const toggle = async t => { try { await api('/admin/tests/' + t.id, { method: 'PUT', body: { active: !t.active } }); list.reload(); } catch (e) { toast(e.message, 'err'); } };
  return (
    <>
      <div className="row wrap toolbar"><button onClick={() => setEdit({})}>+ New test</button><button className="ghost" onClick={() => setGen(true)}>⚡ Auto-generate</button></div>
      {list.loading && !list.data ? <Spinner /> : list.error ? <ErrorBox message={list.error} onRetry={list.reload} /> : !list.data.items.length ? <Empty icon="📝" title="No tests yet" hint="Create one manually or auto-generate from your question bank." /> :
        <div className="card table-wrap"><table><thead><tr><th>Title</th><th>Qs</th><th>Time</th><th>Attempts</th><th>Status</th><th /></tr></thead><tbody>
          {list.data.items.map(t => <tr key={t.id}><td><b>{t.title}</b>{t.premium && <> <Badge kind="warn">★ {t.pricePaise ? fmtINR(t.pricePaise) : 'Invite only'}</Badge></>}<br /><span className="muted small">{[t.exam, t.startsAt && 'opens ' + fmtDateTime(t.startsAt), t.endsAt && 'closes ' + fmtDateTime(t.endsAt)].filter(Boolean).join(' · ')}</span></td>
            <td>{t.questionCount}</td><td>{t.durationMin}m</td><td>{t.attempts}</td><td><button className="linklike" onClick={() => toggle(t)}><Badge kind={t.active ? 'ok' : ''}>{t.active ? 'Live' : 'Hidden'}</Badge></button></td>
            <td className="nowrap">{t.premium && <button className="ghost sm" onClick={() => setAcc(t)}>Access ({t.accessCount})</button>} <button className="ghost sm" onClick={() => setRes(t)}>Results</button> <button className="ghost sm" onClick={() => setEdit(t)}>Edit</button> <button className="ghost sm danger-t" onClick={() => del(t)}>Delete</button></td></tr>)}</tbody></table></div>}
      {list.data && <Pager page={page} pages={list.data.pages} onPage={setPage} />}
      {edit && <TestForm id={edit.id} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); list.reload(); }} />}
      {gen && <Generate onClose={() => setGen(false)} onSaved={() => { setGen(false); list.reload(); }} />}
      {acc && <Access test={acc} onClose={() => setAcc(null)} onChanged={list.reload} />}
      {res && <Results test={res} onClose={() => setRes(null)} />}
    </>
  );
}
