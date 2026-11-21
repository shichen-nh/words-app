/* ================= words · 应用主控 ================= */

import * as DB from './db.js';
import * as S from './sched.js';
import * as V from './views.js';
import { parseFile } from './parser.js';
import { pickEncouragement } from './encourage.js';

const VERSION = '1.0.0';
const $ = (sel, root = document) => root.querySelector(sel);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const state = {
  tab: 'today',
  settings: null,
  deck: null,
  session: null,
  card: null,
  revealed: false,
  answering: false,
  lastAction: null,
  sessionStart: 0,
  layers: [],
  importEntries: null,
  importDeckName: '',
  deckDetail: null,
  pending: null,
};

/* ---------------- 基础工具 ---------------- */

function showToast(text, actionLabel, onAction, ms = 2200) {
  const t = $('#toast');
  t.innerHTML = `<span>${V.esc(text)}</span>${actionLabel ? `<button data-ta="toast">${V.esc(actionLabel)}</button>` : ''}`;
  t.hidden = false;
  clearTimeout(showToast._t);
  document.querySelector('#toast [data-ta]')?.addEventListener('click', () => {
    t.hidden = true;
    onAction?.();
  });
  showToast._t = setTimeout(() => { t.hidden = true; }, ms);
}

function setBusy(text, on = true) {
  const b = $('#busy');
  b.hidden = !on;
  if (text) $('#busy-text').textContent = text;
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme || 'system';
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b0b0c' : '#ffffff');
}

function say(text) {
  if (!('speechSynthesis' in window) || !text) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 0.9;
    const voices = window.speechSynthesis.getVoices() || [];
    const v =
      voices.find((x) => /^en-(US|GB)/i.test(x.lang) && /Samantha|Aria|Jenny|Zira|Google|Natural/i.test(x.name)) ||
      voices.find((x) => /^en/i.test(x.lang));
    if (v) u.voice = v;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch (_) {}
}

/* ---------------- 层管理 ---------------- */

function paintLayer() {
  const layer = $('#layer');
  const top = state.layers[state.layers.length - 1];
  if (!top) {
    layer.hidden = true;
    layer.innerHTML = '';
    return;
  }
  layer.hidden = false;
  layer.innerHTML = top.render();
}

function openLayer(kind, render) {
  state.layers.push({ kind, render });
  paintLayer();
}

function closeLayer() {
  if (!state.layers.length) return;
  state.layers.pop();
  paintLayer();
}

function closeAllLayers() {
  state.layers.length = 0;
  paintLayer();
}

/* ---------------- 路由 ---------------- */

async function render() {
  const view = $('#view');
  if (state.tab === 'today') {
    await renderToday(view);
  } else if (state.tab === 'decks') {
    await renderDecks(view);
  } else if (state.tab === 'stats') {
    await renderStats(view);
  } else {
    await renderMe(view);
  }
  document.querySelectorAll('.tab').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === state.tab);
  });
}

function switchTab(tab) {
  if (state.tab === tab) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  state.tab = tab;
  window.scrollTo(0, 0);
  render();
}

async function renderToday(view) {
  const deck = await DB.getActiveDeck();
  state.deck = deck;
  if (!deck) {
    view.innerHTML = V.todayView({ deck: null, settings: state.settings, streak: 0, dateNow: Date.now() });
    return;
  }
  const [counts, due, checkins] = await Promise.all([
    DB.countsByStatus(deck.id),
    DB.getDueWords(deck.id, Date.now(), 9999),
    DB.listCheckIns(),
  ]);
  const session = S.loadSession(deck.id);
  const streak = S.computeStreak(checkins);
  const checkedToday = checkins.some((c) => c.date === S.dateKey());
  view.innerHTML = V.todayView({
    deck, session, counts, dueCount: due.length,
    settings: state.settings, streak, checkedToday, dateNow: Date.now(),
  });
}

async function renderDecks(view) {
  const decks = await DB.listDecks();
  const countsMap = {};
  for (const d of decks) countsMap[d.id] = await DB.countsByStatus(d.id);
  const active = await DB.getActiveDeck();
  view.innerHTML = V.decksView({ decks, countsMap, activeId: active?.id });
}

