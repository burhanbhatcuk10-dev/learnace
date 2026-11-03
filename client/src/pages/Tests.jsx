import { Link, useNavigate, useParams } from 'react-router-dom';
import { useState } from 'react';
import { api } from '../api.js';
import { useAsync, useTitle, Spinner, ErrorBox, Empty, Chip, Badge, fmtDateTime, fmtDate, fmtDur, fmtINR } from '../ui.jsx';
import { Unlock } from './Unlock.jsx';

const status = t => { const n = Date.now(); if (t.startsAt && n < +new Date(t.startsAt)) return 'upcoming'; if (t.endsAt && n > +new Date(t.endsAt)) return 'closed'; return 'open'; };
const attemptsLeft = t => (t.maxAttempts ? Math.max(0, t.maxAttempts - t.myAttempts) : Infinity);

export function Tests() {
  useTitle('Tests');
  const [tab, setTab] = useState('available');
  const list = useAsync(() => api('/tests'), []);
  const hist = useAsync(() => api('/attempts'), []);
  return (
    <>
      <h2>Test series</h2>
      <div className="row seg"><Chip on={tab === 'available'} onClick={() => setTab('available')}>Available</Chip><Chip on={tab === 'history'} onClick={() => setTab('history')}>My attempts</Chip></div>
      {tab === 'available' ? (list.loading && !list.data ? <Spinner /> : list.error ? <ErrorBox message={list.error} onRetry={list.reload} /> :
        !list.data.items.length ? <Empty icon="📝" title="No tests available yet" hint="Check back soon." /> :
        list.data.items.map(t => {
          const s = status(t), left = attemptsLeft(t), locked = t.premium && !t.unlocked;
          return (
            <div className="card test" key={t.id}>
              <div className="grow"><div className="row wrap"><b>{t.title}</b>
                {t.premium && <Badge kind="warn">{t.unlocked ? '★ Premium' : '🔒 ' + (t.pricePaise ? fmtINR(t.pricePaise) : 'Premium')}</Badge>}{t.openAttemptId && !locked && <Badge kind="warn">In progress</Badge>}{s === 'upcoming' && <Badge kind="info">Opens {fmtDateTime(t.startsAt)}</Badge>}{s === 'closed' && <Badge kind="bad">Closed</Badge>}</div>
                <p className="muted small" style={{ margin: '4px 0' }}>{[t.exam, `${t.questionCount} questions`, `${t.durationMin} min`, `${t.marksPerQ * t.questionCount} marks`, t.negative ? `−${t.negative} negative` : 'no negative'].filter(Boolean).join(' · ')}</p>
                {t.myAttempts > 0 && <p className="small" style={{ margin: 0 }}>Best score: <b>{t.myBest}</b> · {t.myAttempts} attempt{t.myAttempts > 1 ? 's' : ''}{t.maxAttempts ? ` of ${t.maxAttempts}` : ''}</p>}
              </div>
              <div className="row wrap">
                {t.lastAttemptId && <Link className="btn ghost" to={'/results/' + t.lastAttemptId}>Last result</Link>}
                {locked ? <Link className="btn gold" to={'/tests/' + t.id}>{t.pricePaise ? 'Unlock ' + fmtINR(t.pricePaise) : 'Details'}</Link>
                  : t.openAttemptId ? <Link className="btn" to={`/tests/${t.id}/take`}>Resume</Link>
                  : s === 'open' && left > 0 ? <Link className="btn" to={'/tests/' + t.id}>{t.myAttempts ? 'Retake' : 'Start'}</Link>
                  : <Link className="btn ghost" to={'/tests/' + t.id}>Details</Link>}
              </div>
            </div>
          );
        })) : (hist.loading && !hist.data ? <Spinner /> : !hist.data?.items.length ? <Empty icon="📊" title="No attempts yet" hint="Your finished tests appear here." /> :
        <div className="card table-wrap"><table><thead><tr><th>Test</th><th>Date</th><th>Score</th><th>Accuracy</th><th>Time</th><th /></tr></thead><tbody>
          {hist.data.items.map(a => <tr key={a.id}><td>{a.test}</td><td>{fmtDate(a.submittedAt)}</td><td>{a.score}/{a.maxMarks}</td><td>{a.accuracy}%</td><td>{fmtDur(a.timeTaken)}</td><td><Link to={'/results/' + a.id}>Review</Link></td></tr>)}
        </tbody></table></div>)}
    </>
  );
}

