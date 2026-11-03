import { useRef, useState } from 'react';
import { api, download, saveBlob } from '../api.js';
import { useAsync, useDebounced, useUI, useTitle, Modal, Pager, Spinner, ErrorBox, Empty, Badge, LETTERS } from '../ui.jsx';
import { questionsFromCSV, CSV_TEMPLATE } from '../csv.js';

const blank = { text: '', options: ['', '', '', ''], answer: 0, explanation: '', subject: '', topic: '', exam: '', year: '', source: '', difficulty: 'moderate', published: true };

function QuestionForm({ initial, onClose, onSaved }) {
  const { toast } = useUI();
  const [f, setF] = useState({ ...blank, ...initial, options: initial?.options || blank.options, year: initial?.year ?? '' });
  const [busy, setBusy] = useState(false);
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const save = async e => {
    e.preventDefault(); setBusy(true);
    try {
      const body = { ...f, answer: +f.answer, year: f.year === '' ? null : +f.year };
      initial?.id ? await api('/admin/questions/' + initial.id, { method: 'PUT', body }) : await api('/admin/questions', { method: 'POST', body });
      toast('Question saved'); onSaved();
    } catch (x) { toast(x.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <Modal title={initial?.id ? 'Edit question' : 'Add question'} onClose={onClose} wide footer={<><button className="ghost" onClick={onClose}>Cancel</button><button form="qform" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></>}>
      <form id="qform" onSubmit={save}>
        <label className="field">Question<textarea required rows={3} value={f.text} onChange={set('text')} /></label>
        {f.options.map((o, i) => <div className="row opt-row" key={i}><label className="check"><input type="radio" name="ans" checked={+f.answer === i} onChange={() => setF({ ...f, answer: i })} /> {LETTERS[i]}</label>
          <input required placeholder={`Option ${LETTERS[i]}`} value={o} onChange={e => setF({ ...f, options: f.options.map((x, k) => (k === i ? e.target.value : x)) })} /></div>)}
        <p className="muted small">Select the radio button next to the correct option.</p>
        <label className="field">Explanation<textarea rows={2} value={f.explanation || ''} onChange={set('explanation')} /></label>
        <div className="form-grid">
          <label className="field">Subject<input value={f.subject || ''} onChange={set('subject')} /></label><label className="field">Topic<input value={f.topic || ''} onChange={set('topic')} /></label>
          <label className="field">Exam<input value={f.exam || ''} onChange={set('exam')} /></label><label className="field">Year<input type="number" value={f.year} onChange={set('year')} /></label>
          <label className="field">Source<input value={f.source || ''} onChange={set('source')} /></label>
          <label className="field">Difficulty<select value={f.difficulty} onChange={set('difficulty')}><option>easy</option><option>moderate</option><option>difficult</option></select></label>
        </div>
        <label className="check"><input type="checkbox" checked={f.published} onChange={e => setF({ ...f, published: e.target.checked })} /> Published (visible to students)</label>
      </form>
    </Modal>
  );
}

function ImportModal({ onClose, onDone }) {
  const { toast } = useUI(), file = useRef();
  const [p, setP] = useState(null), [busy, setBusy] = useState(false), [result, setResult] = useState(null);
  const read = async e => {
    const fl = e.target.files[0]; if (!fl) return;
    const text = await fl.text();
    try {
      if (/\.json$/i.test(fl.name)) { const j = JSON.parse(text); setP({ items: Array.isArray(j) ? j : j.questions || [], errors: [] }); }
      else setP(questionsFromCSV(text));
    } catch { setP({ items: [], errors: ['Could not read that file. Use the CSV template.'] }); }
  };
  const run = async () => {
    setBusy(true);
    try {
      const tot = { inserted: 0, duplicates: 0, invalidCount: 0, invalid: [] };
      for (let i = 0; i < p.items.length; i += 500) {
        const r = await api('/admin/questions/bulk', { method: 'POST', body: { questions: p.items.slice(i, i + 500) } });
        tot.inserted += r.inserted; tot.duplicates += r.duplicates; tot.invalidCount += r.invalidCount; tot.invalid.push(...r.invalid);
      }
      setResult(tot); onDone();
    } catch (x) { toast(x.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <Modal title="Import questions" onClose={onClose} footer={result ? <button onClick={onClose}>Done</button> : <><button className="ghost" onClick={onClose}>Cancel</button><button disabled={!p?.items.length || busy} onClick={run}>{busy ? 'Importing…' : `Import ${p?.items.length || 0} questions`}</button></>}>
      {result ? <><p><b>{result.inserted}</b> added · {result.duplicates} duplicates skipped · {result.invalidCount} invalid</p>{result.invalid.map(x => <p className="err small" key={x.row}>Row {x.row}: {x.error}</p>)}</> : <>
        <p className="muted small">Upload a CSV (or JSON). Answer column accepts A–D. Duplicate questions are skipped automatically.</p>
        <div className="row wrap"><input ref={file} type="file" accept=".csv,.json,text/csv,application/json" onChange={read} />
          <button className="ghost sm" onClick={() => saveBlob(new Blob([CSV_TEMPLATE], { type: 'text/csv' }), 'questions-template.csv')}>Download template</button></div>
        {p && <><p>{p.items.length} valid question(s) found.</p>{p.errors.slice(0, 8).map((e, i) => <p className="err small" key={i}>{e}</p>)}{p.errors.length > 8 && <p className="muted small">…and {p.errors.length - 8} more problems.</p>}</>}</>}
    </Modal>
  );
}

export default function Questions() {
  useTitle('Admin · Questions');
  const { toast, confirm } = useUI();
  const [f, setF] = useState({ search: '', subject: '', difficulty: '', published: '' }), [page, setPage] = useState(1), [edit, setEdit] = useState(null), [imp, setImp] = useState(false);
  const dq = useDebounced(f.search);
  const list = useAsync(() => api('/admin/questions?' + new URLSearchParams({ page, limit: 20, ...(dq && { search: dq }), ...(f.subject && { subject: f.subject }), ...(f.difficulty && { difficulty: f.difficulty }), ...(f.published && { published: f.published }) })), [page, dq, f.subject, f.difficulty, f.published]);
  const set = (k, v) => { setPage(1); setF(x => ({ ...x, [k]: v })); };
  const del = async q => { if (await confirm('Delete this question permanently? It is removed from practice and tests.', { danger: true, okLabel: 'Delete' })) { try { await api('/admin/questions/' + q.id, { method: 'DELETE' }); toast('Deleted'); list.reload(); } catch (e) { toast(e.message, 'err'); } } };
  const toggle = async q => { try { await api('/admin/questions/' + q.id, { method: 'PUT', body: { published: !q.published } }); list.reload(); } catch (e) { toast(e.message, 'err'); } };
  return (
    <>
      <div className="row wrap toolbar">
        <input placeholder="Search text or topic…" value={f.search} onChange={e => set('search', e.target.value)} />
        <input placeholder="Subject" value={f.subject} onChange={e => set('subject', e.target.value)} />
        <select value={f.difficulty} onChange={e => set('difficulty', e.target.value)}><option value="">Any difficulty</option><option>easy</option><option>moderate</option><option>difficult</option></select>
        <select value={f.published} onChange={e => set('published', e.target.value)}><option value="">All</option><option value="true">Published</option><option value="false">Hidden</option></select>
        <button onClick={() => setEdit({})}>+ Add</button><button className="ghost" onClick={() => setImp(true)}>Import</button>
        <button className="ghost" onClick={() => download('/admin/questions/export.csv', 'questions.csv').catch(e => toast(e.message, 'err'))}>Export</button>
      </div>
      {list.loading && !list.data ? <Spinner /> : list.error ? <ErrorBox message={list.error} onRetry={list.reload} /> : !list.data.items.length ? <Empty icon="❓" title="No questions match" hint="Add one or import a CSV." /> : (
        <div className="card table-wrap"><table><thead><tr><th>#</th><th>Question</th><th>Subject</th><th>Level</th><th>Ans</th><th>Status</th><th /></tr></thead><tbody>
          {list.data.items.map(q => <tr key={q.id}><td>{q.id}</td><td className="wide-td">{q.text.length > 110 ? q.text.slice(0, 110) + '…' : q.text}</td><td>{q.subject || '–'}</td><td>{q.difficulty}</td><td>{LETTERS[q.answer]}</td>
            <td><button className="linklike" onClick={() => toggle(q)} title="Click to toggle"><Badge kind={q.published ? 'ok' : ''}>{q.published ? 'Live' : 'Hidden'}</Badge></button></td>
            <td className="nowrap"><button className="ghost sm" onClick={() => setEdit(q)}>Edit</button> <button className="ghost sm danger-t" onClick={() => del(q)}>Delete</button></td></tr>)}
        </tbody></table></div>)}
      {list.data && <><p className="muted small center-x">{list.data.total} questions</p><Pager page={page} pages={list.data.pages} onPage={setPage} /></>}
      {edit && <QuestionForm initial={edit.id ? edit : null} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); list.reload(); }} />}
      {imp && <ImportModal onClose={() => setImp(false)} onDone={list.reload} />}
    </>
  );
}