async function renderStats(view) {
  const decks = await DB.listDecks();
  let total = 0, newCount = 0, learning = 0, mastered = 0;
  const active = await DB.getActiveDeck();
  for (const d of decks) {
    const c = await DB.countsByStatus(d.id);
    total += c.total;
    newCount += c.new;
    learning += c.learning;
    mastered += c.mastered;
  }
  const checkins = await DB.listCheckIns();
  const streak = S.computeStreak(checkins);

  const start = S.startOfDay();
  let logs = [];
  for (const d of decks) {
    if (d.id === active?.id) logs = await DB.logsBetween(start, Date.now() + 1000);
  }
  const logsToday = {
    new: logs.filter((l) => l.is_new).length,
    review: logs.filter((l) => !l.is_new).length,
    total: logs.length,
    know: logs.filter((l) => l.rating === 'know').length,
  };

  const forecast = [];
  const learningWords = active ? await DB.listWords(active.id, { status: 'learning' }) : [];
  for (let i = 0; i < 7; i++) {
    const dayStart = S.addDays(start, i);
    const dayEnd = dayStart + 86400000 - 1;
    const n = learningWords.filter(
      (w) => w.next_review_at && w.next_review_at >= dayStart && w.next_review_at <= dayEnd
    ).length;
    forecast.push({ label: i === 0 ? '今天' : `${i}`, n });
  }

  view.innerHTML = V.statsView({
    countsAll: { total, new: newCount, learning, mastered },
    checkins, streak, dateNow: Date.now(), logsToday, forecast,
  });
}

async function renderMe(view) {
  const decks = await DB.listDecks();
  let total = 0, newCount = 0, mastered = 0;
  for (const d of decks) {
    const c = await DB.countsByStatus(d.id);
    total += c.total; newCount += c.new; mastered += c.mastered;
  }
  view.innerHTML = V.meView({
    settings: state.settings,
    countsAll: { total, new: newCount, mastered },
    version: VERSION,
  });
}

/* ---------------- 学习 ---------------- */

async function startStudy() {
  const deck = await DB.getActiveDeck();
  if (!deck) {
    showToast('先导入一个词库');
    return;
  }
  let session = S.loadSession(deck.id);
  if (!session) session = await S.buildSession(deck.id, state.settings);
  state.session = session;
  state.deck = deck;
  state.sessionStart = Date.now();
  openLayer('study', () => V.studyShell());
  const ok = await nextCard();
  if (!ok) await finishStudy();
}

async function addMore() {
  const deck = await DB.getActiveDeck();
  if (!deck) return;
  let session = S.loadSession(deck.id);
  if (!session) session = await S.buildSession(deck.id, state.settings);
  const words = await DB.pickNewWords(deck.id, 10);
  if (!words.length) {
    showToast('这个词库的新词学完了');
    return;
  }
  session.targets.new += words.length;
  session.queue.push(...words.map((w) => w.id));
  S.saveSession(deck.id, session);
  state.session = session;
  state.deck = deck;
  state.sessionStart = Date.now();
  openLayer('study', () => V.studyShell());
  await nextCard();
}

async function nextCard() {
  const s = state.session;
  if (!s) return false;
  let card = await S.currentCard(state.deck.id, s);
  if (!card) {
    const n = await S.refill(state.deck.id, s);
    if (n) card = await S.currentCard(state.deck.id, s);
  }
  if (!card) {
    state.card = null;
    return false;
  }
  state.card = card.word;
  state.revealed = false;
  state.answering = false;
  paintCard();
  updateProgress();
  if (Number(state.settings.auto_play)) say(card.word.spelling);
  return true;
}

function paintCard() {
  const cardEl = $('#study-card');
  if (!cardEl || !state.card) return;
  cardEl.classList.remove('swipe-left', 'swipe-right');
  cardEl.style.transform = '';
  const s = state.session;
  const total = s.targets.new + s.targets.review;
  const done = s.done.new + s.done.review;
  cardEl.innerHTML = V.studyCardHTML(state.card, {
    accent: state.settings.accent,
    revealed: state.revealed,
    idx: done,
    total,
  });
  $('#answer-zone').classList.toggle('show', state.revealed);
}