export function TestIntro() {
  const { id } = useParams(), nav = useNavigate();
  const t = useAsync(() => api('/tests/' + id), [id]);
  const lb = useAsync(() => api(`/tests/${id}/leaderboard`), [id]);
  useTitle(t.data?.title || 'Test');
  if (t.loading && !t.data) return <Spinner />;
  if (t.error) return <ErrorBox message={t.error} onRetry={t.reload} />;
  const x = t.data, s = status(x), locked = x.premium && !x.unlocked, canStart = !locked && (x.openAttemptId || (s === 'open' && attemptsLeft(x) > 0));
  return (
    <>
      <Link to="/tests" className="small">← All tests</Link>
      <div className="card"><h2 style={{ marginTop: 0 }}>{x.title}</h2>
        {x.description && <p className="muted">{x.description}</p>}
        <div className="grid">{[['Questions', x.questionCount], ['Duration', x.durationMin + ' min'], ['Total marks', x.marksPerQ * x.questionCount], ['Negative', x.negative ? '−' + x.negative : 'None']].map(([k, v]) =>
          <div className="stat" key={k}><span className="muted small">{k}</span><b>{v}</b></div>)}</div>
        {locked && <Unlock test={x} onUnlocked={t.reload} />}
        <h3>Instructions</h3>
        <ul className="ins">
          <li>You have <b>{x.durationMin} minutes</b>. The timer starts when you press Start, runs on the server, and the test is submitted automatically when time is up.</li>
          <li>Correct answers and explanations are <b>not shown during the test</b>. You will see your score, rank and full review right after you submit.</li>
          {x.endsAt && <li>This test closes on {fmtDateTime(x.endsAt)}. Start before then.</li>}
          <li>Your answers are saved automatically. If you lose connection, just reopen the test and click Resume.</li>
          <li>Shortcuts: <kbd>1</kbd>–<kbd>4</kbd> or <kbd>A</kbd>–<kbd>D</kbd> to answer, <kbd>N</kbd>/<kbd>P</kbd> next/previous, <kbd>M</kbd> mark for review, <kbd>C</kbd> clear.</li>
          <li>Switching tabs is recorded and shown on your result.</li>
          {x.maxAttempts && <li>You may attempt this test {x.maxAttempts} time(s). Used: {x.myAttempts}.</li>}
          {x.instructions && <li>{x.instructions}</li>}
        </ul>
        {s === 'upcoming' && <p className="err">This test opens on {fmtDateTime(x.startsAt)}.</p>}
        {s === 'closed' && !x.openAttemptId && <p className="err">This test has closed.</p>}
        <button disabled={!canStart} onClick={() => nav(`/tests/${id}/take`)}>{locked ? '🔒 Locked' : x.openAttemptId ? 'Resume test' : 'Start test'}</button>
      </div>
      <div className="card"><h3>Leaderboard</h3>
        {lb.data?.items.length ? <table><thead><tr><th>#</th><th>Name</th><th>Score</th><th>Time</th></tr></thead><tbody>
          {lb.data.items.slice(0, 10).map(r => <tr key={r.rank + r.name} className={r.isMe ? 'me' : ''}><td>{r.rank}</td><td>{r.name}{r.isMe && ' (you)'}</td><td>{r.score}</td><td>{fmtDur(r.timeTaken)}</td></tr>)}
        </tbody></table> : <p className="muted">No one has finished this test yet — be the first!</p>}
        {lb.data?.me && lb.data.me.rank > 10 && <p className="small">Your rank: <b>#{lb.data.me.rank}</b> of {lb.data.participants}</p>}
      </div>
    </>
  );
}
