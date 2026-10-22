// Functional-group detection with SMARTS (spec A-10 – A-12, B-2).
import { getRDKit } from './rdkit.js';
import { functionalGroups } from '../core/data.js';

const qcache = new Map();

/**
 * Find functional groups.
 * @param {{molblock?: string, smiles?: string}} src  a 3D molblock (atom
 *   indices then refer to the SDF; hydrogens come last there) or a SMILES
 *   (indices follow the SMILES atom order)
 * @returns {Promise<Array<{group, matches: number[][]}>>} heavy-atom indices
 */
export async function matchFunctionalGroups(src) {
  const [RDKit, groups] = await Promise.all([getRDKit(), functionalGroups()]);
  const mol = src.molblock
    ? RDKit.get_mol(src.molblock, JSON.stringify({ removeHs: true }))
    : RDKit.get_mol(src.smiles);
  if (!mol || !mol.is_valid()) return [];
  const out = [];
  try {
    for (const g of groups) {
      let q = qcache.get(g.id);
      if (!q) { q = RDKit.get_qmol(g.smarts); qcache.set(g.id, q); }
      const parsed = JSON.parse(mol.get_substruct_matches(q) || '[]');
      const res = Array.isArray(parsed) ? parsed : [];
      // one occurrence per first atom (e.g. a phosphodiester has two P-O-C
      // matches but is one phosphate group)
      const seen = new Set();
      const matches = res.map((m) => m.atoms).filter((a) => !seen.has(a[0]) && seen.add(a[0]));
      if (matches.length) out.push({ group: g, matches });
    }
  } finally {
    mol.delete();
  }
  return out;
}

/**
 * Turn matches into colour groups for the viewers: one entry per match,
 * hydrogens bonded to the matched atoms added (graph = full-atom graph in
 * SDF order). An atom keeps the colour of the first group that claims it.
 */
export function highlightGroups(found, graph, only = null) {
  const taken = new Set();
  const out = [];
  for (const f of found) {
    if (only && !only.has(f.group.id)) continue;
    for (const m of f.matches) {
      const atoms = m.filter((i) => !taken.has(i));
      if (!atoms.length) continue;
      const set = new Set(atoms);
      if (graph) {
        for (const b of graph.bonds) {
          if (set.has(b.a) && graph.atoms[b.b].z === 1) set.add(b.b);
          if (set.has(b.b) && graph.atoms[b.a].z === 1) set.add(b.a);
        }
      }
      set.forEach((i) => taken.add(i));
      out.push({ id: f.group.id, color: f.group.color, label: f.group.short || f.group.name, atoms: [...set] });
    }
  }
  return out;
}
