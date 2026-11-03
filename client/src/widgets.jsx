// Brand + presentation building blocks: logo, splash, hero slider, card rails, ticker, counters, icons.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

// ---- Images ---------------------------------------------------------------------------
/** Ask Cloudinary / Unsplash for an appropriately sized, compressed version of an image. */
export function optimize(url, w = 800) {
  if (!url || typeof url !== 'string') return url;
  try {
    const u = new URL(url);
    if (u.hostname === 'res.cloudinary.com') {
      const m = url.match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/);
      if (!m || /\.svg($|\?)/i.test(url) || /^[a-z]{1,3}_[^/]*\//.test(m[2])) return url; // already transformed
      return `${m[1]}f_auto,q_auto,c_limit,w_${w}/${m[2]}`;
    }
    if (u.hostname === 'images.unsplash.com') {
      u.searchParams.set('w', String(w)); u.searchParams.set('q', '70'); u.searchParams.set('auto', 'format'); u.searchParams.set('fit', 'crop');
      return u.toString();
    }
  } catch { /* not a URL */ }
  return url;
}
export const reduceMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** <img> that disappears (letting the CSS fallback show) if the link is broken. */
export function Pic({ src, w = 800, alt = '', className = '', eager = false, ...p }) {
  const [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [src]);
  if (!src || bad) return null;
  return <img className={className} src={optimize(src, w)} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" referrerPolicy="no-referrer" onError={() => setBad(true)} {...p} />;
}

// ---- Brand ----------------------------------------------------------------------------
export const Logo = ({ size = 36 }) => (
  <span className="lockup"><img className="logo-mark" src="/mark.png" alt="" width={size} height={size} /><span className="wordmark">Learnace</span></span>
);
export const FullLogo = ({ width = 220, className = '' }) => (
  <img className={'logo-full ' + className} src="/logo.png" alt="Learnace – Learn with ACE" style={{ width, maxWidth: '100%', height: 'auto' }} />
);

/** Full-screen branded loading screen (mirrors the static splash in index.html so there is no flash). */
export function Splash({ label }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setSlow(true), 5000); return () => clearTimeout(t); }, []);
  return (
    <div className="splash" role="status" aria-label="Loading Learnace">
      <img src="/logo.png" alt="Learnace – Learn with ACE" /><div className="sp-bar"><i /></div>
      {(slow || label) && <span className="sp-note">{slow ? 'Waking up the server — the first visit can take up to a minute…' : label}</span>}
    </div>
  );
}

// ---- Icons ----------------------------------------------------------------------------
const ICONS = {
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.4" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  repeat: <><path d="M17 2l4 4-4 4" /><path d="M3 11V9a3 3 0 0 1 3-3h15" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a3 3 0 0 1-3 3H3" /></>,
  trophy: <><path d="M8 21h8M12 17v4" /><path d="M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" /></>,
  news: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 8h6M7 12h10M7 16h10" /></>,
  library: <><path d="M4 4v16M9 4v16M14 6l4.5 14M2 20h20" /></>,
  shield: <><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M9 12l2 2 4-4" /></>,
  phone: <><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></>,
  spark: <><path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" /></>,
  check: <><path d="M5 12l4 4 10-10" /></>,
  chart: <><path d="M4 20V10M10 20V4M16 20v-8M22 20H2" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  save: <><path d="M5 4h11l3 3v13H5z" /><path d="M8 4v5h7V4M8 20v-6h8v6" /></>,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
};
export const Ico = ({ name, size = 22 }) => (
  <svg className="ico" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[name]}</svg>
);

/** Internal paths use the router; everything else opens in a new tab. */
export function Anchor({ to, children, className, ...p }) {
  if (!to) return <span className={className} {...p}>{children}</span>;
  return /^https?:/i.test(to)
    ? <a className={className} href={to} target="_blank" rel="noopener noreferrer" {...p}>{children}</a>
    : <Link className={className} to={to} {...p}>{children}</Link>;
}

// ---- Hero slider ----------------------------------------------------------------------
/**
 * Full-width carousel: autoplay (pauses on hover/focus/hidden tab/reduced motion), swipe, arrows, dots, keyboard.
 * render(item, index, isActive) draws one slide.
 */