function revealCard() {
  if (state.revealed || !state.card) return;
  state.revealed = true;
  const cardEl = $('#study-card');
  const ans = cardEl.querySelector('.answer');
  const hint = cardEl.querySelector('.hint');
  if (ans) ans.hidden = false;
  if (hint) hint.hidden = true;
  $('#answer-zone').classList.add('show');
}

function updateProgress() {
  const s = state.session;
  if (!s) return;
  const total = s.targets.new + s.targets.review;
  const done = s.done.new + s.done.review;
  const bar = $('#study-progress');
  const counter = $('#study-counter');
  if (bar) bar.style.width = total ? `${Math.min(100, (done / total) * 100)}%` : '0%';
  if (counter) counter.textContent = `${Math.min(done + 1, total || done)} / ${total}`;
}

async function answer(rating) {
  if (!state.revealed || !state.card || state.answering) return;
  state.answering = true;

  const s = state.session;
  const word = state.card;
  const before = { ...word };
  const res = S.applyAnswer(word, rating);

  await DB.updateWord(res.word);
  const logId = await DB.addReviewLog(res.log);

  const firstTime = !s.seen.includes(word.id);
  if (firstTime) {
    s.seen.push(word.id);
    if (word.status === 'new') s.done.new++;
    else s.done.review++;
  }
  if (s.queue[0] === word.id) s.queue.shift();
  else {
    const i = s.queue.indexOf(word.id);
    if (i >= 0) s.queue.splice(i, 1);
  }
  if (res.requeue) s.queue.push(word.id);
  S.saveSession(state.deck.id, s);

  state.lastAction = {
    before, logId, id: word.id, firstTime,
    wasNew: word.status === 'new', requeued: res.requeue,
  };

  const cardEl = $('#study-card');
  if (cardEl) cardEl.classList.add(rating === 'know' ? 'swipe-right' : 'swipe-left');
  updateProgress();
  await sleep(190);

  const ok = await nextCard();
  if (!ok) {
    await finishStudy();
    return;
  }

  showToast(
    rating === 'know' ? `记住了：${word.spelling}` : `再记一次：${word.spelling}`,
    '撤销',
    undoAnswer,
    1800
  );
}

async function undoAnswer() {
  const a = state.lastAction;
  if (!a) return;
  state.lastAction = null;
  const s = state.session;
  if (!s) return;

  await DB.updateWord(a.before);
  try { await DB.deleteReviewLog(a.logId); } catch (_) {}

  if (a.firstTime) {
    s.seen = s.seen.filter((x) => x !== a.id);
    if (a.wasNew) s.done.new = Math.max(0, s.done.new - 1);
    else s.done.review = Math.max(0, s.done.review - 1);
  }
  s.queue = s.queue.filter((x) => x !== a.id);
  s.queue.unshift(a.id);
  S.saveSession(state.deck.id, s);

  state.card = a.before;
  state.revealed = true;
  paintCard();
  const cardEl = $('#study-card');
  if (cardEl) {
    const ans = cardEl.querySelector('.answer');
    const hint = cardEl.querySelector('.hint');
    if (ans) ans.hidden = false;
    if (hint) hint.hidden = true;
  }
  $('#answer-zone').classList.add('show');
  updateProgress();
}

async function finishStudy() {
  const s = state.session;
  if (!s) { closeAllLayers(); return; }
  const done = S.sessionDone(s) || s.queue.length === 0;
  closeAllLayers();

  if (done && (s.targets.new + s.targets.review) > 0) {
    await writeCheckIn(s);
    await render();
    await openCheckinPage(true);
  } else {
    await render();
  }
}

async function writeCheckIn(session) {
  const today = S.dateKey();
  const elapsed = Math.max(0, Math.round((Date.now() - (state.sessionStart || Date.now())) / 1000));
  const existing = await DB.getCheckIn(today);
  if (existing) {
    existing.new_done = Math.max(existing.new_done || 0, session.done.new);
    existing.review_done = Math.max(existing.review_done || 0, session.done.review);
    existing.seconds = (existing.seconds || 0) + elapsed;
    await DB.putCheckIn(existing);
  } else {
    await DB.putCheckIn({
      date: today,
      new_done: session.done.new,
      review_done: session.done.review,
      seconds: elapsed,
    });
  }
}

