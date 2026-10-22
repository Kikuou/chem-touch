// Module worker: keeps the page responsive while OpenChemLib computes a
// conformer (one to a few seconds on a phone).
import { embed } from './conformer-core.js';

self.onmessage = async (e) => {
  const { id, smiles, seed } = e.data;
  try {
    self.postMessage({ id, molfile: await embed(smiles, seed) });
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message ? err.message : err) });
  }
};
