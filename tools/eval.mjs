import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MiniDOMParser } from './minidom.mjs';

globalThis.DOMParser = MiniDOMParser;
const { parseFile } = await import('../js/parser.js');

const here = fileURLToPath(new URL('.', import.meta.url));
const tsDir = join(here, '..', 'testset');

function norm(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, '').replace(/[，,；;。.]/g, '').trim();
}

function evaluate(parsed, expected) {
  const bySpelling = new Map(parsed.map((p) => [norm(p.spelling), p]));
  const expSet = new Set(expected.map((e) => norm(e.spelling)));
  let found = 0, posOk = 0, meaningOk = 0;
  const missing = [];
  for (const e of expected) {
    const p = bySpelling.get(norm(e.spelling));
    if (!p) { missing.push(e.spelling); continue; }
    found++;
    const posJson = String(p.pos_json || '');
    const wantPos = String(e.pos || '').replace('.', '');
    if (!wantPos || posJson.includes(wantPos)) posOk++;
    const gotMeaning = norm(p.meaning_cn);
    const wantMeaning = norm(e.meaning);
    if (!wantMeaning || (gotMeaning && (gotMeaning.includes(wantMeaning.slice(0, Math.min(6, wantMeaning.length))) || wantMeaning.includes(gotMeaning.slice(0, Math.min(6, gotMeaning.length)))))) meaningOk++;
  }
  const extra = parsed.filter((p) => !expSet.has(norm(p.spelling))).map((p) => p.spelling);
  return {
    expected: expected.length,
    parsed: parsed.length,
    recall: expected.length ? found / expected.length : 0,
    posRate: found ? posOk / found : 0,
    meaningRate: found ? meaningOk / found : 0,
    missing,
    extra,
  };
}

const files = (await readdir(tsDir)).filter((f) => /\.(txt|docx|pdf)$/i.test(f)).sort();
const results = [];

for (const f of files) {
  const stem = basename(f, extname(f));
  const docPath = join(tsDir, f);
  const expPath = join(tsDir, `${stem}.expected.json`);
  let expected;
  try {
    expected = JSON.parse(await readFile(expPath, 'utf8'));
  } catch {
    console.log(`跳过 ${f}（没有标注文件）`);
    continue;
  }
  const buf = await readFile(docPath);
  const file = new File([buf], f);
  let parsed = [];
  let err = '';
  try {
    parsed = await parseFile(file, () => {});
  } catch (e) {
    err = e.message;
  }
  const m = evaluate(parsed, expected);
  results.push({ file: f, err, ...m });
}

const pct = (x) => (x * 100).toFixed(0) + '%';
console.log('\n=== 解析评测（当前版本） ===\n');
console.log('文件'.padEnd(24) + '召回'.padEnd(7) + '词性'.padEnd(7) + '释义'.padEnd(7) + '多出');
for (const r of results) {
  console.log(
    r.file.padEnd(24).slice(0, 23) +
      (r.err ? `ERR ${r.err.slice(0, 10)}` : pct(r.recall).padEnd(7) + pct(r.posRate).padEnd(7) + pct(r.meaningRate).padEnd(7) + r.extra.length)
  );
}
const avg = (k) => results.length ? results.reduce((a, r) => a + r[k], 0) / results.length : 0;
console.log(`\n平均：召回 ${pct(avg('recall'))} · 词性 ${pct(avg('posRate'))} · 释义 ${pct(avg('meaningRate'))}`);

const detail = results.map((r) => ({
  file: r.file,
  recall: r.recall,
  posRate: r.posRate,
  meaningRate: r.meaningRate,
  missing: r.missing,
  extra: r.extra,
  err: r.err,
}));
await writeFile(join(here, 'eval-report.json'), JSON.stringify({ generatedAt: new Date().toISOString(), summary: { recall: avg('recall'), pos: avg('posRate'), meaning: avg('meaningRate') }, detail }, null, 1), 'utf8');
console.log('\n明细已写入 tools/eval-report.json');
