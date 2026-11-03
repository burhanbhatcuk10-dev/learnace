import { Link } from 'react-router-dom';
import { api, TZ } from '../api.js';
import { useAuth, useAsync, useTitle, Spinner, ErrorBox, Bars, Progress, Empty, Badge, fmtDate, shortDay, fmtINR } from '../ui.jsx';
import { Anchor, Ico, Pic, Rail, Slider, Ticker } from '../widgets.jsx';

// Shown when no admin banners are set for students.
const STUDENT_SLIDES = [
  { id: 'd1', theme: 'g1', title: "Take today's Daily 10", subtitle: 'Ten fresh questions every day keep your streak alive.', ctaLabel: 'Start Daily 10', linkUrl: '/practice?mode=daily' },
  { id: 'd2', theme: 'g2', title: 'Attempt a timed mock test', subtitle: 'Exam-style window, auto-saved answers, and a full review when you submit.', ctaLabel: 'Browse tests', linkUrl: '/tests' },
  { id: 'd3', theme: 'g3', title: 'Revise your mistakes', subtitle: 'Turn every wrong answer into a point on the next test.', ctaLabel: 'Open mistake notebook', linkUrl: '/practice?mode=mistakes' },
];
const THEMES = ['g1', 'g2', 'g3'];
const testState = t => { const n = Date.now(); if (t.startsAt && n < +new Date(t.startsAt)) return 'upcoming'; if (t.endsAt && n > +new Date(t.endsAt)) return 'closed'; return 'open'; };

