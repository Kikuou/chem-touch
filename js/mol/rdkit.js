// Lazy loader for RDKit.js (MinimalLib, WebAssembly, ~7 MB uncompressed).
// Only screens that draw 2D structures call getRDKit(), so the home screen
// stays light (spec §7: heavy WASM is loaded on demand).
import { loadScript } from '../core/dom.js';

const dir = new URL('../../vendor/rdkit-2026.3.6/', import.meta.url);
let promise = null;

export function getRDKit() {
  if (!promise) {
    promise = loadScript(new URL('RDKit_minimal.js', dir))
      .then(() => window.initRDKitModule({ locateFile: (f) => new URL(f, dir).toString() }))
      .catch((e) => { promise = null; throw e; });
  }
  return promise;
}

// Start downloading in the background (e.g. while the user browses the list).
export function preloadRDKit() {
  getRDKit().catch(() => {});
}

// Graph information (atoms, bonds, aromaticity, charges) of an RDKit mol.
export function molGraph(mol) {
  const j = JSON.parse(mol.get_json());
  const m = j.molecules[0];
  const da = j.defaults.atom;
  const db = j.defaults.bond;
  const ext = (m.extensions || []).find((e) => e.name === 'rdkitRepresentation') || {};
  const aromatic = new Set(ext.aromaticBonds || []);
  const atoms = m.atoms.map((a) => ({ z: a.z ?? da.z, chg: a.chg ?? da.chg, impHs: a.impHs ?? da.impHs }));
  const bonds = (m.bonds || []).map((b, i) => ({ a: b.atoms[0], b: b.atoms[1], order: b.bo ?? db.bo, aromatic: aromatic.has(i) }));
  return { atoms, bonds };
}
