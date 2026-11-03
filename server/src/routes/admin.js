import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { config } from '../env.js';
import { sql, one } from '../db.js';
import { staff, role, revokeAll } from '../auth.js';
import { wrap, HttpError, intId, num, str, like, pct, csv, audit } from '../util.js';
import { bustPublic } from './public.js';
import { leaderboard } from '../leaderboard.js';

const r = Router();
r.use(...staff);

// ---- Validation helpers -------------------------------------------------------------
// "undefined" means "not provided" (so partial updates leave the column alone); empty string/null clears it.
const clear = v => (v === undefined ? undefined : v === '' || v === null ? null : v);
const nstr = max => z.string().trim().max(max).nullish().transform(clear);
const nint = (min, max) => z.preprocess(v => (v === '' ? null : v), z.coerce.number().int().min(min).max(max).nullish()).transform(v => (v === undefined ? undefined : v === null || Number.isNaN(v) ? null : v));
const ndate = z.string().refine(s => s === '' || !Number.isNaN(Date.parse(s)), 'Invalid date').nullish().transform(clear);
const httpUrl = z.string().trim().max(2000).refine(s => s === '' || /^https?:\/\/\S+$/i.test(s), 'Must be a valid http(s) link').nullish().transform(clear);

const QUESTION = {
  text: z.string().trim().min(3).max(2000),
  options: z.array(z.string().trim().min(1, 'Options cannot be empty').max(500)).length(4, 'Exactly 4 options are required'),
  answer: z.coerce.number().int().min(0).max(3),
  explanation: nstr(3000), topic: nstr(120), exam: nstr(120), source: nstr(200), subject: nstr(120), year: nint(1900, 2100),
  difficulty: z.enum(['easy', 'moderate', 'difficult']), published: z.boolean(),
};
const questionCreate = z.object({ ...QUESTION, difficulty: QUESTION.difficulty.default('moderate'), published: QUESTION.published.default(true) });
const questionUpdate = z.object(QUESTION).partial();

const TEST = {
  title: z.string().trim().min(2).max(200), description: nstr(2000), instructions: nstr(4000), exam: nstr(120),
  durationMin: z.coerce.number().int().min(1).max(600), marksPerQ: z.coerce.number().gt(0).max(100), negative: z.coerce.number().min(0).max(100),
  startsAt: ndate, endsAt: ndate, questions: z.array(z.number().int().positive()).max(1000),
  shuffle: z.boolean(), maxAttempts: nint(1, 100), active: z.boolean(), premium: z.boolean(), pricePaise: nint(0, 50_000_000),
};
const testCreate = z.object({ ...TEST, durationMin: TEST.durationMin.default(60), marksPerQ: TEST.marksPerQ.default(1), negative: TEST.negative.default(0),
  shuffle: TEST.shuffle.default(false), active: TEST.active.default(true), premium: TEST.premium.default(false), questions: TEST.questions.min(1, 'Select at least one question') });
const testUpdate = z.object(TEST).partial();

const AFFAIR = { title: z.string().trim().min(2).max(300), category: nstr(100), body: nstr(20000), date: ndate.transform(v => v || undefined), published: z.boolean() };
const MATERIAL = {
  title: z.string().trim().min(2).max(300), category: nstr(100), description: nstr(2000), url: httpUrl, coverUrl: httpUrl,
  premium: z.boolean(), downloadable: z.boolean(),
};