async function openCheckinPage(justChecked = false) {
  const checkins = await DB.listCheckIns();
  const streak = S.computeStreak(checkins);
  const total = S.computeTotalDays(checkins);
  const today = checkins.find((c) => c.date === S.dateKey());
  const words = today ? (today.new_done || 0) + (today.review_done || 0) : 0;
  const text = pickEncouragement({
    streak,
    total,
    broke: streak === 1 && total > 1,
  });
  openLayer('checkin', () => V.checkinView({ streak, total, words, text, checkins, justChecked }));
}

/* ---------------- 导入 ---------------- */

function openImport() {
  openLayer('import', () => V.importView());
  setTimeout(() => {
    const input = $('#file-input');
    const drop = $('#drop-zone');
    if (input) input.addEventListener('change', () => {
      const f = input.files?.[0];
      if (f) handleFile(f);
    });
    if (drop) {
      drop.addEventListener('click', () => input?.click());
      drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drag'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
      drop.addEventListener('drop', (e) => {
        e.preventDefault();
        drop.classList.remove('drag');
        const f = e.dataTransfer?.files?.[0];
        if (f) handleFile(f);
      });
    }
  }, 30);
}

async function handleFile(file) {
  setBusy('正在解析…');
  try {
    const entries = await parseFile(file, (msg) => setBusy(msg));
    state.importEntries = entries;
    state.importDeckName = (file.name || '我的词库').replace(/\.(docx|pdf|txt|csv|md)$/i, '');
    setBusy('', false);
    openLayer('review', () =>
      V.reviewView({ deckName: state.importDeckName, entries: state.importEntries })
    );
  } catch (e) {
    setBusy('', false);
    showToast(e?.message || '解析失败', null, null, 3600);
  }
}

function refreshReview() {
  paintLayer();
}

async function confirmImport() {
  const entries = state.importEntries;
  if (!entries?.length) return;
  setBusy('正在入库…');
  try {
    const deck = await DB.createDeck({ name: state.importDeckName });
    const r = await DB.bulkAddWords(deck.id, entries);
    setBusy('', false);
    closeAllLayers();
    state.importEntries = null;
    state.tab = 'today';
    await render();
    showToast(
      `导入了 ${r.added} 个词${r.skipped.length ? `，跳过 ${r.skipped.length} 个重复` : ''}`
    );
  } catch (e) {
    setBusy('', false);
    showToast(e?.message || '导入失败');
  }
}

function openEditEntry(index) {
  const entry = state.importEntries[index];
  if (!entry) return;
  openLayer('edit-entry', () => V.editEntryView({ entry, index }));
}

function saveEditEntry(index) {
  const entry = state.importEntries[index];
  if (!entry) return;
  const word = $('#ei-word')?.value.trim() || entry.spelling;
  const phon = $('#ei-phon')?.value.trim() || '';
  const cn = $('#ei-cn')?.value.trim() || '';
  const ex = $('#ei-ex')?.value.trim() || '';
  const conf = (word ? 1 : 0) + (phon ? 1 : 0) + (cn ? 1 : 0);
  state.importEntries[index] = {
    ...entry,
    spelling: word,
    phonetic_uk: phon,
    phonetic_us: phon,
    meaning_cn: cn.replace(/；/g, '\n'),
    pos_json: entry.pos_json,
    example: ex,
    confidence: conf,
  };
  closeLayer();
  refreshReview();
}

/* ---------------- 词库 ---------------- */

async function openDeckDetail(id, filter = 'all', search = '') {
  const deck = await DB.getDeck(id);
  if (!deck) return;
  const words = await DB.listWords(id, { status: filter, search });
  state.deckDetail = { id, filter, search };
  const html = () =>
    V.deckDetailView({ deck, words: state.deckDetailWords || words, filter: state.deckDetail.filter, search: state.deckDetail.search });
  state.deckDetailWords = words;
  openLayer('deck-detail', html);
  setTimeout(() => {
    const inp = $('#deck-search');
    if (!inp) return;
    inp.focus();
    inp.setSelectionRange(inp.value.length, inp.value.length);
  }, 30);
}

