// "くわしい表示" (detailed view): off by default. When on, the expert parts
// are shown: triple bonds in the drawing, SMILES input, the advanced editor,
// and SMILES / InChIKey in the molecule data. Saved on this device only.
import { prefs } from './dom.js';

export function isDetail() {
  return prefs.get('detail', '0') === '1';
}

export function setDetail(on) {
  prefs.set('detail', on ? '1' : null);
  window.dispatchEvent(new Event('chemtouch:detail'));
}
