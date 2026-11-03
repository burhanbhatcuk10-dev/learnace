import { useState } from 'react';
import { api } from '../api.js';
import { useAsync, useDebounced, useTitle, Spinner, ErrorBox, Empty, Chip, Badge } from '../ui.jsx';
import { Pic } from '../widgets.jsx';

export function Library() {
  useTitle('Library');
  const [cat, setCat] = useState(''), [q, setQ] = useState(''), dq = useDebounced(q);
  const m = useAsync(() => api('/materials?' + new URLSearchParams({ ...(cat && { category: cat }), ...(dq && { search: dq }) })), [cat, dq]);
  return (
    <>
      <h2>Study library</h2>
      <input placeholder="Search notes, PDFs, books…" value={q} onChange={e => setQ(e.target.value)} />
      <div className="row wrap seg"><Chip on={!cat} onClick={() => setCat('')}>All</Chip>{m.data?.categories.map(c => <Chip key={c} on={cat === c} onClick={() => setCat(c)}>{c}</Chip>)}</div>
      {m.loading && !m.data ? <Spinner /> : m.error ? <ErrorBox message={m.error} onRetry={m.reload} /> : !m.data.items.length ? <Empty icon="📚" title="No study material found" /> :
        <div className="grid g3">{m.data.items.map(x => (
          <div className="card mat" key={x.id}><div className="mat-cover"><Pic src={x.coverUrl} w={640} /><img className="mat-ph" src="/mark.png" alt="" aria-hidden="true" /></div>
            <b>{x.title}</b>{x.description && <p className="muted small">{x.description}</p>}
            <div className="row wrap"><span className="muted small">{x.category}</span><Badge kind={x.premium ? 'warn' : 'ok'}>{x.premium ? 'Premium' : 'Free'}</Badge></div>
            {x.url && <a className="btn" href={x.url} target="_blank" rel="noopener noreferrer">Open</a>}</div>))}</div>}
    </>
  );
}
