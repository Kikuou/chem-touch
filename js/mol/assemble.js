// Assembly mode of the molecule builder (spec C-1 – C-4): a straight carbon
// chain C1..Cn with multiple bonds and simple functional groups.
// Pure functions (no DOM), so they can be tested with Node.
//
// state = {
//   n: 1..18,                       carbons in the chain
//   end: null | 'cooh' | 'cho',     C1 is the carbon of -COOH / -CHO
//   bonds: [{ pos, type }],         bond C(pos)–C(pos+1); type 'cis' | 'trans' | 'triple'
//   subs: [{ pos, type }],          on C(pos); type 'oh' | 'nh2' | 'me' | 'oxo'
// }
// Numbering follows the chain as built (C1 = the -COOH / -CHO carbon); the
// IUPAC name may number it from the other end (lowest locants).

export const MAX_C = 18;

export const SUBS = {
  oh: { label: '-OH', valence: 1, smiles: 'O', prefix: 'ヒドロキシ', en: 'hydroxy' },
  nh2: { label: '-NH₂', valence: 1, smiles: 'N', prefix: 'アミノ', en: 'amino' },
  me: { label: '-CH₃', valence: 1, smiles: 'C', prefix: 'メチル', en: 'methyl' },
  oxo: { label: '=O', valence: 2, smiles: '=O', prefix: 'オキソ', en: 'oxo' },
};
const END_VALENCE = { cooh: 3, cho: 2 };
const BOND_ORDER = { cis: 2, trans: 2, double: 2, triple: 3 };

export function emptyState(n = 6) {
  return { n, end: null, bonds: [], subs: [] };
}

export function cloneState(s) {
  return { n: s.n, end: s.end, bonds: s.bonds.map((b) => ({ ...b })), subs: s.subs.map((x) => ({ ...x })) };
}

function bondAt(s, pos) {
  return s.bonds.find((b) => b.pos === pos) || null;
}

function order(s, pos) {
  if (pos < 1 || pos >= s.n) return 0;
  const b = bondAt(s, pos);
  return b ? BOND_ORDER[b.type] : 1;
}

// bonds used by carbon i (chain bonds + groups)
export function valenceUsed(s, i) {
  let v = order(s, i - 1) + order(s, i);
  for (const x of s.subs) if (x.pos === i) v += SUBS[x.type].valence;
  if (i === 1 && s.end) v += END_VALENCE[s.end];
  return v;
}

// Problems of a state, as Japanese messages ([] = valid).
export function problems(s) {
  const out = [];
  for (let i = 1; i <= s.n; i++) {
    if (valenceUsed(s, i) > 4) out.push(`C${i} の結合が5本以上になります（炭素の手は4本）。`);
  }
  for (const b of s.bonds) {
    if (bondAt(s, b.pos + 1)) out.push(`C${b.pos + 1} に多重結合が2つ並んでいます（このアプリでは扱いません）。`);
  }
  for (const x of s.subs) {
    if (x.type === 'me' && (x.pos === 1 || x.pos === s.n)) out.push('鎖の端のメチル基は、炭素鎖が伸びるのと同じです。');
    if (x.type === 'oxo' && (x.pos === s.n || (x.pos === 1 && !s.end))) out.push('鎖の端の C=O はアルデヒド（-CHO）です。');
    if (x.type === 'oxo' && x.pos === 1 && s.end) out.push(`C1 は ${s.end === 'cooh' ? '-COOH' : '-CHO'} の炭素です。`);
  }
  return [...new Set(out)];
}

