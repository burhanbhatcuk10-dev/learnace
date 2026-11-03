// Image input used across the admin forms: paste a link, upload to Cloudinary, or pick from the library.
import { useEffect, useRef, useState } from 'react';
import { api, uploadImage } from '../api.js';
import { useAsync, useUI, Modal, Spinner } from '../ui.jsx';
import { optimize } from '../widgets.jsx';

export const useMediaStatus = () => useAsync(() => api('/admin/media/status'), []);

export function MediaPicker({ onPick, onClose }) {
  const [items, setItems] = useState([]), [next, setNext] = useState(null), [loading, setLoading] = useState(true), [err, setErr] = useState('');
  const load = async cursor => {
    setLoading(true); setErr('');
    try { const d = await api('/admin/media?limit=30' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : '')); setItems(p => (cursor ? [...p, ...d.items] : d.items)); setNext(d.next); }
    catch (e) { setErr(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal title="Image library" onClose={onClose} wide footer={<button className="ghost" onClick={onClose}>Close</button>}>
      {err && <p className="err">{err}</p>}
      {!items.length && !loading && !err && <p className="muted">No images uploaded yet.</p>}
      <div className="media-grid pick">{items.map(m => (
        <button type="button" key={m.id} className="media-i" onClick={() => onPick(m.url)} title="Use this image"><img src={optimize(m.url, 300)} alt="" loading="lazy" /></button>))}</div>
      {loading && <Spinner />}
      {next && !loading && <div className="center-x"><button className="ghost" onClick={() => load(next)}>Load more</button></div>}
    </Modal>
  );
}

export function ImageField({ label, value, onChange, hint }) {
  const st = useMediaStatus(), { toast } = useUI(), fileRef = useRef(null);
  const [pct, setPct] = useState(null), [lib, setLib] = useState(false);
  const enabled = !!st.data?.enabled;
  const choose = async e => {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
    setPct(0);
    try { const r = await uploadImage(file, p => setPct(Math.round(p * 100))); onChange(r.url); toast('Image uploaded'); }
    catch (x) { toast(x.message, 'err'); } finally { setPct(null); }
  };
  return (
    <div className="field">
      <span>{label}</span>
      <div className="imgf">
        {value ? <img className="imgf-prev" src={optimize(value, 320)} alt="" onError={e => { e.currentTarget.style.visibility = 'hidden'; }} onLoad={e => { e.currentTarget.style.visibility = 'visible'; }} /> : <div className="imgf-prev empty" aria-hidden="true">No image</div>}
        <div className="imgf-ctl">
          <input type="url" placeholder="https://… link (Cloudinary, Unsplash, any image)" value={value || ''} onChange={e => onChange(e.target.value)} />
          <div className="row wrap">
            {enabled && <><button type="button" className="ghost sm" disabled={pct !== null} onClick={() => fileRef.current?.click()}>{pct !== null ? `Uploading ${pct}%…` : '⬆ Upload image'}</button>
              <button type="button" className="ghost sm" onClick={() => setLib(true)}>Choose from library</button></>}
            {value && <button type="button" className="ghost sm danger-t" onClick={() => onChange('')}>Remove</button>}
          </div>
          {st.data && !enabled && <p className="small muted" style={{ margin: 0 }}>Uploads are off until Cloudinary is configured on the server (see Admin → Media). You can still paste an image link.</p>}
          {hint && <p className="small muted" style={{ margin: 0 }}>{hint}</p>}
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={choose} />
      </div>
      {lib && <MediaPicker onClose={() => setLib(false)} onPick={u => { onChange(u); setLib(false); }} />}
    </div>
  );
}
