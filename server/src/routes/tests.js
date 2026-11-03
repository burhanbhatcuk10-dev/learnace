import { Router } from 'express';
import { z } from 'zod';
import { config } from '../env.js';
import { sql, one, tx } from '../db.js';
import { wrap, HttpError, intId, pct, seededShuffle } from '../util.js';
import { leaderboard } from '../leaderboard.js';

const r = Router(); // mounted behind auth in index.js

const deadlineOf = (a, t) => new Date(a.started_at).getTime() + t.duration_min * 60000;

/** Keep only answers for questions that belong to the test, with valid option indexes. */
function cleanAnswers(raw, ids) {
  const allowed = new Set(ids.map(String)), out = {};
  if (raw && typeof raw === 'object') for (const [k, v] of Object.entries(raw)) if (allowed.has(k) && Number.isInteger(v) && v >= 0 && v <= 3) out[k] = v;
  return out;
}
function cleanMarked(raw, ids) {
  const allowed = new Set(ids.map(String)), out = {};
  if (raw && typeof raw === 'object') for (const [k, v] of Object.entries(raw)) if (allowed.has(k) && v === true) out[k] = true;
  return out;
}

/**
 * Score an attempt and store an immutable review snapshot.
 * Uses the client's final answers when on time; otherwise falls back to the last autosave,
 * so a flaky connection at the buzzer never wipes out a whole test.
 */
async function finalize(a, t, clientAnswers) {
  const now = Date.now(), deadline = deadlineOf(a, t);
  const late = now > deadline + config.graceSeconds * 1000;
  const ids = t.question_ids;
  const answers = !late && clientAnswers ? cleanAnswers(clientAnswers, ids) : cleanAnswers(a.answers, ids);
  const marked = a.marked || {};
  const { rows } = await sql('SELECT * FROM questions WHERE id = ANY($1)', [ids]);
  const byId = new Map(rows.map(x => [x.id, x]));
  let c = 0, w = 0, k = 0;
  const review = ids.map(id => byId.get(id)).filter(Boolean).map(x => {
    const ch = answers[String(x.id)], has = Number.isInteger(ch);
    if (!has) k++; else if (ch === x.answer) c++; else w++;
    return { id: x.id, text: x.text, options: x.options, answer: x.answer, choice: has ? ch : null, correct: has ? ch === x.answer : null,
      explanation: x.explanation, subject: x.subject, topic: x.topic, marked: !!marked[String(x.id)] };
  });
  const score = +(c * t.marks_per_q - w * t.negative).toFixed(2);
  const maxMarks = +(review.length * t.marks_per_q).toFixed(2);
  const elapsed = (now - new Date(a.started_at).getTime()) / 1000;
  const timeTaken = Math.round(Math.min(elapsed, t.duration_min * 60));
  const done = await tx(async cl => {
    const u = await cl.query(
      `UPDATE attempts SET status='submitted', submitted_at=now(), correct=$2, wrong=$3, skipped=$4, total=$5, late=$6, max_marks=$7, score=$8, time_taken=$9, answers=$10, review=$11
       WHERE id=$1 AND status='started' RETURNING id`, [a.id, c, w, k, review.length, late, maxMarks, score, timeTaken, JSON.stringify(answers), JSON.stringify(review)]);
    if (!u.rowCount) return false; // someone else (a retry, or a second tab) finished it first
    const logged = review.filter(x => x.choice !== null);
    if (logged.length) await cl.query(
      `INSERT INTO practice_log(user_id,question_id,choice,correct,mode,created_at)
       SELECT $1, q, ch, ok, 'test', now() FROM unnest($2::int[], $3::int[], $4::bool[]) AS x(q, ch, ok)`,
      [a.user_id, logged.map(x => x.id), logged.map(x => x.choice), logged.map(x => x.correct)]);
    return true;
  });
  return done ? { score, maxMarks, correct: c, wrong: w, skipped: k, total: review.length, accuracy: pct(c, c + w), timeTaken, late, id: a.id } : null;
}

/** Auto-submit this user's attempts whose time ran out (called lazily; no background job needed). */
async function sweepExpired(userId) {
  const { rows } = await sql(
    `SELECT a.*, row_to_json(t.*) AS t FROM attempts a JOIN tests t ON t.id=a.test_id
     WHERE a.user_id=$1 AND a.status='started' AND a.started_at + make_interval(mins => t.duration_min) < now()`, [userId]);
  for (const x of rows) await finalize(x, x.t, null);
}

