import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../env.js';
import { sql, one } from '../db.js';
import { sign, auth, createSession, readSession, revokeSession, revokeAll, cookieOpts } from '../auth.js';
import { wrap, HttpError } from '../util.js';

const r = Router();
export const pub = u => ({ id: u.id, name: u.name, email: u.email, role: u.role, phone: u.phone, targetExam: u.target_exam, dailyGoal: u.daily_goal });

// Only failed attempts count towards the limit, so real students are never locked out by normal use.
const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 15, skipSuccessfulRequests: true, message: { error: 'Too many attempts. Try again in a few minutes.' } });
const registerLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, message: { error: 'Too many sign-ups from this network. Try later.' } });

const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', config.bcryptRounds); // equalises timing for unknown emails
const email = z.string().trim().toLowerCase().email().max(200);
const password = z.string().min(8, 'Password must be at least 8 characters').max(128);

async function issue(req, res, user, status = 200) {
  const { sid, cookie } = await createSession(user, req);
  res.cookie('rt', cookie, cookieOpts);
  res.status(status).json({ token: sign(user, sid), user: pub(user) });
}

r.get('/config', (q, s) => s.json({ registrationOpen: config.registrationOpen }));

r.post('/register', registerLimit, wrap(async (q, s) => {
  if (!config.registrationOpen) throw new HttpError(403, 'Registration is closed. Contact the administrator.');
  const b = z.object({
    name: z.string().trim().min(2).max(100), email, password,
    targetExam: z.string().trim().max(100).optional(), phone: z.string().trim().max(30).optional(),
  }).parse(q.body);
  const u = await one(
    'INSERT INTO users(name,email,password,phone,target_exam) VALUES($1,$2,$3,$4,$5) ON CONFLICT (email) DO NOTHING RETURNING *',
    [b.name, b.email, await bcrypt.hash(b.password, config.bcryptRounds), b.phone || null, b.targetExam || null]);
  if (!u) throw new HttpError(409, 'Email already registered');
  await issue(q, s, u, 201);
}));

r.post('/login', loginLimit, wrap(async (q, s) => {
  const b = z.object({ email, password: z.string().min(1).max(128) }).parse(q.body);
  const u = await one('SELECT * FROM users WHERE email=$1', [b.email]);
  const ok = await bcrypt.compare(b.password, u?.password || DUMMY_HASH);
  if (!u || !ok) throw new HttpError(401, 'Invalid email or password');
  if (!u.active) throw new HttpError(403, 'This account is deactivated. Contact the administrator.');
  await sql('UPDATE users SET last_login_at=now() WHERE id=$1', [u.id]);
  await issue(q, s, u);
}));

r.post('/refresh', wrap(async (q, s) => {
  const u = await readSession(q);
  if (!u) { s.clearCookie('rt', { ...cookieOpts, maxAge: undefined }); return s.status(401).json({ error: 'Session expired' }); }
  s.json({ token: sign(u, u.sid), user: pub(u) });
}));

r.post('/logout', wrap(async (q, s) => {
  const u = await readSession(q);
  if (u) await revokeSession(u.sid);
  s.clearCookie('rt', { ...cookieOpts, maxAge: undefined });
  s.json({ ok: true });
}));

r.post('/logout-all', auth, wrap(async (q, s) => {
  await revokeAll(q.user.id);
  s.clearCookie('rt', { ...cookieOpts, maxAge: undefined });
  s.json({ ok: true });
}));

r.get('/me', auth, (q, s) => s.json(pub(q.user)));

r.put('/me', auth, wrap(async (q, s) => {
  const b = z.object({
    name: z.string().trim().min(2).max(100).optional(), phone: z.string().trim().max(30).optional(),
    targetExam: z.string().trim().max(100).optional(), dailyGoal: z.number().int().min(1).max(500).optional(),
  }).parse(q.body);
  const u = await one(
    'UPDATE users SET name=COALESCE($2,name), phone=COALESCE($3,phone), target_exam=COALESCE($4,target_exam), daily_goal=COALESCE($5,daily_goal) WHERE id=$1 RETURNING *',
    [q.user.id, b.name, b.phone, b.targetExam, b.dailyGoal]);
  s.json(pub(u));
}));

r.post('/me/password', auth, wrap(async (q, s) => {
  const b = z.object({ current: z.string().max(128), next: password }).parse(q.body);
  if (!(await bcrypt.compare(b.current, q.user.password))) throw new HttpError(400, 'Current password is wrong');
  await sql('UPDATE users SET password=$2 WHERE id=$1', [q.user.id, await bcrypt.hash(b.next, config.bcryptRounds)]);
  await revokeAll(q.user.id, q.sid); // sign out every other device
  s.json({ ok: true });
}));

export default r;
