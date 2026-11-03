import { Router } from 'express';
import { z } from 'zod';
import { sql, one } from '../db.js';
import { wrap, HttpError, intId, num, str, like, pct, resolveTz, localDate, addDays } from '../util.js';

const r = Router(); // mounted behind auth in index.js

// ---- Filters metadata (drives the dropdowns) --------------------------------------
r.get('/meta/filters', wrap(async (q, s) => {
  const { rows } = await sql(`SELECT exam, subject, topic, count(*)::int AS n FROM questions WHERE published GROUP BY exam, subject, topic`);
  const exams = new Set(), subjects = new Map();
  for (const x of rows) {
    if (x.exam) exams.add(x.exam);
    if (!x.subject) continue;
    const e = subjects.get(x.subject) || { name: x.subject, count: 0, topics: new Set() };
    e.count += x.n; if (x.topic) e.topics.add(x.topic); subjects.set(x.subject, e);
  }
  s.json({
    exams: [...exams].sort(),
    subjects: [...subjects.values()].map(e => ({ name: e.name, count: e.count, topics: [...e.topics].sort() })).sort((a, b) => a.name.localeCompare(b.name)),
  });
}));

// Questions that belong to a test the student is taking right now are hidden from practice, so answers can't be looked up mid-test.
const NOT_IN_LIVE_TEST = `NOT EXISTS (SELECT 1 FROM attempts a JOIN tests t ON t.id=a.test_id WHERE a.user_id=$1 AND a.status='started' AND qq.id = ANY(t.question_ids))`;

// ---- Practice ---------------------------------------------------------------------
// Answers are never sent with the question list; they come back from /check.
r.get('/questions', wrap(async (q, s) => {
  const p = [q.user.id];
  const w = ['qq.published', NOT_IN_LIVE_TEST];
  const add = (cond, v) => { p.push(v); w.push(cond.replace('?', '$' + p.length)); };
  for (const k of ['subject', 'topic', 'exam', 'difficulty']) { const v = str(q.query[k]); if (v) add(`qq.${k} = ?`, v); }
  const search = str(q.query.search);
  if (search) { p.push(like(search)); w.push(`(qq.text ILIKE $${p.length} OR qq.topic ILIKE $${p.length})`); }
  const mode = str(q.query.mode);
  if (mode === 'unattempted') w.push('NOT EXISTS (SELECT 1 FROM practice_log l WHERE l.user_id=$1 AND l.question_id=qq.id)');
  if (mode === 'bookmarked') w.push('EXISTS (SELECT 1 FROM bookmarks b WHERE b.user_id=$1 AND b.question_id=qq.id)');
  if (mode === 'mistakes') w.push(`qq.id IN (SELECT question_id FROM (SELECT DISTINCT ON (question_id) question_id, correct FROM practice_log WHERE user_id=$1 ORDER BY question_id, created_at DESC) m WHERE NOT m.correct)`);
  const limit = num(q.query.limit, 10, 1, 50);
  const random = q.query.random === '1' || q.query.random === 'true';
  const offset = random ? 0 : (num(q.query.page, 1, 1, 100000) - 1) * limit;
  p.push(limit + 1, offset);
  const { rows } = await sql(
    `SELECT qq.id, qq.text, qq.options, qq.subject, qq.topic, qq.exam, qq.difficulty, qq.year,
            EXISTS (SELECT 1 FROM bookmarks b WHERE b.user_id=$1 AND b.question_id=qq.id) AS bookmarked
     FROM questions qq WHERE ${w.join(' AND ')} ORDER BY ${random ? 'random()' : 'qq.id DESC'} LIMIT $${p.length - 1} OFFSET $${p.length}`, p);
  s.json({ items: rows.slice(0, limit), hasMore: rows.length > limit });
}));

