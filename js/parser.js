/* ================= words · 文档解析（docx / pdf / txt） ================= */

const IPA_CHARS = /[ˈˌːəɪʊʌæɑɒɔɜθðʃʒŋɚɝɑːɔːɜːiːuː]/;
const CN_CHAR = /[\u4e00-\u9fff\u3400-\u4dbf]/;

const POS_LIST = [
  'n', 'v', 'vt', 'vi', 'adj', 'adv', 'prep', 'conj', 'pron', 'art',
  'num', 'int', 'aux', 'modal', 'phr', 'abbr', 'pl', 'det', 'link-v',
];
const POS_RE = new RegExp(`(${POS_LIST.map((p) => p.replace('-', '\\-')).join('|')})\\.`, 'gi');
const POS_TOKEN_RE = new RegExp(`^(${POS_LIST.join('|')})\\.?$`, 'i');

const HEADER_WORDS = ['单词', '音标', '词性', '释义', '中文', '英文', '序号', '英式', '美式', '例句', 'word', 'phonetic', 'meaning', 'part of speech'];

/* ---------------- ZIP（只解 docx 需要的文件） ---------------- */

async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== 'function') throw new Error('当前浏览器不支持解压，请用较新的 Chrome / Safari / Edge');
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function unzip(buffer, wanted) {
  const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const len = u8.length;

  // 1) 找 EOCD（0x06054b50）
  let eocd = -1;
  const minPos = Math.max(0, len - 22 - 65535);
  for (let i = len - 22; i >= minPos; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('不是有效的 docx（zip 结构损坏）');

  const count = dv.getUint16(eocd + 10, true);
  let ptr = dv.getUint32(eocd + 16, true);
  const out = new Map();

  // 2) 遍历中央目录
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(ptr, true) !== 0x02014b50) break;
    const method = dv.getUint16(ptr + 10, true);
    const compSize = dv.getUint32(ptr + 20, true);
    const nameLen = dv.getUint16(ptr + 28, true);
    const extraLen = dv.getUint16(ptr + 30, true);
    const commentLen = dv.getUint16(ptr + 32, true);
    const localOff = dv.getUint32(ptr + 42, true);
    const name = new TextDecoder('utf-8').decode(u8.subarray(ptr + 46, ptr + 46 + nameLen));
    ptr += 46 + nameLen + extraLen + commentLen;

    if (wanted && !wanted.some((w) => name === w || name.endsWith(w))) continue;

    // 3) 读 local header，定位数据起点
    const lNameLen = dv.getUint16(localOff + 26, true);
    const lExtraLen = dv.getUint16(localOff + 28, true);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const raw = u8.subarray(dataStart, dataStart + compSize);
    out.set(name, method === 0 ? raw : await inflateRaw(raw));
  }
  return out;
}

/* ---------------- docx ---------------- */

function paraText(p) {
  let out = '';
  const walk = (n) => {
    for (let c = n.firstChild; c; c = c.nextSibling) {
      if (c.nodeType !== 1) continue;
      const ln = c.localName;
      if (ln === 't') out += c.textContent;
      else if (ln === 'tab') out += '\t';
      else if (ln === 'br' || ln === 'cr') out += '\n';
      else if (ln === 'noBreakHyphen') out += '-';
      else walk(c);
    }
  };
  walk(p);
  return out;
}

function rowCells(tr) {
  const cells = [];
  for (let c = tr.firstChild; c; c = c.nextSibling) {
    if (c.nodeType !== 1 || c.localName !== 'tc') continue;
    const ps = c.getElementsByTagNameNS('*', 'p');
    const parts = [];
    for (const p of ps) {
      const t = paraText(p).trim();
      if (t) parts.push(t);
    }
    cells.push(parts.join(' '));
  }
  return cells;
}

export async function docxToLines(buffer) {
  const files = await unzip(buffer, ['word/document.xml']);
  let xml = null;
  for (const [name, bytes] of files) {
    if (name === 'word/document.xml') xml = new TextDecoder('utf-8').decode(bytes);
  }
  if (!xml) throw new Error('这个 docx 里没找到正文（word/document.xml）');

  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const body = doc.getElementsByTagNameNS('*', 'body')[0];
  if (!body) throw new Error('docx 正文结构异常');

  const lines = [];
  for (let n = body.firstChild; n; n = n.nextSibling) {
    if (n.nodeType !== 1) continue;
    if (n.localName === 'p') {
      const t = paraText(n).trim();
      if (t) lines.push(t);
    } else if (n.localName === 'tbl') {
      const trs = n.getElementsByTagNameNS('*', 'tr');
      for (const tr of trs) {
        const cells = rowCells(tr);
        if (cells.length && cells.some((c) => c)) lines.push(cells.join('\t'));
      }
    }
  }
  return lines;
}

