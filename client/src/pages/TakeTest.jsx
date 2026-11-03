import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useUI, Modal, Spinner, ErrorBox, fmtDur, LETTERS } from '../ui.jsx';

export function TakeTest() {
  const { id } = useParams(), nav = useNavigate(), { toast } = useUI();
  const [d, setD] = useState(null), [err, setErr] = useState('');
  const [i, setI] = useState(0), [ans, setAns] = useState({}), [marked, setMarked] = useState({}), [seen, setSeen] = useState({}), [tabs, setTabs] = useState(0);
  const [left, setLeft] = useState(null), [save, setSave] = useState('saved'), [confirming, setConfirming] = useState(false), [busy, setBusy] = useState(false);
  const endAt = useRef(0), aid = useRef(0), submitted = useRef(false), lastTry = useRef(0), latest = useRef({}), timer = useRef(), inflight = useRef(false), dirty = useRef(false), ready = useRef(false);
  latest.current = { answers: ans, marked, tabSwitches: tabs };

  useEffect(() => {
    let alive = true;
    api(`/tests/${id}/start`, { method: 'POST' }).then(x => {
      if (!alive) return;
      aid.current = x.attemptId; endAt.current = Date.now() + x.remainingSec * 1000;
      setAns(x.saved.answers || {}); setMarked(x.saved.marked || {}); setTabs(x.saved.tabSwitches || 0); setSeen({ [x.questions[0].id]: true }); setD(x);
      setTimeout(() => { ready.current = true; }, 0);
    }).catch(e => alive && setErr(e.message));
    return () => { alive = false; };
  }, [id]);

  // ---- autosave (debounced, serialized, retried) ----
  const flush = useCallback(async () => {
    if (inflight.current || submitted.current || !dirty.current) return;
    inflight.current = true; dirty.current = false;
    try { await api(`/attempts/${aid.current}/save`, { method: 'PUT', body: latest.current }); setSave(dirty.current ? 'saving' : 'saved'); }
    catch (e) {
      if (/time is up|already submitted/i.test(e.message)) { submitRef.current(); return; }
      dirty.current = true; setSave('error'); clearTimeout(timer.current); timer.current = setTimeout(flush, 5000);
    } finally { inflight.current = false; if (dirty.current && !submitted.current) { clearTimeout(timer.current); timer.current = setTimeout(flush, 400); } }
  }, []);
  useEffect(() => {
    if (!d || !ready.current) return;
    dirty.current = true; setSave('saving'); clearTimeout(timer.current); timer.current = setTimeout(flush, 700);
  }, [ans, marked, tabs]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => clearTimeout(timer.current), []);

  const submit = useCallback(async () => {
    if (submitted.current) return;
    submitted.current = true; setBusy(true); setConfirming(false); clearTimeout(timer.current); lastTry.current = Date.now();
    try { const r = await api(`/attempts/${aid.current}/submit`, { method: 'POST', body: latest.current }); nav(`/results/${r.id}`, { replace: true }); }
    catch (e) { submitted.current = false; setBusy(false); toast(e.message, 'err'); }
  }, [nav, toast]);
  const submitRef = useRef(submit); submitRef.current = submit;

  // ---- clock (server-synced remaining time) ----
  useEffect(() => {
    if (!d) return;
    const tick = () => { const s = Math.max(0, Math.round((endAt.current - Date.now()) / 1000)); setLeft(s); if (s === 0 && !submitted.current && Date.now() - lastTry.current > 4000) submitRef.current(); };
    tick(); const t = setInterval(tick, 1000); return () => clearInterval(t);
  }, [d]);

  // ---- tab switch detection + leave warning ----
  useEffect(() => {
    if (!d) return;
    const vis = () => { if (document.hidden && !submitted.current) setTabs(t => t + 1); };
    const unload = e => { if (!submitted.current) { e.preventDefault(); e.returnValue = ''; } };
    document.addEventListener('visibilitychange', vis); window.addEventListener('beforeunload', unload);
    return () => { document.removeEventListener('visibilitychange', vis); window.removeEventListener('beforeunload', unload); };
  }, [d]);

  const qs = d?.questions || [], q = qs[i];
  const go = useCallback(n => { setI(p => { const k = Math.min(qs.length - 1, Math.max(0, typeof n === 'function' ? n(p) : n)); if (qs[k]) setSeen(s => ({ ...s, [qs[k].id]: true })); return k; }); }, [qs]);
  const choose = k => q && setAns(a => ({ ...a, [q.id]: k }));
  const clear = () => q && setAns(a => { const { [q.id]: _, ...r } = a; return r; });
  const toggleMark = () => q && setMarked(m => ({ ...m, [q.id]: !m[q.id] }));

  useEffect(() => {
    if (!d) return;
    const onKey = e => {
      if (confirming || e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      const k = e.key.toLowerCase(), n = '1234'.indexOf(k), l = 'abcd'.indexOf(k);
      if (n >= 0) choose(n); else if (l >= 0) choose(l);
      else if (k === 'n' || k === 'arrowright') go(p => p + 1); else if (k === 'p' || k === 'arrowleft') go(p => p - 1);
      else if (k === 'm') toggleMark(); else if (k === 'c') clear();
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  });

  if (err) return <div className="card"><ErrorBox message={err} /><button onClick={() => nav('/tests')}>Back to tests</button></div>;
  if (!d || left === null) return <Spinner label="Preparing your test…" />;
  const answered = Object.keys(ans).length, markedN = Object.values(marked).filter(Boolean).length;

  return (
    <>
      <div className="testbar card">
        <img className="logo-mark" src="/mark.png" alt="" width={30} height={30} /><b className="grow ellipsis">{d.test.title}</b>
        <span className={'small save ' + save}>{save === 'saved' ? '✓ Saved' : save === 'saving' ? 'Saving…' : '⚠ Offline — retrying'}</span>
        <span className={'timer' + (left < 60 ? ' danger' : left < 300 ? ' warn' : '')} aria-label="Time left">⏱ {fmtDur(left)}</span>
        <button onClick={() => setConfirming(true)} disabled={busy}>Submit</button>
      </div>
      {tabs > 0 && <p className="small warn-t">⚠ You left this tab {tabs} time{tabs > 1 ? 's' : ''}. This is recorded.</p>}
      <div className="split">
        <div className="card q">
          <div className="qmeta"><span className="muted small">Question {i + 1} of {qs.length}{q.subject ? ' · ' + q.subject : ''}</span>{marked[q.id] && <span className="badge warn">Marked</span>}</div>
          <p className="qt">{q.text}</p>
          {q.options.map((o, k) => <button key={k} className={'opt' + (ans[q.id] === k ? ' sel' : '')} onClick={() => choose(k)}><span className="lt">{LETTERS[k]}</span>{o}</button>)}
          <div className="row wrap" style={{ marginTop: 12 }}>
            <button className="ghost" onClick={() => go(i - 1)} disabled={i === 0}>← Previous</button>
            <button className="ghost" onClick={clear} disabled={ans[q.id] === undefined}>Clear</button>
            <button className="ghost" onClick={toggleMark}>{marked[q.id] ? 'Unmark' : 'Mark for review'}</button>
            <span className="grow" />
            <button onClick={() => go(i + 1)} disabled={i === qs.length - 1}>Save & next →</button>
          </div>
        </div>
        <div className="card">
          <div className="pal">{qs.map((x, n) => <button key={x.id} aria-label={`Question ${n + 1}`}
            className={'pb' + (ans[x.id] !== undefined ? ' a' : seen[x.id] ? ' s' : '') + (marked[x.id] ? ' r' : '') + (n === i ? ' c' : '')} onClick={() => go(n)}>{n + 1}</button>)}</div>
          <div className="legend small muted"><span><i className="pb a" /> Answered</span><span><i className="pb s" /> Not answered</span><span><i className="pb r" /> Marked</span><span><i className="pb" /> Not visited</span></div>
          <p className="small" style={{ marginBottom: 0 }}>Answered {answered}/{qs.length}</p>
        </div>
      </div>
      {confirming && (
        <Modal title="Submit test?" onClose={() => setConfirming(false)} small footer={<><button className="ghost" onClick={() => setConfirming(false)}>Keep working</button><button onClick={submit}>Submit now</button></>}>
          <div className="grid"><div className="stat"><span className="muted small">Answered</span><b>{answered}</b></div><div className="stat"><span className="muted small">Unanswered</span><b>{qs.length - answered}</b></div><div className="stat"><span className="muted small">Marked</span><b>{markedN}</b></div></div>
          <p className="muted small">Time left: {fmtDur(left)}. You can't change answers after submitting. Your score and the correct answers appear right after.</p>
        </Modal>
      )}
      {busy && <div className="overlay"><Spinner label="Submitting…" /></div>}
    </>
  );
}
