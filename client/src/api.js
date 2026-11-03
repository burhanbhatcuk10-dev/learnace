// Tiny fetch wrapper: bearer token in memory, httpOnly refresh cookie, single-flight token refresh.
let token = null;
let refreshing = null;
let onAuthLost = () => {};

export const setToken = t => { token = t; };
export const setAuthLostHandler = f => { onAuthLost = f; };
export const TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } })();

/** Ask the server for a fresh access token using the refresh cookie. Concurrent callers share one request. */
export function refreshSession() {
  if (!refreshing) {
    refreshing = fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
      .then(async r => { if (!r.ok) return null; const d = await r.json(); token = d.token; return d; })
      .catch(() => null)
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

export async function api(path, { method = 'GET', body, signal } = {}) {
  const go = () => fetch('/api' + path, {
    method, credentials: 'include', signal,
    headers: { ...(body !== undefined && { 'Content-Type': 'application/json' }), ...(token && { Authorization: 'Bearer ' + token }) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let r;
  try { r = await go(); }
  catch (e) { if (e.name === 'AbortError') throw e; throw new Error('Cannot reach the server. Check your internet connection.'); }
  if (r.status === 401 && token) {
    const fresh = await refreshSession();
    if (fresh) r = await go(); else { token = null; onAuthLost(); }
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || (r.status >= 500 ? 'The server is busy. Please try again in a moment.' : `Request failed (${r.status})`));
  return data;
}

/** Download an authenticated file (CSV exports). */
export async function download(path, filename) {
  const go = () => fetch('/api' + path, { credentials: 'include', headers: { Authorization: 'Bearer ' + token } });
  let r = await go();
  if (r.status === 401 && (await refreshSession())) r = await go();
  if (!r.ok) throw new Error('Download failed');
  saveBlob(await r.blob(), filename);
}
export function saveBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Shrink large photos before upload (phones produce 5-10 MB images). GIF/SVG are sent untouched. */
async function shrink(file, max = 2400) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 1_500_000 || typeof createImageBitmap === 'undefined') return file;
  try {
    const bmp = await createImageBitmap(file), k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.88));
    return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
  } catch { return file; }
}

/** Upload an image straight to Cloudinary with a signature from our server. Resolves { url, id }. */
export async function uploadImage(file, onProgress) {
  if (!/^image\//.test(file.type)) throw new Error('Please choose an image file.');
  if (file.size > 25 * 1024 * 1024) throw new Error('That image is too large (max 25 MB).');
  const f = await shrink(file);
  if (f.size > 10 * 1024 * 1024) throw new Error('Image is over 10 MB. Please choose a smaller one.');
  const sig = await api('/admin/media/sign');
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append('file', f); fd.append('api_key', sig.apiKey); fd.append('timestamp', sig.timestamp); fd.append('signature', sig.signature);
    fd.append('folder', sig.folder); fd.append('allowed_formats', sig.allowed_formats);
    const x = new XMLHttpRequest(); x.open('POST', sig.url);
    x.upload.onprogress = e => e.lengthComputable && onProgress?.(e.loaded / e.total);
    x.onload = () => {
      let d = {}; try { d = JSON.parse(x.responseText); } catch { /* ignore */ }
      if (x.status < 300 && d.secure_url) resolve({ url: d.secure_url, id: d.public_id });
      else reject(new Error(d.error?.message || 'Upload failed. Please try again.'));
    };
    x.onerror = () => reject(new Error('Upload failed. Check your internet connection.'));
    x.send(fd);
  });
}