async function reloadDeckDetail() {
  if (!state.deckDetail) return;
  const d = state.deckDetail;
  const words = await DB.listWords(d.id, { status: d.filter, search: d.search });
  state.deckDetailWords = words;
  const box = $('#deck-words');
  if (box) box.innerHTML = V.wordRowsHTML(words);
}

/* ---------------- 设置 ---------------- */

async function setSetting(key, value) {
  state.settings[key] = value;
  await DB.setSetting(key, value);
  if (key === 'theme') applyTheme(value);
  await render();
}

/* ---------------- 冲突/确认 ---------------- */

function openConfirm({ title, text, okLabel, act, danger, id }) {
  state.pending = { act, id };
  openLayer('confirm', () => V.confirmView({ title, text, okLabel, act, danger }));
}

async function runPending() {
  const p = state.pending;
  state.pending = null;
  if (!p) return;
  if (p.act === 'do-wipe') {
    await DB.wipeAll();
    state.settings = await DB.getAllSettings();
    applyTheme(state.settings.theme);
    closeAllLayers();
    state.tab = 'today';
    await render();
    showToast('已清空');
  } else if (p.act === 'do-reset-deck') {
    await DB.resetProgress(p.id);
    S.clearSession(p.id);
    closeAllLayers();
    await render();
    showToast('学习进度已清空');
  } else if (p.act === 'do-delete-deck') {
    await DB.deleteDeck(p.id);
    closeAllLayers();
    await render();
    showToast('词库已删除');
  }
}

/* ---------------- 备份 ---------------- */

