// Public front page (shown to visitors who are not signed in).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAsync, useTitle, fmtDate, fmtINR } from '../ui.jsx';
import { Anchor, BackToTop, Counter, Footer, Ico, Logo, Pic, Rail, Reveal, Slider, Ticker, useScrolled } from '../widgets.jsx';

// Real, verified Unsplash photo (free under the Unsplash License). Used only when an admin hasn't uploaded banners.
const HERO_PHOTO = 'https://images.unsplash.com/photo-1762512346988-045f4d5ad2b3';

const DEFAULT_SLIDES = [
  { id: 'd1', theme: 'g1', imageUrl: HERO_PHOTO, credit: 'Photo: Jaykumar Bherwani / Unsplash', title: 'Prepare smarter for JKSSB, JKPSC, SSC & UPSC',
    subtitle: 'Topic-wise practice, timed mock tests and daily current affairs — all in one place.', ctaLabel: 'Start preparing', linkUrl: '/register' },
  { id: 'd2', theme: 'g2', title: 'Mock tests that feel like the real exam',
    subtitle: 'Server-timed and auto-saved, with a question palette, ranks and a full review once you submit.', ctaLabel: 'Create your account', linkUrl: '/register' },
  { id: 'd3', theme: 'g3', title: 'Fix your weak spots, one mistake at a time',
    subtitle: 'Your mistake notebook and subject-wise accuracy show exactly what to revise next.', ctaLabel: 'Sign in', linkUrl: '/login' },
];
const THEMES = ['g1', 'g2', 'g3'];

const FEATURES = [
  ['target', 'Topic-wise MCQ practice', 'Filter by exam, subject, topic and difficulty. Get instant explanations as you practise.'],
  ['clock', 'Timed mock tests', 'An exam-style window with a question palette, mark-for-review and keyboard shortcuts.'],
  ['repeat', 'Mistake notebook', 'Every wrong answer is saved so you can revise exactly what you got wrong.'],
  ['trophy', 'Ranks & leaderboard', 'See where you stand on every test and track your progress over time.'],
  ['news', 'Daily current affairs', 'Short, searchable notes organised by category — and a Daily 10 quiz every day.'],
  ['library', 'Study library', 'Notes, PDFs and books collected in one place, searchable by category.'],
];
const TRUST = [
  ['lock', 'Answers stay hidden until you submit', 'No hints, no peeking — your result and the full explanations unlock only after you submit the test.'],
  ['clock', 'A timer you can trust', 'The clock runs on the server, so refreshing or reconnecting never gives or takes time away.'],
  ['save', 'Autosave & resume', 'Answers are saved as you go. If your connection drops, reopen the test and carry on.'],
  ['phone', 'Works on your phone', 'Install it like an app and practise anywhere — the design adapts to any screen.'],
];
const STEPS = [
  ['1', 'Create your account', 'Sign up with your email and tell us your target exam.'],
  ['2', 'Practise and take tests', 'Build the habit with Daily 10, then test yourself under exam conditions.'],
  ['3', 'Review and improve', 'Study your result, revise your mistakes and watch your accuracy climb.'],
];
const FAQ = [
  ['How do the mock tests work?', 'Each test has a fixed duration set by the admin. The timer starts when you press Start and runs on the server, and the test is submitted automatically when time is up.'],
  ['When do I see the answers?', 'Only after you submit. During a test nothing is revealed — not even in the Practice section. After submission you get your score, rank and a full review with explanations.'],
  ['What if my internet drops during a test?', 'Your answers are autosaved every few seconds. Reconnect, open the test and press Resume — the clock keeps running, so do it quickly.'],
  ['Which exams does Learnace cover?', 'JKSSB, JKPSC, SSC and UPSC preparation, plus other competitive exams. Browse the practice filters to see what is available.'],
  ['Can I use it on my phone?', 'Yes. Open the site on your phone and add it to your home screen to use it like an app.'],
];