/* ---------------- pdf ---------------- */

export async function pdfToLines(buffer, onProgress) {
  const lib = window.pdfjsLib;
  if (!lib) throw new Error('PDF 解析组件没加载成功');
  const workerSrc = window.__PDF_WORKER_SRC__ || './lib/pdf.worker.min.js';
  const cMapUrl = window.__PDF_CMAP_URL__ || './lib/cmaps/';
  lib.GlobalWorkerOptions.workerSrc = workerSrc;

  const doc = await lib.getDocument({
    data: new Uint8Array(buffer),
    cMapUrl,
    cMapPacked: true,
  }).promise;

  const lines = [];
  for (let p = 1; p <= doc.numPages; p++) {
    if (onProgress) onProgress(p, doc.numPages);
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const rows = new Map();
    for (const item of tc.items) {
      if (!item.str) continue;
      const y = Math.round(item.transform[5] / 2) * 2;
      if (!rows.has(y)) rows.set(y, []);
      const w = item.width || item.str.length * 4;
      rows.get(y).push({ x: item.transform[4], str: item.str, w });
    }
    const ys = [...rows.keys()].sort((a, b) => b - a);
    for (const y of ys) {
      const items = rows.get(y).sort((a, b) => a.x - b.x);
      let line = '';
      let lastEnd = null;
      for (const it of items) {
        if (lastEnd !== null) {
          const gap = it.x - lastEnd;
          const prev = line.slice(-1);
          if (gap > 2.2 && prev && !/\s/.test(prev) && !/^\s/.test(it.str)) line += ' ';
        }
        line += it.str;
        lastEnd = it.x + it.w;
      }
      lines.push(line);
    }
  }
  try { doc.destroy(); } catch (_) {}
  return lines;
}

/* ---------------- 单行 → 词条 ---------------- */

