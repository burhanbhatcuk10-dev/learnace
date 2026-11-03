import { config } from './env.js';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ZodError } from 'zod';
import { pool, sql } from './db.js';
import { bootstrap } from './bootstrap.js';
import { HttpError, wrap } from './util.js';
import { auth } from './auth.js';
import authRoutes from './routes/auth.js';
import studentRoutes from './routes/student.js';
import testRoutes from './routes/tests.js';
import adminRoutes from './routes/admin.js';
import mediaRoutes from './routes/media.js';
import publicRoutes from './routes/public.js';
import paymentRoutes, { webhook as paymentWebhook } from './routes/payments.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // Render terminates TLS in front of us

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://checkout.razorpay.com'],
      frameSrc: ["'self'", 'https://api.razorpay.com', 'https://checkout.razorpay.com'],
      formAction: ["'self'", 'https://api.razorpay.com'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'], // Cloudinary / Unsplash / study-material covers
      connectSrc: ["'self'", 'https://api.cloudinary.com', 'https://api.razorpay.com', 'https://lumberjack.razorpay.com'], // browser uploads go straight to Cloudinary (signed by us)
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: config.prod ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }, // payment pop-ups (UPI apps / bank pages)
}));
app.use(compression());
if (config.clientUrl) app.use(cors({ origin: config.clientUrl.split(','), credentials: true }));
app.use(express.json({ limit: '2mb', verify: (q, s, buf) => { if (q.originalUrl.startsWith('/api/payments/webhook')) q.rawBody = buf; } }), cookieParser());

// Cheap liveness check for Render — deliberately does NOT touch the database,
// so health checks never keep a Neon free-tier compute awake.
app.get('/api/health', (q, s) => s.json({ ok: true, uptime: Math.round(process.uptime()) }));
app.get('/api/health/db', wrap(async (q, s) => { await sql('SELECT 1'); s.json({ ok: true, db: true }); }));

app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 400, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests. Slow down a little.' } }));
app.use('/api', (q, s, next) => { s.set('Cache-Control', 'no-store'); next(); }); // never cache API data (public route overrides)
app.use('/api/auth', authRoutes);
app.use('/api/public', publicRoutes);
app.post('/api/payments/webhook', paymentWebhook); // landing-page data, no login needed
app.use('/api/admin/media', mediaRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', auth, testRoutes, studentRoutes, paymentRoutes); // authenticate once, then try each router
app.use('/api', (q, s) => s.status(404).json({ error: 'Not found' }));

// ---- Serve the built React app --------------------------------------------------------
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (fs.existsSync(path.join(dist, 'index.html'))) {
  app.use('/assets', express.static(path.join(dist, 'assets'), { maxAge: '1y', immutable: true }));
  app.use(express.static(dist, { maxAge: '1h', index: false }));
  app.get('*', (q, s) => s.set('Cache-Control', 'no-cache').sendFile(path.join(dist, 'index.html')));
} else {
  app.get('/', (q, s) => s.type('text').send('API is running. Build the client (npm run build) or use the Vite dev server on :5173.'));
}

// ---- Errors ---------------------------------------------------------------------------
app.use((e, q, s, next) => {
  if (s.headersSent) return next(e);
  if (e instanceof HttpError) return s.status(e.status).json({ error: e.message });
  if (e instanceof ZodError) {
    const i = e.issues[0];
    const field = i.path.filter(x => typeof x === 'string').join('.');
    return s.status(400).json({ error: (field ? field + ': ' : '') + i.message });
  }
  if (e.type === 'entity.parse.failed') return s.status(400).json({ error: 'Invalid JSON' });
  if (e.type === 'entity.too.large') return s.status(413).json({ error: 'Request too large' });
  if (e.code === '42P01' || e.code === '42703') { console.error(e); return s.status(500).json({ error: 'Database update failed: ' + String(e.message || e).slice(0, 160) + ' — check DATABASE_URL points to the same database and restart the server.' }); }
  if (e.code === '23505') return s.status(409).json({ error: 'That already exists' });
  if (e.code === '23503') return s.status(409).json({ error: 'Related item not found or still in use' });
  if (/^2[23]/.test(e.code || '')) return s.status(400).json({ error: e.detail || e.message });
  console.error(e);
  // Staff get the real cause (e.g. a missing table) so problems can be fixed fast; students only see a generic message.
  const staffArea = (q.originalUrl || '').startsWith('/api/admin');
  s.status(500).json({ error: staffArea ? 'Server error: ' + String(e.message || e).slice(0, 200) : 'Server error' });
});

// ---- Start ----------------------------------------------------------------------------
await bootstrap();
const server = app.listen(config.port, '0.0.0.0', () => console.log(`Learnace listening on :${config.port} (${config.prod ? 'production' : 'development'})`));
server.keepAliveTimeout = 65_000; // longer than Render's proxy idle timeout

let closing = false;
const shutdown = sig => {
  if (closing) return; closing = true;
  console.log(`${sig} received, shutting down`);
  server.close(() => pool.end().finally(() => process.exit(0)));
  setTimeout(() => process.exit(0), 10_000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', e => console.error('Unhandled rejection:', e));
