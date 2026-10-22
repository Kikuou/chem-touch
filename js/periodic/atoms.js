// Shared helpers of the periodic table and the electron builder (M4):
// element lookup, shells and orbitals, ions, number formatting.
// js/periodic/ uses only js/core/ (no import from js/mol/).
import { elements as loadElements } from '../core/data.js';

export const SHELLS = ['K', 'L', 'M', 'N', 'O', 'P', 'Q'];
export const CAPACITY = [2, 8, 18, 32, 50, 72, 98]; // 2n^2
export const BUILDER_MAX_Z = 20; // spec E-1: 1-20 are built, the rest are shown
const NOBLE = [2, 10, 18, 36, 54, 86, 118];

let cache = null;
export async function elementData() {
  if (!cache) {
    const doc = await loadElements();
    cache = { ...doc, byZ: new Map(doc.elements.map((e) => [e.z, e])), bySym: new Map(doc.elements.map((e) => [e.symbol, e])) };
  }
  return cache;
}

export function findElement(data, key) {
  if (!key) return null;
  if (/^\d+$/.test(key)) return data.byZ.get(+key) || null;
  const k = key.charAt(0).toUpperCase() + key.slice(1).toLowerCase();
  return data.bySym.get(k) || null;
}

// High-school filling K2 L8 M8 N2 (valid up to 20 electrons).
export function groundShells(n) {
  const out = [];
  let left = n;
  for (const cap of [2, 8, 8, 2]) {
    if (left <= 0) break;
    const k = Math.min(cap, left);
    out.push(k);
    left -= k;
  }
  return out;
}

export function sameShells(a, b) {
  const t = (x) => { const c = [...x]; while (c.length && !c[c.length - 1]) c.pop(); return c.join(','); };
  return t(a) === t(b);
}

// The noble gas with the same electron arrangement, or null.
export function nobleLike(data, shells) {
  const n = shells.reduce((a, b) => a + b, 0);
  if (!NOBLE.includes(n)) return null;
  const g = data.byZ.get(n);
  if (n <= BUILDER_MAX_Z && !sameShells(shells, groundShells(n))) return null;
  return g;
}

export function outerCount(shells) {
  for (let i = shells.length - 1; i >= 0; i--) if (shells[i]) return shells[i];
  return 0;
}

// valence electrons in the high-school sense: outermost electrons, 0 for noble gases
export function valence(e) {
  if (e.family === 'noble-gas') return 0;
  return e.shells ? outerCount(e.shells) : null;
}

// Charge of the noble-gas-like ion formed by losing/gaining outermost
// electrons (Z <= 20; null when the element usually does not form one).
export function usualIon(e) {
  if (!e.shells || e.z > BUILDER_MAX_Z || e.family === 'noble-gas') return null;
  if (e.z === 1) return 1;
  const v = outerCount(e.shells);
  if (v <= 3 && !(e.symbol === 'B')) return v;
  if (v >= 5) return -(8 - v);
  return null;
}

export function ionLabel(sym, charge) {
  if (!charge) return sym;
  const n = Math.abs(charge);
  const sup = `${n > 1 ? n : ''}${charge > 0 ? '+' : '−'}`;
  return `${sym}<sup>${sup}</sup>`;
}

export function ionName(e, charge) {
  if (!charge) return `${e.name_ja}原子`;
  if (charge > 0) return `${e.name_ja}イオン`;
  return e.anion_ja || `${e.name_ja}の陰イオン`;
}

// orbitals 1s 2s 2p 3s 3p 4s filled in order (enough for 20 electrons)
const ORBITALS = [['1s', 1], ['2s', 1], ['2p', 3], ['3s', 1], ['3p', 3], ['4s', 1]];
export function orbitalFill(n) {
  const out = [];
  let left = n;
  for (const [name, boxes] of ORBITALS) {
    const k = Math.max(0, Math.min(left, boxes * 2));
    left -= k;
    // Hund's rule: one electron in each box first, then pairs
    const arrows = Array.from({ length: boxes }, (_, i) => (k > i ? 1 : 0) + (k > boxes + i ? 1 : 0));
    out.push({ name, boxes, count: k, arrows });
  }
  return out;
}

export function orbitalText(n) {
  const sup = (k) => String(k).replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]);
  return orbitalFill(n).filter((o) => o.count).map((o) => `${o.name}${sup(o.count)}`).join(' ');
}

// ------------------------------------------------------------ formatting

// atomic mass as written by PubChem (keeps "7.0"), else the number
export function fmtMass(e) {
  if (e.mass_text) return e.mass_text;
  return e.mass == null ? null : String(e.mass);
}

// rounded to `digits` without trailing zeros; whole numbers keep ".0" when
// decimals are expected (PubChem's 1.0 stays 1.0, not 1)
export function fmtNum(v, digits = 2) {
  if (v == null) return null;
  const s = String(+v.toFixed(digits));
  return digits > 0 && !s.includes('.') ? `${s}.0` : s;
}

export const EV_TO_KJMOL = 96.485;

export const STATE_JA = { Solid: '固体', Liquid: '液体', Gas: '気体' };
export function stateJa(s) {
  if (!s) return null;
  const k = Object.keys(STATE_JA).find((x) => s.includes(x));
  if (!k) return s;
  return STATE_JA[k] + (/expected|predicted/i.test(s) ? '（予想）' : '');
}

export const FAMILY_JA = { alkali: 'アルカリ金属', 'alkaline-earth': 'アルカリ土類金属', halogen: 'ハロゲン', 'noble-gas': '貴ガス' };
export const METALLIC_JA = { metal: '金属元素', metalloid: '半金属（金属と非金属の中間）', nonmetal: '非金属元素' };

// classification used for colouring the table
export function classOf(e) {
  if (e.series) return e.series;
  if (e.family) return e.family;
  if (e.kind === 'transition') return 'transition';
  if (e.metallic === 'metal') return 'post-transition';
  if (e.metallic === 'metalloid') return 'metalloid';
  if (e.metallic === 'nonmetal') return 'nonmetal';
  return 'main';
}
export const CLASS_JA = {
  alkali: 'アルカリ金属', 'alkaline-earth': 'アルカリ土類金属', transition: '遷移元素',
  'post-transition': 'その他の典型金属', metalloid: '半金属', nonmetal: '非金属',
  halogen: 'ハロゲン', 'noble-gas': '貴ガス', lanthanoid: 'ランタノイド', actinoid: 'アクチノイド', main: '典型元素',
};

// Library compounds that contain the element (spec F-6), from their formulas.
export function containsElement(formula, sym) {
  if (!formula) return false;
  return (formula.match(/[A-Z][a-z]?/g) || []).includes(sym);
}
