// Answer checking for the practice: "the right molecule" whatever way it
// was written. Molecules are compared by InChIKey with R/S removed (the
// course does not draw wedges); cis/trans counts only when the question's
// molecule has it.
// parseRational() reads a 示性式 built from blocks (CH3, CH2, OH, COOH ...)
// and checks every atom's number of bonds.

// SMILES without R/S (and without cis/trans unless keepEZ)
function stripStereo(smiles, keepEZ) {
  let s = smiles.replace(/\[([A-Za-z]{1,2})@{1,2}(H?\d*)\]/g, (m, el, h) => (h ? `[${el}${h}]` : (/^(B|C|N|O|P|S|F|Cl|Br|I)$/.test(el) ? el : `[${el}]`)));
  if (!keepEZ) s = s.replace(/[\\/]/g, '');
  return s;
}

/** comparison key of a molecule given as SMILES or molfile */
export function moleculeKey(RDKit, input, { keepEZ = true } = {}) {
  const m = RDKit.get_mol(input);
  if (!m || !m.is_valid()) return null;
  const smi = m.get_smiles();
  m.delete();
  const n = RDKit.get_mol(stripStereo(smi, keepEZ));
  if (!n) return null;
  const key = RDKit.get_inchikey_for_inchi(n.get_inchi());
  n.delete();
  return key;
}

export function hasEZ(smiles) {
  return /[\\/]/.test(smiles);
}

/** same molecule? (R/S ignored; cis/trans only when the target has it) */
export function sameMolecule(RDKit, answer, targetSmiles) {
  const keepEZ = hasEZ(targetSmiles);
  const a = moleculeKey(RDKit, answer, { keepEZ });
  const b = moleculeKey(RDKit, targetSmiles, { keepEZ });
  return !!a && a === b;
}

/** molecular formula of SMILES / molfile input (for "isomer" feedback) */
export function formulaKey(RDKit, input) {
  const m = RDKit.get_mol(input);
  if (!m || !m.is_valid()) return null;
  const inchi = m.get_inchi();
  m.delete();
  return inchi.split('/')[1] || null;
}

// ------------------------------------------------------------ 示性式 blocks

export const BLOCKS = ['CH4', 'CH3', 'CH2', 'CH', 'C', 'H', 'OH', 'O', 'CHO', 'CO', 'COOH', 'COO', 'NH2', 'NH', 'N', 'C2H5', 'C6H5', '=', '≡', '(CH3)', '(OH)'];

const VAL = { C: 4, O: 2, N: 3, H: 1 };

// one block -> atoms (el, h), internal bonds, the atom the previous block
// bonds to (head) and the atom the next block bonds to (tail)
function expand(t) {
  const A = (el, h = 0) => ({ el, h });
  switch (t) {
    case 'CH4': return { atoms: [A('C', 4)], bonds: [], head: 0, tail: 0 };
    case 'CH3': return { atoms: [A('C', 3)], bonds: [], head: 0, tail: 0 };
    case 'CH2': return { atoms: [A('C', 2)], bonds: [], head: 0, tail: 0 };
    case 'CH': return { atoms: [A('C', 1)], bonds: [], head: 0, tail: 0 };
    case 'C': return { atoms: [A('C')], bonds: [], head: 0, tail: 0 };
    case 'H': return { atoms: [A('H')], bonds: [], head: 0, tail: 0 };
    case 'OH': case 'HO': return { atoms: [A('O', 1)], bonds: [], head: 0, tail: 0 };
    case 'O': return { atoms: [A('O')], bonds: [], head: 0, tail: 0 };
    case 'NH2': return { atoms: [A('N', 2)], bonds: [], head: 0, tail: 0 };
    case 'NH': return { atoms: [A('N', 1)], bonds: [], head: 0, tail: 0 };
    case 'N': return { atoms: [A('N')], bonds: [], head: 0, tail: 0 };
    case 'CHO': return { atoms: [A('C', 1), A('O')], bonds: [[0, 1, 2]], head: 0, tail: 0 };
    case 'CO': return { atoms: [A('C'), A('O')], bonds: [[0, 1, 2]], head: 0, tail: 0 };
    case 'COOH': return { atoms: [A('C'), A('O'), A('O', 1)], bonds: [[0, 1, 2], [0, 2, 1]], head: 0, tail: 2 };
    case 'COO': return { atoms: [A('C'), A('O'), A('O')], bonds: [[0, 1, 2], [0, 2, 1]], head: 0, tail: 2 };
    case 'C2H5': return { atoms: [A('C', 2), A('C', 3)], bonds: [[0, 1, 1]], head: 0, tail: 0 };
    case 'C6H5': return {
      atoms: [A('C'), A('C', 1), A('C', 1), A('C', 1), A('C', 1), A('C', 1)],
      bonds: [[0, 1, 2], [1, 2, 1], [2, 3, 2], [3, 4, 1], [4, 5, 2], [5, 0, 1]], head: 0, tail: 0,
    };
    default: return null;
  }
}

