import { sql, one } from './db.js';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
export const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

export const intId = v => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 2147483647) throw new HttpError(404, 'Not found');
  return n;
};
export const num = (v, def, min, max) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), min), max) : def;
};
export const str = v => (typeof v === 'string' ? v.trim() : '');

/** Escape user text for ILIKE. */
export const like = s => '%' + s.replace(/[\\%_]/g, '\\$&') + '%';

// Browsers report legacy names (Chrome says "Asia/Calcutta"); some Postgres builds only know the canonical one.
const TZ_ALIASES = { 'Asia/Calcutta': 'Asia/Kolkata', 'Asia/Saigon': 'Asia/Ho_Chi_Minh', 'Asia/Katmandu': 'Asia/Kathmandu', 'Asia/Rangoon': 'Asia/Yangon',
  'Asia/Dacca': 'Asia/Dhaka', 'Europe/Kiev': 'Europe/Kyiv', 'America/Buenos_Aires': 'America/Argentina/Buenos_Aires', 'Atlantic/Faeroe': 'Atlantic/Faroe' };
const tzCache = new Map();
/** Returns a timezone name that both JavaScript and Postgres understand, or 'UTC'. */
export async function resolveTz(tz) {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return 'UTC';
  if (tzCache.has(tz)) return tzCache.get(tz);
  let out = 'UTC';
  try {
    for (const cand of [tz, TZ_ALIASES[tz]].filter(Boolean)) {
      new Intl.DateTimeFormat('en', { timeZone: cand }); // throws if JS does not know it
      if (await one('SELECT 1 FROM pg_timezone_names WHERE name=$1', [cand])) { out = cand; break; }
    }
  } catch { /* fall through to UTC */ }
  if (tzCache.size < 300) tzCache.set(tz, out);
  return out;
}
/** YYYY-MM-DD for "now" in a timezone. */
export const localDate = (tz, d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
export const addDays = (ymd, n) => { const d = new Date(ymd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export function csv(headers, rows) {
  const cell = v => {
    if (v === null || v === undefined) return '';
    let s = v instanceof Date ? v.toISOString() : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // neutralise spreadsheet formula injection
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return '﻿' + [headers.join(','), ...rows.map(r => headers.map(h => cell(r[h])).join(','))].join('\r\n');
}

export const audit = (user, action, entity, entityId, detail) =>
  sql('INSERT INTO admin_log(user_id,action,entity,entity_id,detail) VALUES($1,$2,$3,$4,$5)', [user?.id ?? null, action, entity, entityId == null ? null : String(entityId), detail ?? null]).catch(() => {});

// Small deterministic PRNG so a shuffled test keeps the same order when resumed.
export function seededShuffle(arr, seed) {
  const a = [...arr];
  let s = (seed * 2654435761) >>> 0;
  const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
