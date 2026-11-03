// Performance leaderboard shared by the student and admin views.
// avgPct  = average of each student's BEST percentage on every test they have taken.
// rating  = avgPct x tests/(tests+1): rewards consistency, so one lucky test can't outrank steady results.
// Ranked by rating; ties go to the higher average, then more tests, then less total time.
import { sql } from './db.js';
import { pct } from './util.js';

const SINCE = { week: 7, month: 30 };
export const sinceOf = period => (SINCE[period] ? new Date(Date.now() - SINCE[period] * 86400000).toISOString() : null);

const RANKED = `
  WITH best AS (
    SELECT DISTINCT ON (a.user_id, a.test_id) a.user_id, a.test_id, a.score, a.max_marks, a.correct, a.wrong, a.time_taken
    FROM attempts a WHERE a.status='submitted' AND a.max_marks > 0 AND ($1::timestamptz IS NULL OR a.submitted_at >= $1::timestamptz)
    ORDER BY a.user_id, a.test_id, a.score / a.max_marks DESC, a.time_taken ASC),
  agg AS (
    SELECT user_id, count(*)::int AS tests, round(avg(score / max_marks * 100)::numeric, 1)::float AS "avgPct",
           round((avg(score / max_marks * 100) * count(*) / (count(*) + 1.0))::numeric, 1)::float AS rating,
           COALESCE(sum(correct),0)::int AS correct, COALESCE(sum(wrong),0)::int AS wrong, COALESCE(sum(time_taken),0)::int AS "totalTime"
    FROM best GROUP BY user_id),
  ranked AS (
    SELECT u.id, u.name, u.email, g.tests, g."avgPct", g.rating, g.correct, g.wrong, g."totalTime",
           rank() OVER (ORDER BY g.rating DESC, g."avgPct" DESC, g.tests DESC, g."totalTime" ASC)::int AS rank, count(*) OVER ()::int AS participants
    FROM agg g JOIN users u ON u.id = g.user_id WHERE u.active AND u.role = 'student')`;

/** Top performers plus (optionally) one user's own row. */
export async function leaderboard({ period = 'all', limit = 50, userId = null, withEmail = false }) {
  const since = sinceOf(period);
  const cols = `id, name, ${withEmail ? 'email, ' : ''}tests, "avgPct", rating, correct, wrong, "totalTime", rank, participants`;
  const [top, me] = await Promise.all([
    sql(`${RANKED} SELECT ${cols} FROM ranked ORDER BY rank, name LIMIT $2`, [since, limit]),
    userId ? sql(`${RANKED} SELECT ${cols} FROM ranked WHERE id=$2`, [since, userId]) : Promise.resolve({ rows: [] }),
  ]);
  const shape = x => ({ ...x, accuracy: pct(x.correct, x.correct + x.wrong) });
  return { items: top.rows.map(shape), me: me.rows[0] ? shape(me.rows[0]) : null, participants: top.rows[0]?.participants || 0, period };
}
