// 教材カタログ (docs/plan.md 提案11): every screen or molecule a lesson can
// use, called by an id "kind" or "kind:arg" (e.g. "compare:oleic-elaidic").
// A lesson plan lists these ids in the order of use; a plan entry may also be
//   { "use": "<id>", "title": "...", "sub": "..." }  an id with its own words
//   { "card": "...", "sub": "..." }                 a topic with no screen
// resolvePart() turns an entry into { title, sub, tag, href } (href null:
// nothing to open yet, e.g. a 準備中 material).
import { compound, comparisons, categories, lifeGroups } from '../core/data.js';

const enc = encodeURIComponent;

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
