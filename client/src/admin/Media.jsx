import { useCallback, useEffect, useRef, useState } from 'react';
import { api, uploadImage } from '../api.js';
import { useAsync, useUI, useTitle, Spinner, ErrorBox } from '../ui.jsx';
import { optimize } from '../widgets.jsx';

const fmtSize = b => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');

export default function Media() {
  useTitle('Admin · Media');
  const { toast, confirm } = useUI(), fileRef = useRef(null);
  const st = useAsync(() => api('/admin/media/status'), []);
  const [items, setItems] = useState([]), [next, setNext] = useState(null), [loading, setLoading] = useState(false), [err, setErr] = useState('');
  const [prog, setProg] = useState(null), [over, setOver] = useState(false);

  const load = useCallback(async cursor => {
    setLoading(true); setErr('');
    try { const d = await api('/admin/media?limit=40' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : '')); setItems(p => (cursor ? [...p, ...d.items] : d.items)); setNext(d.next); }
    catch (e) { setErr(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { if (st.data?.enabled) load(); }, [st.data, load]);

  const upload = async files => {
    const list = [...files].filter(f => f.type.startsWith('image/')); if (!list.length) return toast('Choose image files', 'err');
    let ok = 0;
    for (let i = 0; i < list.length; i++) {
      setProg({ n: i + 1, of: list.length, pct: 0, name: list[i].name });
      try { await uploadImage(list[i], p => setProg(x => x && { ...x, pct: Math.round(p * 100) })); ok++; } catch (e) { toast(`${list[i].name}: ${e.message}`, 'err'); }
    }
    setProg(null); if (ok) { toast(`${ok} image${ok > 1 ? 's' : ''} uploaded`); load(); }
  };
  const copy = async m => { try { await navigator.clipboard.writeText(m.url); toast('Link copied'); } catch { toast(m.url); } };
  const del = async m => {
    if (!(await confirm('Delete this image? Anything still using it will show a blank space.', { danger: true, okLabel: 'Delete' }))) return;
    try { await api('/admin/media?id=' + encodeURIComponent(m.id), { method: 'DELETE' }); setItems(p => p.filter(x => x.id !== m.id)); toast('Deleted'); } catch (e) { toast(e.message, 'err'); }
  };

  if (st.loading && !st.data) return <Spinner />;
  if (st.error) return <ErrorBox message={st.error} onRetry={st.reload} />;
  if (!st.data.enabled) return (
    <div className="card">
      <h3>Connect Cloudinary to store images</h3>
      <p className="muted">Banners, testimonial photos and study-material covers can be uploaded straight from the admin panel once Cloudinary is connected.</p>
      <ol className="ins">
        <li>Create a free account at <a href="https://cloudinary.com" target="_blank" rel="noopener noreferrer">cloudinary.com</a> and open the Dashboard → <b>API Keys</b>.</li>
        <li>In Render, add environment variables <code>CLOUDINARY_CLOUD_NAME</code>, <code>CLOUDINARY_API_KEY</code> and <code>CLOUDINARY_API_SECRET</code> (or a single <code>CLOUDINARY_URL</code>).</li>
        <li>Redeploy. This page will turn into your image library.</li>
      </ol>
      <p className="muted small">Until then you can still paste any image link (for example from Unsplash) into banner and cover fields.</p>
    </div>
  );
  return (
    <>
      <div className={'drop' + (over ? ' over' : '')} onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files); }}>
        {prog ? <><b>Uploading {prog.n} of {prog.of}…</b><span className="muted small">{prog.name}</span><div className="bar"><i style={{ width: prog.pct + '%' }} /></div></>
          : <><b>Drag images here</b><span className="muted small">JPG, PNG, WebP, GIF, AVIF or SVG · large photos are shrunk automatically</span>
            <button onClick={() => fileRef.current?.click()}>⬆ Choose images</button></>}
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => { upload(e.target.files); e.target.value = ''; }} />
      </div>
      {err && <ErrorBox message={err} onRetry={() => load()} />}
      <div className="media-grid">{items.map(m => (
        <figure className="media-i card" key={m.id}>
          <img src={optimize(m.url, 360)} alt="" loading="lazy" />
          <figcaption className="small muted">{m.width}×{m.height} · {fmtSize(m.bytes)}</figcaption>
          <div className="row"><button className="ghost sm" onClick={() => copy(m)}>Copy link</button><button className="ghost sm danger-t" onClick={() => del(m)}>Delete</button></div>
        </figure>))}</div>
      {loading && <Spinner />}
      {!loading && !items.length && !err && <p className="muted center-x">No images yet — upload your first one above.</p>}
      {next && !loading && <div className="center-x"><button className="ghost" onClick={() => load(next)}>Load more</button></div>}
    </>
  );
}
