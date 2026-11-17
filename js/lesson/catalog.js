// 教材カタログ (docs/plan.md 提案11): every screen or molecule a lesson can
// use, called by an id "kind" or "kind:arg" (e.g. "compare:oleic-elaidic").
// A lesson plan lists these ids in the order of use; a plan entry may also be
//   { "use": "<id>", "title": "...", "sub": "..." }  an id with its own words
//   { "card": "...", "sub": "..." }                 a topic with no screen
// resolvePart() turns an entry into { title, sub, tag, href } (href null:
// nothing to open yet, e.g. a 準備中 material).
import { compound, comparisons, categories, lifeGroups } from '../core/data.js';
import { KINDS as CALC } from '../lab/calc.js';

const enc = encodeURIComponent;

// hands-on materials (views/lab.js)
const LAB = {
  states: ['温度と三態', 'スライダーで温度を変えて、分子の動きを見る'],
  formula: ['組成式パズル', '＋と−のイオンを組み合わせて物質をつくる'],
  ph: ['pH ものさし', 'pH と水素イオンの濃さ、身近なものの pH'],
  sort: ['なかまわけ', '純物質と混合物・単体と化合物・酸性と塩基性'],
  attract: ['ひきあう分子', '水とメタン：同じくらいの大きさでも、25 ℃ で液体と気体'],
  metal: ['金属と自由電子', '電池をつなぐと、自由電子が一方向に動く'],
  mwcount: ['分子量カウンター', '原子量 × 個数 をたして分子量を出す'],
  molscale: ['モルのはかり', '物質量（mol）と質量・粒子の数'],
  dissolve: ['とかすビーカー', '水と溶かすものの量で、濃度が変わる'],
  balance: ['反応式の天びん', '係数を変えて、左右の原子の数をそろえる'],
  titration: ['中和の滴定', '塩基を加えると pH がどう変わるか'],
  redox: ['電子の受けわたし', 'Mg と O：電子を失う（酸化）・受け取る（還元）'],
  review: ['総まとめクイズ', '全回から10問']
};

const BOND = {
  ionic: ['イオン結合（Na と Cl）', 'Na から Cl へ電子をわたして、NaCl の結晶へ'],
  covalent: ['共有結合と電子式', '電子を出し合って分子をつくる'],
};
const PERIODIC = {
  '': ['周期表', '元素の並びと分類'],
  mineral: ['周期表：栄養ミネラル', 'からだに必要なミネラルの元素'],
  body: ['周期表：人体の元素組成', '体をつくる元素の多い順'],
  radius: ['周期表：原子半径', '色で傾向を見る'],
  en: ['周期表：電気陰性度', '色で傾向を見る'],
  ie: ['周期表：イオン化エネルギー', '色で傾向を見る'],
};

