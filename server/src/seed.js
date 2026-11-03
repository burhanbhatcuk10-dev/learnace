// Manual CLI:  npm run seed   (the server also does this automatically on start)
import { bootstrap } from './bootstrap.js';
import { pool } from './db.js';

try { await bootstrap(); console.log('Seed complete'); }
catch (e) { console.error('Seed failed:', e.message); process.exitCode = 1; }
finally { await pool.end(); }
