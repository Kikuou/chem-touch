// 3D model for a molecule given as SMILES (spec C-8): used by #/view when
// the molecule is not in the library (molecules made in the builder,
// shared URLs). The heavy work runs in a module worker; the result is
// checked with RDKit.js: same connectivity, and the cis/trans and R/S
// written in the SMILES must survive in the 3D coordinates.
import { getRDKit } from './rdkit.js';

const SEEDS = [42, 7, 2024];
const TIMEOUT_MS = 40000;
const cache = new Map();

let worker = null;
let workerBroken = false;
let nextId = 1;
const pending = new Map();

function getWorker() {
  if (worker || workerBroken) return worker;
  try {
    worker = new Worker(new URL('./conformer.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.error) p.reject(new Error(e.data.error));
      else p.resolve(e.data.molfile);
    };
    worker.onerror = (e) => {
      // e.g. a browser without module workers: use the main thread instead
      e.preventDefault?.();
      workerBroken = true;
      worker?.terminate();
      worker = null;
      const waiting = [...pending.values()];
      pending.clear();
      waiting.forEach((p) => p.retry());
    };
  } catch (e) {
    workerBroken = true;
    worker = null;
  }
  return worker;
}

async function onMainThread(smiles, seed) {
  const { embed } = await import('./conformer-core.js');
  return embed(smiles, seed);
}

function embed(smiles, seed) {
  const w = getWorker();
  if (!w) return onMainThread(smiles, seed);
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('3D 配座の計算に時間がかかりすぎました'));
    }, TIMEOUT_MS);
    const done = (fn) => (v) => { clearTimeout(timer); fn(v); };
    pending.set(id, {
      resolve: done(resolve),
      reject: done(reject),
      retry: () => { clearTimeout(timer); onMainThread(smiles, seed).then(resolve, reject); },
    });
    w.postMessage({ id, smiles, seed });
  });
}

// "/t2-,3+" style stereo layers of an InChI ({} when there are none)
function stereoLayers(inchi) {
  const out = {};
  for (const part of inchi.split('/').slice(1)) {
    if (/^[btms]/.test(part)) out[part[0]] = part.slice(1);
  }
  return out;
}

/**
 * Does the 3D molfile show the molecule written as SMILES?
 * @returns {{ ok: boolean, reason?: string }}
 */
export function checkConformer(RDKit, smiles, molfile) {
  const a = RDKit.get_mol(smiles);
  const b = RDKit.get_mol(molfile, JSON.stringify({ removeHs: false }));
  try {
    if (!a || !b) return { ok: false, reason: '構造を読み取れません' };
    const ia = a.get_inchi();
    const ib = b.get_inchi();
    const ka = RDKit.get_inchikey_for_inchi(ia);
    const kb = RDKit.get_inchikey_for_inchi(ib);
    if (ka.slice(0, 14) !== kb.slice(0, 14)) return { ok: false, reason: '原子のつながりが変わりました' };
    const sa = stereoLayers(ia);
    if (!sa.b && !sa.t) return { ok: true }; // nothing specified in the SMILES
    if (ia.includes('?')) return { ok: true }; // partly specified: not compared
    if (ka !== kb) return { ok: false, reason: '立体（シス/トランス・R/S）が SMILES と一致しません' };
    return { ok: true };
  } finally {
    a?.delete();
    b?.delete();
  }
}

/**
 * @returns {Promise<{ sdf: string, seed: number }>} rejects when no
 *   conformer reproducing the SMILES was found
 */
export function conformerFor(smiles) {
  if (!cache.has(smiles)) {
    const job = (async () => {
      const RDKit = await getRDKit();
      let last = '3D 配座を作れませんでした';
      for (const seed of SEEDS) {
        let molfile;
        try {
          molfile = await embed(smiles, seed);
        } catch (e) {
          last = e.message;
          continue;
        }
        const r = checkConformer(RDKit, smiles, molfile);
        if (r.ok) return { sdf: molfile, seed };
        last = r.reason;
      }
      throw new Error(last);
    })();
    job.catch(() => cache.delete(smiles));
    cache.set(smiles, job);
  }
  return cache.get(smiles);
}