export function Slider({ items, render, interval = 6500, label = 'Highlights', className = '' }) {
  const n = items.length;
  const [i, setI] = useState(0), [paused, setPaused] = useState(false), [hidden, setHidden] = useState(false);
  const drag = useRef(null), moved = useRef(false);
  const go = useCallback(k => setI(p => (n ? ((((typeof k === 'function' ? k(p) : k) % n) + n) % n) : 0)), [n]);
  useEffect(() => { if (i >= n) setI(0); }, [n, i]);
  useEffect(() => { const f = () => setHidden(document.hidden); document.addEventListener('visibilitychange', f); return () => document.removeEventListener('visibilitychange', f); }, []);
  useEffect(() => {
    if (n < 2 || paused || hidden || reduceMotion()) return undefined;
    const t = setTimeout(() => go(p => p + 1), interval);
    return () => clearTimeout(t);
  }, [i, n, paused, hidden, interval, go]);

  const down = e => { drag.current = { x: e.clientX, y: e.clientY }; moved.current = false; };
  const up = e => {
    const d = drag.current; drag.current = null; if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) { moved.current = true; go(p => p + (dx < 0 ? 1 : -1)); }
  };
  const key = e => { if (e.key === 'ArrowRight') go(p => p + 1); else if (e.key === 'ArrowLeft') go(p => p - 1); };
  if (!n) return null;
  return (
    <section className={'slider ' + className} aria-roledescription="carousel" aria-label={label}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}
      onPointerDown={down} onPointerUp={up} onPointerCancel={() => { drag.current = null; }} onKeyDown={key}
      onClickCapture={e => { if (moved.current) { e.preventDefault(); e.stopPropagation(); moved.current = false; } }}>
      <div className="slider-track" style={{ transform: `translateX(-${i * 100}%)` }}>
        {items.map((it, k) => (
          <div className={'slide' + (k === i ? ' on' : '')} key={it.id ?? k} role="group" aria-roledescription="slide" aria-label={`${k + 1} of ${n}`} aria-hidden={k !== i}
            ref={el => { if (el) { if (k !== i) el.setAttribute('inert', ''); else el.removeAttribute('inert'); } }}>
            {render(it, k, k === i)}
          </div>
        ))}
      </div>
      {n > 1 && (
        <>
          <button type="button" className="s-nav prev" aria-label="Previous slide" onClick={() => go(i - 1)}>‹</button>
          <button type="button" className="s-nav next" aria-label="Next slide" onClick={() => go(i + 1)}>›</button>
          <div className="s-dots">{items.map((it, k) => <button type="button" key={it.id ?? k} className={k === i ? 'on' : ''} aria-label={`Go to slide ${k + 1}`} aria-current={k === i} onClick={() => go(k)} />)}</div>
        </>
      )}
    </section>
  );
}