const listSql = `
  SELECT t.id, t.title, t.description, t.exam, t.duration_min AS "durationMin", t.negative, t.marks_per_q AS "marksPerQ",
         t.starts_at AS "startsAt", t.ends_at AS "endsAt", cardinality(t.question_ids) AS "questionCount", t.max_attempts AS "maxAttempts", t.instructions, t.premium, t.price_paise AS "pricePaise",
         (NOT t.premium OR EXISTS (SELECT 1 FROM test_access ta WHERE ta.test_id=t.id AND ta.user_id=$1)) AS unlocked,
         (SELECT count(*) FROM attempts a WHERE a.test_id=t.id AND a.user_id=$1 AND a.status='submitted')::int AS "myAttempts",
         (SELECT max(score) FROM attempts a WHERE a.test_id=t.id AND a.user_id=$1 AND a.status='submitted') AS "myBest",
         (SELECT id FROM attempts a WHERE a.test_id=t.id AND a.user_id=$1 AND a.status='started') AS "openAttemptId",
         (SELECT id FROM attempts a WHERE a.test_id=t.id AND a.user_id=$1 AND a.status='submitted' ORDER BY submitted_at DESC LIMIT 1) AS "lastAttemptId"
  FROM tests t WHERE t.active`;

r.get('/tests', wrap(async (q, s) => {
  await sweepExpired(q.user.id);
  s.json({ items: (await sql(listSql + ' ORDER BY t.id DESC', [q.user.id])).rows });
}));

r.get('/tests/:id', wrap(async (q, s) => {
  await sweepExpired(q.user.id);
  const t = await one(listSql + ' AND t.id=$2', [q.user.id, intId(q.params.id)]);
  if (!t) throw new HttpError(404, 'Test not found');
  s.json(t);
}));

r.post('/tests/:id/start', wrap(async (q, s) => {
  await sweepExpired(q.user.id);
  const t = await one('SELECT * FROM tests WHERE id=$1 AND active', [intId(q.params.id)]);
  if (!t) throw new HttpError(404, 'Test not found');
  if (t.premium && q.user.role === 'student' && !(await one('SELECT 1 FROM test_access WHERE user_id=$1 AND test_id=$2', [q.user.id, t.id])))
    throw new HttpError(402, 'This is a premium mock test. Unlock it to start.');
  let a = await one(`SELECT * FROM attempts WHERE user_id=$1 AND test_id=$2 AND status='started'`, [q.user.id, t.id]);
  if (!a) {
    const now = new Date();
    if (t.starts_at && now < t.starts_at) throw new HttpError(403, `This test opens on ${t.starts_at.toISOString()}`);
    if (t.ends_at && now > t.ends_at) throw new HttpError(403, 'This test has closed');
    if (!t.question_ids.length) throw new HttpError(409, 'This test has no questions yet');
    if (t.max_attempts) {
      const used = await one(`SELECT count(*)::int AS n FROM attempts WHERE user_id=$1 AND test_id=$2 AND status='submitted'`, [q.user.id, t.id]);
      if (used.n >= t.max_attempts) throw new HttpError(403, `You have used all ${t.max_attempts} attempt(s) for this test`);
    }
    a = await one(`INSERT INTO attempts(user_id,test_id) VALUES($1,$2) ON CONFLICT (user_id, test_id) WHERE status='started' DO NOTHING RETURNING *`, [q.user.id, t.id])
      || await one(`SELECT * FROM attempts WHERE user_id=$1 AND test_id=$2 AND status='started'`, [q.user.id, t.id]);
  }
  const { rows } = await sql('SELECT id, text, options, subject, topic FROM questions WHERE id = ANY($1)', [t.question_ids]);
  const pos = new Map(t.question_ids.map((id, i) => [id, i]));
  rows.sort((x, y) => pos.get(x.id) - pos.get(y.id));
  const questions = t.shuffle ? seededShuffle(rows, a.id) : rows;
  s.json({
    attemptId: a.id, remainingSec: Math.max(0, Math.round((deadlineOf(a, t) - Date.now()) / 1000)),
    test: { id: t.id, title: t.title, durationMin: t.duration_min, marksPerQ: t.marks_per_q, negative: t.negative },
    questions, saved: { answers: a.answers || {}, marked: a.marked || {}, tabSwitches: a.tab_switches || 0 },
  });
}));

const saveBody = z.object({ answers: z.record(z.any()).default({}), marked: z.record(z.any()).default({}), tabSwitches: z.number().int().min(0).max(1000).optional() });

/** Autosave: the client calls this (debounced) after every change. */
r.put('/attempts/:id/save', wrap(async (q, s) => {
  const a = await one('SELECT a.*, row_to_json(t.*) AS t FROM attempts a JOIN tests t ON t.id=a.test_id WHERE a.id=$1 AND a.user_id=$2', [intId(q.params.id), q.user.id]);
  if (!a) throw new HttpError(404, 'Attempt not found');
  if (a.status !== 'started') throw new HttpError(409, 'This attempt is already submitted');
  const t = a.t, left = deadlineOf(a, { duration_min: t.duration_min }) + config.graceSeconds * 1000 - Date.now();
  if (left < 0) throw new HttpError(409, 'Time is up');
  const b = saveBody.parse(q.body);
  await sql('UPDATE attempts SET answers=$2, marked=$3, tab_switches=GREATEST(tab_switches, $4), saved_at=now() WHERE id=$1 AND status=\'started\'',
    [a.id, JSON.stringify(cleanAnswers(b.answers, t.question_ids)), JSON.stringify(cleanMarked(b.marked, t.question_ids)), b.tabSwitches ?? 0]);
  s.json({ ok: true });
}));

