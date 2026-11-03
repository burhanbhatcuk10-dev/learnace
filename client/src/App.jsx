import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink, Link, useLocation } from 'react-router-dom';
import { api, refreshSession, setToken, setAuthLostHandler } from './api.js';
import { AuthCtx, UIProvider, Spinner, useUI } from './ui.jsx';
import { Footer, Logo, Splash } from './widgets.jsx';
import { Auth } from './pages/Auth.jsx';
import { Landing } from './pages/Landing.jsx';
import { Dashboard } from './pages/Dashboard.jsx';
import { Practice } from './pages/Practice.jsx';
import { Tests, TestIntro } from './pages/Tests.jsx';
import { TakeTest } from './pages/TakeTest.jsx';
import { Result } from './pages/Result.jsx';
import { Library } from './pages/Library.jsx';
import { Affairs } from './pages/Affairs.jsx';
import { Profile } from './pages/Profile.jsx';
import { Leaderboard } from './pages/Leaderboard.jsx';

const Admin = lazy(() => import('./admin/Admin.jsx'));

function Shell({ user, logout, dark, setDark }) {
  const { pathname } = useLocation();
  const focus = /\/take$/.test(pathname); // distraction-free exam mode
  const staff = user.role !== 'student';
  return (
    <>
      {!focus && (
        <header className="top">
          <Link to="/" className="brand" aria-label="Learnace home"><Logo /></Link>
          <nav className="tabs" aria-label="Main">
            <NavLink to="/" end>Home</NavLink><NavLink to="/practice">Practice</NavLink><NavLink to="/tests">Tests</NavLink><NavLink to="/leaderboard">Ranks</NavLink>
            <NavLink to="/affairs">Affairs</NavLink><NavLink to="/library">Library</NavLink>
            {staff && <NavLink to="/admin">Admin</NavLink>}
          </nav>
          <span className="grow" />
          <button className="ghost icon" onClick={() => setDark(!dark)} aria-label="Toggle theme" title="Toggle theme">{dark ? '☀️' : '🌙'}</button>
          <Link to="/profile" className="avatar" title="Profile">{(user.name || '?')[0].toUpperCase()}</Link>
          <button className="ghost sm" onClick={logout}>Logout</button>
        </header>
      )}
      <main className={'page' + (focus ? ' focus' : '')}>
        <Suspense fallback={<Spinner />}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/practice" element={<Practice />} />
            <Route path="/tests" element={<Tests />} />
            <Route path="/tests/:id" element={<TestIntro />} />
            <Route path="/tests/:id/take" element={<TakeTest />} />
            <Route path="/results/:id" element={<Result />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/affairs" element={<Affairs />} />
            <Route path="/library" element={<Library />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/admin/*" element={staff ? <Admin /> : <Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
      {!focus && <Footer signedIn />}
    </>
  );
}

function Root() {
  const { toast } = useUI();
  const [user, setUser] = useState(null), [ready, setReady] = useState(false);
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark');
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch { /* private mode */ } }, [dark]);
  useEffect(() => {
    setAuthLostHandler(() => { setUser(null); toast('Your session expired. Please sign in again.', 'err'); });
    refreshSession().then(d => d && setUser(d.user)).finally(() => setReady(true));
  }, [toast]);
  const login = useCallback(d => { setToken(d.token); setUser(d.user); }, []);
  const logout = useCallback(async () => { await api('/auth/logout', { method: 'POST' }).catch(() => {}); setToken(null); setUser(null); }, []);
  if (!ready) return <Splash />;
  return (
    <AuthCtx.Provider value={{ user, setUser, login, logout }}>
      <BrowserRouter>
        {user ? <Shell user={user} logout={logout} dark={dark} setDark={setDark} /> : (
          <Routes>
            <Route path="/" element={<Landing dark={dark} setDark={setDark} />} />
            <Route path="/register" element={<Auth mode="register" dark={dark} setDark={setDark} />} />
            <Route path="/login" element={<Auth mode="login" dark={dark} setDark={setDark} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}
      </BrowserRouter>
    </AuthCtx.Provider>
  );
}
export default function App() { return <UIProvider><Root /></UIProvider>; }
