import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth, useAsync, useTitle } from '../ui.jsx';
import { FullLogo, Ico } from '../widgets.jsx';

const POINTS = [
  ['target', 'Topic-wise practice with instant explanations'],
  ['clock', 'Timed mock tests with ranks and full review'],
  ['news', 'Daily current affairs and a study library'],
];

export function Auth({ mode, dark, setDark }) {
  const reg = mode === 'register';
  useTitle(reg ? 'Create account' : 'Sign in');
  const { login } = useAuth();
  const cfg = useAsync(() => api('/auth/config'), []);
  const [f, setF] = useState({ name: '', email: '', password: '', targetExam: '' });
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false), [show, setShow] = useState(false);
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const open = cfg.data?.registrationOpen !== false;
  const submit = async e => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { login(await api(reg ? '/auth/register' : '/auth/login', { method: 'POST', body: reg ? f : { email: f.email, password: f.password } })); }
    catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <div className="auth-shell">
      <aside className="auth-side" aria-hidden="false">
        <img className="auth-watermark" src="/mark.png" alt="" aria-hidden="true" />
        <Link to="/" className="auth-home">← Back to home</Link>
        <div>
          <h2>Learn with ACE</h2>
          <p>Mock tests, MCQs and current affairs for JKSSB, JKPSC, SSC, UPSC and more.</p>
          <ul>{POINTS.map(([ic, t]) => <li key={t}><span><Ico name={ic} size={18} /></span>{t}</li>)}</ul>
        </div>
        <small>Your answers stay hidden until you submit a test — just like the real exam.</small>
      </aside>
      <main className="auth-main">
        <button className="ghost icon auth-theme" onClick={() => setDark(!dark)} aria-label="Toggle theme">{dark ? '☀️' : '🌙'}</button>
        <form className="auth" onSubmit={submit}>
          <Link to="/" aria-label="Learnace home"><FullLogo width={190} className="auth-logo-img" /></Link>
          <h1>{reg ? 'Create your account' : 'Welcome back'}</h1>
          <p className="muted">{reg ? 'Start practising in a minute.' : 'Sign in to continue your preparation.'}</p>
          {reg && <input placeholder="Full name" required minLength={2} autoComplete="name" value={f.name} onChange={set('name')} />}
          <input type="email" placeholder="Email" required autoComplete="email" value={f.email} onChange={set('email')} />
          <div className="pw"><input type={show ? 'text' : 'password'} placeholder={reg ? 'Password (8+ characters)' : 'Password'} minLength={reg ? 8 : 1} required
            autoComplete={reg ? 'new-password' : 'current-password'} value={f.password} onChange={set('password')} />
            <button type="button" className="ghost sm" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button></div>
          {reg && <input placeholder="Target exam (e.g. JKSSB)" value={f.targetExam} onChange={set('targetExam')} />}
          {err && <p className="err" role="alert">{err}</p>}
          <button disabled={busy}>{busy ? 'Please wait…' : reg ? 'Create account' : 'Sign in'}</button>
          {reg ? <Link to="/login">Have an account? Sign in</Link> : open ? <Link to="/register">New here? Create an account</Link> : <p className="muted small">Registration is closed.</p>}
        </form>
      </main>
    </div>
  );
}
