/* ================= words · 鼓励语 ================= */

const LIB = {
  first: [
    '第一天最难，你已经过了。',
    '开始了就不算晚。',
    '今天的这一页，明天还记得你。',
  ],
  early: [
    '开头这几天最容易断，你正在穿过去。',
    '不用一次记住，记住「回头再看」这件事就行。',
    '今天这几个词，明天它们还认得你。',
    '刚起步的时候别求快，求「明天还来」。',
    '一天一点，比一天全部然后消失强。',
    '这会儿背下的词，明天早上会有点眼熟——那就够了。',
  ],
  week: [
    '七天了。习惯的雏形大概就是这样。',
    '一周没有断，这件事本身比背了多少词值钱。',
    '你的单词表在变小，这是好兆头。',
    '一周之后，这件事开始有点不费力了。',
    '继续，节奏比强度重要。',
  ],
  mid: [
    '半个月了。现在不是你坚持，是它在长。',
    '回头看看，第一天的你肯定没想到能走到这儿。',
    '这些词已经不只是词了，是你在补的那块地基。',
    '稳定的可怕之处，是它慢慢不需要意志力。',
    '没什么特别的，就是把该做的做了。',
  ],
  long: [
    '一个月。这已经不是坚持了，是你在长东西。',
    '一个月后还在的人不多，你在里面。',
    '你大概已经发现了：真正难的不是词，是每天坐下来。',
    '继续，照旧就行。',
    '这些天的记录，比任何一句鼓励都硬。',
  ],
  broke: [
    '从头开始也没什么，反正路还在。',
    '断一次不算失败，断完不回来才算。',
    '昨天没来，今天来了，就还是同一条线。',
  ],
  anytime: [
    '做完今天，明天会轻一点。',
    '不着急，记住就行。',
    '今天也算数。',
    '单词不会跑，你来了就好。',
    '嗯，又一天。',
    '这件小事，正在变成你的一部分。',
  ],
};

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * @param {{streak:number, total:number, broke:boolean}} o
 */
export function pickEncouragement({ streak = 1, total = 0, broke = false } = {}) {
  if (broke && streak <= 1) return pick(LIB.broke);
  if (total === 0 && streak <= 1) return pick(LIB.first);
  if (streak >= 30) return pick(LIB.long);
  if (streak >= 14) return pick(LIB.mid);
  if (streak >= 7) return pick(LIB.week);
  if (streak >= 3) return pick(LIB.early);
  if (streak >= 1) return pick(LIB.anytime);
  return pick(LIB.early);
}

export const ALL = LIB;
