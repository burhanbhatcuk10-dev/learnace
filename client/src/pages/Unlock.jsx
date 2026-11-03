// Unlock panel for premium mock tests: online payment (Razorpay: UPI / Google Pay / cards) and a manual UPI fallback.
import { useState } from 'react';
import { api } from '../api.js';
import { useAsync, useAuth, useUI, fmtINR } from '../ui.jsx';
import { Ico } from '../widgets.jsx';

let loading = null;
const loadRazorpay = () => (loading ||= new Promise((resolve, reject) => {
  if (window.Razorpay) return resolve();
  const s = document.createElement('script'); s.src = 'https://checkout.razorpay.com/v1/checkout.js';
  s.onload = () => resolve(); s.onerror = () => { loading = null; reject(new Error('Could not open the payment window. Check your internet connection.')); };
  document.head.appendChild(s);
}));

export function Unlock({ test, onUnlocked }) {
  const { user } = useAuth(), { toast } = useUI();
  const cfg = useAsync(() => api('/payments/config'), []);
  const [busy, setBusy] = useState(false), c = cfg.data;
  const price = test.pricePaise, forSale = price > 0;
  const upiLink = c?.upi ? `upi://pay?pa=${encodeURIComponent(c.upi.id)}&pn=${encodeURIComponent(c.upi.name)}&am=${(price / 100).toFixed(2)}&cu=INR&tn=${encodeURIComponent('Learnace - ' + test.title).slice(0, 80)}` : null;

  const pay = async () => {
    setBusy(true);
    try {
      await loadRazorpay();
      const o = await api(`/tests/${test.id}/order`, { method: 'POST' });
      const rz = new window.Razorpay({
        key: o.keyId, amount: o.amount, currency: o.currency, name: 'Learnace', description: o.title, order_id: o.orderId,
        prefill: { name: user.name, email: user.email, contact: user.phone || undefined }, theme: { color: '#0f5132' },
        handler: async r => {
          try { await api('/payments/verify', { method: 'POST', body: r }); toast('Payment successful — test unlocked!'); onUnlocked(); }
          catch (e) { toast(e.message + ' If money was deducted, it will unlock automatically or contact the admin.', 'err'); setBusy(false); }
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      rz.on('payment.failed', r => { toast(r.error?.description || 'Payment failed. Please try again.', 'err'); setBusy(false); });
      rz.open();
    } catch (e) { toast(e.message, 'err'); setBusy(false); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(c.upi.id); toast('UPI ID copied'); } catch { toast(c.upi.id); } };
  const contactLine = c?.contact && (c.contact.whatsapp || c.contact.email);

  return (
    <div className="card unlock">
      <div className="unlock-h"><span className="feat-i"><Ico name="lock" /></span><div><b>Premium mock test</b><p className="muted small" style={{ margin: 0 }}>{forSale ? 'Unlock once and attempt it with full review, rank and explanations.' : 'This premium test is unlocked by the admin for selected students.'}</p></div>
        {forSale && <span className="price">{fmtINR(price)}</span>}</div>
      {cfg.loading && !c ? <p className="muted small">Loading payment options…</p> : forSale ? (
        <div className="unlock-opts">
          {c?.razorpay && <button className="gold" disabled={busy} onClick={pay}>{busy ? 'Opening payment…' : `Pay ${fmtINR(price)} · UPI / Google Pay / Cards`}</button>}
          {upiLink && (
            <div className="upi-box">
              <b>Pay with any UPI app</b>
              <div className="row wrap"><a className={'btn' + (c?.razorpay ? ' ghost' : ' gold')} href={upiLink}>Open Google Pay / PhonePe / Paytm</a><button type="button" className="ghost sm" onClick={copy}>Copy UPI ID: {c.upi.id}</button></div>
              <p className="muted small" style={{ margin: '6px 0 0' }}>After paying, send the payment screenshot and your registered email (<b>{user.email}</b>) to the admin{contactLine ? ' on ' : '.'}
                {c.contact.whatsapp && <a href={c.contact.whatsapp} target="_blank" rel="noopener noreferrer"> WhatsApp</a>}{c.contact.whatsapp && c.contact.email && ' or '}{c.contact.email && <a href={'mailto:' + c.contact.email}>{c.contact.email}</a>}. Your test is unlocked after verification.</p>
              <button type="button" className="ghost sm" onClick={onUnlocked}>I have been unlocked — refresh</button>
            </div>)}
          {!c?.razorpay && !c?.upi && <p className="muted">Online payment is not available yet. Please contact the admin to unlock this test.</p>}
          {c?.razorpay && <p className="muted small" style={{ margin: 0 }}>Payments are processed securely by Razorpay. Learnace never sees or stores your card or UPI details.</p>}
        </div>
      ) : <p className="muted small">{contactLine ? 'Contact the admin to get access.' : 'Please contact the admin to get access.'}</p>}
    </div>
  );
}