export function Dashboard() {
  useTitle('Home');
  const { user } = useAuth();
  const st = useAsync(() => api('/me/stats?tz=' + encodeURIComponent(TZ)), []);
  const ca = useAsync(() => api('/current-affairs?limit=4'), []);
  const home = useAsync(() => api('/public/home?for=students'), []);
  const tests = useAsync(() => api('/tests'), []);
  const mats = useAsync(() => api('/materials'), []);
  if (st.loading && !st.data) return <Spinner />;
  if (st.error && !st.data) return <ErrorBox message={st.error} onRetry={st.reload} />;
  const s = st.data, goalPct = Math.min(100, Math.round((s.todayAnswered / (s.dailyGoal || 20)) * 100));
  const weak = s.subjects.filter(x => x.answered >= 3).sort((a, b) => a.accuracy - b.accuracy).slice(0, 3);
  const slides = home.data?.banners?.length ? home.data.banners.map((b, i) => ({ ...b, theme: THEMES[i % 3] })) : STUDENT_SLIDES;
  const openTests = (tests.data?.items || []).filter(t => testState(t) !== 'closed').slice(0, 8);
  return (
    <>
      <Ticker items={home.data?.announcements} />
      <Slider items={slides} label="Highlights" className="hero-slider compact" interval={6500} render={(b, k, on) => (
        <div className={'hs ' + (b.theme || 'g1')}>
          <Pic className="hs-img" src={b.imageUrl} w={1400} eager={k === 0} />
          <div className="hs-shade" /><img className="hs-mark" src="/mark.png" alt="" aria-hidden="true" />
          <div className="hs-body"><h2 className={on ? 'rise' : ''}>{b.title}</h2>{b.subtitle && <p className={on ? 'rise d1' : ''}>{b.subtitle}</p>}
            {b.linkUrl && <div className={on ? 'rise d2' : ''}><Anchor className="btn gold" to={b.linkUrl}>{b.ctaLabel || 'Open'} <Ico name="arrow" size={16} /></Anchor></div>}</div>
        </div>
      )} />
      <div className="hero card brand">
        <div><h2 style={{ margin: 0 }}>Welcome back, {user.name.split(' ')[0]} 👋</h2>
          <p className="muted" style={{ margin: '4px 0 0' }}>{user.targetExam ? `Preparing for ${user.targetExam}` : 'Set your target exam in Profile'}</p></div>
        <div className="row wrap">
          <span className="badge info">🔥 {s.streak}-day streak</span>
          <Link className="btn gold" to="/practice?mode=daily">Daily 10 →</Link>
        </div>
      </div>
      <div className="card">
        <div className="between"><b>Today's goal</b><span className="muted small">{s.todayAnswered} / {s.dailyGoal} questions</span></div>
        <Progress value={s.todayAnswered} max={s.dailyGoal} kind={goalPct >= 100 ? 'ok' : ''} />
        {goalPct >= 100 && <p className="small ok-t" style={{ margin: '8px 0 0' }}>Goal reached — great work!</p>}
      </div>
      <div className="grid">
        {[['Tests taken', s.attempts, 'clock'], ['Questions answered', s.questions, 'target'], ['Accuracy', s.accuracy + '%', 'check'], ['Avg test score', s.avgScorePct + '%', 'chart']].map(([k, v, ic]) =>
          <div className="card stat" key={k}><span className="stat-i"><Ico name={ic} size={18} /></span><span className="muted small">{k}</span><b>{v}</b></div>)}
      </div>
      <div className="grid g2">
        <Link to="/practice?mode=mistakes" className="card tile"><b>🔁 Revise mistakes</b><span className="muted small">{s.mistakes} question{s.mistakes === 1 ? '' : 's'} to fix</span></Link>
        <Link to="/practice?mode=bookmarked" className="card tile"><b>⭐ Saved questions</b><span className="muted small">{s.bookmarks} bookmarked</span></Link>
        <Link to="/tests" className="card tile"><b>📝 Mock tests</b><span className="muted small">Timed, with ranks</span></Link>
        <Link to="/leaderboard" className="card tile"><b>🏆 Leaderboard</b><span className="muted small">See how you rank against others</span></Link>
        <Link to="/practice?mode=unattempted" className="card tile"><b>✨ Something new</b><span className="muted small">Questions you haven't seen</span></Link>
      </div>
      {openTests.length > 0 && (
        <section className="rail-sec"><div className="between"><h3>Mock tests for you</h3><Link to="/tests" className="small">All tests →</Link></div>
          <Rail label="Mock tests">{openTests.map(t => { const st = testState(t); return (
            <Link key={t.id} to={t.openAttemptId ? `/tests/${t.id}/take` : '/tests/' + t.id} className="rcard test-card">
              <div className="row wrap"><Badge kind="info">{t.exam || 'Mock test'}</Badge>{t.premium && <Badge kind="warn">{t.unlocked ? '★ Premium' : '🔒 ' + (t.pricePaise ? fmtINR(t.pricePaise) : 'Premium')}</Badge>}{t.openAttemptId && t.unlocked && <Badge kind="warn">In progress</Badge>}{st === 'upcoming' && <Badge kind="warn">Upcoming</Badge>}{t.myAttempts > 0 && !t.openAttemptId && <Badge kind="ok">Best {t.myBest}</Badge>}</div>
              <b>{t.title}</b><span className="muted small">{t.questionCount} questions · {t.durationMin} min · {t.marksPerQ * t.questionCount} marks</span>
              <span className="rcard-cta">{!t.unlocked ? (t.pricePaise ? 'Unlock ' + fmtINR(t.pricePaise) : 'Details') : t.openAttemptId ? 'Resume' : t.myAttempts ? 'Retake' : st === 'upcoming' ? 'View details' : 'Start'} <Ico name="arrow" size={15} /></span>
            </Link>); })}</Rail></section>
      )}
      <div className="grid g2">
        <div className="card"><h3>Last 14 days</h3>
          <Bars data={s.activity.map(a => ({ label: shortDay(a.date), value: a.answered, sub: `${a.correct} correct` }))} />
        </div>
        <div className="card"><h3>Subject accuracy</h3>
          {s.subjects.length ? s.subjects.slice(0, 6).map(x => (
            <div key={x.subject} className="subj"><div className="between small"><span>{x.subject}</span><span className="muted">{x.accuracy}% · {x.answered}</span></div>
              <Progress value={x.accuracy} kind={x.accuracy >= 70 ? 'ok' : x.accuracy >= 40 ? 'warn' : 'bad'} /></div>))
            : <p className="muted">Answer a few questions to see your strengths.</p>}
          {weak.length > 0 && <p className="small muted" style={{ marginBottom: 0 }}>Focus on: {weak.map((w, i) => <span key={w.subject}>{i > 0 && ', '}<Link to={'/practice?subject=' + encodeURIComponent(w.subject)}>{w.subject}</Link></span>)}</p>}
        </div>
      </div>
      {mats.data?.items?.length > 0 && (
        <section className="rail-sec"><div className="between"><h3>Study library</h3><Link to="/library" className="small">View all →</Link></div>
          <Rail label="Study material">{mats.data.items.slice(0, 10).map(m => (
            <a key={m.id} href={m.url || '/library'} {...(m.url ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className="rcard mat-card">
              <div className="mat-cover"><Pic src={m.coverUrl} w={480} /><img className="mat-ph" src="/mark.png" alt="" aria-hidden="true" /></div>
              <b>{m.title}</b><span className="muted small">{m.category || 'Study material'}</span></a>))}</Rail></section>
      )}
      <div className="grid g2">
        <div className="card"><h3>Recent results</h3>
          {s.recent.length ? s.recent.map(a => <Link key={a.id} to={'/results/' + a.id} className="li"><span>{a.test}</span><span className="muted small">{a.score}/{a.marks} · {a.accuracy}%</span></Link>)
            : <Empty icon="📝" title="No tests yet" hint="Take a mock test to see results here."><Link className="btn" to="/tests">Browse tests</Link></Empty>}
        </div>
        <div className="card"><div className="between"><h3 style={{ margin: 0 }}>Current affairs</h3><Link to="/affairs" className="small">View all</Link></div>
          {ca.data?.items?.length ? ca.data.items.map(c => <Link key={c.id} to="/affairs" className="li col-li"><b>{c.title}</b><span className="muted small">{c.category} · {fmtDate(c.date)}</span></Link>)
            : <p className="muted">Nothing published yet.</p>}
        </div>
      </div>
    </>
  );
}