// Try a change; returns { state } or { error } (the state is not modified).
export function apply(s, action) {
  const t = cloneState(s);
  if (action.kind === 'n') {
    t.n = Math.max(1, Math.min(MAX_C, action.n));
    t.bonds = t.bonds.filter((b) => b.pos < t.n);
    t.subs = t.subs.filter((x) => x.pos <= t.n);
    // groups that are no longer allowed at the new chain end are dropped
    t.subs = t.subs.filter((x) => !(x.type === 'me' && x.pos === t.n) && !(x.type === 'oxo' && x.pos === t.n));
  } else if (action.kind === 'end') {
    t.end = action.end || null;
    if (t.end) t.subs = t.subs.filter((x) => !(x.pos === 1 && x.type === 'oxo'));
  } else if (action.kind === 'bond') {
    const cur = bondAt(t, action.pos);
    t.bonds = t.bonds.filter((b) => b.pos !== action.pos);
    if (action.type && !(cur && cur.type === action.type)) t.bonds.push({ pos: action.pos, type: action.type });
    t.bonds.sort((a, b) => a.pos - b.pos);
  } else if (action.kind === 'sub') {
    t.subs.push({ pos: action.pos, type: action.type });
    t.subs.sort((a, b) => a.pos - b.pos || a.type.localeCompare(b.type));
  } else if (action.kind === 'clear') {
    // remove everything on carbon pos (groups) or on bond pos
    if (action.what === 'atom') t.subs = t.subs.filter((x) => x.pos !== action.pos);
    else t.bonds = t.bonds.filter((b) => b.pos !== action.pos);
  }
  const p = problems(t);
  if (p.length && action.kind !== 'n') return { error: p[0] };
  return { state: t, warnings: p };
}

// ------------------------------------------------------------ geometry

// groups on the sp2 carbon i other than the double-bond partner j
function sp2Groups(s, i, j) {
  const g = [];
  const other = i < j ? i - 1 : i + 1;
  if (other >= 1 && other <= s.n) g.push(chainSide(s, i, other));
  for (const x of s.subs) if (x.pos === i) g.push(x.type === 'me' ? '1C|' : x.type);
  while (g.length < 2) g.push('H');
  return g;
}

// A double bond C(pos)=C(pos+1) can be cis or trans when both carbons
// carry two different groups. Only bonds inside the chain (both chain
// neighbours present) are offered.
export function hasGeometry(s, pos) {
  if (pos <= 1 || pos >= s.n - 1) return false;
  const a = sp2Groups(s, pos, pos + 1);
  const b = sp2Groups(s, pos + 1, pos);
  return a[0] !== a[1] && b[0] !== b[1];
}

// Serialized description of the part of the molecule reached from carbon
// `from` through its neighbour `to` (used to compare groups).
function chainSide(s, from, to) {
  const step = to > from ? 1 : -1;
  let out = '';
  for (let i = to; i >= 1 && i <= s.n; i += step) {
    const bpos = step > 0 ? i - 1 : i;
    out += `${order(s, bpos)}C`;
    const subs = s.subs.filter((x) => x.pos === i).map((x) => x.type).sort();
    if (i === 1 && s.end) subs.push(s.end);
    if (subs.length) out += `(${subs.join(',')})`;
  }
  return out + '|';
}

// Carbons with four different groups (stereocentres; R/S is not chosen
// in the builder).
export function stereocentres(s) {
  const out = [];
  for (let i = 1; i <= s.n; i++) {
    if (order(s, i - 1) > 1 || order(s, i) > 1) continue;
    if (i === 1 && s.end) continue;
    const subs = s.subs.filter((x) => x.pos === i);
    if (subs.some((x) => x.type === 'oxo')) continue;
    const g = [];
    if (i > 1) g.push(chainSide(s, i, i - 1));
    if (i < s.n) g.push(chainSide(s, i, i + 1));
    for (const x of subs) g.push(x.type === 'me' ? '1C|' : x.type);
    if (g.length > 4) continue;
    while (g.length < 4) g.push('H');
    if (new Set(g).size === 4) out.push(i);
  }
  return out;
}

// ------------------------------------------------------------ SMILES

// Written from Cn down to C1 so that -COOH / -CHO come last
// (e.g. oleic acid: CCCCCCCC/C=C\CCCCCCCC(=O)O).
export function toSmiles(s) {
  const dir = {};
  for (const b of s.bonds) {
    if (b.type !== 'cis' && b.type !== 'trans') continue;
    if (!hasGeometry(s, b.pos)) continue;
    const left = b.pos - 1;
    const right = b.pos + 1;
    if (!dir[left]) dir[left] = '/';
    dir[right] = b.type === 'trans' ? dir[left] : (dir[left] === '/' ? '\\' : '/');
  }
  let out = '';
  for (let i = s.n; i >= 1; i--) {
    let tok = 'C';
    for (const x of s.subs) if (x.pos === i) tok += `(${SUBS[x.type].smiles})`;
    if (i === 1 && s.end === 'cooh') tok += '(=O)O';
    if (i === 1 && s.end === 'cho') tok += '=O';
    out += tok;
    if (i > 1) {
      const b = bondAt(s, i - 1);
      out += b ? (b.type === 'triple' ? '#' : '=') : (dir[i - 1] || '');
    }
  }
  return out;
}

