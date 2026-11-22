/* ================= words · 数据层（IndexedDB） ================= */

const DB_NAME = 'words-db';
const DB_VERSION = 1;

let _dbp = null;

export function db() {
  if (!_dbp) {
    _dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('deck')) {
          const s = d.createObjectStore('deck', { keyPath: 'id', autoIncrement: true });
          s.createIndex('created_at', 'created_at');
        }
        if (!d.objectStoreNames.contains('word')) {
          const s = d.createObjectStore('word', { keyPath: 'id', autoIncrement: true });
          s.createIndex('deck_id', 'deck_id');
          s.createIndex('deck_status', ['deck_id', 'status']);
          s.createIndex('deck_due', ['deck_id', 'status', 'next_review_at']);
          s.createIndex('spelling', 'spelling_lc');
        }
        if (!d.objectStoreNames.contains('review_log')) {
          const s = d.createObjectStore('review_log', { keyPath: 'id', autoIncrement: true });
          s.createIndex('at', 'at');
          s.createIndex('word_id', 'word_id');
        }
        if (!d.objectStoreNames.contains('check_in')) {
          d.createObjectStore('check_in', { keyPath: 'date' });
        }
        if (!d.objectStoreNames.contains('settings')) {
          d.createObjectStore('settings', { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return _dbp;
}

function pr(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withTx(storeNames, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(storeNames, mode);
    let result;
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('transaction aborted'));
    try {
      const stores = Array.isArray(storeNames)
        ? storeNames.map((n) => t.objectStore(n))
        : t.objectStore(storeNames);
      // fn 可以返回一个 IDBRequest 的 Promise；request 一定在事务提交前完成，
      // 所以这里 resolve 它会安全地等到 oncomplete 之后
      result = fn(stores, t);
    } catch (e) {
      try { t.abort(); } catch (_) {}
      reject(e);
    }
  });
}

/* ---------------- deck ---------------- */

export async function listDecks() {
  const all = await withTx('deck', 'readonly', (s) => pr(s.getAll()));
  return all.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
}

export async function getDeck(id) {
  return withTx('deck', 'readonly', (s) => pr(s.get(id)));
}

export async function getActiveDeck() {
  const decks = await listDecks();
  return decks.find((d) => d.is_active) || decks[0] || null;
}

export async function createDeck({ name, file_name }) {
  const now = Date.now();
  const id = await withTx('deck', 'readwrite', (s) =>
    pr(s.add({ name: name || '未命名词库', file_name: file_name || '', total: 0, created_at: now, is_active: 0 }))
  );
  const decks = await listDecks();
  if (decks.length === 1) await setActiveDeck(id);
  return getDeck(id);
}

export async function setActiveDeck(id) {
  return withTx('deck', 'readwrite', (s) => {
    const all = [];
    const cur = s.openCursor();
    cur.onsuccess = () => {
      const c = cur.result;
      if (c) { all.push(c.value); c.continue(); return; }
      for (const d of all) {
        const next = { ...d, is_active: d.id === id ? 1 : 0 };
        s.put(next);
      }
    };
  });
}

export async function updateDeck(deck) {
  return withTx('deck', 'readwrite', (s) => pr(s.put(deck)));
}

export async function deleteDeck(id) {
  const keys = await withTx('word', 'readonly', (s) => pr(s.index('deck_id').getAllKeys(id)));
  const wids = (keys || []).map((k) => (Array.isArray(k) ? k[0] : k));
  await withTx(['deck', 'word', 'review_log'], 'readwrite', (s) => {
    const [deckS, wordS, logS] = s;
    deckS.delete(id);
    const logIdx = logS.index('word_id');
    for (const wid of wids) {
      wordS.delete(wid);
      logIdx.delete(wid);
    }
  });
}

/* ---------------- word ---------------- */

function normalizeEntry(e, deckId, now) {
  return {
    deck_id: deckId,
    spelling: e.spelling,
    spelling_lc: String(e.spelling || '').toLowerCase(),
    phonetic_uk: e.phonetic_uk || '',
    phonetic_us: e.phonetic_us || e.phonetic_uk || '',
    pos_json: e.pos_json || '[]',
    meaning_cn: e.meaning_cn || '',
    example: e.example || '',
    source_line: e.source_line || 0,
    confidence: e.confidence ?? 2,
    status: 'new',
    stage: 0,
    correct_streak: 0,
    wrong_count: 0,
    relearn_date: '',
    relearn_count: 0,
    next_review_at: null,
    last_review_at: null,
    is_favorite: 0,
    created_at: now,
  };
}

export async function bulkAddWords(deckId, entries) {
  const now = Date.now();
  const existed = new Set();
  const existing = await withTx('word', 'readonly', (s) => pr(s.getAll()));
  for (const w of existing) if (w.deck_id === deckId) existed.add(w.spelling_lc);

  const toAdd = [];
  const skipped = [];
  for (const e of entries) {
    const lc = String(e.spelling || '').toLowerCase();
    if (!lc) continue;
    if (existed.has(lc)) { skipped.push(e.spelling); continue; }
    existed.add(lc);
    toAdd.push(normalizeEntry(e, deckId, now));
  }

  const BATCH = 400;
  for (let i = 0; i < toAdd.length; i += BATCH) {
    const chunk = toAdd.slice(i, i + BATCH);
    await withTx('word', 'readwrite', (s) => {
      for (const w of chunk) s.add(w);
    });
  }
  const deck = await getDeck(deckId);
  if (deck) {
    deck.total = (await countsByStatus(deckId)).total;
    await updateDeck(deck);
  }
  return { added: toAdd.length, skipped };
}

export async function getWord(id) {
  return withTx('word', 'readonly', (s) => pr(s.get(id)));
}

export async function getWordsByIds(ids) {
  const out = [];
  for (const id of ids) {
    const w = await getWord(id);
    if (w) out.push(w);
  }
  return out;
}

export async function updateWord(word) {
  return withTx('word', 'readwrite', (s) => pr(s.put(word)));
}

export async function deleteWord(id) {
  return withTx('word', 'readwrite', (s) => pr(s.delete(id)));
}

export async function listWords(deckId, { status = 'all', search = '' } = {}) {
  const all = await withTx('word', 'readonly', (s) => pr(s.index('deck_id').getAll(deckId)));
  const q = search.trim().toLowerCase();
  return all.filter((w) => {
    if (status !== 'all') {
      if (status === 'favorite') { if (!w.is_favorite) return false; }
      else if (w.status !== status) return false;
    }
    if (q && !(w.spelling_lc.includes(q) || (w.meaning_cn || '').includes(q))) return false;
    return true;
  });
}

export async function countsByStatus(deckId) {
  const all = await withTx('word', 'readonly', (s) => pr(s.index('deck_id').getAll(deckId)));
  const c = { total: all.length, new: 0, learning: 0, mastered: 0 };
  for (const w of all) {
    if (w.status === 'new') c.new++;
    else if (w.status === 'mastered') c.mastered++;
    else c.learning++;
  }
  return c;
}

export async function countsAll() {
  const decks = await listDecks();
  const out = { total: 0, learning: 0, mastered: 0 };
  for (const d of decks) {
    const c = await countsByStatus(d.id);
    out.total += c.total;
    out.learning += c.learning;
    out.mastered += c.mastered;
  }
  return out;
}

/** 只从「从未学过」的词里随机抽 n 个 —— 绝不混入 learning / mastered */
export async function pickNewWords(deckId, n) {
  if (n <= 0) return [];
  const range = IDBKeyRange.only([deckId, 'new']);
  const keys = await withTx('word', 'readonly', (s) => pr(s.index('deck_status').getAllKeys(range)));
  if (!keys || !keys.length) return [];
  const ids = keys.map((k) => (Array.isArray(k) ? k[0] : k));
  // Fisher–Yates
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const picked = ids.slice(0, n);
  const out = [];
  for (const id of picked) {
    const w = await getWord(id);
    if (w) out.push(w);
  }
  return out;
}

/** 到期待复习词（逾期最久优先） */
export async function getDueWords(deckId, beforeTs, limit = 9999) {
  const range = IDBKeyRange.bound([deckId, 'learning', 0], [deckId, 'learning', beforeTs]);
  const keys = await withTx('word', 'readonly', (s) => pr(s.index('deck_due').getAllKeys(range)));
  const ids = keys.map((k) => (Array.isArray(k) ? k[0] : k)).slice(0, limit);
  const out = [];
  for (const id of ids) {
    const w = await getWord(id);
    if (w) out.push(w);
  }
  return out;
}

/* ---------------- review log ---------------- */

export async function addReviewLog(log) {
  return withTx('review_log', 'readwrite', (s) => pr(s.add(log)));
}

export async function deleteReviewLog(id) {
  return withTx('review_log', 'readwrite', (s) => pr(s.delete(id)));
}

export async function logsBetween(fromTs, toTs) {
  const range = IDBKeyRange.bound(fromTs, toTs);
  return withTx('review_log', 'readonly', (s) => pr(s.index('at').getAll(range)));
}

/* ---------------- check in ---------------- */

export async function getCheckIn(date) {
  return withTx('check_in', 'readonly', (s) => pr(s.get(date)));
}

export async function putCheckIn(ci) {
  return withTx('check_in', 'readwrite', (s) => pr(s.put(ci)));
}

export async function listCheckIns() {
  return withTx('check_in', 'readonly', (s) => pr(s.getAll()));
}

/* ---------------- settings ---------------- */

const SETTING_DEFAULTS = {
  daily_new_goal: 20,
  daily_review_cap: 200,
  accent: 'us',
  auto_play: 0,
  theme: 'system',
  remind_time: '20:30',
  fuzzy_mode: 0,
  spell_mode: 0,
  last_deck: 0,
  answer_mode: 'recognize', // recognize | spelling | dictation | mix
  hint_max: 2,              // 每张卡最多提示几个字母
};

export async function getSetting(key) {
  const row = await withTx('settings', 'readonly', (s) => pr(s.get(key)));
  if (!row) return SETTING_DEFAULTS[key];
  return row.value;
}

export async function setSetting(key, value) {
  return withTx('settings', 'readwrite', (s) => pr(s.put({ key, value })));
}

export async function getAllSettings() {
  const rows = await withTx('settings', 'readonly', (s) => pr(s.getAll()));
  const out = { ...SETTING_DEFAULTS };
  for (const r of rows) out[r.key] = r.value;
  return out;
}

/* ---------------- 维护 ---------------- */

export async function resetProgress(deckId) {
  const all = await withTx('word', 'readonly', (s) => pr(s.index('deck_id').getAll(deckId)));
  await withTx('word', 'readwrite', (s) => {
    for (const w of all) {
      s.put({
        ...w, status: 'new', stage: 0, correct_streak: 0, wrong_count: 0,
        relearn_date: '', relearn_count: 0, next_review_at: null, last_review_at: null,
      });
    }
  });
}

export async function exportAll() {
  const [decks, words, logs, checkins, settings] = await Promise.all([
    withTx('deck', 'readonly', (s) => pr(s.getAll())),
    withTx('word', 'readonly', (s) => pr(s.getAll())),
    withTx('review_log', 'readonly', (s) => pr(s.getAll())),
    withTx('check_in', 'readonly', (s) => pr(s.getAll())),
    withTx('settings', 'readonly', (s) => pr(s.getAll())),
  ]);
  return { app: 'words', version: 1, exported_at: new Date().toISOString(), decks, words, logs, checkins, settings };
}

export async function importAll(data) {
  if (!data || data.app !== 'words') throw new Error('不是 words 的备份文件');
  await withTx(['deck', 'word', 'review_log', 'check_in', 'settings'], 'readwrite', (s) => {
    const [ds, ws, ls, cs, ss] = s;
    for (const st of [ds, ws, ls, cs, ss]) st.clear();
    for (const d of data.decks || []) ds.put(d);
    for (const w of data.words || []) ws.put(w);
    for (const l of data.logs || []) ls.put(l);
    for (const c of data.checkins || []) cs.put(c);
    for (const x of data.settings || []) ss.put(x);
  });
}

export async function wipeAll() {
  await withTx(['deck', 'word', 'review_log', 'check_in', 'settings'], 'readwrite', (s) => {
    for (const st of s) st.clear();
  });
}
