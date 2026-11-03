# Learnace

Exam-preparation platform for JKSSB, JKPSC, SSC, UPSC and similar exams.
**React + Express + Neon Postgres**, deployed as a single Render web service.

## What's new in this version
- **Learnace branding** everywhere: logo, favicon/PWA icons, branded splash screen, green/gold/maroon theme.
- **Public front page** for visitors: hero slider, announcement ticker, animated stats, exam / test / study-material carousels, testimonials slider, FAQ.
- **Student home** now has a banner slider, ticker, and carousels of tests and study material.
- **Cloudinary image storage**: admins upload banners, covers and photos from **Admin → Media** (or any form with an image field). Browsers upload directly to Cloudinary with a signature from the server.
- **Admin → Site & content**: banners, announcements, testimonials (plus current affairs and materials). **Admin → Settings**: footer contact and social links.
- **Tests**: admin sets the test time (presets, 1–600 min) and the open/close window. The correct answers are never sent during a test, and Practice can no longer be used to look up the answer to a question in a test you are taking. Score, rank and the full review appear only after you submit.

## Leaderboard & activity
- **Students → Ranks**: overall performance leaderboard (all time / 30 days / 7 days) with a podium and your own rank. Ranking uses each student's best attempt per test; the *rating* is the average % weighted by tests taken, so consistency beats one lucky score.
- **Admin → Activity**: live view (auto-refresh) of who is online, who is taking a test right now (answers done, time left, tab switches), recent submissions, logins, sign-ups, and the full leaderboard with CSV export.
- **Admin → Users → Activity**: one student's rank, scores, practice accuracy, 14-day activity, subject strengths, test history and last-seen device.

## Features

**Students**
- Practice MCQs with filters (exam, subject, topic, difficulty, search); modes: Random, New for me, My mistakes, Saved, Daily 10
- Bookmark questions, instant explanations, mistake notebook
- Timed mock tests with a server-enforced clock, **autosave + resume**, question palette, mark-for-review, keyboard shortcuts, tab-switch tracking
- Result review: per-subject breakdown, rank, leaderboard, printable
- Dashboard: streak, daily goal, 14-day activity, subject accuracy, weak-area hints
- Current affairs and study library with search and categories; dark mode; mobile-friendly

**Admins** (`super_admin`, `content_admin`)
- Questions: add/edit/delete, search, filters, **CSV/JSON bulk import with duplicate detection**, CSV export
- Tests: manual builder with question picker, **auto-generate from filters**, open/close windows, attempt limits, shuffle, results + CSV export
- Current affairs and materials CRUD; user management (deactivate, reset password, create staff, change roles); audit log; analytics overview

**Security & operations**
- Revocable sessions (httpOnly refresh cookie, 15-min access tokens), logout-everywhere, rate limits, strict CSP, zod validation on every admin input
- Versioned database migrations; idempotent startup (creates tables + first admin automatically)
- Neon-aware: TLS, cold-start retry, dropped-connection recovery; the health check never touches the database

## Deploy: Neon + Render (about 10 minutes)

### 1. Create the database (Neon)
1. Sign in at https://neon.tech and create a project.
2. Click **Connect** and copy the connection string (`postgresql://…neon.tech/neondb?sslmode=require`). The pooled one (host contains `-pooler`) is recommended. Pasting the whole `psql '…'` line also works.

### 2. Push the code to GitHub
```
git init && git add . && git commit -m "Learnace"
git branch -M main && git remote add origin <your-repo-url> && git push -u origin main
```

### 3. Deploy on Render
1. Render dashboard → **New → Blueprint** → select the repo (it reads `render.yaml`).
2. Fill in the three prompts:
   - `DATABASE_URL` – the Neon string from step 1
   - `ADMIN_EMAIL` – your admin login
   - `ADMIN_PASSWORD` – 10+ characters
   (`JWT_SECRET` is generated automatically.)
