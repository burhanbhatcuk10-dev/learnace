import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, TZ } from '../api.js';
import { useAsync, useUI, useTitle, useDebounced, Spinner, Empty, Chip, Progress, LETTERS } from '../ui.jsx';

const MODES = [['random', 'Random'], ['unattempted', 'New for me'], ['mistakes', 'My mistakes'], ['bookmarked', 'Saved'], ['daily', 'Daily 10']];

export function Practice() {
  useTitle('Practice');
  const { toast } = useUI();
  const [sp] = useSearchParams();
  const meta = useAsync(() => api('/meta/filters'), []);
  const [f, setF] = useState({ mode: MODES.some(m => m[0] === sp.get('mode')) ? sp.get('mode') : 'random', subject: sp.get('subject') || '', topic: '', exam: '', difficulty: '', search: '', count: 10 });
  const search = useDebounced(f.search, 400);
  const [items, setItems] = useState([]), [res, setRes] = useState({}), [loading, setLoading] = useState(true), [page, setPage] = useState(1), [more, setMore] = useState(false);

  const load = useCallback(async (p = 1) => {
    setLoading(true); setRes({});
    try {
      if (f.mode === 'daily') { const d = await api('/practice/daily?tz=' + encodeURIComponent(TZ)); setItems(d.items); setMore(false); }
      else {
        const q = new URLSearchParams({ limit: f.count, mode: f.mode, page: p });
        if (f.mode === 'random' || f.mode === 'unattempted') q.set('random', '1');
        for (const k of ['subject', 'topic', 'exam', 'difficulty']) if (f[k]) q.set(k, f[k]);
        if (search) q.set('search', search);
        const d = await api('/questions?' + q); setItems(d.items); setMore(d.hasMore);
      }
      setPage(p); window.scrollTo({ top: 0 });
    } catch (e) { toast(e.message, 'err'); } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.mode, f.subject, f.topic, f.exam, f.difficulty, f.count, search]);
  useEffect(() => { load(1); }, [load]);

  const topics = useMemo(() => meta.data?.subjects.find(s => s.name === f.subject)?.topics || [], [meta.data, f.subject]);
  const set = (k, v) => setF(x => ({ ...x, [k]: v, ...(k === 'subject' ? { topic: '' } : {}) }));

  const pick = async (q, i) => {
    if (res[q.id]) return;
    try { const r = await api(`/questions/${q.id}/check`, { method: 'POST', body: { choice: i, mode: f.mode === 'daily' ? 'daily' : f.mode === 'mistakes' || f.mode === 'bookmarked' ? 'revision' : 'practice' } }); setRes(x => ({ ...x, [q.id]: { ...r, i } })); }
    catch (e) { toast(e.message, 'err'); }
  };
  const mark = async q => {
    const on = !q.bookmarked;
    setItems(xs => xs.map(x => (x.id === q.id ? { ...x, bookmarked: on } : x)));
    try { await api(`/questions/${q.id}/bookmark`, { method: on ? 'POST' : 'DELETE' }); } catch (e) { toast(e.message, 'err'); setItems(xs => xs.map(x => (x.id === q.id ? { ...x, bookmarked: !on } : x))); }
  };
  const answered = Object.keys(res).length, correct = Object.values(res).filter(r => r.correct).length, done = items.length > 0 && answered === items.length;
  const paged = f.mode === 'mistakes' || f.mode === 'bookmarked';

  return (
    <>
      <h2>Practice</h2>
      <div className="row wrap seg">{MODES.map(([k, l]) => <Chip key={k} on={f.mode === k} onClick={() => set('mode', k)}>{l}</Chip>)}</div>
      {f.mode !== 'daily' && (
        <div className="card filters">
          <select value={f.exam} onChange={e => set('exam', e.target.value)}><option value="">All exams</option>{meta.data?.exams.map(x => <option key={x}>{x}</option>)}</select>
          <select value={f.subject} onChange={e => set('subject', e.target.value)}><option value="">All subjects</option>{meta.data?.subjects.map(s => <option key={s.name} value={s.name}>{s.name} ({s.count})</option>)}</select>
          <select value={f.topic} onChange={e => set('topic', e.target.value)} disabled={!topics.length}><option value="">All topics</option>{topics.map(t => <option key={t}>{t}</option>)}</select>
          <select value={f.difficulty} onChange={e => set('difficulty', e.target.value)}><option value="">Any difficulty</option><option>easy</option><option>moderate</option><option>difficult</option></select>
          <input placeholder="Search questions…" value={f.search} onChange={e => set('search', e.target.value)} />
          <select value={f.count} onChange={e => set('count', +e.target.value)}>{[5, 10, 20, 30].map(n => <option key={n} value={n}>{n} per set</option>)}</select>
        </div>
      )}
      {f.mode === 'daily' && <p className="muted">Same 10 questions for everyone today — come back tomorrow to keep your streak.</p>}
      {answered > 0 && <div className="card sticky-prog"><div className="between small"><span>{answered}/{items.length} answered</span><span>{correct} correct</span></div><Progress value={answered} max={items.length} /></div>}
      {loading ? <Spinner /> : !items.length ? (
        <Empty icon={f.mode === 'bookmarked' ? '⭐' : f.mode === 'mistakes' ? '🎉' : '🔎'} title={f.mode === 'mistakes' ? 'No mistakes to revise' : f.mode === 'bookmarked' ? 'Nothing saved yet' : 'No questions found'}
          hint={f.mode === 'mistakes' ? 'Questions you get wrong will show up here.' : f.mode === 'bookmarked' ? 'Tap ☆ on a question to save it.' : 'Try changing the filters.'} />
      ) : items.map((q, n) => {
        const r = res[q.id];
        return (
          <div className="card q" key={q.id}>
            <div className="qmeta"><span className="muted small">{[q.subject, q.topic, q.exam, q.year].filter(Boolean).join(' · ')}</span>
              <span className="row"><span className={'badge ' + (q.difficulty === 'easy' ? 'ok' : q.difficulty === 'difficult' ? 'bad' : 'warn')}>{q.difficulty}</span>
                <button className="ghost icon" onClick={() => mark(q)} aria-label={q.bookmarked ? 'Remove bookmark' : 'Bookmark'} title="Save for later">{q.bookmarked ? '⭐' : '☆'}</button></span></div>
            <p className="qt"><b>{n + 1}.</b> {q.text}</p>
            {q.options.map((o, i) => <button key={i} className={'opt' + (r ? (i === r.answer ? ' ok' : i === r.i ? ' bad' : ' dim') : '')} disabled={!!r} onClick={() => pick(q, i)}><span className="lt">{LETTERS[i]}</span>{o}</button>)}
            {r && <div className={'explain ' + (r.correct ? 'ok' : 'bad')}><b>{r.correct ? '✓ Correct' : `✗ Incorrect — answer is ${LETTERS[r.answer]}`}</b>{r.explanation && <p>{r.explanation}</p>}</div>}
          </div>
        );
      })}
      {done && (
        <div className="card center-x"><h3>Set complete: {correct}/{items.length} ({Math.round((correct / items.length) * 100)}%)</h3>
          <div className="row center-x">{paged && page > 1 && <button className="ghost" onClick={() => load(page - 1)}>Previous set</button>}
            {(!paged || more) && f.mode !== 'daily' && <button onClick={() => load(paged ? page + 1 : 1)}>Next set →</button>}</div></div>
      )}
    </>
  );
}
