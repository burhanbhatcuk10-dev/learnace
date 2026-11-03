// CSV parsing + question import mapping (runs in the browser; the server validates again).
export function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(x => x.trim())) rows.push(row); row = []; }
    else cur += c;
  }
  row.push(cur); if (row.some(x => x.trim())) rows.push(row);
  return rows;
}

const ALIAS = { question: 'text', correct: 'answer', 'correct_answer': 'answer', a: 'option_a', b: 'option_b', c: 'option_c', d: 'option_d', 'option a': 'option_a', 'option b': 'option_b', 'option c': 'option_c', 'option d': 'option_d' };

/** Returns { items, errors } — answer may be A-D or 1-4. */
export function questionsFromCSV(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) return { items: [], errors: ['The file has no data rows.'] };
  const head = rows[0].map(h => { const k = h.trim().toLowerCase(); return ALIAS[k] || k; });
  const items = [], errors = [];
  rows.slice(1).forEach((r, n) => {
    const o = Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()]));
    const opts = ['option_a', 'option_b', 'option_c', 'option_d'].map(k => o[k]);
    const a = (o.answer || '').toUpperCase();
    const ans = 'ABCD'.indexOf(a) >= 0 && a.length === 1 ? 'ABCD'.indexOf(a) : /^[1-4]$/.test(a) ? +a - 1 : -1;
    if (!o.text) return errors.push(`Row ${n + 2}: missing question text`);
    if (opts.some(x => !x)) return errors.push(`Row ${n + 2}: needs 4 options`);
    if (ans < 0) return errors.push(`Row ${n + 2}: answer must be A, B, C or D`);
    items.push({ text: o.text, options: opts, answer: ans, explanation: o.explanation, subject: o.subject, topic: o.topic, exam: o.exam,
      difficulty: ['easy', 'moderate', 'difficult'].includes((o.difficulty || '').toLowerCase()) ? o.difficulty.toLowerCase() : 'moderate',
      year: o.year || null, source: o.source, published: !/^(false|no|0)$/i.test(o.published || '') });
  });
  return { items, errors };
}

export const CSV_TEMPLATE = 'text,option_a,option_b,option_c,option_d,answer,explanation,subject,topic,exam,difficulty,year,source\n' +
  '"Which river is known as the lifeline of Kashmir?",Jhelum,Chenab,Ravi,Tawi,A,"The Jhelum flows through the Kashmir Valley.",J&K Geography,Rivers,JKSSB,easy,2023,Sample\n';
