// Image storage on Cloudinary. The browser uploads straight to Cloudinary using a short-lived signature
// from this server (so the API secret never leaves the server and large files never pass through it).
import { Router } from 'express';
import crypto from 'crypto';
import { config } from '../env.js';
import { staff } from '../auth.js';
import { wrap, HttpError, str, num, audit } from '../util.js';

const r = Router();
r.use(...staff);

const cld = config.cloudinary;
const API = () => `https://api.cloudinary.com/v1_1/${cld.cloudName}`;
const ALLOWED = 'jpg,jpeg,png,webp,gif,avif,svg';
const sign = params => crypto.createHash('sha1')
  .update(Object.keys(params).filter(k => params[k] !== undefined && params[k] !== '').sort().map(k => `${k}=${params[k]}`).join('&') + cld.apiSecret).digest('hex');
const need = () => { if (!cld.enabled) throw new HttpError(503, 'Image storage is not configured. Add the CLOUDINARY_* settings on the server.'); };
const basic = () => 'Basic ' + Buffer.from(`${cld.apiKey}:${cld.apiSecret}`).toString('base64');

async function call(url, opts) {
  let res;
  try { res = await fetch(url, { ...opts, signal: AbortSignal.timeout(15000) }); }
  catch { throw new HttpError(502, 'Could not reach Cloudinary. Try again in a moment.'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(502, 'Cloudinary: ' + (data.error?.message || res.status));
  return data;
}

r.get('/status', (q, s) => s.json({ enabled: cld.enabled, cloudName: cld.enabled ? cld.cloudName : null }));

// Parameters the browser must send, unchanged, with the file.
r.get('/sign', wrap(async (q, s) => {
  need();
  const p = { allowed_formats: ALLOWED, folder: cld.folder, timestamp: Math.floor(Date.now() / 1000) };
  s.json({ url: `${API()}/image/upload`, apiKey: cld.apiKey, ...p, signature: sign(p) });
}));

r.get('/', wrap(async (q, s) => {
  need();
  const p = new URLSearchParams({ prefix: cld.folder + '/', max_results: String(num(q.query.limit, 40, 1, 100)), direction: 'desc' });
  const cur = str(q.query.cursor); if (cur) p.set('next_cursor', cur);
  const d = await call(`${API()}/resources/image/upload?${p}`, { headers: { Authorization: basic() } });
  s.json({
    items: (d.resources || []).map(x => ({ id: x.public_id, url: x.secure_url, width: x.width, height: x.height, bytes: x.bytes, format: x.format, createdAt: x.created_at })),
    next: d.next_cursor || null,
  });
}));

r.delete('/', wrap(async (q, s) => {
  need();
  const id = str(q.query.id);
  if (!id.startsWith(cld.folder + '/') || id.includes('..')) throw new HttpError(400, 'Not one of this site’s images');
  const p = { public_id: id, timestamp: Math.floor(Date.now() / 1000) };
  const body = new URLSearchParams({ ...p, api_key: cld.apiKey, signature: sign(p) });
  await call(`${API()}/image/destroy`, { method: 'POST', body });
  audit(q.user, 'delete', 'image', id);
  s.json({ ok: true });
}));

export default r;