r.post('/attempts/:id/submit', wrap(async (q, s) => {
  const a = await one('SELECT a.*, row_to_json(t.*) AS t FROM attempts a JOIN tests t ON t.id=a.test_id WHERE a.id=$1 AND a.user_id=$2', [intId(q.params.id), q.user.id]);
  if (!a) throw new HttpError(404, 'Attempt not found');
  if (a.status === 'submitted') return s.json({ id: a.id, alreadySubmitted: true });
  // Persist final marks for review before scoring.
  const b = saveBody.partial().parse(q.body || {});
  if (b.marked) await sql('UPDATE attempts SET marked=$2, tab_switches=GREATEST(tab_switches,$3) WHERE id=$1', [a.id, JSON.stringify(cleanMarked(b.marked, a.t.question_ids)), b.tabSwitches ?? 0]);
  a.marked = b.marked ? cleanMarked(b.marked, a.t.question_ids) : a.marked;
  const result = await finalize(a, a.t, b.answers);
  s.json(result || { id: a.id, alreadySubmitted: true });
}));

const rankSql = `WITH best AS (
    SELECT DISTINCT ON (user_id) user_id, score, time_taken FROM attempts WHERE test_id=$1 AND status='submitted' ORDER BY user_id, score DESC, time_taken ASC),
  ranked AS (
    SELECT u.id AS uid, u.name, b.score, b.time_taken AS "timeTaken", rank() OVER (ORDER BY b.score DESC, b.time_taken ASC)::int AS rank, count(*) OVER ()::int AS participants
    FROM best b JOIN users u ON u.id=b.user_id)`;

r.get('/tests/:id/leaderboard', wrap(async (q, s) => {
  const id = intId(q.params.id);
  const [top, me] = await Promise.all([
    sql(`${rankSql} SELECT name, score, "timeTaken", rank, participants, (uid=$2) AS "isMe" FROM ranked ORDER BY rank, name LIMIT 20`, [id, q.user.id]),
    one(`${rankSql} SELECT name, score, "timeTaken", rank, participants FROM ranked WHERE uid=$2`, [id, q.user.id]),
  ]);
  s.json({ items: top.rows, me: me || null, participants: top.rows[0]?.participants || 0 });
}));

// Overall performance ranking across all tests (names only — no emails for students).
r.get('/leaderboard', wrap(async (q, s) => {
  const period = ['week', 'month'].includes(q.query.period) ? q.query.period : 'all';
  s.json(await leaderboard({ period, limit: 50, userId: q.user.id }));
}));

// ---- History and results ----------------------------------------------------------
r.get('/attempts', wrap(async (q, s) => {
  await sweepExpired(q.user.id);
  const { rows } = await sql(
    `SELECT a.id, a.test_id AS "testId", t.title AS test, a.score, a.max_marks AS "maxMarks", a.correct, a.wrong, a.skipped, a.total, a.time_taken AS "timeTaken", a.submitted_at AS "submittedAt", a.late
     FROM attempts a JOIN tests t ON t.id=a.test_id WHERE a.user_id=$1 AND a.status='submitted' ORDER BY a.submitted_at DESC LIMIT 100`, [q.user.id]);
  s.json({ items: rows.map(x => ({ ...x, accuracy: pct(x.correct, x.correct + x.wrong) })) });
}));

r.get('/attempts/:id/result', wrap(async (q, s) => {
  const a = await one(
    `SELECT a.*, t.title, t.duration_min, t.negative, t.marks_per_q FROM attempts a JOIN tests t ON t.id=a.test_id WHERE a.id=$1 AND a.user_id=$2`, [intId(q.params.id), q.user.id]);
  if (!a) throw new HttpError(404, 'Result not found');
  if (a.status !== 'submitted') throw new HttpError(409, 'This attempt is still in progress');
  const bm = await sql('SELECT question_id FROM bookmarks WHERE user_id=$1', [q.user.id]);
  const marks = new Set(bm.rows.map(x => x.question_id));
  const rk = await one(`${rankSql} SELECT rank, participants FROM ranked WHERE uid=$2`, [a.test_id, q.user.id]);
  s.json({
    id: a.id, testId: a.test_id, title: a.title, score: a.score, maxMarks: a.max_marks, correct: a.correct, wrong: a.wrong, skipped: a.skipped, total: a.total,
    accuracy: pct(a.correct, a.correct + a.wrong), timeTaken: a.time_taken, durationMin: a.duration_min, negative: a.negative, marksPerQ: a.marks_per_q,
    late: a.late, tabSwitches: a.tab_switches, submittedAt: a.submitted_at, rank: rk?.rank ?? null, participants: rk?.participants ?? null,
    review: (a.review || []).map(x => ({ ...x, bookmarked: marks.has(x.id) })),
  });
}));

export default r;
