import pg from 'pg';
import { config } from './env.js';

// ---- Connection (Neon-friendly) -------------------------------------------------
// Neon needs TLS. We strip sslmode/channel_binding from the URL and pass an explicit
// ssl object so behaviour is identical across pg versions. Localhost stays plain.
function connectionOptions(url) {
  const u = new URL(url);
  const mode = u.searchParams.get('sslmode');
  u.searchParams.delete('sslmode');
  u.searchParams.delete('channel_binding');
  const local = ['localhost', '127.0.0.1', '::1'].includes(u.hostname);
  const ssl = mode === 'disable' || (local && !mode) ? false : { rejectUnauthorized: true };
  return { connectionString: u.toString(), ssl };
}

export const pool = new pg.Pool({
  ...connectionOptions(config.databaseUrl),
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 20_000, // Neon may need a few seconds to wake from auto-suspend
  keepAlive: true,
});
// Neon drops idle connections when the compute suspends; without this handler Node would crash.
pool.on('error', e => console.warn('Idle database client error (ignored):', e.message));

const sleep = ms => new Promise(r => setTimeout(r, ms));
const TRANSIENT_CODES = new Set(['57P01', '57P02', '57P03', '08000', '08001', '08003', '08006', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ECONNREFUSED']);
const isTransient = e => TRANSIENT_CODES.has(e.code) || /Connection terminated|terminating connection|timeout exceeded when trying to connect/i.test(e.message || '');

/** Run a query; retries once if the pooled connection was dropped (Neon suspend/wake). */
let healing = null;
/** Self-heal: if a table/column is missing (server restarted before migrating, or a different DB), migrate now and retry. */
const heal = () => (healing ||= migrate().catch(e => { console.error('Self-heal migration failed:', e.message); healing = null; throw e; }).finally(() => setTimeout(() => { healing = null; }, 30_000)));
export async function sql(text, params) {
  try { return await pool.query(text, params); }
  catch (e) {
    if (e.code === '42P01' || e.code === '42703') {
      if (/schema_migrations/.test(text)) throw e;
      console.warn('Missing table/column (' + e.message + ') — running migrations and retrying…');
      await heal();
      return pool.query(text, params);
    }
    if (!isTransient(e)) throw e;
    await sleep(500);
    return pool.query(text, params);
  }
}
export const one = async (text, params) => (await sql(text, params)).rows[0];

/** Run fn(client) inside a transaction. */
export async function tx(fn) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { c.release(); }
}

// ---- Migrations -----------------------------------------------------------------
// Append new entries; never edit old ones. Each runs once, in a transaction.
const MIGRATIONS = [
  { v: 1, name: 'base schema', sql: `
    CREATE TABLE IF NOT EXISTS users(
      id SERIAL PRIMARY KEY, name TEXT, phone TEXT, target_exam TEXT,
      email TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('super_admin','content_admin','student')),
      active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS questions(
      id SERIAL PRIMARY KEY, text TEXT NOT NULL,
      options JSONB NOT NULL CHECK (jsonb_typeof(options)='array' AND jsonb_array_length(options)=4),
      answer INT NOT NULL CHECK (answer BETWEEN 0 AND 3), explanation TEXT, topic TEXT, exam TEXT, source TEXT, year INT, subject TEXT,
      difficulty TEXT NOT NULL DEFAULT 'moderate' CHECK (difficulty IN ('easy','moderate','difficult')),
      published BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE INDEX IF NOT EXISTS q_filter ON questions(exam, subject, difficulty);
    CREATE INDEX IF NOT EXISTS q_fts ON questions USING GIN (to_tsvector('simple', text));
    CREATE TABLE IF NOT EXISTS tests(
      id SERIAL PRIMARY KEY, title TEXT NOT NULL, description TEXT, exam TEXT,
      duration_min INT NOT NULL DEFAULT 60, marks_per_q DOUBLE PRECISION NOT NULL DEFAULT 1, negative DOUBLE PRECISION NOT NULL DEFAULT 0,
      starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ, question_ids INT[] NOT NULL DEFAULT '{}',
      active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS attempts(
      id SERIAL PRIMARY KEY, user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE, test_id INT NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(), submitted_at TIMESTAMPTZ, status TEXT NOT NULL DEFAULT 'started',
      score DOUBLE PRECISION, max_marks DOUBLE PRECISION, correct INT, wrong INT, skipped INT, total INT, time_taken INT, late BOOLEAN);
    CREATE INDEX IF NOT EXISTS a_user ON attempts(user_id, status);
    CREATE INDEX IF NOT EXISTS a_test ON attempts(test_id, status);
    CREATE TABLE IF NOT EXISTS materials(
      id SERIAL PRIMARY KEY, title TEXT NOT NULL, category TEXT, description TEXT, url TEXT, cover_url TEXT,
      premium BOOLEAN NOT NULL DEFAULT false, downloadable BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS current_affairs(
      id SERIAL PRIMARY KEY, title TEXT NOT NULL, category TEXT, body TEXT, pub_date TIMESTAMPTZ NOT NULL DEFAULT now(),
      published BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
  ` },
  { v: 2, name: 'sessions, analytics, autosave, bookmarks, audit log', sql: `
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_goal INT NOT NULL DEFAULT 20;
    ALTER TABLE questions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
    ALTER TABLE tests ADD COLUMN IF NOT EXISTS instructions TEXT;
    ALTER TABLE tests ADD COLUMN IF NOT EXISTS shuffle BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE tests ADD COLUMN IF NOT EXISTS max_attempts INT;
    ALTER TABLE attempts ADD COLUMN IF NOT EXISTS answers JSONB NOT NULL DEFAULT '{}';
    ALTER TABLE attempts ADD COLUMN IF NOT EXISTS marked JSONB NOT NULL DEFAULT '{}';
    ALTER TABLE attempts ADD COLUMN IF NOT EXISTS tab_switches INT NOT NULL DEFAULT 0;
    ALTER TABLE attempts ADD COLUMN IF NOT EXISTS review JSONB;
    ALTER TABLE attempts ADD COLUMN IF NOT EXISTS saved_at TIMESTAMPTZ;
    UPDATE attempts SET status='abandoned' WHERE status='started'
      AND id NOT IN (SELECT max(id) FROM attempts WHERE status='started' GROUP BY user_id, test_id);
    CREATE UNIQUE INDEX IF NOT EXISTS a_one_open ON attempts(user_id, test_id) WHERE status='started';
    CREATE INDEX IF NOT EXISTS ca_date ON current_affairs(pub_date DESC);
    CREATE TABLE IF NOT EXISTS sessions(
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL, user_agent TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(), expires_at TIMESTAMPTZ NOT NULL, revoked BOOLEAN NOT NULL DEFAULT false);
    CREATE INDEX IF NOT EXISTS s_user ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS practice_log(
      id BIGSERIAL PRIMARY KEY, user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      question_id INT NOT NULL REFERENCES questions(id) ON DELETE CASCADE, choice INT, correct BOOLEAN NOT NULL,
      mode TEXT NOT NULL DEFAULT 'practice', created_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE INDEX IF NOT EXISTS pl_user_time ON practice_log(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS pl_user_q ON practice_log(user_id, question_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS bookmarks(
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE, question_id INT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (user_id, question_id));
    CREATE TABLE IF NOT EXISTS admin_log(
      id BIGSERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE SET NULL, action TEXT NOT NULL,
      entity TEXT, entity_id TEXT, detail TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
  ` },
  { v: 3, name: 'site content: banners, announcements, testimonials, settings', sql: `
    CREATE TABLE IF NOT EXISTS banners(
      id SERIAL PRIMARY KEY, title TEXT NOT NULL, subtitle TEXT, image_url TEXT, link_url TEXT, cta_label TEXT,
      audience TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all','public','students')),
      position INT NOT NULL DEFAULT 0, active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS announcements(
      id SERIAL PRIMARY KEY, text TEXT NOT NULL, link_url TEXT, active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS testimonials(
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, role TEXT, quote TEXT NOT NULL, photo_url TEXT,
      position INT NOT NULL DEFAULT 0, active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS site_settings(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE INDEX IF NOT EXISTS banners_order ON banners(position, id);
  ` },
  { v: 4, name: 'premium tests, per-user access, payments', sql: `
    ALTER TABLE tests ADD COLUMN IF NOT EXISTS premium BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE tests ADD COLUMN IF NOT EXISTS price_paise INT NOT NULL DEFAULT 0;
    CREATE TABLE IF NOT EXISTS test_access(
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE, test_id INT NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
      source TEXT NOT NULL DEFAULT 'admin', granted_by INT REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, test_id));
    CREATE INDEX IF NOT EXISTS ta_test ON test_access(test_id);
    CREATE TABLE IF NOT EXISTS payments(
      id SERIAL PRIMARY KEY, user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE, test_id INT REFERENCES tests(id) ON DELETE SET NULL,
      amount_paise INT NOT NULL, currency TEXT NOT NULL DEFAULT 'INR', provider_order_id TEXT UNIQUE, provider_payment_id TEXT,
      status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created','paid','failed')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), paid_at TIMESTAMPTZ);
    CREATE INDEX IF NOT EXISTS pay_user ON payments(user_id, created_at DESC);
  ` },
];

export async function migrate() {
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations(version INT PRIMARY KEY, name TEXT, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  const done = new Set((await pool.query('SELECT version FROM schema_migrations')).rows.map(r => r.version));
  for (const m of MIGRATIONS) {
    if (done.has(m.v)) continue;
    await tx(async c => {
      await c.query(m.sql);
      await c.query('INSERT INTO schema_migrations(version,name) VALUES($1,$2) ON CONFLICT DO NOTHING', [m.v, m.name]);
    });
    console.log(`Migration ${m.v} applied: ${m.name}`);
  }
  // Safety net: site-content tables are idempotent, so make sure they exist on every start.
  for (const m of MIGRATIONS.slice(-2)) await pool.query(m.sql); // all idempotent
  const have = (await pool.query(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = current_schema() AND table_name IN ('banners','announcements','testimonials','site_settings','test_access','payments')`)).rows[0].n;
  console.log(have === 6 ? 'Database schema OK (site content tables present).' : `! Only ${have}/6 site content tables found in schema ${'current_schema'} — check DATABASE_URL.`);
}

/** Wait for the database (covers Neon cold start) before migrating. */
export async function waitForDb(tries = 6) {
  for (let i = 1; ; i++) {
    try { await pool.query('SELECT 1'); return; }
    catch (e) {
      if (i >= tries) throw e;
      console.warn(`Database not ready (${e.message}); retry ${i}/${tries - 1}…`);
      await sleep(1500 * i);
    }
  }
}
