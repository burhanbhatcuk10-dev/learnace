import { NavLink, Route, Routes, Navigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth, useAsync, useTitle, Spinner, ErrorBox, Bars, fmtDateTime } from '../ui.jsx';
import Questions from './Questions.jsx';
import AdminTests from './Tests.jsx';
import Content from './Content.jsx';
import Users from './Users.jsx';
import Media from './Media.jsx';
import Activity from './Activity.jsx';
import Settings from './Settings.jsx';
import Payments from './Payments.jsx';

function Overview() {
  useTitle('Admin');
  const s = useAsync(() => api('/admin/stats'), []);
  if (s.loading && !s.data) return <Spinner />;
  if (s.error) return <ErrorBox message={s.error} onRetry={s.reload} />;
  const d = s.data, day = x => x.date.slice(8);
  return (
    <>
      <div className="grid">{[['Students', d.students], ['Active (24h)', d.activeToday], ['Questions', d.questions], ['Tests', d.tests], ['Attempts', d.attempts], ['Avg score', d.avgScorePct + '%'], ['Articles', d.articles], ['Materials', d.materials]].map(([k, v]) =>
        <div className="card stat" key={k}><span className="muted small">{k}</span><b>{v}</b></div>)}</div>
      <div className="grid g2">
        <div className="card"><h3>New students (14 days)</h3><Bars data={d.signups.map(x => ({ label: day(x), value: x.n }))} color="var(--ok)" /></div>
        <div className="card"><h3>Tests submitted (14 days)</h3><Bars data={d.attemptsByDay.map(x => ({ label: day(x), value: x.n }))} /></div>
      </div>
      <div className="grid g2">
        <div className="card"><h3>Most-attempted tests</h3>{d.topTests.length ? d.topTests.map(t => <div className="li" key={t.id}><span>{t.title}</span><span className="muted small">{t.attempts} attempts · avg {t.avgPct}%</span></div>) : <p className="muted">No attempts yet.</p>}</div>
        <div className="card"><h3>Recent admin activity</h3>{d.log.length ? d.log.map(l => <div className="li col-li" key={l.id}><span className="small"><b>{l.who || 'System'}</b> {l.action} {l.entity}{l.entityId ? ' #' + l.entityId : ''}</span><span className="muted small">{l.detail ? l.detail + ' · ' : ''}{fmtDateTime(l.createdAt)}</span></div>) : <p className="muted">Nothing yet.</p>}</div>
      </div>
    </>
  );
}

export default function Admin() {
  const { user } = useAuth();
  return (
    <>
      <h2>Admin</h2>
      <nav className="subnav">
        <NavLink to="/admin" end>Overview</NavLink><NavLink to="/admin/activity">Activity</NavLink><NavLink to="/admin/questions">Questions</NavLink><NavLink to="/admin/tests">Tests</NavLink><NavLink to="/admin/payments">Payments</NavLink>
        <NavLink to="/admin/content">Site & content</NavLink><NavLink to="/admin/media">Media</NavLink><NavLink to="/admin/settings">Settings</NavLink><NavLink to="/admin/users">Users</NavLink>
      </nav>
      <Routes>
        <Route index element={<Overview />} />
        <Route path="activity" element={<Activity />} />
        <Route path="questions" element={<Questions />} />
        <Route path="tests" element={<AdminTests />} />
        <Route path="content" element={<Content />} />
        <Route path="media" element={<Media />} />
        <Route path="settings" element={<Settings />} />
        <Route path="payments" element={<Payments />} />
        <Route path="users" element={<Users me={user} />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </>
  );
}