const DEMO = [
  { q: 'Who is known as the “Father of the Indian Constitution”?', o: ['Mahatma Gandhi', 'Dr. B. R. Ambedkar', 'Jawaharlal Nehru', 'Sardar Patel'], a: 1,
    e: 'Dr. B. R. Ambedkar chaired the Drafting Committee of the Constituent Assembly, which is why he is called the Father of the Indian Constitution.' },
  { q: 'The headquarters of the Reserve Bank of India is located in…', o: ['New Delhi', 'Kolkata', 'Mumbai', 'Chennai'], a: 2,
    e: 'The RBI was set up in Kolkata in 1935 but moved its headquarters to Mumbai in 1937.' },
  { q: 'Which river is known as the “Sorrow of Bihar”?', o: ['Ganga', 'Gandak', 'Son', 'Kosi'], a: 3,
    e: 'The Kosi is called the Sorrow of Bihar because its frequent floods and shifting course have caused huge damage.' },
];

function Demo() {
  const [n, setN] = useState(0), [pick, setPick] = useState(null);
  const d = DEMO[n], done = pick !== null;
  return (
    <div className="demo card">
      <div className="between"><span className="badge info">Sample question {n + 1} of {DEMO.length}</span><span className="muted small">Practice mode</span></div>
      <p className="qt">{d.q}</p>
      {d.o.map((o, k) => <button key={k} type="button" disabled={done} className={'opt' + (done && k === d.a ? ' ok' : done && k === pick ? ' bad' : done ? ' dim' : '')} onClick={() => setPick(k)}><span className="lt">{'ABCD'[k]}</span>{o}</button>)}
      {done && <div className={'explain ' + (pick === d.a ? 'ok' : 'bad')}><b>{pick === d.a ? 'Correct!' : 'Not quite.'}</b><p>{d.e}</p></div>}
      <div className="row wrap" style={{ marginTop: 12 }}>
        {done ? <button type="button" onClick={() => { setN((n + 1) % DEMO.length); setPick(null); }}>Next question →</button> : <span className="muted small">Pick an answer to see the explanation.</span>}
        <span className="grow" /><Link className="btn ghost sm" to="/register">Practise more</Link>
      </div>
    </div>
  );
}

function HeroMock() {
  return (
    <div className="hs-mock" aria-hidden="true">
      <div className="mk-top"><b>JKSSB Mock Test</b><span className="mk-timer">⏱ 42:10</span></div>
      <p className="mk-q">Which Article of the Constitution deals with the Right to Equality?</p>
      {['Article 12', 'Article 14', 'Article 19', 'Article 21'].map((o, i) => <div className={'mk-o' + (i === 1 ? ' sel' : '')} key={o}><i>{'ABCD'[i]}</i>{o}</div>)}
      <div className="mk-pal">{Array.from({ length: 15 }, (_, i) => <span key={i} className={i < 6 ? 'a' : i === 6 ? 'c' : ''}>{i + 1}</span>)}</div>
    </div>
  );
}
const Eyebrow = ({ children }) => <span className="eyebrow">{children}</span>;

function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <div className="faq">
      {FAQ.map(([q, a], i) => (
        <div className={'faq-i' + (open === i ? ' on' : '')} key={q}>
          <button type="button" aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)}><span>{q}</span><i aria-hidden="true">{open === i ? '–' : '+'}</i></button>
          {open === i && <p>{a}</p>}
        </div>
      ))}
    </div>
  );
}