// kind -> (arg) => part (may be async)
const KINDS = {
  notation: (a) => ({ tag: '教材', title: '書き方くらべ', sub: '同じ分子を、構造式・簡略構造式・骨格構造式・示性式で', href: `#/build/notation${a ? `?id=${enc(a)}` : ''}` }),
  draw: () => ({ tag: '作図', title: 'なぞって描く', sub: '指でなぞって分子を描く', href: '#/build/draw' }),
  practice: (a) => ({ tag: '確認', title: '書きかえ練習', sub: '出された書き方を見て、別の書き方で答える', href: `#/build/practice${a ? `?mode=${enc(a)}` : ''}` }),
  quiz: (a) => ({ tag: '確認', title: '官能基クイズ', sub: '分子の中の −OH や −COOH を見つける', href: `#/quiz${a ? `?id=${enc(a)}` : ''}` }),
  compare: async (a) => {
    const p = (await comparisons()).find((x) => x.id === a);
    return p && { tag: 'くらべる', title: p.title, sub: p.kind, href: `#/compare/${enc(a)}` };
  },
  compound: async (a) => {
    const c = await compound(a);
    return c && { tag: '分子', title: c.name_ja, sub: c.reading && c.reading !== c.name_ja ? c.reading : '', href: `#/compound/${enc(a)}`, formula: c.formula };
  },
  library: async (a) => {
    const c = (await categories()).find((x) => x.id === a);
    return c && { tag: '分子', title: c.label, sub: c.desc, href: `#/library?cat=${enc(a)}` };
  },
  life: async (a) => {
    const g = (await lifeGroups()).find((x) => x.id === a);
    return g && { tag: '分子', title: g.label, sub: g.desc, href: `#/library?life=${enc(a)}` };
  },
  series: (a) => ({ tag: '教材', title: '同族体シリーズ', sub: '炭素の数による沸点・融点の変化', href: `#/series${a ? `?s=${enc(a)}` : ''}` }),
  periodic: (a = '') => {
    const p = PERIODIC[a];
    if (!p) return null;
    const q = a === 'mineral' || a === 'body' ? `?filter=${a}` : a ? `?view=${a}` : '';
    return { tag: '教材', title: p[0], sub: p[1], href: `#/periodic${q}` };
  },
  electron: (a) => ({ tag: '教材', title: a ? `電子配置（${a}）` : '電子配置ビルダー', sub: 'K殻・L殻・M殻に電子を入れる', href: a ? `#/electron/${enc(a)}` : '#/electron' }),
  bond: (a = 'ionic') => BOND[a] && { tag: '教材', title: BOND[a][0], sub: BOND[a][1], href: `#/bond?type=${a}` },
  lab: (a) => LAB[a] && { tag: '触る', title: LAB[a][0], sub: LAB[a][1], href: `#/lab/${a}` },
  calc: (a) => CALC[a] && { tag: '計算', title: `計算練習：${CALC[a].title}`, sub: '見当をつける → 穴うめ → 自分で計算', href: `#/lab/calc?k=${enc(a)}` },
  soon: (a) => a && { tag: '準備中', title: a, sub: '新しい教材（作成中）', href: null },
};

export const PART_KINDS = Object.keys(KINDS);

function split(id) {
  const i = String(id).indexOf(':');
  return i < 0 ? [id, undefined] : [id.slice(0, i), id.slice(i + 1)];
}

// a plan entry -> { title, sub, tag, href } or null when the id is unknown
export async function resolvePart(entry) {
  if (entry && typeof entry === 'object' && entry.card) {
    return { tag: '話題', title: entry.card, sub: entry.sub || '', href: null };
  }
  const id = typeof entry === 'string' ? entry : entry?.use;
  const [kind, arg] = split(id || '');
  const make = KINDS[kind];
  const part = make ? await make(arg) : null;
  if (!part) return null;
  if (typeof entry === 'object') {
    if (entry.title) part.title = entry.title;
    if (entry.sub) part.sub = entry.sub;
  }
  return part;
}

// Every part a lesson can use, in groups, for the 授業をつくる editor
// (views/teach.js). Molecules are many: they are searched there instead.
export async function catalogGroups() {
  const [presets, cats, life] = await Promise.all([comparisons(), categories(), lifeGroups()]);
  const g = (label, ids) => ({ label, ids });
  return [
    g('触る教材', Object.keys(LAB).map((k) => `lab:${k}`)),
    g('計算練習', Object.keys(CALC).map((k) => `calc:${k}`)),
    g('くらべる', presets.map((p) => `compare:${p.id}`)),
    g('つくる・確認', ['draw', 'practice', 'practice:choose', 'practice:blocks', 'practice:draw', 'quiz', 'notation']),
    g('周期表・電子・結合', [...Object.keys(PERIODIC).map((k) => (k ? `periodic:${k}` : 'periodic')), 'electron', 'bond:ionic', 'bond:covalent']),
    g('分子の一覧', [...life.filter((x) => !x.planned).map((x) => `life:${x.id}`), ...cats.map((c) => `library:${c.id}`)]),
    g('同族体シリーズ', ['series:alkane', 'series:alkanol', 'series:carboxylic-acid', 'series:saturated-fatty-acid']),
  ];
}
