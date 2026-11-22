/* ================= words · 构词规则与同义词 =================
 * 纯离线：只做「规则推导 + 词库内匹配」，不查外部词典。
 * 推导出来的形式不一定都是真词，所以调用方要区分：
 *   inDeck = true  → 词库里确实有这个拼写，可以放心
 *   inDeck = false → 规则推的，可能是非词，默认不勾
 */

export function posOf(word) {
  try {
    const arr = JSON.parse(word.pos_json || '[]');
    if (Array.isArray(arr) && arr.length) return arr.map((s) => s.pos || '').join(' ');
  } catch (_) {}
  return '';
}

/** 规则推导同一词根的常见形式。只保留最可靠的变形，不做自由后缀堆砌 */
export function formsOf(word) {
  const w = (word.spelling || '').toLowerCase().trim();
  if (!/^[a-z][a-z'-]*$/.test(w) || w.length < 3) return [];
  const pos = posOf(word);
  const isVerb = /v/.test(pos) || !pos;
  const isNoun = /n/.test(pos) || !pos;
  const isAdj = /adj/.test(pos) || !pos;
  const out = [];
  const seen = new Set([w]);
  const add = (form, label) => {
    if (!form || seen.has(form)) return;
    if (!/^[a-z][a-z'-]*$/.test(form)) return;
    seen.add(form);
    out.push({ form, label });
  };

  const endsY = /[^aeiou]y$/.test(w);
  const endsE = /e$/.test(w);
  const cvc = /[^aeiou][aeiou][^aeiouwy]$/.test(w);

  if (isVerb) {
    if (endsY) {
      add(w.slice(0, -1) + 'ies', '三单');
      add(w.slice(0, -1) + 'ied', '过去式');
      add(w + 'ing', '现在分词');
    } else if (endsE) {
      add(w + 's', '三单');
      add(w.slice(0, -1) + 'ed', '过去式');
      add(w.slice(0, -1) + 'ing', '现在分词');
    } else if (cvc) {
      add(w + 's', '三单');
      add(w + w.slice(-1) + 'ed', '过去式');
      add(w + w.slice(-1) + 'ing', '现在分词');
    } else {
      add(w + 's', '三单');
      add(w + 'ed', '过去式');
      add(w + 'ing', '现在分词');
    }
  }

  if (isNoun) {
    if (endsY) add(w.slice(0, -1) + 'ies', '复数');
    else if (/(s|x|z|ch|sh)$/.test(w)) add(w + 'es', '复数');
    else add(w + 's', '复数');
  }

  if (isAdj) {
    if (w.length <= 7) {
      add(w + 'er', '比较级');
      add(w + 'est', '最高级');
    }
    add(w + 'ly', '副词');
  }

  return out;
}

/** 从释义里拆出「（同义词：a, b, c）」 */
export function synonymsOf(word) {
  const src = String(word.meaning_cn || '');
  const m = src.match(/同义词[：:]\s*([^）)]+)/);
  if (!m) return [];
  return m[1]
    .split(/[,，;；]/)
    .map((s) => s.trim())
    .filter((s) => /^[A-Za-z][A-Za-z' -]*$/.test(s) && s.length > 1)
    .slice(0, 12);
}

/**
 * 给一批学过的词生成建议
 * @returns [{ base, form, label, kind: 'form'|'syn', inDeck, baseMeaning, basePos }]
 */
export function buildSuggestions(learnedWords, allWords) {
  const bySpelling = new Map();
  for (const w of allWords) bySpelling.set(w.spelling.toLowerCase(), w);
  const out = [];
  const seen = new Set();

  const push = (item) => {
    const k = item.form.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(item);
  };

  for (const base of learnedWords) {
    const baseMeaning = String(base.meaning_cn || '').replace(/\n/g, '；');
    for (const f of formsOf(base)) {
      const hit = bySpelling.get(f.form);
      push({
        base: base.spelling,
        form: f.form,
        label: f.label,
        kind: 'form',
        inDeck: !!hit,
        baseMeaning,
        basePos: posOf(base),
        hitStatus: hit ? hit.status : '',
      });
    }
    for (const s of synonymsOf(base)) {
      const hit = bySpelling.get(s.toLowerCase());
      push({
        base: base.spelling,
        form: s,
        label: '同义词',
        kind: 'syn',
        inDeck: !!hit,
        baseMeaning,
        basePos: posOf(base),
        hitStatus: hit ? hit.status : '',
      });
    }
  }
  return out;
}