// ---- Card rail (horizontal scroll-snap carousel) --------------------------------------
export function Rail({ children, label = 'Carousel' }) {
  const ref = useRef(null);
  const [can, setCan] = useState({ l: false, r: false });
  const upd = useCallback(() => {
    const e = ref.current; if (!e) return;
    setCan({ l: e.scrollLeft > 4, r: e.scrollLeft + e.clientWidth < e.scrollWidth - 4 });
  }, []);
  useEffect(() => {
    upd(); const e = ref.current; if (!e || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(upd); ro.observe(e); return () => ro.disconnect();
  }, [upd, children]);
  const by = d => ref.current?.scrollBy({ left: d * ref.current.clientWidth * 0.85, behavior: reduceMotion() ? 'auto' : 'smooth' });
  return (
    <div className="rail-wrap">
      {can.l && <button type="button" className="s-nav prev" aria-label="Scroll left" onClick={() => by(-1)}>‹</button>}
      <div className="rail" ref={ref} onScroll={upd} tabIndex={0} role="region" aria-label={label}>{children}</div>
      {can.r && <button type="button" className="s-nav next" aria-label="Scroll right" onClick={() => by(1)}>›</button>}
    </div>
  );
}

// ---- Announcement ticker --------------------------------------------------------------
export function Ticker({ items }) {
  if (!items?.length) return null;
  const secs = Math.max(24, Math.round(items.reduce((a, x) => a + x.text.length, 0) * 0.28));
  const row = (hide) => (
    <div className="tick-row" aria-hidden={hide || undefined}>
      {items.map(a => <Anchor key={a.id} to={a.linkUrl} className="tick-item"><span className="tick-dot" />{a.text}</Anchor>)}
    </div>
  );
  return (
    <div className="ticker" role="region" aria-label="Announcements">
      <span className="tick-tag">Latest</span>
      <div className="tick-view"><div className="tick-move" style={{ animationDuration: secs + 's' }}>{row(false)}{row(true)}</div></div>
    </div>
  );
}

// ---- Animated number ------------------------------------------------------------------
export function Counter({ to, suffix = '' }) {
  const ref = useRef(null);
  const [v, setV] = useState(reduceMotion() ? to : 0);
  useEffect(() => {
    if (reduceMotion() || typeof IntersectionObserver === 'undefined') { setV(to); return undefined; }
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return; io.disconnect();
      const t0 = performance.now(), dur = 1300;
      const step = t => { const p = Math.min(1, (t - t0) / dur); setV(Math.round(to * (1 - (1 - p) ** 3))); if (p < 1) raf = requestAnimationFrame(step); };
      raf = requestAnimationFrame(step);
    });
    io.observe(ref.current);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [to]);
  return <span ref={ref}>{v.toLocaleString('en-IN')}{suffix}</span>;
}

// ---- Footer ---------------------------------------------------------------------------
export function Footer({ settings = {}, signedIn = false }) {
  const s = settings, social = [['WhatsApp', s.whatsapp], ['Telegram', s.telegram], ['Instagram', s.instagram], ['YouTube', s.youtube], ['Facebook', s.facebook]].filter(x => x[1]);
  return (
    <footer className="foot noprint">
      <div className="foot-in">
        <div className="foot-brand">
          <FullLogo width={150} />
          {s.about && <p className="muted small">{s.about}</p>}
        </div>
        <div>
          <b>Explore</b>
          <nav className="foot-links" aria-label="Footer">
            {signedIn
              ? <><Link to="/practice">Practice</Link><Link to="/tests">Mock tests</Link><Link to="/leaderboard">Leaderboard</Link><Link to="/affairs">Current affairs</Link><Link to="/library">Library</Link></>
              : <><Link to="/login">Sign in</Link><Link to="/register">Create account</Link></>}
          </nav>
        </div>
        {(s.contactEmail || s.phone || social.length > 0) && (
          <div>
            <b>Contact</b>
            <nav className="foot-links" aria-label="Contact">
              {s.contactEmail && <a href={'mailto:' + s.contactEmail}>{s.contactEmail}</a>}
              {s.phone && <a href={'tel:' + s.phone.replace(/\s/g, '')}>{s.phone}</a>}
              {social.map(([k, v]) => <a key={k} href={v} target="_blank" rel="noopener noreferrer">{k}</a>)}
            </nav>
          </div>
        )}
      </div>
      <div className="foot-bar">© {new Date().getFullYear()} Learnace · Learn with ACE</div>
    </footer>
  );
}

// ---- Scroll-reveal, scrolled-header flag, back-to-top ---------------------------------
export function Reveal({ children, className = '', delay = 0 }) {
  const ref = useRef(null);
  const [on, setOn] = useState(() => reduceMotion() || typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (on) return undefined;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    io.observe(ref.current); return () => io.disconnect();
  }, [on]);
  return <div ref={ref} className={'reveal ' + (on ? 'in ' : '') + className} style={delay ? { transitionDelay: delay + 'ms' } : undefined}>{children}</div>;
}
export function useScrolled(px = 8) {
  const [v, setV] = useState(false);
  useEffect(() => { const f = () => setV(window.scrollY > px); f(); window.addEventListener('scroll', f, { passive: true }); return () => window.removeEventListener('scroll', f); }, [px]);
  return v;
}
export function BackToTop() {
  const show = useScrolled(700);
  if (!show) return null;
  return <button type="button" className="to-top" aria-label="Back to top" onClick={() => window.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' })}>↑</button>;
}