// ------------------------------------------------------------ names (C-4)
// Japanese names in the style of high-school textbooks, with the locants
// in front: 1-プロパノール, 2-ブテン, cis-9-オクタデセン酸, 2-メチル-1-プロパノール.

const STEM = [null,
  ['メタン', 'メタ', 'メテン', 'メチン'],
  ['エタン', 'エタ', 'エテン', 'エチン'],
  ['プロパン', 'プロパ', 'プロペン', 'プロピン'],
  ['ブタン', 'ブタ', 'ブテン', 'ブチン'],
  ['ペンタン', 'ペンタ', 'ペンテン', 'ペンチン'],
  ['ヘキサン', 'ヘキサ', 'ヘキセン', 'ヘキシン'],
  ['ヘプタン', 'ヘプタ', 'ヘプテン', 'ヘプチン'],
  ['オクタン', 'オクタ', 'オクテン', 'オクチン'],
  ['ノナン', 'ノナ', 'ノネン', 'ノニン'],
  ['デカン', 'デカ', 'デセン', 'デシン'],
  ['ウンデカン', 'ウンデカ', 'ウンデセン', 'ウンデシン'],
  ['ドデカン', 'ドデカ', 'ドデセン', 'ドデシン'],
  ['トリデカン', 'トリデカ', 'トリデセン', 'トリデシン'],
  ['テトラデカン', 'テトラデカ', 'テトラデセン', 'テトラデシン'],
  ['ペンタデカン', 'ペンタデカ', 'ペンタデセン', 'ペンタデシン'],
  ['ヘキサデカン', 'ヘキサデカ', 'ヘキサデセン', 'ヘキサデシン'],
  ['ヘプタデカン', 'ヘプタデカ', 'ヘプタデセン', 'ヘプタデシン'],
  ['オクタデカン', 'オクタデカ', 'オクタデセン', 'オクタデシン'],
];
const MULT = ['', '', 'ジ', 'トリ', 'テトラ', 'ペンタ', 'ヘキサ', 'ヘプタ', 'オクタ', 'ノナ'];
// principal characteristic groups, highest priority first
const SUFFIX = { cooh: '酸', cho: 'アール', oxo: 'オン', oh: 'オール', nh2: 'アミン' };
const PRIORITY = ['cooh', 'cho', 'oxo', 'oh', 'nh2'];

function reversed(s) {
  const n = s.n;
  return {
    n, end: s.end,
    bonds: s.bonds.map((b) => ({ pos: n - b.pos, type: b.type })).sort((a, b) => a.pos - b.pos),
    subs: s.subs.map((x) => ({ pos: n + 1 - x.pos, type: x.type })).sort((a, b) => a.pos - b.pos || a.type.localeCompare(b.type)),
  };
}

function key(s) {
  return `${s.n}|${s.end}|${s.bonds.map((b) => b.pos + b.type).join(',')}|${s.subs.map((x) => x.pos + x.type).join(',')}`;
}

// same molecule up to reading the chain from the other end
function canonicalKey(s) {
  if (s.end) return key(s);
  const a = key(s);
  const b = key(reversed(s));
  return a < b ? a : b;
}

function cmpLists(a, b) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}

function principal(s) {
  if (s.end) return s.end;
  for (const t of PRIORITY) if (s.subs.some((x) => x.type === t)) return t;
  return null;
}

function locants(s, pr) {
  const sfx = pr && pr !== 'cooh' && pr !== 'cho' ? s.subs.filter((x) => x.type === pr).map((x) => x.pos) : [];
  const prefixes = s.subs.filter((x) => x.type !== pr);
  const alpha = [...prefixes].sort((a, b) => SUBS[a.type].en.localeCompare(SUBS[b.type].en) || a.pos - b.pos);
  return {
    sfx: sfx.sort((a, b) => a - b),
    multi: s.bonds.map((b) => b.pos).sort((a, b) => a - b),
    dbl: s.bonds.filter((b) => b.type !== 'triple').map((b) => b.pos).sort((a, b) => a - b),
    pre: prefixes.map((x) => x.pos).sort((a, b) => a - b),
    alpha: alpha.map((x) => x.pos),
  };
}