const link = z.string().trim().max(500).refine(v => v === '' || /^(https?:\/\/\S+|\/[\w\-/?=&#.%]*)$/i.test(v), 'Use a full https:// link or an in-site path like /tests').nullish().transform(clear);
const BANNER = { title: z.string().trim().min(2).max(160), subtitle: nstr(400), imageUrl: httpUrl, linkUrl: link, ctaLabel: nstr(40),
  audience: z.enum(['all', 'public', 'students']), position: nint(0, 1000), active: z.boolean() };
const ANNOUNCE = { text: z.string().trim().min(2).max(300), linkUrl: link, active: z.boolean() };
const TESTIMONIAL = { name: z.string().trim().min(2).max(100), role: nstr(120), quote: z.string().trim().min(5).max(600), photoUrl: httpUrl, position: nint(0, 1000), active: z.boolean() };

// ---- Generic CRUD -------------------------------------------------------------------
/**
 * name: URL segment; table; map: apiField -> column; json: fields stored as JSONB;
 * search: columns for ILIKE search; filters: query params that match a column exactly.
 */
function crud({ name, table, map, json = [], create, update, search = [], filters = [], order, extra = '', omitInList = [], beforeSave }) {
  const cols = fields => fields.map(f => `${map[f]} AS "${f}"`).join(', ');
  const all = Object.keys(map), listFields = all.filter(f => !omitInList.includes(f));
  const selList = `id, ${cols(listFields)}${extra}`, selOne = `id, ${cols(all)}`;
  const toRow = (body, partial) => {
    const out = [];
    for (const f of all) {
      if (body[f] === undefined) continue;
      out.push([map[f], json.includes(f) ? JSON.stringify(body[f]) : body[f]]);
    }
    if (!out.length && partial) throw new HttpError(400, 'Nothing to update');
    return out;
  };

  r.get(`/${name}`, wrap(async (q, s) => {
    const p = [], w = [];
    for (const f of filters) {
      const v = str(q.query[f]); if (!v) continue;
      p.push(/^(true|false)$/.test(v) ? v === 'true' : v); w.push(`${map[f]} = $${p.length}`);
    }
    const term = str(q.query.search);
    if (term && search.length) { p.push(like(term)); w.push('(' + search.map(c => `${c} ILIKE $${p.length}`).join(' OR ') + ')'); }
    const ids = str(q.query.ids).split(',').map(Number).filter(n => Number.isInteger(n) && n > 0).slice(0, 300);
    if (ids.length) { p.push(ids); w.push(`id = ANY($${p.length})`); }
    const where = w.length ? 'WHERE ' + w.join(' AND ') : '';
    const limit = num(q.query.limit, 25, 1, ids.length ? 300 : 100), page = num(q.query.page, 1, 1, 100000);
    const [rows, total] = await Promise.all([
      sql(`SELECT ${selList} FROM ${table} ${where} ORDER BY ${order} LIMIT ${limit} OFFSET ${(page - 1) * limit}`, p),
      one(`SELECT count(*)::int AS n FROM ${table} ${where}`, p),
    ]);
    s.json({ items: rows.rows, total: total.n, page, pages: Math.max(1, Math.ceil(total.n / limit)) });
  }));

  r.get(`/${name}/:id`, wrap(async (q, s) => {
    const row = await one(`SELECT ${selOne} FROM ${table} WHERE id=$1`, [intId(q.params.id)]);
    if (!row) throw new HttpError(404, 'Not found');
    s.json(row);
  }));

  r.post(`/${name}`, wrap(async (q, s) => {
    const body = create.parse(q.body);
    if (beforeSave) await beforeSave(body);
    const e = toRow(body, false);
    const row = await one(`INSERT INTO ${table}(${e.map(x => x[0])}) VALUES(${e.map((_, i) => '$' + (i + 1))}) RETURNING ${selOne}`, e.map(x => x[1]));
    audit(q.user, 'create', name, row.id, row.title || row.name || (row.text || '').slice(0, 80)); bustPublic();
    s.status(201).json(row);
  }));

  r.put(`/${name}/:id`, wrap(async (q, s) => {
    const body = update.parse(q.body);
    if (beforeSave) await beforeSave(body);
    const e = toRow(body, true);
    const touch = table === 'questions' ? ', updated_at=now()' : '';
    const row = await one(`UPDATE ${table} SET ${e.map((x, i) => `${x[0]}=$${i + 2}`)}${touch} WHERE id=$1 RETURNING ${selOne}`, [intId(q.params.id), ...e.map(x => x[1])]);
    if (!row) throw new HttpError(404, 'Not found');
    audit(q.user, 'update', name, row.id, row.title || row.name || (row.text || '').slice(0, 80)); bustPublic();
    s.json(row);
  }));

  r.delete(`/${name}/:id`, wrap(async (q, s) => {
    const row = await one(`DELETE FROM ${table} WHERE id=$1 RETURNING id`, [intId(q.params.id)]);
    if (!row) throw new HttpError(404, 'Not found');
    audit(q.user, 'delete', name, row.id); bustPublic();
    s.json({ ok: true });
  }));
}

// ---- Questions: bulk import / export -------------------------------------------------
const bulkSchema = z.array(z.unknown()).min(1, 'Send at least one question').max(1000, 'Up to 1000 questions per import');
r.post('/questions/bulk', wrap(async (q, s) => {
  const rowsIn = bulkSchema.parse(q.body?.questions ?? q.body);
  const forcePublished = typeof q.body?.published === 'boolean' ? q.body.published : null; // e.g. exam-only questions
  const valid = [], invalid = [];
  rowsIn.forEach((x, i) => {
    const res = questionCreate.safeParse(x);
    if (res.success) valid.push(forcePublished === null ? res.data : { ...res.data, published: forcePublished }); else invalid.push({ row: i + 1, error: res.error.issues[0].path.join('.') + ': ' + res.error.issues[0].message });
  });
  // skip questions whose text already exists (case-insensitive), and duplicates inside the file
  const seen = new Set(), fresh = [];
  const existing = new Set((await sql('SELECT lower(text) AS t FROM questions WHERE lower(text) = ANY($1)', [valid.map(v => v.text.toLowerCase())])).rows.map(x => x.t));
  let duplicates = 0;
  for (const v of valid) {
    const k = v.text.toLowerCase();
    if (existing.has(k) || seen.has(k)) { duplicates++; continue; }
    seen.add(k); fresh.push(v);
  }
  if (fresh.length) await sql(
    `INSERT INTO questions(text,options,answer,explanation,topic,exam,source,year,subject,difficulty,published)
     SELECT x.text, x.options, x.answer, x.explanation, x.topic, x.exam, x.source, x.year, x.subject, x.difficulty, x.published
     FROM jsonb_to_recordset($1::jsonb) AS x(text text, options jsonb, answer int, explanation text, topic text, exam text, source text, year int, subject text, difficulty text, published boolean)`,
    [JSON.stringify(fresh.map(v => ({ ...v, explanation: v.explanation ?? null, topic: v.topic ?? null, exam: v.exam ?? null, source: v.source ?? null, subject: v.subject ?? null, year: v.year ?? null })))]);
  audit(q.user, 'import', 'questions', null, `${fresh.length} added, ${duplicates} duplicates, ${invalid.length} invalid`);
  // ids of every valid row (new or already in the bank), in file order, so a test can be built straight from a CSV
  const idByText = new Map((await sql('SELECT id, lower(text) AS t FROM questions WHERE lower(text) = ANY($1)', [valid.map(v => v.text.toLowerCase())])).rows.map(x => [x.t, x.id]));
  const ids = [...new Set(valid.map(v => idByText.get(v.text.toLowerCase())).filter(Boolean))];
  s.status(201).json({ inserted: fresh.length, duplicates, ids, invalid: invalid.slice(0, 50), invalidCount: invalid.length });
}));

r.get('/questions/export.csv', wrap(async (q, s) => {
  const { rows } = await sql('SELECT * FROM questions ORDER BY id');
  const L = 'ABCD';
  const out = rows.map(x => ({
    text: x.text, option_a: x.options[0], option_b: x.options[1], option_c: x.options[2], option_d: x.options[3], answer: L[x.answer],
    explanation: x.explanation, subject: x.subject, topic: x.topic, exam: x.exam, difficulty: x.difficulty, year: x.year, source: x.source, published: x.published,
  }));
  s.type('text/csv').attachment('questions.csv').send(csv(['text', 'option_a', 'option_b', 'option_c', 'option_d', 'answer', 'explanation', 'subject', 'topic', 'exam', 'difficulty', 'year', 'source', 'published'], out));
}));

const ensureQuestionsExist = async body => {
  if (!body.questions) return;
  body.questions = [...new Set(body.questions)];
  const { rows } = await sql('SELECT id FROM questions WHERE id = ANY($1)', [body.questions]);
  if (rows.length !== body.questions.length) throw new HttpError(400, 'Some selected questions no longer exist');
};
const checkWindow = body => {
  if (body.startsAt && body.endsAt && new Date(body.endsAt) <= new Date(body.startsAt)) throw new HttpError(400, 'End time must be after the start time');
};

crud({
  name: 'questions', table: 'questions', create: questionCreate, update: questionUpdate, order: 'id DESC',
  map: { text: 'text', options: 'options', answer: 'answer', explanation: 'explanation', topic: 'topic', exam: 'exam', source: 'source', year: 'year', subject: 'subject', difficulty: 'difficulty', published: 'published' },
  json: ['options'], search: ['text', 'topic'], filters: ['subject', 'exam', 'difficulty', 'published'],
});

// ---- Tests ----------------------------------------------------------------------------
r.post('/tests/generate', wrap(async (q, s) => {
  const b = z.object({
    title: z.string().trim().min(2).max(200), exam: nstr(120), subject: nstr(120), topic: nstr(120), difficulty: z.enum(['easy', 'moderate', 'difficult']).nullish(),
    count: z.coerce.number().int().min(1).max(200), durationMin: z.coerce.number().int().min(1).max(600).optional(),
    marksPerQ: z.coerce.number().gt(0).max(100).default(1), negative: z.coerce.number().min(0).max(100).default(0), shuffle: z.boolean().default(true),
  }).parse(q.body);
  const p = [], w = ['published'];
  for (const k of ['subject', 'topic', 'exam', 'difficulty']) if (b[k]) { p.push(b[k]); w.push(`${k}=$${p.length}`); }
  p.push(b.count);
  const ids = (await sql(`SELECT id FROM questions WHERE ${w.join(' AND ')} ORDER BY random() LIMIT $${p.length}`, p)).rows.map(x => x.id);
  if (!ids.length) throw new HttpError(400, 'No published questions match those filters');
  const t = await one(
    `INSERT INTO tests(title,exam,duration_min,marks_per_q,negative,question_ids,shuffle) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id, title`,
    [b.title, b.exam ?? null, b.durationMin ?? Math.max(5, Math.round(ids.length * 1.2)), b.marksPerQ, b.negative, ids, b.shuffle]);
  audit(q.user, 'generate', 'tests', t.id, `${ids.length} questions`);
  s.status(201).json({ ...t, questionCount: ids.length, requested: b.count });
}));

r.get('/tests/:id/results', wrap(async (q, s) => {
  const id = intId(q.params.id);
  const t = await one('SELECT title FROM tests WHERE id=$1', [id]);
  if (!t) throw new HttpError(404, 'Not found');
  const { rows } = await sql(
    `SELECT u.name, u.email, a.score, a.max_marks AS "maxMarks", a.correct, a.wrong, a.skipped, a.time_taken AS "timeTaken", a.submitted_at AS "submittedAt", a.late, a.tab_switches AS "tabSwitches"
     FROM attempts a JOIN users u ON u.id=a.user_id WHERE a.test_id=$1 AND a.status='submitted' ORDER BY a.score DESC, a.time_taken ASC`, [id]);
  const items = rows.map((x, i) => ({ rank: i + 1, ...x, accuracy: pct(x.correct, x.correct + x.wrong) }));
  if (q.query.format === 'csv') {
    const h = ['rank', 'name', 'email', 'score', 'maxMarks', 'correct', 'wrong', 'skipped', 'accuracy', 'timeTaken', 'late', 'tabSwitches', 'submittedAt'];
    return s.type('text/csv').attachment(`results-test-${id}.csv`).send(csv(h, items));
  }
  s.json({ title: t.title, items });
}));

crud({
  name: 'tests', table: 'tests', create: testCreate, update: testUpdate, order: 'id DESC',
  map: { title: 'title', description: 'description', instructions: 'instructions', exam: 'exam', durationMin: 'duration_min', marksPerQ: 'marks_per_q', negative: 'negative',
    startsAt: 'starts_at', endsAt: 'ends_at', questions: 'question_ids', shuffle: 'shuffle', maxAttempts: 'max_attempts', active: 'active', premium: 'premium', pricePaise: 'price_paise' },
  search: ['title', 'exam'], filters: ['exam', 'active'], omitInList: ['questions', 'instructions'],
  extra: `, (SELECT count(*) FROM test_access ta WHERE ta.test_id=tests.id)::int AS "accessCount", cardinality(question_ids) AS "questionCount", (SELECT count(*) FROM attempts a WHERE a.test_id=tests.id AND a.status='submitted')::int AS attempts`,
  beforeSave: async b => { checkWindow(b); await ensureQuestionsExist(b); if (b.premium && b.pricePaise === 0) b.pricePaise = 0; },
});

// ---- Premium access: who can open which paid test ------------------------------------------
r.get('/tests/:id/access', wrap(async (q, s) => {
  const { rows } = await sql(`SELECT u.id, u.name, u.email, ta.source, ta.created_at AS "at" FROM test_access ta JOIN users u ON u.id=ta.user_id WHERE ta.test_id=$1 ORDER BY ta.created_at DESC LIMIT 500`, [intId(q.params.id)]);
  s.json({ items: rows });
}));
r.post('/tests/:id/access', wrap(async (q, s) => {
  const id = intId(q.params.id);
  if (!(await one('SELECT 1 FROM tests WHERE id=$1', [id]))) throw new HttpError(404, 'Test not found');
  const b = z.object({ emails: z.string().max(20000).optional(), all: z.boolean().optional() }).parse(q.body);
  let granted = 0, notFound = [];
  if (b.all) {
    granted = (await sql(`INSERT INTO test_access(user_id,test_id,source,granted_by) SELECT id,$1,'admin',$2 FROM users WHERE role='student' AND active ON CONFLICT DO NOTHING`, [id, q.user.id])).rowCount;
  } else {
    const emails = [...new Set((b.emails || '').toLowerCase().split(/[\s,;]+/).filter(Boolean))].slice(0, 2000);
    if (!emails.length) throw new HttpError(400, 'Enter at least one email');
    const users = (await sql('SELECT id, lower(email) AS email FROM users WHERE lower(email) = ANY($1)', [emails])).rows;
    notFound = emails.filter(e => !users.some(u => u.email === e));
    if (users.length) granted = (await sql(`INSERT INTO test_access(user_id,test_id,source,granted_by) SELECT x,$1,'admin',$3 FROM unnest($2::int[]) x ON CONFLICT DO NOTHING`, [id, users.map(u => u.id), q.user.id])).rowCount;
  }
  audit(q.user, 'grant-access', 'tests', id, b.all ? 'all students' : `${granted} user(s)`);
  s.json({ granted, notFound });
}));
r.delete('/tests/:id/access/:userId', wrap(async (q, s) => {
  await sql('DELETE FROM test_access WHERE test_id=$1 AND user_id=$2', [intId(q.params.id), intId(q.params.userId)]);
  audit(q.user, 'revoke-access', 'tests', q.params.id, 'user ' + q.params.userId);
  s.json({ ok: true });
}));
r.get('/payments', wrap(async (q, s) => {
  const [rows, tot] = await Promise.all([
    sql(`SELECT p.id, p.amount_paise AS "amountPaise", p.status, p.created_at AS "createdAt", p.paid_at AS "paidAt", p.provider_payment_id AS "paymentId", u.name, u.email, t.title AS test
         FROM payments p JOIN users u ON u.id=p.user_id LEFT JOIN tests t ON t.id=p.test_id ORDER BY p.id DESC LIMIT 200`),
    one(`SELECT COALESCE(sum(amount_paise) FILTER (WHERE status='paid'),0)::bigint AS "revenuePaise", count(*) FILTER (WHERE status='paid')::int AS paid FROM payments`),
  ]);
  s.json({ items: rows.rows, revenuePaise: Number(tot.revenuePaise), paid: tot.paid });
}));

// ---- Current affairs & materials ------------------------------------------------------
crud({
  name: 'current-affairs', table: 'current_affairs', create: z.object({ ...AFFAIR, published: AFFAIR.published.default(true) }), update: z.object(AFFAIR).partial(), order: 'pub_date DESC, id DESC',
  map: { title: 'title', category: 'category', body: 'body', date: 'pub_date', published: 'published' },
  search: ['title', 'body'], filters: ['category', 'published'], omitInList: ['body'],
});
crud({
  name: 'materials', table: 'materials', create: z.object({ ...MATERIAL, premium: MATERIAL.premium.default(false), downloadable: MATERIAL.downloadable.default(true) }), update: z.object(MATERIAL).partial(), order: 'id DESC',
  map: { title: 'title', category: 'category', description: 'description', url: 'url', coverUrl: 'cover_url', premium: 'premium', downloadable: 'downloadable' },
  search: ['title', 'description'], filters: ['category'],
});

crud({
  name: 'banners', table: 'banners', create: z.object({ ...BANNER, audience: BANNER.audience.default('all'), active: BANNER.active.default(true) }), update: z.object(BANNER).partial(), order: 'position, id',
  map: { title: 'title', subtitle: 'subtitle', imageUrl: 'image_url', linkUrl: 'link_url', ctaLabel: 'cta_label', audience: 'audience', position: 'position', active: 'active' },
  search: ['title', 'subtitle'], filters: ['audience', 'active'],
});
crud({
  name: 'announcements', table: 'announcements', create: z.object({ ...ANNOUNCE, active: ANNOUNCE.active.default(true) }), update: z.object(ANNOUNCE).partial(), order: 'id DESC',
  map: { text: 'text', linkUrl: 'link_url', active: 'active' }, search: ['text'], filters: ['active'],
});
crud({
  name: 'testimonials', table: 'testimonials', create: z.object({ ...TESTIMONIAL, active: TESTIMONIAL.active.default(true) }), update: z.object(TESTIMONIAL).partial(), order: 'position, id',
  map: { name: 'name', role: 'role', quote: 'quote', photoUrl: 'photo_url', position: 'position', active: 'active' }, search: ['name', 'quote'], filters: ['active'],
});

// ---- Site settings (footer contact + social links, about text) --------------------------
const SETTING_KEYS = ['upiId', 'upiName', 'contactEmail', 'phone', 'whatsapp', 'telegram', 'instagram', 'youtube', 'facebook', 'about'];
r.get('/settings', wrap(async (q, s) => s.json(Object.fromEntries((await sql('SELECT key, value FROM site_settings')).rows.map(x => [x.key, x.value])))));
r.put('/settings', wrap(async (q, s) => {
  const b = z.object(Object.fromEntries(SETTING_KEYS.map(k => [k, z.string().trim().max(k === 'about' ? 1000 : 300).optional()]))).strict().parse(q.body);
  for (const [k, v] of Object.entries(b)) {
    if (v) await sql(`INSERT INTO site_settings(key,value) VALUES($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`, [k, v]);
    else await sql('DELETE FROM site_settings WHERE key=$1', [k]);
  }
  audit(q.user, 'update', 'settings', null, Object.keys(b).join(', ')); bustPublic();
  s.json({ ok: true });
}));

// ---- Users ---------------------------------------------------------------------------
const pwd = z.string().min(8).max(128);
r.get('/users', wrap(async (q, s) => {
  const p = [], w = [];
  const isSuper = q.user.role === 'super_admin';
  const want = isSuper ? str(q.query.role) : 'student';
  if (want === 'student') w.push(`u.role='student'`); else if (want === 'staff') w.push(`u.role<>'student'`);
  const term = str(q.query.search);
  if (term) { p.push(like(term)); w.push(`(u.name ILIKE $${p.length} OR u.email ILIKE $${p.length})`); }
  const where = w.length ? 'WHERE ' + w.join(' AND ') : '';
  const limit = num(q.query.limit, 25, 1, 100), page = num(q.query.page, 1, 1, 100000);
  const [rows, total] = await Promise.all([
    sql(`SELECT u.id, u.name, u.email, u.phone, u.target_exam AS "targetExam", u.role, u.active, u.created_at AS "createdAt", u.last_login_at AS "lastLoginAt",
           (SELECT count(*) FROM attempts a WHERE a.user_id=u.id AND a.status='submitted')::int AS attempts
         FROM users u ${where} ORDER BY u.id DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`, p),
    one(`SELECT count(*)::int AS n FROM users u ${where}`, p),
  ]);
  s.json({ items: rows.rows, total: total.n, page, pages: Math.max(1, Math.ceil(total.n / limit)) });
}));

async function manageable(q) {
  const id = intId(q.params.id);
  const u = await one('SELECT * FROM users WHERE id=$1', [id]);
  if (!u) throw new HttpError(404, 'User not found');
  if (u.id === q.user.id) throw new HttpError(400, 'Use your profile page to change your own account');
  if (q.user.role !== 'super_admin' && u.role !== 'student') throw new HttpError(403, 'Only a super admin can manage staff accounts');
  return u;
}

r.put('/users/:id', wrap(async (q, s) => {
  const u = await manageable(q);
  const b = z.object({ active: z.boolean().optional(), role: z.enum(['student', 'content_admin', 'super_admin']).optional(), name: z.string().trim().min(2).max(100).optional() }).parse(q.body);
  if (b.role && q.user.role !== 'super_admin') throw new HttpError(403, 'Only a super admin can change roles');
  const row = await one('UPDATE users SET active=COALESCE($2,active), role=COALESCE($3,role), name=COALESCE($4,name) WHERE id=$1 RETURNING id, name, email, role, active', [u.id, b.active, b.role, b.name]);
  if (b.active === false || b.role) await revokeAll(u.id);
  audit(q.user, 'update', 'users', u.id, JSON.stringify(b));
  s.json(row);
}));

r.post('/users/:id/reset-password', wrap(async (q, s) => {
  const u = await manageable(q);
  const b = z.object({ password: pwd }).parse(q.body);
  await sql('UPDATE users SET password=$2 WHERE id=$1', [u.id, await bcrypt.hash(b.password, config.bcryptRounds)]);
  await revokeAll(u.id);
  audit(q.user, 'reset-password', 'users', u.id, u.email);
  s.json({ ok: true });
}));

r.post('/users', role('super_admin'), wrap(async (q, s) => {
  const b = z.object({ name: z.string().trim().min(2).max(100), email: z.string().trim().toLowerCase().email(), password: pwd, role: z.enum(['student', 'content_admin', 'super_admin']).default('content_admin') }).parse(q.body);
  const row = await one('INSERT INTO users(name,email,password,role) VALUES($1,$2,$3,$4) ON CONFLICT (email) DO NOTHING RETURNING id, name, email, role, active', [b.name, b.email, await bcrypt.hash(b.password, config.bcryptRounds), b.role]);
  if (!row) throw new HttpError(409, 'Email already registered');
  audit(q.user, 'create', 'users', row.id, `${row.email} (${row.role})`);
  s.status(201).json(row);
}));

// ---- Activity: who is doing what ------------------------------------------------------
r.get('/leaderboard', wrap(async (q, s) => {
  const period = ['week', 'month'].includes(q.query.period) ? q.query.period : 'all';
  const d = await leaderboard({ period, limit: q.query.format === 'csv' ? 5000 : 100, withEmail: true });
  if (q.query.format === 'csv') return s.type('text/csv').attachment(`leaderboard-${period}.csv`).send(csv(['rank', 'name', 'email', 'tests', 'rating', 'avgPct', 'accuracy', 'correct', 'wrong', 'totalTime'], d.items));
  s.json(d);
}));

r.get('/activity', wrap(async (q, s) => {
  const [now, live, subs, joins, logins, today] = await Promise.all([
    one(`SELECT count(DISTINCT user_id)::int AS n FROM sessions WHERE NOT revoked AND last_used_at > now() - interval '15 minutes'`),
    sql(`SELECT a.id, u.id AS "userId", u.name, u.email, t.title AS test, a.started_at AS "startedAt",
                GREATEST(0, round(extract(epoch FROM (a.started_at + make_interval(mins => t.duration_min) - now()))))::int AS "remainingSec", a.tab_switches AS "tabSwitches",
                (SELECT count(*) FROM jsonb_object_keys(a.answers))::int AS answered, cardinality(t.question_ids) AS total
         FROM attempts a JOIN users u ON u.id=a.user_id JOIN tests t ON t.id=a.test_id
         WHERE a.status='started' AND a.started_at + make_interval(mins => t.duration_min) > now() ORDER BY a.started_at DESC LIMIT 50`),
    sql(`SELECT a.id, u.id AS "userId", u.name, t.title AS test, a.score, a.max_marks AS "maxMarks", a.correct, a.wrong, a.time_taken AS "timeTaken", a.submitted_at AS "submittedAt", a.late, a.tab_switches AS "tabSwitches"
         FROM attempts a JOIN users u ON u.id=a.user_id JOIN tests t ON t.id=a.test_id WHERE a.status='submitted' ORDER BY a.submitted_at DESC LIMIT 25`),
    sql(`SELECT id, name, email, created_at AS "createdAt" FROM users WHERE role='student' ORDER BY id DESC LIMIT 10`),
    sql(`SELECT id, name, email, last_login_at AS "lastLoginAt" FROM users WHERE role='student' AND last_login_at IS NOT NULL ORDER BY last_login_at DESC LIMIT 10`),
    one(`SELECT (SELECT count(*) FROM attempts WHERE status='submitted' AND submitted_at > now() - interval '24 hours')::int AS submissions,
                (SELECT count(DISTINCT user_id) FROM practice_log WHERE created_at > now() - interval '24 hours')::int AS practisers,
                (SELECT count(*) FROM users WHERE role='student' AND created_at > now() - interval '24 hours')::int AS signups`),
  ]);
  s.json({ onlineNow: now.n, inProgress: live.rows, submissions: subs.rows.map(x => ({ ...x, pct: x.maxMarks ? Math.round((x.score / x.maxMarks) * 100) : 0 })), signups: joins.rows, logins: logins.rows, last24h: today });
}));

r.get('/users/:id/activity', wrap(async (q, s) => {
  const id = intId(q.params.id);
  const u = await one(`SELECT id, name, email, phone, target_exam AS "targetExam", role, active, created_at AS "createdAt", last_login_at AS "lastLoginAt" FROM users WHERE id=$1`, [id]);
  if (!u) throw new HttpError(404, 'User not found');
  if (q.user.role !== 'super_admin' && u.role !== 'student') throw new HttpError(403, 'Only a super admin can view staff activity');
  const [prac, att, recent, days, subj, ses, lb] = await Promise.all([
    one(`SELECT count(*)::int AS answered, count(*) FILTER (WHERE correct)::int AS correct, max(created_at) AS "lastAt", count(DISTINCT created_at::date) FILTER (WHERE created_at > now() - interval '30 days')::int AS "activeDays30" FROM practice_log WHERE user_id=$1`, [id]),
    one(`SELECT count(*)::int AS n, COALESCE(round(avg(score / NULLIF(max_marks,0) * 100))::int, 0) AS "avgPct", COALESCE(round(max(score / NULLIF(max_marks,0) * 100))::int, 0) AS "bestPct", COALESCE(sum(tab_switches),0)::int AS "tabSwitches" FROM attempts WHERE user_id=$1 AND status='submitted'`, [id]),
    sql(`SELECT a.id, t.title AS test, a.status, a.score, a.max_marks AS "maxMarks", a.correct, a.wrong, a.skipped, a.time_taken AS "timeTaken", COALESCE(a.submitted_at, a.started_at) AS "at", a.late, a.tab_switches AS "tabSwitches"
         FROM attempts a JOIN tests t ON t.id=a.test_id WHERE a.user_id=$1 AND a.status IN ('submitted','started') ORDER BY COALESCE(a.submitted_at, a.started_at) DESC LIMIT 20`, [id]),
    sql(`SELECT d::date::text AS date, count(l.id)::int AS answered, count(l.id) FILTER (WHERE l.correct)::int AS correct FROM generate_series(current_date - 13, current_date, '1 day') d
         LEFT JOIN practice_log l ON l.user_id=$1 AND l.created_at::date = d::date GROUP BY d ORDER BY d`, [id]),
    sql(`SELECT qq.subject, count(*)::int AS answered, count(*) FILTER (WHERE l.correct)::int AS correct FROM practice_log l JOIN questions qq ON qq.id=l.question_id WHERE l.user_id=$1 AND qq.subject IS NOT NULL GROUP BY qq.subject ORDER BY count(*) DESC LIMIT 8`, [id]),
    one(`SELECT count(*) FILTER (WHERE NOT revoked AND expires_at > now())::int AS active, max(last_used_at) AS "lastSeen", (array_agg(user_agent ORDER BY last_used_at DESC))[1] AS device FROM sessions WHERE user_id=$1`, [id]),
    leaderboard({ period: 'all', limit: 1, userId: id }),
  ]);
  s.json({
    user: u, practice: { ...prac, accuracy: pct(prac.correct, prac.answered) }, tests: att, recent: recent.rows, activity: days.rows,
    subjects: subj.rows.map(x => ({ ...x, accuracy: pct(x.correct, x.answered) })), sessions: ses, rank: lb.me ? { rank: lb.me.rank, of: lb.me.participants, avgPct: lb.me.avgPct } : null,
  });
}));

// ---- Dashboard ------------------------------------------------------------------------
r.get('/stats', wrap(async (q, s) => {
  const [c, signups, attempts, top, log] = await Promise.all([
    one(`SELECT (SELECT count(*) FROM users WHERE role='student')::int AS students,
                (SELECT count(*) FROM questions)::int AS questions, (SELECT count(*) FROM tests)::int AS tests,
                (SELECT count(*) FROM materials)::int AS materials, (SELECT count(*) FROM current_affairs)::int AS articles,
                (SELECT count(*) FROM attempts WHERE status='submitted')::int AS attempts,
                (SELECT count(DISTINCT user_id) FROM practice_log WHERE created_at > now() - interval '24 hours')::int AS "activeToday",
                (SELECT COALESCE(round(avg(score / NULLIF(max_marks,0) * 100))::int, 0) FROM attempts WHERE status='submitted') AS "avgScorePct"`),
    sql(`SELECT d::date::text AS date, count(u.id)::int AS n FROM generate_series(current_date - 13, current_date, '1 day') d LEFT JOIN users u ON u.created_at::date = d::date AND u.role='student' GROUP BY d ORDER BY d`),
    sql(`SELECT d::date::text AS date, count(a.id)::int AS n FROM generate_series(current_date - 13, current_date, '1 day') d LEFT JOIN attempts a ON a.submitted_at::date = d::date AND a.status='submitted' GROUP BY d ORDER BY d`),
    sql(`SELECT t.id, t.title, count(a.id)::int AS attempts, COALESCE(round(avg(a.score / NULLIF(a.max_marks,0) * 100))::int, 0) AS "avgPct" FROM tests t JOIN attempts a ON a.test_id=t.id AND a.status='submitted' GROUP BY t.id ORDER BY count(a.id) DESC LIMIT 5`),
    sql(`SELECT l.id, l.action, l.entity, l.entity_id AS "entityId", l.detail, l.created_at AS "createdAt", u.name AS who FROM admin_log l LEFT JOIN users u ON u.id=l.user_id ORDER BY l.id DESC LIMIT 12`),
  ]);
  s.json({ ...c, signups: signups.rows, attemptsByDay: attempts.rows, topTests: top.rows, log: log.rows });
}));

export default r;
