// "Library compounds close to the molecule you made" (spec C-5):
// identical (InChIKey), same atoms and bonds but other stereo (first
// InChIKey block, e.g. elaidic acid for a cis/trans change), and similar
// ones (Tanimoto similarity of Morgan fingerprints, radius 2, scaled by
// the ratio of heavy-atom counts).
import { compounds } from '../core/data.js';
import { getRDKit } from './rdkit.js';

const FP = JSON.stringify({ radius: 2, nBits: 2048 });
let libFps = null;

function bits(fp) {
  const on = [];
  for (let i = 0; i < fp.length; i++) if (fp.charCodeAt(i) === 49) on.push(i);
  return on;
}

function heavyAtoms(m) {
  return JSON.parse(m.get_descriptors()).NumHeavyAtoms || 1;
}

function tanimoto(a, b) {
  let i = 0;
  let j = 0;
  let common = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { common++; i++; j++; } else if (a[i] < b[j]) i++; else j++;
  }
  const union = a.length + b.length - common;
  return union ? common / union : 0;
}

async function libraryFps(RDKit) {
  if (!libFps) {
    const list = (await compounds()).filter((c) => c.smiles && c.kind !== 'crystal');
    libFps = [];
    for (const c of list) {
      const m = RDKit.get_mol(c.smiles);
      if (!m) continue;
      libFps.push({ c, fp: bits(m.get_morgan_fp(FP)), heavy: heavyAtoms(m) });
      m.delete();
    }
  }
  return libFps;
}

/**
 * @returns {Promise<{ inchikey, exact, stereo: object[], similar: {c, sim}[] } | null>}
 */
export async function libraryMatches(smiles, { limit = 3, min = 0.35 } = {}) {
  const RDKit = await getRDKit();
  const m = RDKit.get_mol(smiles);
  if (!m || !m.is_valid()) return null;
  const key = RDKit.get_inchikey_for_inchi(m.get_inchi());
  const fp = bits(m.get_morgan_fp(FP));
  const heavy = heavyAtoms(m);
  m.delete();
  const list = await compounds();
  const exact = list.find((c) => c.inchikey === key) || null;
  const stereo = list.filter((c) => c.inchikey && c !== exact && c.inchikey.slice(0, 14) === key.slice(0, 14));
  const skip = new Set([exact, ...stereo].filter(Boolean).map((c) => c.id));
  const similar = (await libraryFps(RDKit))
    .filter((x) => !skip.has(x.c.id))
    // the fingerprint sees only short paths (C16 and C18 chains look the
    // same), so the score is also scaled by the size ratio
    .map((x) => ({ c: x.c, sim: tanimoto(fp, x.fp) * Math.min(heavy, x.heavy) / Math.max(heavy, x.heavy) }))
    .filter((x) => x.sim >= min)
    .sort((a, b) => b.sim - a.sim)
    .slice(0, limit);
  return { inchikey: key, exact, stereo, similar };
}

// Molecular formula (Hill order) and average molecular weight.
const MASS = { H: 1.008, C: 12.011, N: 14.007, O: 15.999, F: 18.998, Na: 22.990, P: 30.974, S: 32.06, Cl: 35.45, K: 39.098, Br: 79.904, I: 126.904, Si: 28.085, B: 10.81, Mg: 24.305, Ca: 40.078, Fe: 55.845 };
const SYM = { 1: 'H', 5: 'B', 6: 'C', 7: 'N', 8: 'O', 9: 'F', 11: 'Na', 12: 'Mg', 14: 'Si', 15: 'P', 16: 'S', 17: 'Cl', 19: 'K', 20: 'Ca', 26: 'Fe', 35: 'Br', 53: 'I' };

export function formulaOf(graph) {
  const count = {};
  let unknown = false;
  for (const a of graph.atoms) {
    const s = SYM[a.z];
    if (!s) { unknown = true; continue; }
    count[s] = (count[s] || 0) + 1;
    if (a.impHs) count.H = (count.H || 0) + a.impHs;
  }
  if (unknown) return null;
  const order = Object.keys(count).sort((a, b) => {
    const r = (x) => (x === 'C' ? 0 : x === 'H' ? 1 : 2);
    return r(a) - r(b) || a.localeCompare(b);
  });
  const formula = (count.C ? order : Object.keys(count).sort()).map((s) => s + (count[s] > 1 ? count[s] : '')).join('');
  const mw = Object.entries(count).reduce((t, [s, k]) => t + MASS[s] * k, 0);
  return { formula, mw };
}
