/* ================= words · 视图（纯 HTML 生成） ================= */

import { termOf } from './solar-terms.js';

export const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

function fmtDate(ts) {
  const d = new Date(ts);
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 · 周${WEEK[d.getDay()]}`;
}

function phonLine(word, accent) {
  const uk = (word.phonetic_uk || '').trim();
  const us = (word.phonetic_us || '').trim();
  if (!uk && !us) return '';
  const one = accent === 'uk' ? (uk || us) : (us || uk);
  const label = accent === 'uk' ? '英' : '美';
  return `<span>${label} /${esc(one)}/</span>`;
}

function posSegments(word) {
  try {
    const arr = JSON.parse(word.pos_json || '[]');
    if (Array.isArray(arr) && arr.length) return arr;
  } catch (_) {}
  return [];
}

/* ---------------- 今日 ---------------- */

export function todayView({ deck, session, counts, dueCount, settings, streak, checkedToday, dateNow }) {
  if (!deck) {
    return `
      <div class="h1">今天</div>
      <div class="sub">${fmtDate(dateNow)}</div>
      <div class="empty">
        <span class="big">▤</span>
        还没有词库。<br>把你的 Word / PDF 单词表导进来，它就能背了。
      </div>
      <div class="start-wrap" style="margin-top:8px">
        <button class="btn btn-primary btn-block" data-act="import">导入我的单词表</button>
      </div>
      <p class="sub" style="text-align:center;margin-top:18px;line-height:1.9">
        支持 .docx / .pdf / .txt<br>自动识别 英文 · 音标 · 词性 · 中文
      </p>`;
  }

  const total = session ? session.targets.new + session.targets.review : 0;
  const done = session ? session.done.new + session.done.review : 0;
  const finished = session && total > 0 && done >= total;
  const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0;

  const newTarget = session ? session.targets.new : Math.min(Number(settings.daily_new_goal) || 20, counts.new);
  const revTarget = session ? session.targets.review : Math.min(dueCount, Number(settings.daily_review_cap) || 200);
  const newDone = session ? session.done.new : 0;
  const revDone = session ? session.done.review : 0;

  const nothingToday = !finished && newTarget === 0 && revTarget === 0;

  let action = '';
  if (finished || checkedToday) {
    action = `<div class="done-badge">✓ 今天完成了${checkedToday ? ' · 已打卡' : ''}</div>
      <div style="display:flex;gap:10px;margin-top:8px">
        <button class="btn btn-line" data-act="checkin-page" style="flex:1">看看打卡</button>
        <button class="btn btn-ghost" data-act="more" style="flex:1">再学 10 个</button>
      </div>`;
  } else if (nothingToday) {
    action = `<div class="done-badge" style="color:var(--muted)">今天没有到期的词，也没有新词了</div>`;
  } else {
    action = `<button class="btn btn-primary btn-block" data-act="start">${done > 0 ? '继续背诵' : '开始背诵'}</button>`;
  }

  return `
    <div class="today-head">
      <div>
        <div class="h1">今天</div>
        <div class="sub">${fmtDate(dateNow)} · ${esc(deck.name)}</div>
      </div>
      <div class="streak-badge">🔥 连续 ${streak} 天</div>
    </div>

    <div class="ring-wrap">
      <div class="ring" style="--p:${pct}">
        <div class="ring-inner">
          <div class="ring-num">${done}<small>/${total}</small></div>
          <div class="ring-cap">今日已背</div>
        </div>
      </div>
    </div>

    <div class="today-nums">
      <div class="n"><b>${newDone}/${newTarget}</b><span>新词</span></div>
      <div class="n"><b>${revDone}/${revTarget}</b><span>复习</span></div>
      <div class="n"><b>${counts.total}</b><span>词库总数</span></div>
    </div>

    <div class="start-wrap">${action}</div>

    <div class="section" style="margin-top:26px">
      <div class="section-title"><span>这个词库</span><span>已掌握 ${counts.mastered} 个</span></div>
      <div class="row"><span class="k">还没学</span><span class="v">${counts.new} 个</span></div>
      <div class="row"><span class="k">学习中</span><span class="v">${counts.learning} 个</span></div>
      <div class="row"><span class="k">今日复习量</span><span class="v">${dueCount} 个到期</span></div>
    </div>`;
}

/* ---------------- 词库 ---------------- */

export function decksView({ decks, countsMap, activeId }) {
  const totalWords = decks.reduce((a, d) => a + (countsMap[d.id]?.total || 0), 0);
  const items = decks
    .map((d) => {
      const c = countsMap[d.id] || { total: 0, learned: 0, new: 0, mastered: 0 };
      const learned = c.total - c.new;
      const pct = c.total ? Math.round((learned / c.total) * 100) : 0;
      return `
      <div class="deck-item" data-act="open-deck" data-id="${d.id}">
        <div class="deck-icon">${esc((d.name || 'W').trim().slice(0, 1).toUpperCase())}</div>
        <div class="deck-main">
          <div class="deck-name">${esc(d.name)}${d.id === activeId ? ' <span class="chip" style="font-size:10px;padding:2px 7px;vertical-align:middle">当前</span>' : ''}</div>
          <div class="deck-meta">${c.total} 个词 · 已学 ${learned} · 掌握 ${c.mastered}</div>
          <div class="bar"><i style="width:${pct}%"></i></div>
        </div>
        <div class="deck-right">${pct}%</div>
      </div>`;
    })
    .join('');

  return `
    <div class="today-head">
      <div>
        <div class="h1">词库</div>
        <div class="sub">${decks.length} 个词库 · 共 ${totalWords} 个单词</div>
      </div>
      <button class="icon-btn" data-act="import" style="font-size:24px">＋</button>
    </div>
    <div style="margin-top:18px">
      ${decks.length ? items : `<div class="empty"><span class="big">▤</span>还没有词库</div>`}
    </div>
    <div style="margin-top:16px">
      <button class="btn btn-line btn-block" data-act="import">导入文档</button>
    </div>`;
}

export function wordRowsHTML(words) {
  const rows = words
    .slice(0, 400)
    .map(
      (w) => `
    <div class="word-row" data-act="edit-word" data-id="${w.id}">
      <span class="dot ${w.status}"></span>
      <span class="w">${esc(w.spelling)}</span>
      <span class="p">${esc(w.phonetic_us || w.phonetic_uk || '')}</span>
      <span class="m">${esc((w.meaning_cn || '').replace(/\n/g, ' '))}</span>
    </div>`
    )
    .join('');
  return rows || `<div class="empty">这个筛选下没有词</div>`;
}

export function deckDetailView({ deck, words, filter, search }) {
  const low = words.filter((w) => w.status === 'new').length;

  const filters = [
    ['all', '全部'],
    ['new', '没学'],
    ['learning', '学习中'],
    ['mastered', '已掌握'],
    ['favorite', '收藏'],
  ]
    .map(
      ([k, label]) =>
        `<button class="chip ${filter === k ? 'active' : ''}" data-act="deck-filter" data-k="${k}">${label}</button>`
    )
    .join('');

  return `
    <div class="layer-head">
      <div class="side"><button class="icon-btn" data-act="close-layer">‹</button></div>
      <div class="title">${esc(deck.name)}</div>
      <div class="side" style="text-align:right"><button class="icon-btn" data-act="deck-menu" data-id="${deck.id}">⋯</button></div>
    </div>
    <div class="layer-body">
      <div class="sub" style="margin-bottom:12px">共 ${deck.total} 个词，其中 ${low} 个还没学</div>
      <input class="search" id="deck-search" placeholder="搜索单词或中文" value="${esc(search)}">
      <div class="filters">${filters}</div>
      <div id="deck-words">${wordRowsHTML(words)}</div>
      ${words.length > 400 ? `<p class="sub" style="text-align:center;margin-top:14px">只显示前 400 个，用搜索找具体的</p>` : ''}
    </div>`;
}

/* ---------------- 统计 ---------------- */

export function statsView({ countsAll, checkins, streak, dateNow, logsToday, forecast }) {
  const totalDays = new Set(checkins.map((c) => c.date)).size;
  const map = new Map(checkins.map((c) => [c.date, c]));
  const heatCells = [];
  for (let i = 119; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const c = map.get(key);
    const n = c ? (c.new_done || 0) + (c.review_done || 0) : 0;
    let alpha = 0;
    if (n > 0) alpha = n >= 60 ? 1 : n >= 35 ? 0.75 : n >= 15 ? 0.5 : 0.3;
    heatCells.push(
      `<i title="${key} · ${n} 个词" style="${n ? `background:var(--fg);opacity:${alpha}` : ''}"></i>`
    );
  }

  const maxF = Math.max(1, ...forecast.map((f) => f.n));
  const bars = forecast
    .map(
      (f) =>
        `<div class="b"><i style="height:${Math.max(2, (f.n / maxF) * 84)}px"></i><span>${f.label}</span></div>`
    )
    .join('');

  return `
    <div class="h1">统计</div>
    <div class="sub">${fmtDate(dateNow)}</div>

    <div class="stat-grid" style="margin-top:18px">
      <div class="stat-box"><b>${streak}</b><span>连续打卡（天）</span></div>
      <div class="stat-box"><b>${totalDays}</b><span>累计打卡（天）</span></div>
      <div class="stat-box"><b>${countsAll.total - countsAll.new}</b><span>学过的词（库）</span></div>
      <div class="stat-box"><b>${countsAll.mastered}</b><span>已掌握</span></div>
    </div>

    <div class="section">
      <div class="section-title"><span>今天</span><span>${logsToday.new} 新学 · ${logsToday.review} 复习</span></div>
      <div class="sub">正确率 ${logsToday.total ? Math.round((logsToday.know / logsToday.total) * 100) : 0}%</div>
    </div>

    <div class="section">
      <div class="section-title"><span>最近 120 天</span><span>颜色越深，那天背得越多</span></div>
      <div class="heat">${heatCells.join('')}</div>
    </div>

    <div class="section">
      <div class="section-title"><span>未来 7 天要复习</span><span>${forecast.reduce((a, f) => a + f.n, 0)} 个</span></div>
      <div class="bars">${bars}</div>
    </div>`;
}

/* ---------------- 我的 / 设置 ---------------- */

export function meView({ settings, countsAll, version, cacheVersion }) {
  const seg = (name, cur, opts) =>
    `<div class="seg">${opts
      .map(
        ([v, label]) =>
          `<button class="${String(cur) === String(v) ? 'on' : ''}" data-act="set" data-k="${name}" data-v="${v}">${label}</button>`
      )
      .join('')}</div>`;

  return `
    <div class="h1">我的</div>
    <div class="sub">words · v${version} · 缓存 ${esc(cacheVersion || '?')}</div>
    <div style="display:flex;gap:8px;margin-top:10px">
      <button class="btn btn-ghost" data-act="check-update" style="flex:1;padding:9px 0;font-size:13px">检查更新</button>
      <span class="sub" style="flex:1;font-size:11px;line-height:1.5;text-align:left">更新不会自动生效，点这里之后再关掉重开</span>
    </div>

    <div class="section" style="margin-top:18px">
      <div class="section-title"><span>每天背多少</span><span>来自未学的新词</span></div>
      <div class="row"><span class="k">每日新词</span><span class="v">${settings.daily_new_goal} 个</span></div>
      <input type="range" min="5" max="100" step="5" value="${settings.daily_new_goal}" data-act="range-new" style="width:100%;accent-color:var(--fg)">
      <div class="row"><span class="k">每日复习上限</span><span class="v">${settings.daily_review_cap} 个</span></div>
      <input type="range" min="20" max="500" step="20" value="${settings.daily_review_cap}" data-act="range-review" style="width:100%;accent-color:var(--fg)">
    </div>

    <div class="section">
      <div class="section-title"><span>发音</span></div>
      <div class="row" style="display:block">
        <div class="k" style="margin-bottom:8px">口音</div>
        ${seg('accent', settings.accent, [['us', '美音'], ['uk', '英音']])}
      </div>
      <div class="row">
        <span class="k">出现单词时自动读</span>
        <span class="v">${seg('auto_play', settings.auto_play, [[0, '关'], [1, '开']])}</span>
      </div>
    </div>

    <div class="section">
      <div class="section-title"><span>怎么背</span><span>三种方式共用同一条遗忘曲线</span></div>
      <div class="row" style="display:block">
        <div class="k" style="margin-bottom:8px">作答方式</div>
        ${seg('answer_mode', settings.answer_mode, [
          ['recognize', '认词'],
          ['spelling', '默写'],
          ['dictation', '听写'],
          ['mix', '混合'],
        ])}
      </div>
      <p class="sub" style="margin:8px 0 0">默写和听写会检查拼写，拼对才算「会了」。混合模式每张卡随机。</p>
    </div>

    <div class="section">
      <div class="section-title"><span>外观</span></div>
      <div class="row" style="display:block">
        <div class="k" style="margin-bottom:8px">主题</div>
        ${seg('theme', settings.theme, [['system', '跟随系统'], ['light', '浅色'], ['dark', '深色']])}
      </div>
    </div>

    <div class="section">
      <div class="section-title"><span>打卡提醒</span></div>
      <div class="row">
        <span class="k">每天提醒</span>
        <input type="time" value="${settings.remind_time}" data-act="remind-time">
      </div>
      <p class="sub" style="margin:8px 0 0">需要这个 App 在前台或已添加到主屏幕，提醒才会在打开时生效。</p>
    </div>

    <div class="section">
      <div class="section-title"><span>数据</span></div>
      <div class="row"><span class="k">已学词数</span><span class="v">${countsAll.total - countsAll.new} / ${countsAll.total}</span></div>
      <div class="row" style="border:0;padding-bottom:4px">
        <button class="btn btn-ghost" data-act="export">导出备份</button>
        <button class="btn btn-ghost" data-act="import-backup">恢复备份</button>
      </div>
      <div class="row" style="border:0;padding-top:4px">
        <button class="btn btn-danger" data-act="wipe" style="width:100%">清空全部数据</button>
      </div>
    </div>

    <p class="sub" style="text-align:center;margin-top:22px;line-height:1.9">
      words · 把你自己单词表变成会复习的 App<br>数据只存在这台设备上
    </p>`;
}

/* ---------------- 学习页 ---------------- */

export function studyShell() {
  return `
  <div class="study">
    <div class="study-top">
      <button class="icon-btn" data-act="study-close">✕</button>
      <div class="progress"><i id="study-progress" style="width:0%"></i></div>
      <span class="counter" id="study-counter">0 / 0</span>
    </div>
    <div class="card-stage">
      <div class="card" id="study-card"></div>
    </div>
    <div class="answer-zone" id="answer-zone">
      <div class="actions">
        <button class="btn btn-know" data-act="know">会了</button>
        <button class="btn btn-unknown" data-act="unknown">不认识</button>
      </div>
    </div>
  </div>`;
}

export function studyCardHTML(word, { accent, revealed, idx, total }) {
  const long = (word.spelling || '').length > 13;
  const phon = phonLine(word, accent);
  const segs = posSegments(word);
  const meaning = (word.meaning_cn || '').trim();
  const meaningHTML = segs.length
    ? segs
        .map(
          (s) =>
            `<div class="pos-row">${s.pos ? `<span class="pos">${esc(s.pos)}</span>` : ''}<span class="meaning">${esc(s.cn)}</span></div>`
        )
        .join('')
    : `<div class="pos-row"><span class="meaning">${esc(meaning.replace(/\n/g, '；'))}</span></div>`;

  return `
    <button class="star ${word.is_favorite ? 'on' : ''}" data-act="star">${word.is_favorite ? '★' : '☆'}</button>
    <div class="word ${long ? 'long' : ''}">${esc(word.spelling)}</div>
    <div class="phon">
      ${phon}
      <button data-act="speak" aria-label="发音">🔊</button>
    </div>
    <div class="answer" ${revealed ? '' : 'hidden'}>
      ${meaningHTML}
      ${word.example ? `<div class="example">${esc(word.example)}</div>` : ''}
      <div class="meta"><span>第 ${idx + 1} / ${total} 张</span><span>记忆持久度 ${Math.round((word.stage / 8) * 100)}%</span></div>
    </div>
    <div class="hint" ${revealed ? 'hidden' : ''}>点击卡片看释义</div>`;
}

/* ---------------- 默写 / 听写卡片 ---------------- */

export function spellCardHTML(word, opts) {
  const {
    mode = 'spelling',
    hintPositions = [],
    hintCount = 0,
    hintMax = 2,
    feedback = '',
    extra = '',
  } = opts || {};
  const spelling = word.spelling || '';
  const letters = spelling.split('');
  const len = letters.filter((c) => /[A-Za-z]/.test(c)).length;
  const segs = posSegments(word);
  const meaningHTML = segs.length
    ? segs
        .map(
          (s) =>
            `<div class="pos-row">${s.pos ? `<span class="pos">${esc(s.pos)}</span>` : ''}<span class="meaning">${esc(s.cn)}</span></div>`
        )
        .join('')
    : `<div class="pos-row"><span class="meaning">${esc((word.meaning_cn || '').replace(/\n/g, '；'))}</span></div>`;

  const slots = letters
    .map((ch, i) => {
      if (/[A-Za-z]/.test(ch)) {
        const shown = hintPositions.includes(i);
        return `<span class="slot${shown ? ' on' : ''}">${shown ? esc(ch) : '·'}</span>`;
      }
      if (ch === ' ') return `<span class="slot sep"></span>`;
      return `<span class="slot dash">${esc(ch)}</span>`;
    })
    .join('');

  return `
    <button class="star ${word.is_favorite ? 'on' : ''}" data-act="star">${word.is_favorite ? '★' : '☆'}</button>
    ${mode === 'dictation' ? `<button class="big-speak" data-act="speak" aria-label="发音">🔊</button>` : ''}
    <div class="spell-meaning">${meaningHTML}</div>
    <div class="spell-meta">${mode === 'dictation' ? '听发音，拼出这个单词' : '看中文，拼出这个单词'} · <b>${len}</b> 个字母</div>
    <div class="slots">${slots}</div>
    <div class="spell-box">
      <input id="spell-input" class="spell-input" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="拼写…">
      <button class="btn btn-know spell-go" data-act="spell-submit">确定</button>
    </div>
    <div class="spell-tools">
      <button class="chip" data-act="spell-hint" ${hintCount >= hintMax ? 'disabled' : ''}>提示字母（${hintCount}/${hintMax}）</button>
      <button class="chip" data-act="spell-skip">不会，看答案</button>
    </div>
    <div class="spell-feedback">${feedback}</div>
  `;
}

/* ---------------- 学期总结：派生词 / 同义词 ---------------- */

export function summaryView({ learnedCount, items }) {
  const toAdd = items.map((it, i) => ({ ...it, i })).filter((it) => !it.inDeck);
  const have = items.map((it, i) => ({ ...it, i })).filter((it) => it.inDeck);
  const syns = toAdd.filter((it) => it.kind === 'syn');
  const forms = toAdd.filter((it) => it.kind === 'form');

  const row = (it) => `
    <label class="sugg-row">
      <input type="checkbox" class="sugg-check" data-i="${it.i}">
      <span class="sugg-form">${esc(it.form)}</span>
      <span class="sugg-tag">${esc(it.label)}</span>
      <span class="sugg-from">← ${esc(it.base)}</span>
    </label>`;

  const group = (title, arr, hint) =>
    arr.length
      ? `<div class="section" style="padding:12px 14px">
        <div class="section-title"><span>${esc(title)}</span><span>${arr.length} 个</span></div>
        ${hint ? `<p class="sub" style="margin:0 0 6px">${esc(hint)}</p>` : ''}
        ${arr.map(row).join('')}
      </div>`
      : '';

  const haveHTML = have.length
    ? `<div class="section" style="padding:12px 14px">
      <div class="section-title"><span>你词库里已经有的</span><span>${have.length} 个</span></div>
      <p class="sub" style="margin:0 0 6px">这些不用再加，只是让你知道它们之间的关系。</p>
      ${have
        .slice(0, 40)
        .map(
          (it) =>
            `<div class="sugg-row plain"><span class="sugg-form">${esc(it.form)}</span><span class="sugg-tag">${esc(it.label)}</span><span class="sugg-from">← ${esc(it.base)}</span></div>`
        )
        .join('')}
    </div>`
    : '';

  return `
    <div class="layer-head">
      <div class="side"><button class="icon-btn" data-act="close-layer">✕</button></div>
      <div class="title">这一轮能扩展什么</div>
      <div class="side"></div>
    </div>
    <div class="layer-body">
      <p class="sub">本轮学了 <b>${learnedCount}</b> 个词，推出来 <b>${items.length}</b> 个相关的。勾选的会作为新词加进当前词库，明天进新词池。</p>
      ${group('同义词', syns, '来自你导入文档里的「同义词」标注，是真词。')}
      ${group('派生词', forms, '按构词规则推的，不一定都是真词，自己看一眼再勾。')}
      ${haveHTML}
    </div>
    <div class="layer-foot">
      <button class="btn btn-ghost" data-act="close-layer" style="flex:0 0 90px">不用了</button>
      <button class="btn btn-primary" data-act="add-suggestions" style="flex:1">加入勾选的词</button>
    </div>`;
}

/* ---------------- 打卡 ---------------- */

export function checkinView({ streak, total, words, text, checkins, justChecked, canExpand }) {
  const map = new Set(checkins.map((c) => c.date));
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const first = new Date(y, m, 1);
  const days = new Date(y, m + 1, 0).getDate();
  const pad = first.getDay();
  const cells = [];
  for (let i = 0; i < pad; i++) cells.push('<div class="cal-d blank"></div>');
  for (let d = 1; d <= days; d++) {
    const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isToday = d === now.getDate();
    cells.push(
      `<div class="cal-d ${map.has(key) ? 'hit' : ''} ${isToday ? 'today' : ''}">${d}</div>`
    );
  }

  return `
    <div class="layer-head">
      <div class="side"><button class="icon-btn" data-act="close-layer">✕</button></div>
      <div class="title">打卡</div>
      <div class="side"></div>
    </div>
    <div class="layer-body" style="padding-top:36px">
      <div class="checkin-hero">
        <div class="checkin-mark">${justChecked ? '✓' : '☺'}</div>
        <div class="checkin-title">${justChecked ? '今日完成' : '今天还没打卡'}</div>
        <div class="checkin-say">${esc(text)}</div>
      </div>
      ${(() => {
        const term = termOf();
        if (!term) return '';
        return `<div class="term-card">
          <div class="term-top"><span class="term-name">${esc(term.name)}</span><span class="term-from">${esc(term.from)}</span></div>
          <div class="term-poem">${esc(term.poem)}</div>
          <div class="term-en">${esc(term.en)}</div>
        </div>`;
      })()}
      <div class="big-nums">
        <div class="box"><b>${streak}</b><span>连续天数</span></div>
        <div class="box"><b>${total}</b><span>累计天数</span></div>
        <div class="box"><b>${words}</b><span>今日词数</span></div>
      </div>
      <div class="section" style="margin-top:22px">
        <div class="section-title"><span>这个月</span><span>${y} 年 ${m + 1} 月</span></div>
        <div class="cal">
          ${['日', '一', '二', '三', '四', '五', '六'].map((w) => `<div class="cal-h">${w}</div>`).join('')}
          ${cells.join('')}
        </div>
      </div>
      ${canExpand ? `<button class="btn btn-ghost btn-block" data-act="open-summary" style="margin-top:18px">这一轮能扩展什么 →</button>
      <p class="sub" style="text-align:center;margin-top:8px">从刚背的词里找出同义词和派生词</p>` : ''}
    </div>`;
}

/* ---------------- 导入 ---------------- */

export function importView() {
  return `
    <div class="layer-head">
      <div class="side"><button class="icon-btn" data-act="close-layer">✕</button></div>
      <div class="title">导入单词表</div>
      <div class="side"></div>
    </div>
    <div class="layer-body">
      <div class="drop" id="drop-zone">
        <span class="big">⇪</span>
        <b>点这里选文件</b><br>
        或把文件拖进来<br>
        <span style="font-size:12px">.docx / .pdf / .txt</span>
      </div>
      <input type="file" id="file-input" accept=".docx,.pdf,.txt,.csv,.md" hidden>

      <div class="section" style="margin-top:20px">
        <div class="section-title"><span>什么样的格式认得出来</span></div>
        <p class="sub" style="line-height:2;margin:0">
          一行一个词条，比如：<br>
          <code>abandon /əˈbændən/ vt. 放弃；抛弃</code><br>
          <code>abandon  [əˈbændən]  v. 放弃</code><br>
          也支持 Word 表格：<b>单词 | 音标 | 词性 | 中文</b>
        </p>
      </div>

      <div class="section" style="margin-top:14px;background:var(--chip)">
        <p class="sub" style="margin:0;line-height:1.9">
          导入后会让<b>你确认一遍</b>再入库 —— 识别错的行会标黄，可以直接改。<br>
          扫描图片版 PDF 读不出文字，会明确提示你换 Word 版。
        </p>
      </div>
    </div>`;
}

export function reviewView({ deckName, entries, editing }) {
  const lowCount = entries.filter((e) => (e.confidence ?? 3) < 2).length;
  const rows = entries
    .slice(0, 500)
    .map(
      (e, i) => `
    <div class="preview-row ${(e.confidence ?? 3) < 2 ? 'low' : ''}" data-act="edit-entry" data-i="${i}">
      <span class="w">${esc(e.spelling)}</span>
      <span class="p">${esc(e.phonetic_uk || '')}</span>
      <span class="m">${esc((e.meaning_cn || '').replace(/\n/g, '；'))}</span>
      <button class="del" data-act="del-entry" data-i="${i}">×</button>
    </div>`
    )
    .join('');

  return `
    <div class="layer-head">
      <div class="side"><button class="icon-btn" data-act="close-layer">✕</button></div>
      <div class="title">确认一下</div>
      <div class="side"></div>
    </div>
    <div class="layer-body" style="padding-bottom:20px">
      <div class="sub" style="margin-bottom:6px">
        来自 <b>${esc(deckName)}</b> · 识别到 <b>${entries.length}</b> 条
        ${lowCount ? ` · <span style="color:var(--warn)">${lowCount} 条不太确定</span>` : ''}
      </div>
      <p class="sub" style="margin:0 0 12px;line-height:1.9">点任意一行可以改音标 / 中文，或者删掉它。</p>
      <div>${rows}</div>
      ${entries.length > 500 ? `<p class="sub" style="text-align:center">先显示前 500 条，剩下的会一起入库</p>` : ''}
    </div>
    <div class="layer-foot">
      <button class="btn btn-ghost" data-act="close-layer" style="flex:0 0 90px">取消</button>
      <button class="btn btn-primary" data-act="confirm-import" style="flex:1">导入这 ${entries.length} 个词</button>
    </div>`;
}

export function editEntryView({ entry, index }) {
  return `
    <div class="layer-head">
      <div class="side"><button class="icon-btn" data-act="close-layer">‹</button></div>
      <div class="title">修改词条</div>
      <div class="side"></div>
    </div>
    <div class="layer-body">
      <div class="edit-grid">
        <div><label>英文单词</label><input id="ei-word" value="${esc(entry.spelling)}"></div>
        <div><label>音标（不用写斜杠）</label><input id="ei-phon" value="${esc(entry.phonetic_uk || '')}"></div>
        <div><label>中文释义</label><input id="ei-cn" value="${esc((entry.meaning_cn || '').replace(/\n/g, '；'))}"></div>
        <div><label>例句（可选）</label><input id="ei-ex" value="${esc(entry.example || '')}"></div>
      </div>
    </div>
    <div class="layer-foot">
      <button class="btn btn-ghost" data-act="close-layer" style="flex:0 0 90px">取消</button>
      <button class="btn btn-primary" data-act="save-entry" data-i="${index}" style="flex:1">保存</button>
    </div>`;
}

/* ---------------- 通用弹层 ---------------- */

export function confirmView({ title, text, okLabel, act, danger }) {
  return `
    <div class="layer-head">
      <div class="side"></div>
      <div class="title">${esc(title)}</div>
      <div class="side"></div>
    </div>
    <div class="layer-body" style="display:flex;align-items:center;justify-content:center">
      <p style="text-align:center;color:var(--muted);line-height:2">${esc(text)}</p>
    </div>
    <div class="layer-foot">
      <button class="btn btn-ghost" data-act="close-layer" style="flex:1">取消</button>
      <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="${act}" style="flex:1">${esc(okLabel)}</button>
    </div>`;
}

export function deckMenuView({ deck }) {
  return `
    <div class="layer-head">
      <div class="side"><button class="icon-btn" data-act="close-layer">‹</button></div>
      <div class="title">${esc(deck.name)}</div>
      <div class="side"></div>
    </div>
    <div class="layer-body">
      <button class="btn btn-ghost btn-block" data-act="set-active" data-id="${deck.id}" style="margin-bottom:10px">设为当前词库</button>
      <button class="btn btn-ghost btn-block" data-act="reset-deck" data-id="${deck.id}" style="margin-bottom:10px">清空学习进度（保留单词）</button>
      <button class="btn btn-danger btn-block" data-act="delete-deck" data-id="${deck.id}">删除整个词库</button>
    </div>`;
}
