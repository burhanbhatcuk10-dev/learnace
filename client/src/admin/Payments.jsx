import { api } from '../api.js';
import { useAsync, useTitle, Spinner, ErrorBox, Empty, Badge, fmtDateTime, fmtINR } from '../ui.jsx';

export default function Payments() {
  useTitle('Admin · Payments');
  const p = useAsync(() => api('/admin/payments'), []);
  if (p.loading && !p.data) return <Spinner />;
  if (p.error) return <ErrorBox message={p.error} onRetry={p.reload} />;
  const d = p.data;
  return (
    <>
      <div className="stat-row"><div className="card stat"><b>{fmtINR(d.revenuePaise)}</b><span className="muted small">Revenue</span></div><div className="card stat"><b>{d.paid}</b><span className="muted small">Paid orders</span></div></div>
      {!d.items.length ? <Empty icon="💳" title="No payments yet" hint="Mark a test as Premium with a price and students can buy it. Add Razorpay keys (or a UPI ID in Settings) to accept payments." /> :
        <div className="card table-wrap"><table><thead><tr><th>Student</th><th>Test</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead><tbody>
          {d.items.map(x => <tr key={x.id}><td>{x.name}<br /><span className="muted small">{x.email}</span></td><td>{x.test || '—'}</td><td>{fmtINR(x.amountPaise)}</td><td><Badge kind={x.status === 'paid' ? 'ok' : x.status === 'failed' ? 'bad' : ''}>{x.status}</Badge>{x.paymentId && <><br /><span className="muted small">{x.paymentId}</span></>}</td><td>{fmtDateTime(x.paidAt || x.createdAt)}</td></tr>)}</tbody></table></div>}
    </>
  );
}