export function Landing({ dark, setDark }) {
  useTitle('');
  const home = useAsync(() => api('/public/home'), []);
  const d = home.data;
  const slides = (d?.banners?.length ? d.banners.map((b, i) => ({ ...b, theme: THEMES[i % 3] })) : DEFAULT_SLIDES);
  const stats = d ? [['Students', d.stats.students], ['Practice questions', d.stats.questions], ['Mock tests', d.stats.tests], ['Tests submitted', d.stats.attempts]].filter(x => x[1] > 0) : [];
  const scrolled = useScrolled();
  const exams = d?.exams?.length ? d.exams : [{ name: 'JKSSB' }, { name: 'JKPSC' }, { name: 'SSC' }, { name: 'UPSC' }];

  return (
    <div className="land">
      <Ticker items={d?.announcements} />
      <header className={'top pub-top' + (scrolled ? ' scrolled' : '')}>
        <Link to="/" className="brand" aria-label="Learnace home"><Logo /></Link>
        <nav className="pub-nav" aria-label="Sections"><a href="#features">Features</a><a href="#exams">Exams</a><a href="#try">Try it</a>{d?.tests?.length > 0 && <a href="#tests">Tests</a>}<a href="#faq">FAQ</a></nav>
        <span className="grow" />
        <button className="ghost icon" onClick={() => setDark(!dark)} aria-label="Toggle theme" title="Toggle theme">{dark ? '☀️' : '🌙'}</button>
        <Link className="btn ghost sm hide-xs" to="/login">Sign in</Link>
        <Link className="btn gold sm" to="/register">Get started</Link>
      </header>

      <Slider items={slides} label="Learnace highlights" className="hero-slider" interval={7000} render={(b, k, on) => (
        <div className={'hs ' + (b.theme || 'g1')}>
          <Pic className="hs-img" src={b.imageUrl} w={1600} eager={k === 0} />
          <div className="hs-shade" />
          <img className="hs-mark" src="/mark.png" alt="" aria-hidden="true" />
          {!b.id?.toString().startsWith('d') ? null : <HeroMock />}
          <div className="hs-body">
            <h1 className={on ? 'rise' : ''}>{b.title}</h1>
            {b.subtitle && <p className={on ? 'rise d1' : ''}>{b.subtitle}</p>}
            <div className={'row wrap ' + (on ? 'rise d2' : '')}>
              {b.linkUrl && <Anchor className="btn gold" to={b.linkUrl}>{b.ctaLabel || 'Learn more'} <Ico name="arrow" size={16} /></Anchor>}
              {!b.id?.toString().startsWith('d') ? null : <Link className="btn glass" to="/login">I already have an account</Link>}
            </div>
          </div>
          {b.credit && <span className="hs-credit">{b.credit}</span>}
        </div>
      )} />

      {stats.length > 0 && (
        <section className="wrap-s stats-strip" aria-label="Learnace in numbers">
          {stats.map(([k, v]) => <div key={k}><b><Counter to={v} /></b><span>{k}</span></div>)}
        </section>
      )}

      <section id="exams" className="wrap-s sec">
        <div className="sec-h"><Eyebrow>Exams</Eyebrow><h2>Built for your exam</h2><p className="muted">Practise questions tagged to the exam you are preparing for.</p></div>
        <Rail label="Exams">
          {exams.map((x, i) => (
            <Link to="/register" className={'rcard exam e' + (i % 3)} key={x.name}>
              <span className="exam-i"><Ico name="target" size={26} /></span><b>{x.name}</b>
              <span className="muted small">{x.n ? `${x.n.toLocaleString('en-IN')} practice question${x.n === 1 ? '' : 's'}` : 'Practice + mock tests'}</span>
            </Link>
          ))}
        </Rail>
      </section>

      <section id="features" className="wrap-s sec">
        <div className="sec-h"><Eyebrow>Features</Eyebrow><h2>Everything you need to prepare</h2><p className="muted">One platform for practice, testing, revision and reading.</p></div>
        <div className="feat-grid">
          {FEATURES.map(([ic, t, p], i) => <Reveal key={t} delay={i * 60}><div className="card feat f" data-c={i % 3}><span className="feat-i"><Ico name={ic} /></span><h3>{t}</h3><p className="muted">{p}</p></div></Reveal>)}
        </div>
      </section>

      <section id="try" className="wrap-s sec">
        <div className="try-grid">
          <Reveal><Eyebrow>Try it now</Eyebrow><h2 className="try-h">Practise the way you will be tested</h2>
            <p className="muted">Answer a sample question and see the explanation instantly — exactly how Practice mode works inside Learnace.</p>
            <ul className="tick-list"><li><Ico name="check" size={18} />Instant explanations in Practice mode</li><li><Ico name="check" size={18} />In mock tests, answers stay hidden until you submit</li><li><Ico name="check" size={18} />Every mistake is saved for revision</li></ul>
            <Link className="btn" to="/register">Create your account <Ico name="arrow" size={16} /></Link></Reveal>
          <Reveal delay={120}><Demo /></Reveal>
        </div>
      </section>

      {d?.tests?.length > 0 && (
        <section id="tests" className="wrap-s sec">
          <div className="sec-h between"><div><h2>Mock tests to try</h2><p className="muted">Sign in to attempt any of these.{d.tests.some(t => t.premium) && (d.onlinePay || d.settings?.upiId) ? ' Premium mocks unlock with UPI, Google Pay or cards.' : ''}</p></div><Link to="/login" className="small">Sign in →</Link></div>
          <Rail label="Mock tests">
            {d.tests.map(t => (
              <Link to="/login" className="rcard test-card" key={t.id}>
                <div className="row wrap"><span className="badge info">{t.exam || 'Mock test'}</span>{t.premium && <span className="badge warn">★ Premium{t.pricePaise ? ' · ' + fmtINR(t.pricePaise) : ''}</span>}</div><b>{t.title}</b>
                <span className="muted small">{t.questionCount} questions · {t.durationMin} min · {+t.totalMarks} marks</span>
                {t.startsAt && new Date(t.startsAt) > new Date() && <span className="badge warn">Opens {fmtDate(t.startsAt)}</span>}
                <span className="rcard-cta">{t.premium && t.pricePaise ? 'Sign in to unlock' : 'Sign in to start'} <Ico name="arrow" size={15} /></span>
              </Link>
            ))}
          </Rail>
        </section>
      )}

      <section className="sec trust-band">
        <div className="wrap-s">
          <div className="sec-h"><h2>Fair, reliable, exam-like</h2><p>The test engine is built so that your result means something.</p></div>
          <div className="trust-grid">{TRUST.map(([ic, t, p]) => <div key={t}><span className="feat-i on-dark"><Ico name={ic} /></span><h3>{t}</h3><p>{p}</p></div>)}</div>
        </div>
      </section>

      <section className="wrap-s sec">
        <div className="sec-h"><Eyebrow>Getting started</Eyebrow><h2>How it works</h2></div>
        <div className="steps">{STEPS.map(([n, t, p]) => <div className="card step" key={n}><span className="step-n">{n}</span><h3>{t}</h3><p className="muted">{p}</p></div>)}</div>
      </section>

      {d?.materials?.length > 0 && (
        <section className="wrap-s sec">
          <div className="sec-h"><h2>Study library</h2><p className="muted">Notes, PDFs and books for your preparation.</p></div>
          <Rail label="Study material">
            {d.materials.map(m => (
              <Link to="/login" className="rcard mat-card" key={m.id}>
                <div className="mat-cover"><Pic src={m.coverUrl} w={480} /><img className="mat-ph" src="/mark.png" alt="" aria-hidden="true" /></div>
                <b>{m.title}</b><span className="muted small">{m.category || 'Study material'}</span>
              </Link>
            ))}
          </Rail>
        </section>
      )}

      {d?.testimonials?.length > 0 && (
        <section className="wrap-s sec">
          <div className="sec-h"><h2>What students say</h2></div>
          <Slider items={d.testimonials} label="Student testimonials" interval={8000} className="testi" render={t => (
            <figure className="quote">
              <blockquote>“{t.quote}”</blockquote>
              <figcaption>
                {t.photoUrl ? <Pic className="q-photo" src={t.photoUrl} w={120} /> : <span className="q-photo ph">{t.name[0]}</span>}
                <span><b>{t.name}</b>{t.role && <><br /><span className="muted small">{t.role}</span></>}</span>
              </figcaption>
            </figure>
          )} />
        </section>
      )}

      <section id="faq" className="wrap-s sec narrow"><div className="sec-h"><Eyebrow>FAQ</Eyebrow><h2>Questions, answered</h2></div><Faq /></section>

      <section className="wrap-s sec">
        <div className="cta-band">
          <img src="/mark.png" alt="" aria-hidden="true" />
          <div><h2>Ready to learn with ACE?</h2><p>Create your account and take your first practice set in minutes.</p></div>
          <div className="row wrap"><Link className="btn gold" to="/register">Create account</Link><Link className="btn glass" to="/login">Sign in</Link></div>
        </div>
      </section>
      <Footer settings={d?.settings} />
      <div className="m-cta noprint"><Link className="btn ghost" to="/login">Sign in</Link><Link className="btn gold" to="/register">Get started</Link></div>
      <BackToTop />
    </div>
  );
}
