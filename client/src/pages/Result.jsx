import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAsync, useUI, useTitle, Spinner, ErrorBox, Chip, Progress, fmtDur, LETTERS } from '../ui.jsx';

export function Result() {
  const { id } = useParams(), { toast } = useUI();
  const r = useAsync(() => api(`/attempts/${id}/result`), [id]);
  const lb = useAsync(() => (r.data ? api(`/tests/${r.data.testId}/leaderboard`) : Promise.resolve(null)), [r.data?.testId]);
  const [filter, setFilter] = useState('all'), [bm, setBm] = useState({});
  useTitle(r.data ? r.data.title + ' · Result' : 'Result');
  const subjects = useMemo(() => {
    const m = new Map();
    for (const q of r.data?.review || []) {
      const k = q.subject || 'General', e = m.get(k) || { subject: k, correct: 0, wrong: 0, skipped: 0 };
      if (q.choice === null) e.skipped++; else if (q.correct) e.correct++; else e.wrong++; m.set(k, e);
    }
    return [...m.values()];
  }, [r.data]);
  if (r.loading && !r.data) return <Spinner />;
  if (r.error) return <ErrorBox message={r.error} onRetry={r.reload} />;
  const x = r.data, pctScore = x.maxMarks ? Math.round((x.score / x.maxMarks) * 100) : 0;
  const shown = x.review.filter(q => filter === 'all' || (filter === 'wrong' && q.choice !== null && !q.correct) || (filter === 'skipped' && q.choice === null) || (filter === 'correct' && q.correct) || (filter === 'marked' && q.marked));
  const isBm = q => bm[q.id] ?? q.bookmarked;
  const toggle = async q => { const on = !isBm(q); setBm(b => ({ ...b, [q.id]: on })); try { await api(`/questions/${q.id}/bookmark`, { method: on ? 'POST' : 'DELETE' }); } catch (e) { setBm(b => ({ ...b, [q.id]: !on })); toast(e.message, 'err'); } };

  return (
    <>
      <div className="print-brand"><img src="/logo.png" alt="Learnace – Learn with ACE" width={150} /></div>
      <div className="card hero"><div><span className="muted small">Result</span><h2 style={{ margin: '2px 0' }}>{x.title}</h2>
        <div className="big">{x.score}<span className="muted"> / {x.maxMarks}</span> <span className="badge info">{pctScore}%</span></div></div>
        <div className="row wrap">{x.rank && <span className="badge ok">Rank #{x.rank} of {x.participants}</span>}
          <button className="ghost" onClick={() => window.print()}>🖨 Print</button><Link className="btn" to={'/tests/' + x.testId}>Retake</Link></div></div>
      {x.late && <p className="card warn-t">Time ran out before submission, so your last auto-saved answers were evaluated.</p>}
      {x.tabSwitches > 0 && <p className="small warn-t">You left the test tab {x.tabSwitches} time(s).</p>}
      <div className="grid">{[['Correct', x.correct], ['Incorrect', x.wrong], ['Unattempted', x.skipped], ['Accuracy', x.accuracy + '%'], ['Time taken', fmtDur(x.timeTaken)]].map(([k, v]) =>
        <div className="card stat" key={k}><span className="muted small">{k}</span><b>{v}</b></div>)}</div>
      <div className="grid g2">
        <div className="card"><h3>By subject</h3>{subjects.map(s => { const t = s.correct + s.wrong + s.skipped, acc = s.correct + s.wrong ? Math.round((s.correct / (s.correct + s.wrong)) * 100) : 0;
          return <div className="subj" key={s.subject}><div className="between small"><span>{s.subject}</span><span className="muted">{s.correct}/{t} correct · {acc}%</span></div><Progress value={s.correct} max={t} kind={acc >= 70 ? 'ok' : acc >= 40 ? 'warn' : 'bad'} /></div>; })}
          {x.wrong > 0 && <Link to="/practice?mode=mistakes" className="btn ghost sm" style={{ marginTop: 8 }}>Practice mistakes</Link>}</div>
        <div className="card"><h3>Leaderboard</h3>{lb.data?.items?.length ? <table><tbody>{lb.data.items.slice(0, 8).map(l => <tr key={l.rank + l.name} className={l.isMe ? 'me' : ''}><td>{l.rank}</td><td>{l.name}{l.isMe && ' (you)'}</td><td>{l.score}</td></tr>)}</tbody></table> : <p className="muted">No data yet.</p>}</div>
      </div>
      <div className="row wrap seg noprint">{[['all', 'All'], ['wrong', 'Incorrect'], ['skipped', 'Unattempted'], ['correct', 'Correct'], ['marked', 'Marked']].map(([k, l]) => <Chip key={k} on={filter === k} onClick={() => setFilter(k)}>{l}</Chip>)}</div>
      {shown.map(q => { const n = x.review.indexOf(q) + 1; return (
        <div className="card q" key={q.id}>
          <div className="qmeta"><span className="muted small">Q{n}{q.subject ? ' · ' + q.subject : ''}</span>
            <span className="row">{q.marked && <span className="badge warn">Marked</span>}<span className={'badge ' + (q.choice === null ? '' : q.correct ? 'ok' : 'bad')}>{q.choice === null ? 'Skipped' : q.correct ? 'Correct' : 'Incorrect'}</span>
              <button className="ghost icon noprint" onClick={() => toggle(q)} aria-label="Bookmark">{isBm(q) ? '⭐' : '☆'}</button></span></div>
          <p className="qt">{q.text}</p>
          {q.options.map((o, k) => <div key={k} className={'opt static' + (k === q.answer ? ' ok' : k === q.choice ? ' bad' : ' dim')}><span className="lt">{LETTERS[k]}</span>{o}
            {k === q.choice && <em className="tag">your answer</em>}{k === q.answer && <em className="tag">correct</em>}</div>)}
          {q.explanation && <div className="explain"><b>Explanation</b><p>{q.explanation}</p></div>}
        </div>); })}
      {!shown.length && <p className="muted">Nothing in this filter.</p>}
    </>
  );
}
