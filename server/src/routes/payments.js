// Paid (premium) mock tests. Razorpay handles UPI / Google Pay / PhonePe / cards / netbanking.
// Price is always read from the database, and access is only granted after the payment signature is verified.
import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { config } from '../env.js';
import { sql, one, tx } from '../db.js';
import { wrap, HttpError, intId } from '../util.js';

const rz = config.razorpay;
const r = Router(); // mounted behind auth
const hmac = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const basic = () => 'Basic ' + Buffer.from(`${rz.keyId}:${rz.keySecret}`).toString('base64');

/** Idempotent: marks the order paid and unlocks the test. Returns true if the order exists. */
export async function markPaid(orderId, paymentId, amountPaise) {
  return tx(async c => {
    const cur = (await c.query('SELECT id, user_id, test_id, amount_paise, status FROM payments WHERE provider_order_id=$1 FOR UPDATE', [orderId])).rows[0];
    if (!cur) return false;
    if (amountPaise != null && Number(amountPaise) !== cur.amount_paise) return false; // never unlock for a wrong amount
    if (cur.status !== 'paid') await c.query(`UPDATE payments SET status='paid', provider_payment_id=$2, paid_at=now() WHERE id=$1`, [cur.id, paymentId]);
    if (cur.test_id) await c.query(`INSERT INTO test_access(user_id,test_id,source) VALUES($1,$2,'purchase') ON CONFLICT DO NOTHING`, [cur.user_id, cur.test_id]);
    return true;
  });
}

r.get('/payments/config', wrap(async (q, s) => {
  const st = Object.fromEntries((await sql(`SELECT key, value FROM site_settings WHERE key IN ('upiId','upiName','contactEmail','whatsapp','phone')`)).rows.map(x => [x.key, x.value]));
  s.json({ razorpay: rz.enabled ? { keyId: rz.keyId } : null, upi: st.upiId ? { id: st.upiId, name: st.upiName || 'Learnace' } : null,
    contact: { email: st.contactEmail || null, whatsapp: st.whatsapp || null, phone: st.phone || null } });
}));

r.post('/tests/:id/order', wrap(async (q, s) => {
  if (!rz.enabled) throw new HttpError(503, 'Online payment is not set up yet. Please use the other payment option or contact the admin.');
  const t = await one('SELECT id, title, premium, price_paise FROM tests WHERE id=$1 AND active', [intId(q.params.id)]);
  if (!t) throw new HttpError(404, 'Test not found');
  if (!t.premium || t.price_paise <= 0) throw new HttpError(400, 'This test is not for sale');
  if (await one('SELECT 1 FROM test_access WHERE user_id=$1 AND test_id=$2', [q.user.id, t.id])) throw new HttpError(409, 'You already have access to this test');
  const pay = await one('INSERT INTO payments(user_id,test_id,amount_paise) VALUES($1,$2,$3) RETURNING id', [q.user.id, t.id, t.price_paise]);
  const fail = async msg => { await sql(`UPDATE payments SET status='failed' WHERE id=$1`, [pay.id]); throw new HttpError(502, msg); };
  let res, d = {};
  try {
    res = await fetch('https://api.razorpay.com/v1/orders', { method: 'POST', headers: { Authorization: basic(), 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000),
      body: JSON.stringify({ amount: t.price_paise, currency: 'INR', receipt: 'lrn_' + pay.id, notes: { userId: String(q.user.id), testId: String(t.id) } }) });
    d = await res.json().catch(() => ({}));
  } catch { await fail('Could not reach the payment provider. Please try again.'); }
  if (!res.ok || !d.id) await fail('Payment provider error: ' + (d.error?.description || res.status));
  await sql('UPDATE payments SET provider_order_id=$2 WHERE id=$1', [pay.id, d.id]);
  s.json({ orderId: d.id, amount: t.price_paise, currency: 'INR', keyId: rz.keyId, title: t.title });
}));

r.post('/payments/verify', wrap(async (q, s) => {
  const b = z.object({ razorpay_order_id: z.string().max(100), razorpay_payment_id: z.string().max(100), razorpay_signature: z.string().max(200) }).parse(q.body);
  const mine = await one('SELECT 1 FROM payments WHERE provider_order_id=$1 AND user_id=$2', [b.razorpay_order_id, q.user.id]);
  if (!mine) throw new HttpError(404, 'Order not found');
  if (!same(hmac(rz.keySecret, `${b.razorpay_order_id}|${b.razorpay_payment_id}`), b.razorpay_signature)) throw new HttpError(400, 'Payment could not be verified');
  await markPaid(b.razorpay_order_id, b.razorpay_payment_id);
  s.json({ ok: true });
}));

/** Razorpay webhook (backup in case the student closes the page right after paying). Public, signature-checked. */
export const webhook = wrap(async (q, s) => {
  if (!rz.webhookSecret || !q.rawBody) return s.status(503).json({ error: 'Webhook not configured' });
  if (!same(hmac(rz.webhookSecret, q.rawBody), q.get('x-razorpay-signature') || '')) return s.status(400).json({ error: 'Bad signature' });
  const e = q.body?.event, p = q.body?.payload?.payment?.entity;
  if ((e === 'payment.captured' || e === 'order.paid') && p?.order_id) await markPaid(p.order_id, p.id, p.amount);
  s.json({ ok: true });
});

export default r;
