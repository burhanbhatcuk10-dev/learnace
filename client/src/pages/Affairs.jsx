import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useDebounced, useTitle, Spinner, Empty, Chip, fmtDate } from '../ui.jsx';

export function Affairs() {
  useTitle('Current affairs');
  const [cat, setCat] = useState(''), [q, setQ] = useState(''), dq = useDebounced(q);
  const [items, setItems] = useState([]), [cats, setCats] = useState([]), [page, setPage] = useState(1), [more, setMore] = useState(false), [loading, setLoading] = useState(true), [open, setOpen] = useState(null), [err, setErr] = useState('');
  useEffect(() => {
    let alive = true; setLoading(true); setErr('');
    api('/current-affairs?' + new URLSearchParams({ page, limit: 15, ...(cat && { category: cat }), ...(dq && { search: dq }) }))
      .then(d => { if (!alive) return; setItems(p => (page === 1 ? d.items : [...p, ...d.items])); setMore(d.hasMore); setCats(d.categories); })
      .catch(e => alive && setErr(e.message)).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [cat, dq, page]);
  const reset = fn => v => { setPage(1); fn(v); };
  return (
    <>
      <h2>Current affairs</h2>
      <input placeholder="Search…" value={q} onChange={e => reset(setQ)(e.target.value)} />
      <div className="row wrap seg"><Chip on={!cat} onClick={() => reset(setCat)('')}>All</Chip>{cats.map(c => <Chip key={c} on={cat === c} onClick={() => reset(setCat)(c)}>{c}</Chip>)}</div>
      {err && <p className="err">{err}</p>}
      {items.map(a => (
        <article className="card" key={a.id}>
          <button className="linklike" onClick={() => setOpen(open === a.id ? null : a.id)} aria-expanded={open === a.id}><b>{a.title}</b><span className="muted small">{a.category} · {fmtDate(a.date)}</span></button>
          {open === a.id && <p className="body">{a.body || 'No further details.'}</p>}
        </article>))}
      {loading ? <Spinner /> : !items.length && !err && <Empty icon="📰" title="Nothing here yet" />}
      {more && !loading && <div className="center-x"><button className="ghost" onClick={() => setPage(p => p + 1)}>Load more</button></div>}
    </>
  );
}