// IUPAC rule for the direction of numbering (lowest locants, in order)
function better(a, b) {
  for (const k of ['sfx', 'multi', 'dbl', 'pre', 'alpha']) {
    const c = cmpLists(a[k], b[k]);
    if (c) return c < 0;
  }
  return true;
}

// combinations of k positions out of list (for the locant check)
function* combos(list, k, start = 0, acc = []) {
  if (acc.length === k) { yield [...acc]; return; }
  for (let i = start; i < list.length; i++) {
    acc.push(list[i]);
    yield* combos(list, k, i, acc); // repetition allowed (e.g. 1,1-diol)
    acc.pop();
  }
}

// Can the locants of this kind of feature be left out? Yes when no other
// placement of the same features gives a different, valid molecule
// (ethanol, propanone, propene, propenoic acid ...).
// Locants stay when there are two or more of the feature (2,3-ブタンジオン)
// or when both multiple bonds and a suffix group need positions
// (3-ペンテン-2-オン).
function locantsNeeded(s, kind, pr) {
  const isBond = kind === 'bond';
  const mine = isBond ? s.bonds : s.subs.filter((x) => x.type === kind);
  if (!mine.length) return false;
  if (mine.length > 1) return true;
  if (isBond && pr && s.subs.some((x) => x.type === pr)) return true;
  if (!isBond && s.bonds.length) return true;
  const positions = [];
  for (let p = 1; p <= (isBond ? s.n - 1 : s.n); p++) positions.push(p);
  const types = mine.map((x) => x.type);
  const base = cloneState(s);
  if (isBond) base.bonds = [];
  else base.subs = base.subs.filter((x) => x.type !== kind);
  const ref = canonicalKey(s);
  let count = 0;
  for (const c of combos(positions, mine.length)) {
    if (++count > 5000) return true;
    if (isBond && new Set(c).size !== c.length) continue;
    const t = cloneState(base);
    c.forEach((p, i) => (isBond ? t.bonds : t.subs).push({ pos: p, type: types[i] }));
    t.bonds.sort((a, b) => a.pos - b.pos);
    t.subs.sort((a, b) => a.pos - b.pos || a.type.localeCompare(b.type));
    if (problems(t).length) continue;
    if (canonicalKey(t) !== ref) return true;
  }
  return false;
}

// elision when a suffix starting with a vowel follows "〜ン": ブタン + オール -> ブタノール
function joinSuffix(stem, sfx) {
  if (!stem.endsWith('ン')) return stem + sfx;
  const head = stem.slice(0, -1);
  if (sfx === 'オール') return head + 'ノール';
  if (sfx === 'アール') return head + 'ナール';
  if (sfx === 'オン') return head + 'ノン';
  return stem + sfx;
}

/**
 * Japanese name of a state, or null when it cannot be named simply.
 * @returns {{ name: string, numbering: 'as-built'|'reversed' }}
 */
