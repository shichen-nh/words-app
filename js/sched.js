/* ================= words · 调度层（艾宾浩斯遗忘曲线） ================= */

import * as DB from './db.js';

/** 阶段间隔（天）。索引 = stage */
export const INTERVALS = [0, 1, 2, 4, 7, 15, 30, 60, 120];
export const MAX_STAGE = INTERVALS.length - 1;
export const RELEARN_DELAY_MS = 5 * 60 * 1000; // 答错后库里的「下次到期」，当天由内存队列先兜住
export const MAX_RELEARN_PER_DAY = 2;          // 同一个词一天最多重排 2 次（即最多出现 3 次）

/* ---------- 时间工具 ---------- */
export function startOfDay(ts = Date.now()) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
export function endOfDay(ts = Date.now()) {
  const d = new Date(ts);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}
export function addDays(ts, n) {
  const d = new Date(ts);
  d.setDate(d.getDate() + n);
  return d.getTime();
}
export function dateKey(ts = Date.now()) {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
export function prettyDate(ts = Date.now()) {
  const d = new Date(ts);
  const w = '日一二三四五六'[d.getDay()];
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 · 周${w}`;
}

/* ---------- 核心：一次作答的结算 ---------- */

/**
 * @param word   当前单词（不会被直接改动）
 * @param rating 'know' | 'unknown'
 * @returns {{word: object, log: object, requeue: boolean}}
 */
export function applyAnswer(word, rating, now = Date.now()) {
  const w = { ...word };
  const prevStage = w.stage || 0;
  const wasNew = w.status === 'new';
  const today = dateKey(now);
  let requeue = false;

  if (rating === 'know') {
    w.status = 'learning';
    w.last_review_at = now;
    w.correct_streak = (w.correct_streak || 0) + 1;
    w.stage = wasNew ? 1 : Math.min(prevStage + 1, MAX_STAGE);
    w.next_review_at = addDays(startOfDay(now), INTERVALS[w.stage]);
    // 走到最后一档、并且连续答对 3 次 → 已掌握，退出复习队列
    if (w.stage >= MAX_STAGE && w.correct_streak >= 3) {
      w.status = 'mastered';
      w.next_review_at = null;
    }
  } else {
    w.status = 'learning';
    w.last_review_at = now;
    w.correct_streak = 0;
    w.wrong_count = (w.wrong_count || 0) + 1;
    w.stage = Math.max(1, Math.floor((wasNew ? 0 : prevStage) / 2));

    if (w.relearn_date !== today) {
      w.relearn_date = today;
      w.relearn_count = 0;
    }
    w.relearn_count = (w.relearn_count || 0) + 1;

    if (w.relearn_count > MAX_RELEARN_PER_DAY) {
      // 今天已经重排 2 次还没记住 → 收工，明天见
      w.stage = 1;
      w.next_review_at = addDays(startOfDay(now), 1);
    } else {
      w.next_review_at = now + RELEARN_DELAY_MS;
      requeue = true; // 当天队列尾部再出现一次
    }
  }

  const log = {
    word_id: w.id,
    deck_id: w.deck_id,
    rating,
    prev_stage: prevStage,
    next_stage: w.stage,
    is_new: wasNew ? 1 : 0,
    at: now,
  };

  return { word: w, log, requeue };
}

/** 记忆持久度（只用于展示） */
export function retention(stage) {
  const p = Math.round((stage / MAX_STAGE) * 100);
  return Math.max(5, Math.min(100, p));
}

/* ---------- 每日会话 ---------- */

const SKEY = (date, deckId) => `words.session.${date}.${deckId}`;

export function loadSession(deckId) {
  try {
    const raw = localStorage.getItem(SKEY(dateKey(), deckId));
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!Array.isArray(s.queue)) return null;
    return s;
  } catch {
    return null;
  }
}

export function saveSession(deckId, session) {
  try {
    localStorage.setItem(SKEY(dateKey(), deckId), JSON.stringify(session));
  } catch (_) {}
}

export function clearSession(deckId) {
  try {
    localStorage.removeItem(SKEY(dateKey(), deckId));
  } catch (_) {}
}

/**
 * 构建今天的队列：先到期复习（逾期最久优先），再随机新词
 * 新词只从 status='new' 里抽 —— 学过的绝不混进来
 */
export async function buildSession(deckId, settings, now = Date.now()) {
  const goal = Math.max(1, Math.min(500, Number(settings.daily_new_goal) || 20));
  const cap = Math.max(1, Math.min(2000, Number(settings.daily_review_cap) || 200));

  const counts = await DB.countsByStatus(deckId);
  const newTarget = Math.min(goal, counts.new);

  const due = await DB.getDueWords(deckId, now, cap);
  const newWords = await DB.pickNewWords(deckId, newTarget);

  const queue = [...due.map((w) => w.id), ...newWords.map((w) => w.id)];
  const session = {
    date: dateKey(now),
    deckId,
    createdAt: now,
    queue,
    targets: { review: due.length, new: newWords.length },
    done: { review: 0, new: 0 },
    seen: [],
    relearn: {},   // 当天需要巩固的词：{ wordId: { done } }，连续答对 3 次才移出
    shows: {},     // 每个词今天出现过几次（防止死循环）
    seconds: 0,
    startedAt: now,
    carriedOver: Math.max(0, (await DB.getDueWords(deckId, now, 99999)).length - due.length),
  };
  saveSession(deckId, session);
  return session;
}

/** 取当前该显示的那张卡（会顺带把队列里已被删掉的词清掉） */
export async function currentCard(deckId, session) {
  while (session.queue.length) {
    const id = session.queue[0];
    const w = await DB.getWord(id);
    if (w) return { word: w, id };
    session.queue.shift();
  }
  return null;
}

/** 队列空时再捞一次：库里还有已经到期、但没进今天队列的（比如答错重排超时） */
export async function refill(deckId, session, now = Date.now()) {
  const known = new Set(session.seen);
  const due = await DB.getDueWords(deckId, now, 9999);
  const extra = due.filter((w) => !known.has(w.id) && !session.queue.includes(w.id)).map((w) => w.id);
  if (extra.length) {
    session.queue.push(...extra);
    saveSession(deckId, session);
  }
  return extra.length;
}

/* ---------- 打卡 ---------- */

export function computeStreak(checkins, todayKey = dateKey()) {
  const set = new Set(checkins.map((c) => c.date));
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (!set.has(todayKey)) d.setDate(d.getDate() - 1); // 今天还没打，从昨天往前数
  let streak = 0;
  while (set.has(dateKey(d.getTime()))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

export function computeTotalDays(checkins) {
  return new Set(checkins.map((c) => c.date)).size;
}

/** 今天算不算完成：新词目标 + 到期复习都清完 */
export function sessionDone(session) {
  if (!session) return false;
  return (
    session.done.new >= session.targets.new &&
    session.done.review >= session.targets.review
  );
}

export function sessionTotal(session) {
  return session ? session.targets.new + session.targets.review : 0;
}

export function sessionFinishedCount(session) {
  return session ? session.done.new + session.done.review : 0;
}
