/* ================= words · 例句补全 =================
 * 用免费词典接口 dictionaryapi.dev（无需 key、支持跨域）。
 * 拿不到就返回 null —— 不编句子。
 */

const API = 'https://api.dictionaryapi.dev/api/v2/entries/en/';

export async function fetchExample(word) {
  const w = String(word || '').trim().toLowerCase();
  if (!w || !/^[a-z][a-z' -]*$/.test(w)) return null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(API + encodeURIComponent(w), { signal: ctrl.signal });
    if (!r.ok) return null;
    const data = await r.json();
    const entry = Array.isArray(data) ? data[0] : null;
    if (!entry) return null;

    let example = '';
    let meaning = '';
    let pos = '';
    for (const m of entry.meanings || []) {
      if (!pos && m.partOfSpeech) pos = m.partOfSpeech;
      for (const d of m.definitions || []) {
        if (!example && d.example) example = d.example;
        if (!meaning && d.definition) meaning = d.definition;
      }
      if (example && pos) break;
    }
    if (!example) return null;
    return { example, pos, meaning };
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 逐条补，控制节奏，避免被限流 */
export async function fillExamples(words, onProgress) {
  let done = 0;
  let filled = 0;
  for (const w of words) {
    if (!w.example) {
      const r = await fetchExample(w.spelling);
      if (r) {
        w.example = r.example;
        filled++;
      }
      await new Promise((res) => setTimeout(res, 150));
    }
    done++;
    onProgress?.(done, words.length, filled);
  }
  return filled;
}