export function nameOf(s0) {
  if (problems(s0).length || s0.n < 1 || s0.n > MAX_C) return null;
  const pr = principal(s0);
  let s = s0;
  let numbering = 'as-built';
  if (!s0.end) {
    const r = reversed(s0);
    if (!better(locants(s0, pr), locants(r, pr))) { s = r; numbering = 'reversed'; }
  }
  const L = locants(s, pr);
  const [alkane, base, ene1, yne1] = STEM[s.n];
  const D = s.bonds.filter((b) => b.type !== 'triple').map((b) => b.pos);
  const T = s.bonds.filter((b) => b.type === 'triple').map((b) => b.pos);
  const unsatLoc = locantsNeeded(s, 'bond', pr);

  // hydrocarbon part, e.g. ブタン / 2-ブテン / 1,3-ブタジエン / 1-ブテン-3-イン
  let hc;
  let front = []; // locants written in front of the hydrocarbon part
  const ene = D.length === 1 ? ene1 : `${base}${MULT[D.length]}エン`;
  const yne = T.length === 1 ? yne1 : `${base}${MULT[T.length]}イン`;
  if (!D.length && !T.length) hc = alkane;
  else if (!T.length) { hc = ene; front = D; }
  else if (!D.length) { hc = yne; front = T; }
  else { hc = `${ene}-${T.join(',')}-${T.length === 1 ? 'イン' : MULT[T.length] + 'イン'}`; front = D; }
  if (!unsatLoc && !(D.length && T.length)) front = [];

  // principal group (suffix)
  let main = hc;
  if (pr) {
    const k = pr === 'cooh' || pr === 'cho' ? 1 : L.sfx.length;
    const sfx = k > 1 ? MULT[k] + SUFFIX[pr] : SUFFIX[pr];
    const sfxLoc = pr !== 'cooh' && pr !== 'cho' && locantsNeeded(s, pr) ? L.sfx : [];
    if (front.length && sfxLoc.length) main = `${front.join(',')}-${hc}-${sfxLoc.join(',')}-${sfx}`;
    else if (front.length) main = `${front.join(',')}-${joinSuffix(hc, sfx)}`;
    else if (sfxLoc.length) main = `${sfxLoc.join(',')}-${joinSuffix(hc, sfx)}`;
    else main = joinSuffix(hc, sfx);
  } else if (front.length) {
    main = `${front.join(',')}-${hc}`;
  }

  // prefixes in alphabetical order of the English names
  const groups = {};
  for (const x of s.subs) if (x.type !== pr) (groups[x.type] ||= []).push(x.pos);
  const prefix = Object.keys(groups)
    .sort((a, b) => SUBS[a].en.localeCompare(SUBS[b].en))
    .map((t) => `${groups[t].sort((a, b) => a - b).join(',')}-${MULT[groups[t].length]}${SUBS[t].prefix}`)
    .join('-');
  let name = prefix ? (/^\d/.test(main) ? `${prefix}-${main}` : prefix + main) : main;

  // cis / trans of the double bonds that have it
  const geo = s.bonds.filter((b) => (b.type === 'cis' || b.type === 'trans') && hasGeometry(s, b.pos));
  if (geo.length) {
    name = (geo.length === D.length
      ? geo.map((b) => b.type).join(',')
      : geo.map((b) => `${b.pos}-${b.type}`).join(',')) + '-' + name;
  }
  return { name, numbering };
}

// Fatty-acid style summary (C18:1 n-9) when the state is a straight
// unbranched carboxylic acid with only C=C bonds.
export function fattyAcidNotation(s) {
  if (s.end !== 'cooh' || s.subs.length || s.bonds.some((b) => b.type === 'triple') || s.n < 4) return null;
  const k = s.bonds.length;
  if (!k) return `C${s.n}:0`;
  const first = Math.max(...s.bonds.map((b) => b.pos)); // closest to the methyl end
  return `C${s.n}:${k} n-${s.n - first}`;
}

// ------------------------------------------------------------ URL form
// n=18&end=cooh&b=9c,12c&g=2oh,3me

export function encodeState(s) {
  const q = { n: String(s.n) };
  if (s.end) q.end = s.end;
  if (s.bonds.length) q.b = s.bonds.map((b) => b.pos + ({ cis: 'c', trans: 't', triple: 'y' })[b.type]).join(',');
  if (s.subs.length) q.g = s.subs.map((x) => x.pos + x.type).join(',');
  return q;
}

export function decodeState(query) {
  const get = (k) => (query.get ? query.get(k) : query[k]) || '';
  const n = Math.max(1, Math.min(MAX_C, parseInt(get('n'), 10) || 0));
  if (!n) return null;
  let s = emptyState(n);
  const end = get('end');
  if (end === 'cooh' || end === 'cho') s.end = end;
  for (const tok of get('b').split(',').filter(Boolean)) {
    const m = tok.match(/^(\d+)([cty])$/);
    if (m) s.bonds.push({ pos: +m[1], type: { c: 'cis', t: 'trans', y: 'triple' }[m[2]] });
  }
  for (const tok of get('g').split(',').filter(Boolean)) {
    const m = tok.match(/^(\d+)(oh|nh2|me|oxo)$/);
    if (m) s.subs.push({ pos: +m[1], type: m[2] });
  }
  s.bonds = s.bonds.filter((b) => b.pos >= 1 && b.pos < n).sort((a, b) => a.pos - b.pos);
  s.subs = s.subs.filter((x) => x.pos >= 1 && x.pos <= n).sort((a, b) => a.pos - b.pos || a.type.localeCompare(b.type));
  if (problems(s).length) s = { ...s, bonds: [], subs: [] };
  return s;
}
