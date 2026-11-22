/* ================= words · 二十四节气 =================
 * 公历日期为近似值（每年相差 1–2 天，对打卡卡片足够）
 * 诗句只收能确认作者与出处的；拿不准的节气用农谚，标「农谚」
 */

export const SOLAR_TERMS = [
  { name: '小寒', month: 1, day: 6, poem: '小寒连大吕，欢鹊垒新巢', from: '元稹《咏廿四气诗·小寒》', en: 'Cold peaks; magpies build new nests.' },
  { name: '大寒', month: 1, day: 20, poem: '旧雪未及消，新雪又拥户', from: '邵雍《大寒吟》', en: 'Last snow still unmelted, fresh snow at the door.' },
  { name: '立春', month: 2, day: 4, poem: '律回岁晚冰霜少，春到人间草木知', from: '张栻《立春偶成》', en: 'Spring arrives; the grass and trees feel it first.' },
  { name: '雨水', month: 2, day: 19, poem: '好雨知时节，当春乃发生', from: '杜甫《春夜喜雨》', en: 'Good rain knows its season and falls with spring.' },
  { name: '惊蛰', month: 3, day: 6, poem: '微雨众卉新，一雷惊蛰始', from: '韦应物《观田家》', en: 'A light rain renews the plants; one thunderclap wakes the insects.' },
  { name: '春分', month: 3, day: 21, poem: '春分雨脚落声微，柳岸斜风带客归', from: '徐铉《春分日》', en: 'On the equinox the rain falls soft, and the wind brings travellers home.' },
  { name: '清明', month: 4, day: 5, poem: '清明时节雨纷纷，路上行人欲断魂', from: '杜牧《清明》', en: 'It rains on the day of the dead, and travellers lose their hearts.' },
  { name: '谷雨', month: 4, day: 20, poem: '谷雨前后，种瓜点豆', from: '农谚', en: 'Around Grain Rain, plant melons and beans.' },
  { name: '立夏', month: 5, day: 6, poem: '绿树阴浓夏日长，楼台倒影入池塘', from: '高骈《山亭夏日》', en: 'Green shade deepens, summer days grow long; pavilions reflect in the pond.' },
  { name: '小满', month: 5, day: 21, poem: '小满不满，麦有一险', from: '农谚', en: 'If Grain Full does not fill, the wheat is in danger.' },
  { name: '芒种', month: 6, day: 6, poem: '时雨及芒种，四野皆插秧', from: '陆游《时雨》', en: 'When the rains come with Grain in Ear, every field is planted.' },
  { name: '夏至', month: 6, day: 21, poem: '昼晷已云极，宵漏自此长', from: '韦应物《夏至避暑北池》', en: 'The day has reached its longest; from now the nights grow.' },
  { name: '小暑', month: 7, day: 7, poem: '倏忽温风至，因循小暑来', from: '元稹《小暑六月节》', en: 'Suddenly the warm wind arrives — Minor Heat is here.' },
  { name: '大暑', month: 7, day: 23, poem: '大暑不暑，五谷不鼓', from: '农谚', en: 'If Great Heat brings no heat, the grain will not fill.' },
  { name: '立秋', month: 8, day: 8, poem: '睡起秋声无觅处，满阶梧桐月明中', from: '刘翰《立秋》', en: 'Waking, I cannot find where autumn sounded; moonlit leaves cover the steps.' },
  { name: '处暑', month: 8, day: 23, poem: '处暑无三日，新凉直万金', from: '苏泂《长江二首》', en: 'Within three days of End of Heat, the new cool is worth a fortune.' },
  { name: '白露', month: 9, day: 8, poem: '露从今夜白，月是故乡明', from: '杜甫《月夜忆舍弟》', en: 'From tonight the dew turns white; the moon is brightest at home.' },
  { name: '秋分', month: 9, day: 23, poem: '秋分客尚在，竹露夕微微', from: '杜甫《晚晴》', en: 'On the equinox the traveller remains; the bamboo drips in the evening.' },
  { name: '寒露', month: 10, day: 8, poem: '袅袅凉风动，凄凄寒露零', from: '白居易《池上》', en: 'A cool wind stirs; the cold dew falls.' },
  { name: '霜降', month: 10, day: 23, poem: '霜降水返壑，风落木归山', from: '白居易《岁晚》', en: 'With frost, water returns to the valleys and leaves to the hills.' },
  { name: '立冬', month: 11, day: 7, poem: '细雨生寒未有霜，庭前木叶半青黄', from: '仇远《立冬即事》', en: 'Light rain brings cold before the frost; half the leaves have yellowed.' },
  { name: '小雪', month: 11, day: 22, poem: '晚来天欲雪，能饮一杯无', from: '白居易《问刘十九》', en: 'Snow is coming with the evening; will you stay for a cup?' },
  { name: '大雪', month: 12, day: 7, poem: '千山鸟飞绝，万径人踪灭', from: '柳宗元《江雪》', en: 'No bird flies over the hills; no footprint marks the paths.' },
  { name: '冬至', month: 12, day: 22, poem: '邯郸驿里逢冬至，抱膝灯前影伴身', from: '白居易《邯郸冬至夜思家》', en: 'At the solstice, far from home, I hold my knees before a lamp.' },
];

/** 返回某天是否是节气（容差只往后一天，因为公历日期每年可能晚 1 天） */
export function termOf(date = new Date()) {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return SOLAR_TERMS.find((t) => t.month === m && (t.day === d || t.day + 1 === d)) || null;
}

/** 距离下一个节气还有多少天 */
export function nextTerm(date = new Date()) {
  const today = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  let best = null;
  for (const y of [date.getFullYear(), date.getFullYear() + 1]) {
    for (const t of SOLAR_TERMS) {
      const ts = new Date(y, t.month - 1, t.day).getTime();
      const gap = Math.round((ts - today) / 86400000);
      if (gap >= 0 && (!best || gap < best.gap)) best = { term: t, gap };
    }
  }
  return best;
}
