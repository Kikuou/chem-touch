// 3D coordinates for molecules made in the browser (spec C-8), with
// OpenChemLib: ConformerGenerator (torsion statistics from crystal
// structures) followed by a short MMFF94s+ minimisation.
// Runs inside conformer.worker.js; conformer.js falls back to calling it
// on the main thread when module workers are not available.
import * as OCL from '../../vendor/openchemlib-9.25.1/openchemlib.js';

const RESOURCES = new URL('../../vendor/openchemlib-9.25.1/resources-conformer.json', import.meta.url);
let ready = null;

function init() {
  if (!ready) {
    ready = fetch(RESOURCES)
      .then((r) => {
        if (!r.ok) throw new Error(`resources: HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => OCL.Resources.register(data))
      .catch((e) => { ready = null; throw e; });
  }
  return ready;
}

/**
 * SMILES -> molfile (V2000) with explicit hydrogens after the heavy atoms
 * (the 2D/3D index rule of the viewer). Throws when no conformer is found.
 */
export async function embed(smiles, seed = 42) {
  await init();
  const mol = OCL.Molecule.fromSmiles(smiles);
  const conf = new OCL.ConformerGenerator(seed).getOneConformerAsMolecule(mol);
  if (!conf) throw new Error('3D 配座を作れませんでした');
  try {
    new OCL.ForceFieldMMFF94(conf, 'MMFF94s+').minimise({ maxIts: 500 });
  } catch (e) {
    // MMFF has no parameters for some atoms (metals); keep the
    // conformer generator's geometry
  }
  return conf.toMolfile();
}