r.post('/questions/:id/check', wrap(async (q, s) => {
  const id = intId(q.params.id);
  const b = z.object({ choice: z.number().int().min(0).max(3), mode: z.enum(['practice', 'daily', 'revision']).default('practice') }).parse(q.body);
  const x = await one('SELECT answer, explanation FROM questions WHERE id=$1 AND published', [id]);
  if (!x) throw new HttpError(404, 'Question not found');
  // Never reveal an answer while the student has an unfinished test containing this question.
  const live = await one(
    `SELECT 1 FROM attempts a JOIN tests t ON t.id=a.test_id
     WHERE a.user_id=$1 AND a.status='started' AND $2 = ANY(t.question_ids)
       AND a.started_at + make_interval(mins => t.duration_min) + interval '150 seconds' > now() LIMIT 1`, [q.user.id, id]);
  if (live) throw new HttpError(403, 'This question is part of a test you are taking. Answers unlock after you submit.');
  const correct = x.answer === b.choice;
  await sql('INSERT INTO practice_log(user_id,question_id,choice,correct,mode) VALUES($1,$2,$3,$4,$5)', [q.user.id, id, b.choice, correct, b.mode]);
  s.json({ correct, answer: x.answer, explanation: x.explanation });
}));

r.post('/questions/:id/bookmark', wrap(async (q, s) => {
  const id = intId(q.params.id);
  if (!(await one('SELECT 1 FROM questions WHERE id=$1', [id]))) throw new HttpError(404, 'Question not found');
  await sql('INSERT INTO bookmarks(user_id,question_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [q.user.id, id]);
  s.json({ bookmarked: true });
}));
r.delete('/questions/:id/bookmark', wrap(async (q, s) => {
  await sql('DELETE FROM bookmarks WHERE user_id=$1 AND question_id=$2', [q.user.id, intId(q.params.id)]);
  s.json({ bookmarked: false });
}));

// Same 10 questions for everyone on a given (local) day.
r.get('/practice/daily', wrap(async (q, s) => {
  const tz = await resolveTz(q.query.tz), day = localDate(tz);
  const { rows } = await sql(
    `SELECT qq.id, qq.text, qq.options, qq.subject, qq.topic, qq.exam, qq.difficulty, qq.year,
            EXISTS (SELECT 1 FROM bookmarks b WHERE b.user_id=$1 AND b.question_id=qq.id) AS bookmarked
     FROM questions qq WHERE qq.published AND ${NOT_IN_LIVE_TEST} ORDER BY md5(qq.id::text || $2) LIMIT 10`, [q.user.id, day]);
  const done = await one(`SELECT count(DISTINCT question_id)::int AS n FROM practice_log WHERE user_id=$1 AND mode='daily' AND (created_at AT TIME ZONE $2)::date = $3::date`, [q.user.id, tz, day]);
  s.json({ date: day, items: rows, answeredToday: done.n });
}));

// ---- Personal analytics -----------------------------------------------------------
function streakOf(days, today) {
  const set = new Set(days);
  let cur = set.has(today) ? today : addDays(today, -1), n = 0;
  while (set.has(cur)) { n++; cur = addDays(cur, -1); }
  return n;
}

r.get('/me/stats', wrap(async (q, s) => {
  const tz = await resolveTz(q.query.tz), today = localDate(tz), uid = q.user.id;
  const [tot, att, days, act, subj, recent, extra] = await Promise.all([
    one('SELECT count(*)::int AS answered, count(*) FILTER (WHERE correct)::int AS correct FROM practice_log WHERE user_id=$1', [uid]),
    one(`SELECT count(*)::int AS n, COALESCE(round(avg(score / NULLIF(max_marks,0) * 100))::int, 0) AS avg_pct, COALESCE(max(score / NULLIF(max_marks,0) * 100),0)::float AS best_pct FROM attempts WHERE user_id=$1 AND status='submitted'`, [uid]),
    sql(`SELECT DISTINCT (created_at AT TIME ZONE $2)::date::text AS d FROM practice_log WHERE user_id=$1 AND created_at > now() - interval '400 days'`, [uid, tz]),
    sql(`SELECT (created_at AT TIME ZONE $2)::date::text AS d, count(*)::int AS n, count(*) FILTER (WHERE correct)::int AS c FROM practice_log
         WHERE user_id=$1 AND created_at > now() - interval '16 days' GROUP BY d`, [uid, tz]),
    sql(`SELECT qq.subject, count(*)::int AS answered, count(*) FILTER (WHERE l.correct)::int AS correct FROM practice_log l JOIN questions qq ON qq.id=l.question_id
         WHERE l.user_id=$1 AND qq.subject IS NOT NULL GROUP BY qq.subject ORDER BY count(*) DESC LIMIT 12`, [uid]),
    sql(`SELECT a.id, t.title AS test, a.score, a.max_marks AS marks, a.correct, a.total, a.submitted_at AS "submittedAt" FROM attempts a JOIN tests t ON t.id=a.test_id
         WHERE a.user_id=$1 AND a.status='submitted' ORDER BY a.submitted_at DESC LIMIT 5`, [uid]),
    one(`SELECT (SELECT count(*) FROM bookmarks WHERE user_id=$1)::int AS bookmarks,
                (SELECT count(*) FROM (SELECT DISTINCT ON (question_id) question_id, correct FROM practice_log WHERE user_id=$1 ORDER BY question_id, created_at DESC) m WHERE NOT m.correct)::int AS mistakes`, [uid]),
  ]);
  const byDay = new Map(act.rows.map(x => [x.d, x]));
  const activity = Array.from({ length: 14 }, (_, i) => { const d = addDays(today, i - 13); const x = byDay.get(d); return { date: d, answered: x?.n || 0, correct: x?.c || 0 }; });
  s.json({
    attempts: att.n, avgScorePct: att.avg_pct, bestScorePct: Math.round(att.best_pct),
    questions: tot.answered, accuracy: pct(tot.correct, tot.answered),
    streak: streakOf(days.rows.map(x => x.d), today), todayAnswered: byDay.get(today)?.n || 0, dailyGoal: q.user.daily_goal,
    activity,
    subjects: subj.rows.map(x => ({ ...x, accuracy: pct(x.correct, x.answered) })),
    recent: recent.rows.map(a => ({ ...a, accuracy: pct(a.correct, a.total) })),
    bookmarks: extra.bookmarks, mistakes: extra.mistakes,
  });
}));

// ---- Reading content --------------------------------------------------------------
r.get('/current-affairs', wrap(async (q, s) => {
  const p = [], w = ['published'];
  const category = str(q.query.category), search = str(q.query.search);
  if (category) { p.push(category); w.push(`category = $${p.length}`); }
  if (search) { p.push(like(search)); w.push(`(title ILIKE $${p.length} OR body ILIKE $${p.length})`); }
  const limit = num(q.query.limit, 20, 1, 50), page = num(q.query.page, 1, 1, 10000);
  p.push(limit + 1, (page - 1) * limit);
  const [{ rows }, cats] = await Promise.all([
    sql(`SELECT id, title, category, body, pub_date AS date FROM current_affairs WHERE ${w.join(' AND ')} ORDER BY pub_date DESC, id DESC LIMIT $${p.length - 1} OFFSET $${p.length}`, p),
    sql(`SELECT DISTINCT category FROM current_affairs WHERE published AND category IS NOT NULL ORDER BY 1`),
  ]);
  s.json({ items: rows.slice(0, limit), hasMore: rows.length > limit, categories: cats.rows.map(x => x.category) });
}));

r.get('/materials', wrap(async (q, s) => {
  const p = [], w = [];
  const category = str(q.query.category), search = str(q.query.search);
  if (category) { p.push(category); w.push(`category = $${p.length}`); }
  if (search) { p.push(like(search)); w.push(`(title ILIKE $${p.length} OR description ILIKE $${p.length})`); }
  const [{ rows }, cats] = await Promise.all([
    sql(`SELECT id, title, category, description, url, cover_url AS "coverUrl", premium, downloadable, created_at AS "createdAt" FROM materials ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY id DESC LIMIT 100`, p),
    sql(`SELECT DISTINCT category FROM materials WHERE category IS NOT NULL ORDER BY 1`),
  ]);
  s.json({ items: rows, categories: cats.rows.map(x => x.category) });
}));

export default r;