const label = (t) => t.replace(/\((.*)\)/, '$1');

/**
 * blocks (strings) -> { molfile } or { error }.
 * Main chain left to right; "(CH3)" / "(OH)" hang on the block before them;
 * "=" / "≡" make the next bond double / triple.
 */
export function parseRational(blocks) {
  if (!blocks.length) return { error: 'ブロックを並べてください。' };
  const atoms = [];
  const bonds = [];
  const owner = []; // block label per atom, for messages
  let prevTail = null;
  let pending = 1;
  for (let k = 0; k < blocks.length; k++) {
    const t = blocks[k];
    if (t === '=' || t === '≡') {
      if (prevTail === null || k === blocks.length - 1) return { error: `「${t}」は2つのブロックの間に置きます。` };
      pending = t === '=' ? 2 : 3;
      continue;
    }
    const branch = /^\(.*\)$/.test(t);
    const e = expand(label(t));
    if (!e) return { error: `「${t}」は使えません。` };
    const base = atoms.length;
    e.atoms.forEach((a) => { atoms.push({ ...a }); owner.push(label(t)); });
    e.bonds.forEach(([a, b, o]) => bonds.push([base + a, base + b, o]));
    if (prevTail !== null) bonds.push([prevTail, base + e.head, branch ? 1 : pending]);
    else if (branch) return { error: '（ ）の枝は、つながる原子団のあとに置きます。' };
    pending = 1;
    if (!branch) prevTail = base + e.tail;
  }
  // every atom must use exactly its number of bonds (C 4, O 2, N 3, H 1)
  for (let i = 0; i < atoms.length; i++) {
    const used = bonds.reduce((t, [a, b, o]) => t + (a === i || b === i ? o : 0), 0) + atoms[i].h;
    const want = VAL[atoms[i].el];
    if (used > want) return { error: `${owner[i]} の ${atoms[i].el} の結合が ${used} 本になります（${atoms[i].el} は ${want} 本）。` };
    if (used < want) return { error: `${owner[i]} の ${atoms[i].el} の結合が ${want - used} 本たりません。H の数やつなぎ方を見直そう。` };
  }
  // molfile with explicit hydrogens, so RDKit cannot add any
  const all = atoms.map((a) => a.el);
  const allBonds = bonds.slice();
  atoms.forEach((a, i) => { for (let k = 0; k < a.h; k++) { all.push('H'); allBonds.push([i, all.length - 1, 1]); } });
  let s = '\n  chem-touch blocks\n\n';
  s += `${String(all.length).padStart(3)}${String(allBonds.length).padStart(3)}  0  0  0  0  0  0  0  0999 V2000\n`;
  for (const el of all) s += `    0.0000    0.0000    0.0000 ${el.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0\n`;
  for (const [a, b, o] of allBonds) s += `${String(a + 1).padStart(3)}${String(b + 1).padStart(3)}${String(o).padStart(3)}  0\n`;
  return { molfile: s + 'M  END\n' };
}
