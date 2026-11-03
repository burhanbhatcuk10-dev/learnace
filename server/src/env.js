// Loads .env (server/ or project root) and validates configuration once, with clear messages.
import dotenv from 'dotenv';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
for (const p of ['../.env', '../../.env']) dotenv.config({ path: path.join(here, p) });

const env = process.env;
const prod = env.NODE_ENV === 'production';
const problems = [];

// Neon's dashboard shows the string as:  psql 'postgresql://...'  — accept that too.
let databaseUrl = (env.DATABASE_URL || '').trim().replace(/^psql\s+/i, '').replace(/^['"]|['"]$/g, '');
if (!databaseUrl) problems.push('DATABASE_URL is missing (paste your Neon connection string).');
else if (!/^postgres(ql)?:\/\//i.test(databaseUrl)) problems.push('DATABASE_URL must start with postgresql://');

let jwtSecret = env.JWT_SECRET || '';
if (jwtSecret.length < 32) {
  if (prod) problems.push('JWT_SECRET must be at least 32 characters.');
  else {
    jwtSecret = crypto.randomBytes(32).toString('hex'); // dev only: sessions reset on restart
    console.warn('! JWT_SECRET missing/short — using a temporary one for development.');
  }
}

if (problems.length) {
  console.error('\nConfiguration error:\n - ' + problems.join('\n - ') + '\n');
  process.exit(1);
}

// Cloudinary: either CLOUDINARY_URL=cloudinary://KEY:SECRET@CLOUD or the three separate variables.
function cloudinary() {
  let cloudName = (env.CLOUDINARY_CLOUD_NAME || '').trim(), apiKey = (env.CLOUDINARY_API_KEY || '').trim(), apiSecret = (env.CLOUDINARY_API_SECRET || '').trim();
  const m = /^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/i.exec((env.CLOUDINARY_URL || '').trim());
  if (m && !(cloudName && apiKey && apiSecret)) [, apiKey, apiSecret, cloudName] = m;
  return { enabled: !!(cloudName && apiKey && apiSecret), cloudName, apiKey, apiSecret, folder: (env.CLOUDINARY_FOLDER || 'learnace').replace(/[^\w-]/g, '') || 'learnace' };
}

const razorpay = { keyId: (env.RAZORPAY_KEY_ID || '').trim(), keySecret: (env.RAZORPAY_KEY_SECRET || '').trim(), webhookSecret: (env.RAZORPAY_WEBHOOK_SECRET || '').trim() };
razorpay.enabled = !!(razorpay.keyId && razorpay.keySecret);

const flag = (v, d) => (v === undefined || v === '' ? d : /^(1|true|yes|on)$/i.test(v));

export const config = {
  prod,
  port: parseInt(env.PORT, 10) || 5000,
  databaseUrl,
  jwtSecret,
  clientUrl: env.CLIENT_URL || '',
  adminEmail: (env.ADMIN_EMAIL || '').trim().toLowerCase(),
  adminPassword: env.ADMIN_PASSWORD || '',
  seedSample: flag(env.SEED_SAMPLE, false),
  registrationOpen: flag(env.REGISTRATION_OPEN, true),
  bcryptRounds: Math.min(Math.max(parseInt(env.BCRYPT_ROUNDS, 10) || 10, 8), 14),
  cloudinary: cloudinary(),
  razorpay,
  sessionDays: 30,
  graceSeconds: 120, // extra time allowed after the deadline for network delay
};
