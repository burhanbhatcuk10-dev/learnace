import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from './env.js';
import { sql, one } from './db.js';

const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const sign = (u, sid) => jwt.sign({ id: u.id, role: u.role, sid }, config.jwtSecret, { expiresIn: '15m' });

export const cookieOpts = {
  httpOnly: true, sameSite: 'lax', secure: config.prod, path: '/api/auth',
  maxAge: config.sessionDays * 86400 * 1000,
};

/** Opaque, revocable refresh session. The cookie holds "<session id>.<secret>"; only a hash is stored. */
export async function createSession(user, req) {
  const secret = crypto.randomBytes(32).toString('base64url');
  const s = await one(
    `INSERT INTO sessions(user_id, token_hash, user_agent, expires_at) VALUES($1,$2,$3, now() + make_interval(days => $4)) RETURNING id`,
    [user.id, hash(secret), (req.get('user-agent') || '').slice(0, 250), config.sessionDays]);
  return { sid: s.id, cookie: `${s.id}.${secret}` };
}

export async function readSession(req) {
  const raw = req.cookies?.rt;
  if (typeof raw !== 'string') return null;
  const [sid, secret] = raw.split('.');
  if (!UUID.test(sid || '') || !secret) return null;
  const u = await one(
    `SELECT u.*, s.id AS sid FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id=$1 AND s.token_hash=$2 AND NOT s.revoked AND s.expires_at > now() AND u.active`, [sid, hash(secret)]);
  if (!u) return null;
  // sliding expiry, written at most once an hour
  sql(`UPDATE sessions SET last_used_at=now(), expires_at=now() + make_interval(days => $2) WHERE id=$1 AND last_used_at < now() - interval '1 hour'`, [sid, config.sessionDays]).catch(() => {});
  return u;
}

export const revokeSession = sid => sql('UPDATE sessions SET revoked=true WHERE id=$1', [sid]);
export const revokeAll = (userId, exceptSid = null) => sql('UPDATE sessions SET revoked=true WHERE user_id=$1 AND ($2::uuid IS NULL OR id <> $2::uuid)', [userId, exceptSid]);

export async function auth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) throw new Error('no token');
    const p = jwt.verify(header.slice(7), config.jwtSecret);
    const u = await one(
      `SELECT u.* FROM users u JOIN sessions s ON s.user_id = u.id
       WHERE u.id=$1 AND s.id=$2 AND NOT s.revoked AND s.expires_at > now() AND u.active`, [p.id, p.sid]);
    if (!u) throw new Error('inactive');
    req.user = u; req.sid = p.sid; next();
  } catch (e) {
    if (e.code && /^(08|57|ECONN|ETIME)/.test(String(e.code))) return next(e); // db trouble is a 500, not a logout
    res.status(401).json({ error: 'Unauthorized' });
  }
}
export const role = (...allowed) => (req, res, next) => (allowed.includes(req.user.role) ? next() : res.status(403).json({ error: 'Forbidden' }));
export const staff = [auth, role('super_admin', 'content_admin')];
