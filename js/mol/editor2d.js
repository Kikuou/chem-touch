// Free drawing (spec C-6): the OpenChemLib canvas editor. Its toolbar is
// drawn at a fixed small size, so the whole editor is scaled up with a CSS
// transform for fingers (pointer positions stay correct with transforms;
// they do not with CSS zoom).
const OCL_URL = new URL('../../vendor/openchemlib-9.25.1/openchemlib.js', import.meta.url);
const TOOLBAR_H = 362; // CSS px of the unscaled toolbar
let oclPromise = null;

export function loadOCL() {
  if (!oclPromise) oclPromise = import(OCL_URL.href).catch((e) => { oclPromise = null; throw e; });
  return oclPromise;
}

/**
 * @param {HTMLElement} host  sized box (width from layout, height = `height`)
 * @param {{ height: number, smiles?: string, onChange?: (smiles: string) => void }} o
 */
export async function mountEditor(host, { height, smiles = '', onChange } = {}) {
  const OCL = await loadOCL();
  const scale = Math.max(1, Math.min(1.6, height / TOOLBAR_H));
  const inner = document.createElement('div');
  inner.className = 'ocl-inner';
  host.innerHTML = '';
  host.style.height = `${height}px`;
  host.append(inner);
  const fit = () => {
    inner.style.cssText = `position:absolute;left:0;top:0;transform:scale(${scale});transform-origin:0 0;`
      + `width:${host.clientWidth / scale}px;height:${height / scale}px`;
  };
  fit();
  const editor = new OCL.CanvasEditor(inner);
  const read = () => {
    const m = editor.getMolecule();
    return m.getAllAtoms() ? m.toIsomericSmiles() : '';
  };
  // The editor centres a new molecule using its on-screen (scaled) size,
  // which puts it off to the right; move it to the middle of the canvas.
  const recenter = () => {
    const m = editor.getMolecule();
    const n = m.getAllAtoms();
    const cv = inner.querySelector('[data-openchemlib-canvas-editor]')?.shadowRoot?.querySelectorAll('canvas')[1];
    if (!n || !cv) return;
    let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
    for (let i = 0; i < n; i++) {
      x0 = Math.min(x0, m.getAtomX(i)); x1 = Math.max(x1, m.getAtomX(i));
      y0 = Math.min(y0, m.getAtomY(i)); y1 = Math.max(y1, m.getAtomY(i));
    }
    m.translateCoords(cv.width / 2 - (x0 + x1) / 2, cv.height / 2 - (y0 + y1) / 2);
    editor.moleculeChanged();
  };
  const set = (smi) => {
    try {
      editor.setMolecule(smi ? OCL.Molecule.fromSmiles(smi) : new OCL.Molecule(0, 0));
      if (smi) recenter();
      return true;
    } catch (e) {
      return false;
    }
  };
  if (smiles) set(smiles);
  editor.setOnChangeListener((e) => {
    if (e.type === 'molecule') onChange?.(read());
  });
  const ro = new ResizeObserver(() => fit());
  ro.observe(host);
  return {
    scale,
    getSmiles: read,
    setSmiles: set,
    clear: () => editor.clearAll(),
    destroy: () => { ro.disconnect(); if (!editor.isDestroyed) editor.destroy(); },
  };
}
