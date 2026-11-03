import { useState } from 'react';
import { api, download } from '../api.js';
import { useAsync, useAuth, useUI, useTitle, Spinner, ErrorBox, Empty, Chip, fmtDur } from '../ui.jsx';

const PERIODS = [['all', 'All time'], ['month', 'Last 30 days'], ['week', 'Last 7 days']];
const MEDAL = ['🥇', '🥈', '🥉'];

/** Ranking board used by students (names only) and by admins (adds email + CSV export). */
export function Board({ path, admin = false }) {
  const { user } = useAuth(), { toast } = useUI();
  const [period, setPeriod] = useState('all');
  const d = useAsync(() => api(`${path}?period=${period}`), [path, period]);
  const items = d.data?.items || [], me = d.data?.me;
  const podium = items.slice(0, 3);
  return (
    <>
      <div className="row wrap seg between">
        <div className="row wrap">{PERIODS.map(([k, l]) => <Chip key={k} on={period === k} onClick={() => setPeriod(k)}>{l}</Chip>)}</div>
        {admin && <button className="ghost sm" onClick={() => download(`/admin/leaderboard?format=csv&period=${period}`, `leaderboard-${period}.csv`).catch(e => toast(e.message, 'err'))}>Export CSV</button>}
      </div>
      {!admin && (
        <div className="card me-card">
          {me ? <><span className="rank-big">#{me.rank}</span><div><b>Your rank</b><p className="muted small" style={{ margin: 0 }}>of {me.participants} · rating {me.rating} · {me.tests} test{me.tests === 1 ? '' : 's'} · {me.avgPct}% average</p></div></>
            : <div><b>You are not ranked yet</b><p className="muted small" style={{ margin: 0 }}>Submit a mock test {period === 'all' ? '' : 'in this period '}to join the leaderboard.</p></div>}
        </div>
      )}
      {d.loading && !d.data ? <Spinner /> : d.error ? <ErrorBox message={d.error} onRetry={d.reload} /> : !items.length ? <Empty icon="🏆" title="No rankings yet" hint="Rankings appear once students submit mock tests." /> : (
        <>
          <div className="podium" aria-label="Top three">
            {[1, 0, 2].map(i => podium[i] && (
              <div key={podium[i].id} className={'pod p' + (i + 1) + (!admin && podium[i].id === user.id ? ' me' : '')}>
                <span className="pod-medal">{MEDAL[i]}</span><b className="ellipsis">{podium[i].name}</b>
                <span className="pod-score">{podium[i].rating}</span><span className="muted small">{podium[i].avgPct}% avg · {podium[i].tests} test{podium[i].tests === 1 ? '' : 's'}</span>
              </div>))}
          </div>
          <div className="card table-wrap">
            <table>
              <thead><tr><th>#</th><th>Student</th><th title="Average % weighted by number of tests">Rating</th><th>Avg %</th><th>Tests</th><th>Accuracy</th><th>Time</th></tr></thead>
              <tbody>{items.map(x => (
                <tr key={x.id} className={!admin && x.id === user.id ? 'me' : ''}>
                  <td>{MEDAL[x.rank - 1] || x.rank}</td>
                  <td>{x.name}{!admin && x.id === user.id && ' (you)'}{admin && <><br /><span className="muted small">{x.email}</span></>}</td>
                  <td><b>{x.rating}</b></td><td>{x.avgPct}%</td><td>{x.tests}</td><td>{x.accuracy}%</td><td>{fmtDur(x.totalTime)}</td>
                </tr>))}</tbody>
            </table>
          </div>
        </>
      )}
      <p className="muted small">How ranking works: for every test, your best attempt counts. Your <b>average %</b> across tests is weighted by how many tests you have taken (<b>rating</b>), so steady performance beats a single lucky score.</p>
    </>
  );
}

export function Leaderboard() {
  useTitle('Leaderboard');
  return <><h2>Leaderboard</h2><Board path="/leaderboard" /></>;
}
