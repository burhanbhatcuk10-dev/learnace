import bcrypt from 'bcryptjs';
import { config } from './env.js';
import { migrate, waitForDb, sql, one, tx } from './db.js';
import { SAMPLE_QUESTIONS, SAMPLE_NOTE } from './sample.js';

/** Idempotent: safe to run on every start. Creates tables, the first admin, and optional demo data. */
export async function bootstrap() {
  await waitForDb();
  await migrate();

  if (config.adminEmail && config.adminPassword) {
    if (config.adminPassword.length < 10) console.warn('! ADMIN_PASSWORD is shorter than 10 characters — admin was not created.');
    else {
      const r = await sql(
        `INSERT INTO users(name,email,password,role) VALUES('Super Admin',$1,$2,'super_admin') ON CONFLICT (email) DO NOTHING`,
        [config.adminEmail, await bcrypt.hash(config.adminPassword, config.bcryptRounds)]);
      if (r.rowCount) console.log(`Admin account created: ${config.adminEmail}`);
    }
  } else if (!(await one(`SELECT 1 FROM users WHERE role='super_admin' LIMIT 1`))) {
    console.warn('! No admin exists. Set ADMIN_EMAIL and ADMIN_PASSWORD (10+ chars) and restart.');
  }

  if (config.seedSample && !(await one('SELECT 1 FROM questions LIMIT 1'))) {
    await tx(async c => {
      const ids = [];
      for (const [text, options, answer, explanation, subject, topic, difficulty] of SAMPLE_QUESTIONS) {
        const { rows } = await c.query(
          `INSERT INTO questions(text,options,answer,explanation,subject,topic,difficulty,exam,source) VALUES($1,$2,$3,$4,$5,$6,$7,'General','SAMPLE') RETURNING id`,
          [text, JSON.stringify(options), answer, explanation, subject, topic, difficulty]);
        ids.push(rows[0].id);
      }
      await c.query(
        `INSERT INTO tests(title,description,instructions,exam,duration_min,marks_per_q,negative,question_ids,shuffle) VALUES($1,$2,$3,'General',20,1,0.25,$4,true)`,
        ['Sample Mock Test 1', 'A quick mixed-subject test to try the exam engine.', 'Each question carries 1 mark. 0.25 marks are deducted for every wrong answer.', ids]);
      await c.query('INSERT INTO current_affairs(title,category,body) VALUES($1,$2,$3)', [SAMPLE_NOTE.title, SAMPLE_NOTE.category, SAMPLE_NOTE.body]);
    });
    console.log('Sample content loaded.');
  }
}
