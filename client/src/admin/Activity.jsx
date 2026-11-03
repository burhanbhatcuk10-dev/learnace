import { useState } from 'react';
import { api } from '../api.js';
import { useAsync, useInterval, useTitle, Modal, Spinner, ErrorBox, Bars, Progress, Badge, fmtDate, fmtDateTime, fmtDur, shortDay } from '../ui.jsx';
import { Board } from '../pages/Leaderboard.jsx';

const device = ua => !ua ? '–' : `${/Mobi|Android|iPhone/i.test(ua) ? 'Mobile' : 'Desktop'} · ${/Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser'}`;
const ago = d => { if (!d) return 'Never'; const m = Math.round((Date.now() - new Date(d)) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : fmtDate(d); };

/** Detailed view of one person's activity (opened from Users and Activity). */
export function UserActivity({ id, onClose }) {
  const a = useAsync(() => api(`/admin/users/${id}/activity`), [id]);
  const d = a.data;
  return (
    <Modal title={d ? d.user.name : 'Student activity'} wide onClose={onClose} footer={<button onClick={onClose}>Close</button>}>
      {a.loading && !d ? <Spinner /> : a.error ? <ErrorBox message={a.error} onRetry={a.reload} /> : (
        <>
          <p className="muted small" style={{ marginTop: 0 }}>{d.user.email}{d.user.phone ? ' · ' + d.user.phone : ''}{d.user.targetExam ? ' · Target: ' + d.user.targetExam : ''} · Joined {fmtDate(d.user.createdAt)}
            {' '}<Badge kind={d.user.active ? 'ok' : 'bad'}>{d.user.active ? 'Active' : 'Disabled'}</Badge></p>
          <div className="grid">{[
            ['Rank', d.rank ? `#${d.rank.rank} of ${d.rank.of}` : 'Not ranked'], ['Tests taken', d.tests.n], ['Average score', d.tests.avgPct + '%'], ['Best score', d.tests.bestPct + '%'],
            ['Questions answered', d.practice.answered], ['Practice accuracy', d.practice.accuracy + '%'], ['Active days (30d)', d.practice.activeDays30], ['Tab switches in tests', d.tests.tabSwitches],
          ].map(([k, v]) => <div className="card stat" key={k}><span className="muted small">{k}</span><b style={{ fontSize: '1.35rem' }}>{v}</b></div>)}</div>
          <p className="small muted">Last login: {d.user.lastLoginAt ? fmtDateTime(d.user.lastLoginAt) : 'Never'} · Last seen: {ago(d.sessions.lastSeen)} · Signed-in devices: {d.sessions.active} · Last device: {device(d.sessions.device)} · Last practice: {ago(d.practice.lastAt)}</p>
          <div className="grid g2">
            <div className="card"><h4 style={{ marginTop: 0 }}>Practice (14 days)</h4><Bars data={d.activity.map(x => ({ label: shortDay(x.date), value: x.answered, sub: `${x.correct} correct` }))} height={90} /></div>
            <div className="card"><h4 style={{ marginTop: 0 }}>Subject accuracy</h4>{d.subjects.length ? d.subjects.map(x => <div className="subj" key={x.subject}><div className="between small"><span>{x.subject}</span><span className="muted">{x.accuracy}% · {x.answered}</span></div><Progress value={x.accuracy} kind={x.accuracy >= 70 ? 'ok' : x.accuracy >= 40 ? 'warn' : 'bad'} /></div>) : <p className="muted small">No practice yet.</p>}</div>
          </div>
          <h4>Tests</h4>
          {d.recent.length ? <div className="card table-wrap"><table><thead><tr><th>Test</th><th>Score</th><th>Correct / wrong</th><th>Time</th><th>Tab sw.</th><th>When</th></tr></thead><tbody>
            {d.recent.map(r => <tr key={r.id}><td>{r.test}</td>
              <td>{r.status === 'started' ? <Badge kind="warn">In progress</Badge> : <>{r.score}/{r.maxMarks}{r.late && ' ⚠'}</>}</td>
              <td>{r.status === 'started' ? '–' : `${r.correct} / ${r.wrong}`}</td><td>{r.status === 'started' ? '–' : fmtDur(r.timeTaken)}</td><td>{r.tabSwitches}</td><td>{fmtDateTime(r.at)}</td></tr>)}</tbody></table></div>
            : <p className="muted">No tests attempted yet.</p>}
        </>
      )}
    </Modal>
  );
}

export default function Activity() {
  useTitle('Admin · Activity');
  const a = useAsync(() => api('/admin/activity'), []);
  const [view, setView] = useState(null);
  useInterval(() => a.reload(), 30000);
  if (a.loading && !a.data) return <Spinner />;
  if (a.error && !a.data) return <ErrorBox message={a.error} onRetry={a.reload} />;
  const d = a.data, who = (id, name) => <button className="linklike link" onClick={() => setView(id)}>{name}</button>;
  return (
    <>
      <p className="muted small">Live view — refreshes every 30 seconds. Click a student's name for their full activity.</p>
      <div className="grid">{[['Online now', d.onlineNow], ['Taking a test', d.inProgress.length], ['Tests submitted (24h)', d.last24h.submissions], ['Practising (24h)', d.last24h.practisers], ['New sign-ups (24h)', d.last24h.signups]].map(([k, v]) =>
        <div className="card stat" key={k}><span className="muted small">{k}</span><b>{v}</b></div>)}</div>

      <h3>Taking a test right now</h3>
      {d.inProgress.length ? <div className="card table-wrap"><table><thead><tr><th>Student</th><th>Test</th><th>Answered</th><th>Time left</th><th>Tab switches</th></tr></thead><tbody>
        {d.inProgress.map(x => <tr key={x.id}><td>{who(x.userId, x.name)}</td><td>{x.test}</td><td>{x.answered}/{x.total}</td><td>{fmtDur(x.remainingSec)}</td><td>{x.tabSwitches > 2 ? <Badge kind="bad">{x.tabSwitches}</Badge> : x.tabSwitches}</td></tr>)}</tbody></table></div>
        : <p className="muted">Nobody is in a test at the moment.</p>}

      <h3>Recent submissions</h3>
      {d.submissions.length ? <div className="card table-wrap"><table><thead><tr><th>Student</th><th>Test</th><th>Score</th><th>Time</th><th>Tab sw.</th><th>When</th></tr></thead><tbody>
        {d.submissions.map(x => <tr key={x.id}><td>{who(x.userId, x.name)}</td><td>{x.test}</td><td>{x.score}/{x.maxMarks} <Badge kind={x.pct >= 70 ? 'ok' : x.pct >= 40 ? 'warn' : 'bad'}>{x.pct}%</Badge>{x.late && ' ⚠'}</td><td>{fmtDur(x.timeTaken)}</td><td>{x.tabSwitches}</td><td>{ago(x.submittedAt)}</td></tr>)}</tbody></table></div>
        : <p className="muted">No submissions yet.</p>}

      <div className="grid g2">
        <div className="card"><h3 style={{ marginTop: 0 }}>Recent logins</h3>{d.logins.length ? d.logins.map(x => <div className="li" key={x.id}>{who(x.id, x.name)}<span className="muted small">{ago(x.lastLoginAt)}</span></div>) : <p className="muted">None yet.</p>}</div>
        <div className="card"><h3 style={{ marginTop: 0 }}>New students</h3>{d.signups.length ? d.signups.map(x => <div className="li" key={x.id}>{who(x.id, x.name)}<span className="muted small">{ago(x.createdAt)}</span></div>) : <p className="muted">None yet.</p>}</div>
      </div>

      <h3>Leaderboard</h3>
      <Board path="/admin/leaderboard" admin />
      {view && <UserActivity id={view} onClose={() => setView(null)} />}
    </>
  );
}