3. Click **Apply**. The first build takes a few minutes. On first start the app creates all tables and your admin account.
4. Open your `https://learnace-xxxx.onrender.com` URL and sign in with the admin email and password. Go to **Admin** to add questions.

Want demo content? Set `SEED_SAMPLE=true` before the first start (it only loads into an empty question bank).

Manual setup instead of a Blueprint: New → Web Service → Build `npm run build`, Start `npm start`, Health check path `/api/health`, and add the env vars above (`NODE_ENV=production`).

### Good to know
- **Free tier cold starts:** Render's free plan sleeps after ~15 min idle (first request takes ~30–60 s) and Neon's free compute suspends after ~5 min idle (first query takes ~1 s). The app retries automatically; use a paid Render plan to avoid sleep.
- **Close registration** later by setting `REGISTRATION_OPEN=false`; create students from Admin → Users instead.
- **Rotate secrets:** changing `JWT_SECRET` signs everyone out (harmless). Change the admin password from Profile.
- **Study material** is stored as links (Google Drive, S3, etc.). Render's disk is ephemeral, so the app does not host files itself.

## Run locally
```
cp .env.example .env      # fill in DATABASE_URL (a free Neon branch is perfect) and ADMIN_*
npm install               # root tools
npm run setup             # installs server + client
npm run dev               # API on :5000, website on :5173
```
Open http://localhost:5173. `npm run seed` runs the setup step on its own.

## Importing questions (CSV)
Admin → Questions → Import → "Download template". Columns:
`text, option_a, option_b, option_c, option_d, answer (A–D), explanation, subject, topic, exam, difficulty (easy|moderate|difficult), year, source`.
Existing questions with identical text are skipped.

## Project layout
```
server/src   index.js (app) · db.js (Neon pool + migrations) · auth.js (sessions) · routes/{auth,student,tests,admin}.js
client/src   App.jsx · ui.jsx · api.js · pages/* · admin/*
render.yaml  Render Blueprint
```

## Image storage (Cloudinary)
1. Create a free account at https://cloudinary.com → Dashboard → **API Keys**.
2. Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (or one `CLOUDINARY_URL`) on Render and redeploy.
3. Open **Admin → Media** to upload. Without Cloudinary the site still works; you can paste image links (e.g. from Unsplash) instead.

Tip: set a question to *unpublished* to keep it exclusive to tests so it never shows in Practice.

## Environment variables
| Name | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Neon connection string |
| `JWT_SECRET` | yes (prod) | 32+ chars; auto-generated on Render |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | first run | creates the first super admin (password 10+ chars) |
| `SEED_SAMPLE` | no | `true` loads demo content into an empty database |
| `REGISTRATION_OPEN` | no | `false` disables public sign-up |
| `CLIENT_URL` | no | only if the website is hosted on a different origin (CORS) |
| `BCRYPT_ROUNDS` | no | default 10 |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | for uploads | or a single `CLOUDINARY_URL`; optional `CLOUDINARY_FOLDER` (default `learnace`) |

## Premium mocks & payments

- **Admin → Tests → New/Edit**: tick **★ Premium mock** and set a price in ₹ (0 = invite only).
- **Access** button (premium tests): grant by email list or to all students, or remove a student. Everyone else sees a lock and the price.
- Students pay with **Razorpay** (UPI / Google Pay / PhonePe / cards). Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` and add the webhook `https://YOUR-SITE/api/payments/webhook` (events `payment.captured`, `order.paid`). Payments are verified on the server (HMAC signature + amount) before access is granted.
- No Razorpay? Set **UPI ID** in Admin → Settings: students get an "Open Google Pay / PhonePe" button and you unlock them manually from **Access** after they send a screenshot.
- **Admin → Payments** lists orders and revenue.

## Bulk questions from CSV in a test

In the test form use **Upload CSV of questions** (template provided). Questions are imported in chunks of 500 and added to the test; keep "exam-only" ticked to hide them from Practice.