function cleanWord(w) {
  return w.replace(/^[^A-Za-z]+/, '').replace(/[^A-Za-z'’\-.\s]+$/, '').trim();
}

function extractPhonetic(line) {
  const cands = [];
  const m1 = line.match(/\/([^\/\n]{1,44})\//);
  if (m1) cands.push({ raw: m1[0], inner: m1[1], idx: m1.index });
  const m2 = line.match(/[\[［]([^\]］\n]{1,44})[\]］]/);
  if (m2) cands.push({ raw: m2[0], inner: m2[1], idx: m2.index });

  for (const c of cands) {
    const inner = c.inner.trim();
    if (!inner) continue;
    const looksIpa = IPA_CHARS.test(inner);
    const looksEnough = /^[A-Za-zəɪʊʌæɑɒɔɜθðʃʒŋˈˌː'’\-.,;:\s]+$/.test(inner) && inner.length <= 40;
    if (looksIpa || looksEnough) return { phonetic: inner, start: c.idx, end: c.idx + c.raw.length };
  }
  return null;
}

function splitByPos(text) {
  const matches = [];
  const re = new RegExp(`(${POS_LIST.map((p) => p.replace('-', '\\-')).join('|')})\\.`, 'gi');
  let m;
  while ((m = re.exec(text))) {
    const prev = m.index > 0 ? text[m.index - 1] : '';
    if (/[A-Za-z]/.test(prev)) continue; // 跳过单词内部的「n.」这类，比如 abandon. 里的 n.
    matches.push({ index: m.index, len: m[0].length, pos: m[1].toLowerCase() });
  }

  if (!matches.length) {
    const t = text.trim();
    return t ? [{ pos: '', cn: t }] : [];
  }

  const segs = [];
  const before = text.slice(0, matches[0].index).trim();
  if (before && CN_CHAR.test(before)) segs.push({ pos: '', cn: before });

  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const start = cur.index + cur.len;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    let cn = text.slice(start, end).replace(/^[\s|，,;；、:：-]+/, '').trim();
    cn = cn.replace(/[|，,;；]$/, '').trim();
    if (cn) segs.push({ pos: cur.pos + '.', cn });
  }
  return segs;
}

function cnPosConvert(text) {
  const map = {
    名词: 'n.', 动词: 'v.', 形容词: 'adj.', 副词: 'adv.', 介词: 'prep.',
    连词: 'conj.', 代词: 'pron.', 冠词: 'art.', 数词: 'num.', 感叹词: 'int.',
  };
  let out = text;
  for (const [k, v] of Object.entries(map)) out = out.split(k).join(v);
  return out;
}

function parseLine(raw) {
  let line = raw.replace(/\u3000/g, ' ').replace(/\s+/g, ' ').trim();
  if (!line) return null;
  line = line.replace(/^\s*(?:\d{1,4}[.、)）]|[-•·*])\s*/, '');
  if (!line) return null;
  if (POS_TOKEN_RE.test(line)) return null; // 整行只有一个词性，没意义

  const ph = extractPhonetic(line);
  let phonetic = '';
  if (ph) {
    phonetic = ph.phonetic;
    line = line.slice(0, ph.start) + ' ' + line.slice(ph.end);
    line = line.replace(/\s+/g, ' ').trim();
  }

  const firstCn = line.search(CN_CHAR);
  const head = (firstCn >= 0 ? line.slice(0, firstCn) : line).trim();
  const tail = firstCn >= 0 ? line.slice(firstCn).trim() : '';

  // 把 head 拆成「单词 token」和「词性 token」
  const tokens = head.split(/\s+/).filter(Boolean);
  const wordTokens = [];
  const posTokens = [];
  for (const t of tokens) {
    if (POS_TOKEN_RE.test(t)) {
      const p = t.replace(/\.$/, '').toLowerCase();
      posTokens.push(p + '.');
    } else if (!posTokens.length) {
      wordTokens.push(t);
    }
  }
  let spelling = cleanWord(wordTokens.join(' '));
  const wordOk =
    spelling &&
    /^[A-Za-z]/.test(spelling) &&
    spelling.length <= 48 &&
    !/[=;(){}\[\]<>"“”]/.test(spelling) &&
    spelling.split(/\s+/).length <= 3;
  if (!wordOk) {
    if (wordTokens.length) return null; // 有英文但不像单词 → 多半是代码行或句子
    spelling = '';
  }

  if (firstCn < 0) {
    if (!spelling) return null;
    return { spelling, phonetic, meaning_cn: '', pos_json: '[]', example: '', confidence: phonetic ? 2 : 1 };
  }

  const meaningText = (posTokens.length ? `${posTokens.join(' ')} ` : '') + tail;
  const segs = splitByPos(cnPosConvert(meaningText)).filter((s) => s.cn);
  if (!spelling && !segs.length) return null;

  const meaning_cn = segs.map((s) => (s.pos ? `${s.pos} ${s.cn}` : s.cn)).join('\n');
  const conf = (spelling ? 1 : 0) + (phonetic ? 1 : 0) + (meaning_cn ? 1 : 0);
  return {
    spelling,
    phonetic,
    meaning_cn,
    pos_json: JSON.stringify(segs),
    example: '',
    confidence: conf,
  };
}

/* ---------------- 表格行 ---------------- */

function cellType(c) {
  const t = c.trim();
  if (!t) return 'empty';
  const cn = (t.match(CN_CHAR) || []).length;
  if (cn / t.length > 0.25) return 'cn';
  if (IPA_CHARS.test(t) && !/^[A-Za-z\s]+$/.test(t)) return 'ipa';
  if (new RegExp(`^(${POS_LIST.join('|')})\\.?$`, 'i').test(t)) return 'pos';
  if (/^[A-Za-z][A-Za-z'’\-. ]{0,39}$/.test(t)) return 'en';
  if (IPA_CHARS.test(t)) return 'ipa';
  return 'other';
}

function parseCells(cells) {
  const types = cells.map(cellType);
  if (types.every((t) => t === 'cn') && cells.join('').length < 12) return null;

  const pick = (t) => {
    const i = types.indexOf(t);
    return i >= 0 ? cells[i].trim() : '';
  };

  let spelling = cleanWord(pick('en'));
  let phonetic = pick('ipa').replace(/^[\/\[]|[\/\]]$/g, '').trim();
  let pos = pick('pos');
  let meaning = pick('cn');

  // 第一列不是英文时，退一步：找第一个「看起来像单词」的单元格
  if (!spelling) {
    const i = cells.findIndex((c) => /^[A-Za-z][A-Za-z'’\-]{1,39}$/.test(c.trim()));
    if (i >= 0) spelling = cleanWord(cells[i].trim());
  }
  if (!meaning) {
    const i = cells.findIndex((c) => CN_CHAR.test(c));
    if (i >= 0) meaning = cells[i].trim();
  }
  if (!spelling) return null;

  const posSegs = splitByPos(cnPosConvert((pos ? pos + ' ' : '') + meaning));
  const meaning_cn = posSegs.length
    ? posSegs.map((s) => (s.pos ? `${s.pos} ${s.cn}` : s.cn)).join('\n')
    : meaning;

  const conf = (spelling ? 1 : 0) + (phonetic ? 1 : 0) + (meaning_cn ? 1 : 0);
  return {
    spelling,
    phonetic,
    meaning_cn,
    pos_json: JSON.stringify(posSegs),
    example: '',
    confidence: conf,
  };
}

/* ---------------- 总入口 ---------------- */

function isNoise(line) {
  const t = line.trim();
  if (!t) return true;
  if (/^第?\s*\d+\s*页$/.test(t)) return true;
  if (/^\d{1,4}$/.test(t)) return true;
  if (/^[-\s=_·•]+$/.test(t)) return true;
  if (/^[（(]?[一二三四五六七八九十]+[）)]?[、.．]/.test(t) && t.length < 14) return true;
  const lower = t.toLowerCase();
  if (HEADER_WORDS.some((w) => lower.includes(w.toLowerCase())) && t.length < 24) return true;
  return false;
}

export function parseLines(lines) {
  const rows = [];
  for (const raw of lines) {
    const line = String(raw || '').replace(/\u00a0/g, ' ').trim();
    if (!line) continue;

    if (line.includes('\t')) {
      const cells = line.split('\t');
      if (cells.length >= 2) {
        const e = parseCells(cells);
        if (e) rows.push({ ...e, source_line: rows.length + 1 });
        continue;
      }
    }
    if (isNoise(line)) continue;
    const e = parseLine(line);
    if (!e) continue;
    rows.push({ ...e, source_line: rows.length + 1 });
  }

  // 多行合并：有单词没释义的，吸收后面 1~2 行纯释义
  const merged = [];
  for (let i = 0; i < rows.length; i++) {
    const cur = rows[i];
    if (cur.spelling && !cur.meaning_cn) {
      const tailMean = [];
      let j = i + 1;
      while (j < rows.length && j <= i + 2 && !rows[j].spelling && rows[j].meaning_cn) {
        tailMean.push(rows[j].meaning_cn);
        j++;
      }
      if (tailMean.length) {
        cur.meaning_cn = tailMean.join('\n');
        cur.pos_json = JSON.stringify(splitByPos(cnPosConvert(cur.meaning_cn)));
        cur.confidence = Math.min(3, cur.confidence + 1);
        i = j - 1;
      }
    }
    merged.push(cur);
  }

  // 纯释义行没有归属 → 丢掉
  const out = [];
  const seen = new Set();
  for (const r of merged) {
    if (!r.spelling) continue;
    const key = r.spelling.toLowerCase();
    if (seen.has(key)) continue; // 词库内部先去一次重
    seen.add(key);
    out.push({
      spelling: r.spelling,
      phonetic_uk: r.phonetic || '',
      phonetic_us: r.phonetic || '',
      pos_json: r.pos_json || '[]',
      meaning_cn: r.meaning_cn || '',
      example: r.example || '',
      source_line: r.source_line || 0,
      confidence: r.confidence ?? 1,
    });
  }
  return out;
}

/** 统一入口：File → 词条数组 */
export async function parseFile(file, onStep) {
  const name = (file.name || '').toLowerCase();
  const buf = await file.arrayBuffer();
  let lines = [];

  if (name.endsWith('.docx')) {
    onStep?.('正在解压 Word 文档…');
    lines = await docxToLines(buf);
  } else if (name.endsWith('.txt') || name.endsWith('.csv') || name.endsWith('.md')) {
    onStep?.('正在读取文本…');
    const text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
    lines = text.split(/\r?\n/);
  } else if (name.endsWith('.pdf')) {
    onStep?.('正在读取 PDF…');
    lines = await pdfToLines(buf, (p, total) => onStep?.(`正在读取 PDF… ${p}/${total} 页`));
  } else {
    throw new Error('只支持 .docx / .pdf / .txt 文件');
  }

  onStep?.(`正在识别 ${lines.length} 行…`);
  const entries = parseLines(lines);

  if (!entries.length) {
    const hint = name.endsWith('.pdf')
      ? '没识别到单词。这个 PDF 可能是扫描图片版（没有文字层），请换 Word 版或「带文字的 PDF」。'
      : '没识别到单词。检查一下文档是不是「一行一个词条」的格式（单词 + 音标 + 词性 + 中文）。';
    throw new Error(hint);
  }
  return entries;
}