async function doExport() {
  try {
    const data = await DB.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `words-backup-${S.dateKey()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    showToast('备份已导出');
  } catch (e) {
    showToast('导出失败');
  }
}

function pickBackup() {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.json,application/json';
  inp.style.display = 'none';
  document.body.appendChild(inp);
  inp.onchange = async () => {
    const f = inp.files?.[0];
    try { inp.remove(); } catch (_) {}
    if (!f) return;
    setBusy('正在恢复…');
    try {
      const data = JSON.parse(await f.text());
      await DB.importAll(data);
      state.settings = await DB.getAllSettings();
      applyTheme(state.settings.theme);
      setBusy('', false);
      await render();
      showToast('恢复完成');
    } catch (e) {
      setBusy('', false);
      showToast(e?.message || '恢复失败');
    }
  };
  inp.click();
}

/* ---------------- 手势 ---------------- */

let touchStart = null;

function bindGestures() {
  const layer = $('#layer');
  layer.addEventListener('touchstart', (e) => {
    const card = e.target.closest('#study-card');
    if (!card || !state.revealed) return;
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, el: card };
  }, { passive: true });

  layer.addEventListener('touchmove', (e) => {
    if (!touchStart) return;
    const dx = e.touches[0].clientX - touchStart.x;
    const dy = e.touches[0].clientY - touchStart.y;
    if (Math.abs(dy) > Math.abs(dx)) return;
    touchStart.el.style.transform = `translateX(${dx}px) rotate(${dx / 40}deg)`;
    touchStart.el.style.opacity = String(Math.max(0.4, 1 - Math.abs(dx) / 600));
  }, { passive: true });

  layer.addEventListener('touchend', (e) => {
    if (!touchStart) return;
    const dx = (e.changedTouches[0].clientX - touchStart.x);
    const el = touchStart.el;
    touchStart = null;
    if (dx > 90) {
      el.style.transform = '';
      answer('know');
    } else if (dx < -90) {
      el.style.transform = '';
      answer('unknown');
    } else {
      el.style.transform = '';
      el.style.opacity = '';
    }
  });
}

/* ---------------- 事件 ---------------- */

async function onClick(e) {
  const btn = e.target.closest('[data-act]');
  const layerEl = $('#layer');

  // 卡片点击 → 揭示
  if (layerEl.contains(e.target) && !btn) {
    const card = e.target.closest('#study-card');
    if (card) { revealCard(); return; }
  }
  if (!btn) return;
  const act = btn.dataset.act;

  switch (act) {
    case 'start':
      await startStudy();
      break;
    case 'more':
      await addMore();
      break;
    case 'import':
      openImport();
      break;
    case 'open-deck':
      await openDeckDetail(Number(btn.dataset.id));
      break;
    case 'close-layer':
      closeLayer();
      break;
    case 'study-close':
      closeAllLayers();
      await render();
      break;
    case 'know':
      await answer('know');
      break;
    case 'unknown':
      await answer('unknown');
      break;
    case 'speak':
      if (state.card) say(state.card.spelling);
      break;
    case 'star': {
      if (!state.card) break;
      const w = { ...state.card, is_favorite: state.card.is_favorite ? 0 : 1 };
      await DB.updateWord(w);
      state.card = w;
      paintCard();
      if (state.revealed) {
        const cardEl = $('#study-card');
        const ans = cardEl?.querySelector('.answer');
        if (ans) ans.hidden = false;
      }
      break;
    }
    case 'checkin-page':
      await openCheckinPage(false);
      break;
    case 'deck-filter': {
      if (!state.deckDetail) break;
      state.deckDetail.filter = btn.dataset.k;
      const words = await DB.listWords(state.deckDetail.id, {
        status: state.deckDetail.filter,
        search: state.deckDetail.search,
      });
      state.deckDetailWords = words;
      const box = $('#deck-words');
      if (box) box.innerHTML = V.wordRowsHTML(words);
      btn.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === btn));
      break;
    }
    case 'deck-menu': {
      const deck = await DB.getDeck(Number(btn.dataset.id));
      openLayer('deck-menu', () => V.deckMenuView({ deck }));
      break;
    }
    case 'set-active': {
      await DB.setActiveDeck(Number(btn.dataset.id));
      showToast('已切换当前词库');
      closeAllLayers();
      await render();
      break;
    }
    case 'reset-deck':
      openConfirm({
        title: '清空学习进度',
        text: '所有单词会变回「还没学」，词库本身保留。',
        okLabel: '清空',
        act: 'do-reset-deck',
        id: Number(btn.dataset.id),
        danger: true,
      });
      break;
    case 'delete-deck':
      openConfirm({
        title: '删除词库',
        text: '单词和复习记录都会一起删掉，不能恢复。',
        okLabel: '删除',
        act: 'do-delete-deck',
        id: Number(btn.dataset.id),
        danger: true,
      });
      break;
    case 'edit-word': {
      const w = await DB.getWord(Number(btn.dataset.id));
      if (!w) break;
      openLayer('edit-word', () => `
        <div class="layer-head">
          <div class="side"><button class="icon-btn" data-act="close-layer">‹</button></div>
          <div class="title">修改单词</div><div class="side"></div>
        </div>
        <div class="layer-body">
          <div class="edit-grid">
            <div><label>英文</label><input id="ew-word" value="${V.esc(w.spelling)}"></div>
            <div><label>音标</label><input id="ew-phon" value="${V.esc(w.phonetic_us || w.phonetic_uk || '')}"></div>
            <div><label>中文</label><input id="ew-cn" value="${V.esc((w.meaning_cn || '').replace(/\\n/g, '；'))}"></div>
          </div>
          <p class="sub" style="margin-top:16px">状态：${w.status === 'new' ? '还没学' : w.status === 'mastered' ? '已掌握' : '学习中'} · 阶段 ${w.stage}/8</p>
        </div>
        <div class="layer-foot">
          <button class="btn btn-danger" data-act="del-word" data-id="${w.id}" style="flex:0 0 100px">删除</button>
          <button class="btn btn-primary" data-act="save-word" data-id="${w.id}" style="flex:1">保存</button>
        </div>`);
      break;
    }
    case 'save-word': {
      const w = await DB.getWord(Number(btn.dataset.id));
      if (!w) break;
      w.spelling = $('#ew-word')?.value.trim() || w.spelling;
      w.spelling_lc = w.spelling.toLowerCase();
      w.phonetic_us = $('#ew-phon')?.value.trim() || '';
      w.phonetic_uk = w.phonetic_us;
      w.meaning_cn = ($('#ew-cn')?.value.trim() || '').replace(/；/g, '\n');
      await DB.updateWord(w);
      showToast('已保存');
      closeLayer();
      await reloadDeckDetail();
      break;
    }
    case 'del-word': {
      await DB.deleteWord(Number(btn.dataset.id));
      showToast('已删除');
      closeLayer();
      await reloadDeckDetail();
      break;
    }
    case 'edit-entry':
      openEditEntry(Number(btn.dataset.i));
      break;
    case 'del-entry': {
      e.stopPropagation();
      const i = Number(btn.dataset.i);
      state.importEntries.splice(i, 1);
      refreshReview();
      break;
    }
    case 'save-entry':
      saveEditEntry(Number(btn.dataset.i));
      break;
    case 'confirm-import':
      await confirmImport();
      break;
    case 'set':
      await setSetting(btn.dataset.k, isNaN(Number(btn.dataset.v)) ? btn.dataset.v : Number(btn.dataset.v));
      break;
    case 'export':
      await doExport();
      break;
    case 'import-backup':
      pickBackup();
      break;
    case 'wipe':
      openConfirm({
        title: '清空全部数据',
        text: '词库、进度、打卡记录全部删除，不能恢复。',
        okLabel: '清空',
        act: 'do-wipe',
        danger: true,
      });
      break;
    case 'do-wipe':
    case 'do-reset-deck':
    case 'do-delete-deck':
      await runPending();
      break;
    default:
      break;
  }
}

function bindEvents() {
  document.querySelectorAll('.tab').forEach((b) => {
    b.addEventListener('click', () => switchTab(b.dataset.tab));
  });

  document.addEventListener('click', (e) => {
    onClick(e).catch((err) => {
      console.error(err);
      showToast(err?.message || '出了点问题');
    });
  });

  document.addEventListener('input', async (e) => {
    if (e.target.id !== 'deck-search' || !state.deckDetail) return;
    const v = e.target.value;
    state.deckDetail.search = v;
    const list = await DB.listWords(state.deckDetail.id, {
      status: state.deckDetail.filter,
      search: v,
    });
    state.deckDetailWords = list;
    const box = $('#deck-words');
    if (box) box.innerHTML = V.wordRowsHTML(list);
  });

  document.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.matches?.('[data-act="range-new"]')) {
      const v = Number(t.value);
      await DB.setSetting('daily_new_goal', v);
      state.settings.daily_new_goal = v;
      const row = t.previousElementSibling;
      if (row) row.querySelector('.v').textContent = `${v} 个`;
    } else if (t.matches?.('[data-act="range-review"]')) {
      const v = Number(t.value);
      await DB.setSetting('daily_review_cap', v);
      state.settings.daily_review_cap = v;
      const row = t.previousElementSibling;
      if (row) row.querySelector('.v').textContent = `${v} 个`;
    } else if (t.matches?.('[data-act="remind-time"]')) {
      await DB.setSetting('remind_time', t.value);
      state.settings.remind_time = t.value;
      showToast('提醒时间已保存');
    }
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (state.settings?.theme === 'system') applyTheme('system');
  });

  bindGestures();
}

/* ---------------- PWA ---------------- */

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

/* ---------------- 启动 ---------------- */

async function boot() {
  state.settings = await DB.getAllSettings();
  applyTheme(state.settings.theme);
  bindEvents();
  await render();

  // 每天第一次打开时，若昨天有未完成的学习，直接给出提示就好；不打扰
  window.addEventListener('online', () => {});
}

boot().catch((e) => {
  console.error(e);
  document.body.innerHTML = `<div style="padding:40px;font-family:sans-serif">
    <h3>启动失败</h3><pre style="white-space:pre-wrap;color:#888">${V.esc(e?.message || e)}</pre>
    <p style="color:#888">请用 Chrome / Edge / Safari 打开，或把页面放到 http(s) 地址下。</p>
  </div>`;
});
