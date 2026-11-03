import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

// ---- Auth context ---------------------------------------------------------------------
export const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

// ---- Toasts + confirm dialog ----------------------------------------------------------
const UICtx = createContext(null);
export const useUI = () => useContext(UICtx);

export function UIProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dlg, setDlg] = useState(null);
  const toast = useCallback((msg, type = 'ok') => {
    const id = Math.random();
    setToasts(t => [...t.slice(-3), { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), type === 'err' ? 6000 : 3200);
  }, []);
  const confirm = useCallback((message, { okLabel = 'Confirm', danger = false, title = 'Please confirm' } = {}) =>
    new Promise(resolve => setDlg({ message, okLabel, danger, title, resolve })), []);
  const close = v => { dlg.resolve(v); setDlg(null); };
  return (
    <UICtx.Provider value={{ toast, confirm }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map(t => <div key={t.id} className={'toast ' + t.type}>{t.msg}</div>)}
      </div>
      {dlg && (
        <Modal title={dlg.title} onClose={() => close(false)} small
          footer={<><button className="ghost" onClick={() => close(false)}>Cancel</button>
            <button className={dlg.danger ? 'danger' : ''} onClick={() => close(true)} autoFocus>{dlg.okLabel}</button></>}>
          <p style={{ margin: 0 }}>{dlg.message}</p>
        </Modal>
      )}
    </UICtx.Provider>
  );
}

// ---- Building blocks ------------------------------------------------------------------
export function Modal({ title, onClose, children, footer, small, wide }) {
  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (small ? ' sm' : '') + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-h"><h3>{title}</h3><button className="ghost icon" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>
  );
}

export const Spinner = ({ label = 'Loading…' }) => <div className="center"><div className="spinner" aria-hidden="true" /><span className="muted">{label}</span></div>;
export const Empty = ({ icon = '📭', title, hint, children }) => <div className="empty"><div className="empty-i">{icon}</div><b>{title}</b>{hint && <p className="muted">{hint}</p>}{children}</div>;
export const ErrorBox = ({ message, onRetry }) => <div className="card err-box"><p className="err" style={{ margin: 0 }}>{message}</p>{onRetry && <button className="ghost sm" onClick={onRetry}>Try again</button>}</div>;
export const Chip = ({ children, on, ...p }) => <button type="button" className={'chip' + (on ? ' on' : '')} {...p}>{children}</button>;
export const Badge = ({ kind = '', children }) => <span className={'badge ' + kind}>{children}</span>;
export const Progress = ({ value, max = 100, kind = '' }) => <div className={'bar ' + kind}><i style={{ width: Math.min(100, max ? (value / max) * 100 : 0) + '%' }} /></div>;

export function Pager({ page, pages, onPage }) {
  if (pages <= 1) return null;
  return (
    <div className="row center-x pager">
      <button className="ghost sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>← Prev</button>
      <span className="muted small">Page {page} of {pages}</span>
      <button className="ghost sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next →</button>
    </div>
  );
}

/** Minimal bar chart. data: [{label, value, sub}] */
export function Bars({ data, height = 110, color = 'var(--brand)', format = v => v }) {
  const max = Math.max(1, ...data.map(d => d.value));
  return (
    <div className="bars" style={{ height }} role="img" aria-label="Bar chart">
      {data.map((d, i) => (
        <div className="col" key={i} title={`${d.label}: ${format(d.value)}${d.sub ? ' · ' + d.sub : ''}`}>
          <div className="col-v">{d.value ? format(d.value) : ''}</div>
          <div className="col-b"><i style={{ height: (d.value / max) * 100 + '%', background: color }} /></div>
          <div className="col-l">{d.label}</div>
        </div>
      ))}
    </div>
  );
}

// ---- Hooks ----------------------------------------------------------------------------
export function useAsync(fn, deps = []) {
  const [s, setS] = useState({ data: null, loading: true, error: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setS(x => ({ ...x, loading: true, error: null }));
    fn().then(data => alive && setS({ data, loading: false, error: null }), e => alive && setS(x => ({ data: x.data, loading: false, error: e.message })));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick(t => t + 1), []);
  const setData = useCallback(d => setS(x => ({ ...x, data: typeof d === 'function' ? d(x.data) : d })), []);
  return { ...s, reload, setData };
}

export function useDebounced(value, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export function useTitle(t) { useEffect(() => { document.title = t ? `${t} · Learnace` : 'Learnace – Learn with ACE'; }, [t]); }

// ---- Formatting -----------------------------------------------------------------------
export const fmtDate = d => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '–');
export const fmtDateTime = d => (d ? new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–');
export const fmtDur = sec => {
  sec = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60, p = n => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
};
export const shortDay = ymd => new Date(ymd + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'narrow' });
export const LETTERS = 'ABCD';
export const fmtINR = paise => '₹' + (Number(paise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });
export const useInterval = (fn, ms) => { const f = useRef(fn); f.current = fn; useEffect(() => { const t = setInterval(() => f.current(), ms); return () => clearInterval(t); }, [ms]); };
