// Landing-page data. No login needed, contains nothing private, and is cached briefly so
// anonymous visitors never keep the (Neon) database busy.
import { Router } from 'express';
import { sql, one } from '../db.js';
import { wrap, str } from '../util.js';
import { config } from '../env.js';

const r = Router();
let cache = { at: 0, data: null, pending: null };
export const bustPublic = () => { cache.at = 0; };

async function load() {
  const [stats, banners, ann, testi, exams, tests, mats, set] = await Promise.all([
    one(`SELECT (SELECT count(*) FROM users WHERE role='student' AND active)::int AS students,
                (SELECT count(*) FROM questions WHERE published)::int AS questions,
                (SELECT count(*) FROM tests WHERE active)::int AS tests,
                (SELECT count(*) FROM attempts WHERE status='submitted')::int AS attempts`),
    sql(`SELECT id, title, subtitle, image_url AS "imageUrl", link_url AS "linkUrl", cta_label AS "ctaLabel", audience FROM banners WHERE active ORDER BY position, id LIMIT 12`),
    sql(`SELECT id, text, link_url AS "linkUrl" FROM announcements WHERE active ORDER BY id DESC LIMIT 8`),
    sql(`SELECT id, name, role, quote, photo_url AS "photoUrl" FROM testimonials WHERE active ORDER BY position, id LIMIT 12`),
    sql(`SELECT exam AS name, count(*)::int AS n FROM questions WHERE published AND exam IS NOT NULL AND exam <> '' GROUP BY exam ORDER BY count(*) DESC LIMIT 12`),
    sql(`SELECT id, title, exam, duration_min AS "durationMin", cardinality(question_ids) AS "questionCount", (marks_per_q * cardinality(question_ids)) AS "totalMarks",
                starts_at AS "startsAt", ends_at AS "endsAt", premium, price_paise AS "pricePaise" FROM tests WHERE active AND cardinality(question_ids) > 0 AND (ends_at IS NULL OR ends_at > now()) ORDER BY id DESC LIMIT 8`),
    sql(`SELECT id, title, category, cover_url AS "coverUrl", premium FROM materials ORDER BY id DESC LIMIT 10`),
    sql(`SELECT key, value FROM site_settings`),
  ]);
  return { stats, banners: banners.rows, announcements: ann.rows, testimonials: testi.rows, exams: exams.rows, tests: tests.rows, materials: mats.rows,
    settings: Object.fromEntries(set.rows.map(x => [x.key, x.value])) };
}

r.get('/home', wrap(async (q, s) => {
  if (!cache.data || Date.now() - cache.at > 45_000) {
    cache.pending ||= load().then(d => { cache = { at: Date.now(), data: d, pending: null }; return d; }, e => { cache.pending = null; throw e; });
    await cache.pending;
  }
  const d = cache.data, forStudents = str(q.query.for) === 'students';
  const ok = b => b.audience === 'all' || b.audience === (forStudents ? 'students' : 'public');
  s.set('Cache-Control', 'public, max-age=30');
  s.json({ ...d, banners: d.banners.filter(ok), onlinePay: config.razorpay.enabled });
}));

export default r;
