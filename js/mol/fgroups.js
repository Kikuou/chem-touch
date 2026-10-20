// Functional-group detection with SMARTS (spec A-11, B-2 "含まれる官能基").
// M1 only lists the groups; M2 will reuse matchFunctionalGroups() to
// highlight the matched atoms in the viewers (A-10).
import { getRDKit } from './rdkit.js';
import { functionalGroups } from '../core/data.js';

const qcache = new Map();

/** @returns {Promise<Array<{group, matches: number[][]}>>} atom indices refer to the heavy-atom graph of the SMILES */
export async function matchFunctionalGroups(smiles) {
  const [RDKit, groups] = await Promise.all([getRDKit(), functionalGroups()]);
  const mol = RDKit.get_mol(smiles);
  if (!mol || !mol.is_valid()) return [];
  const out = [];
  try {
    for (const g of groups) {
      let q = qcache.get(g.id);
      if (!q) { q = RDKit.get_qmol(g.smarts); qcache.set(g.id, q); }
      const parsed = JSON.parse(mol.get_substruct_matches(q) || '[]');
      const res = Array.isArray(parsed) ? parsed : [];
      if (res.length) out.push({ group: g, matches: res.map((m) => m.atoms) });
    }
  } finally {
    mol.delete();
  }
  return out;
}
