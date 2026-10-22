// 3D molecule viewer (spec A-1 – A-6, A-9) on top of 3Dmol.js.
//
// Atom indices are the atom order of the SDF; the 2D view uses the same
// order (see structure2d.js), which is what makes 2D <-> 3D linking work.
import { loadScript, isDark } from '../core/dom.js';
import { ATOM_COLORS } from './elements.js';

const LIB = new URL('../../vendor/3dmol-2.5.4/3Dmol-min.js', import.meta.url);

export async function load3Dmol() {
  if (!window.$3Dmol) await loadScript(LIB);
  return window.$3Dmol;
}

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch (e) {
    return false;
  }
}

const hex = (s) => parseInt(s.slice(1), 16);
function colorscheme() {
  const pal = isDark() ? ATOM_COLORS.dark : ATOM_COLORS.light;
  const map = {};
  for (const [k, v] of Object.entries(pal)) map[k] = hex(v);
  return { prop: 'elem', map };
}

// van der Waals radii (Angstrom) as used by 3Dmol for sphere sizes
const VDW = { H: 1.2, C: 1.7, N: 1.55, O: 1.52, F: 1.47, P: 1.8, S: 1.8, Cl: 1.75, Na: 2.27 };

// radii (Angstrom) used only to draw the NaCl lattice nicely
const ION_RADIUS = { Na: 1.02, Cl: 1.81 };

export class Viewer3D {
  /**
   * @param {HTMLElement} el container (must have a size)
   * @param {object} cb  onAtom(index), onBond(i, j), onEmpty()
   */
  constructor(el, cb = {}) {
    this.el = el;
    this.cb = cb;
    this.style = 'ballstick';
    this.showH = true;
    this.spinning = false;
    this.selected = null;
    this.selShape = null;
    this.pendingAtom = null;
    this.lastTap = { t: 0, x: 0, y: 0 };
  }

  async init() {
    const $3Dmol = await load3Dmol();
    this.viewer = $3Dmol.createViewer(this.el, { antialias: true, id: 'v3d-' + Math.random().toString(36).slice(2) });
    this.el.__viewer3d = this; // handle for automated tests
    this.ro = new ResizeObserver(() => { this.viewer.resize(); this.viewer.render(); });
    this.ro.observe(this.el);
    this.bindTaps();
    return this;
  }

  /** @param {string} sdf  @param {object} opts { crystal: 'nacl'|'diamond'|'graphite'|null } */
  load(sdf, opts = {}) {
    const v = this.viewer;
    v.clear();
    this.crystal = opts.crystal || null;
    this.model = v.addModel(sdf, 'sdf', { keepH: true });
    this.atoms = this.model.selectedAtoms({});
    this.hasH = this.atoms.some((a) => a.elem === 'H');
    // 3Dmol reports a tap on a stick as a tap on one of its atoms; the
    // pointer handler below decides whether it was really the atom.
    this.model.setClickable({}, true, (atom) => {
      this.pendingAtom = { index: atom.index, t: performance.now() };
    });
    this.applyStyle();
    v.zoomTo();
    v.zoom(this.crystal ? 0.95 : 1.2);
    this.home = v.getView();
    v.render();
  }

  applyStyle() {
    const v = this.viewer;
    const cs = colorscheme();
    // paint the canvas with the panel colour (transparent canvases are not
    // reliable across 3Dmol/WebGL implementations)
    const bg = getComputedStyle(this.el).getPropertyValue('--surface').trim() || '#ffffff';
    v.setBackgroundColor(bg, 1);
    let style;
    if (this.style === 'spacefill') style = { sphere: { colorscheme: cs } };
    else if (this.style === 'stick') style = { stick: { radius: 0.2, colorscheme: cs } };
    else style = { stick: { radius: 0.13, colorscheme: cs }, sphere: { scale: 0.27, colorscheme: cs } };
    this.model.setStyle({}, style);
    if (this.crystal === 'nacl') {
      const k = this.style === 'spacefill' ? 1 : this.style === 'stick' ? 0.3 : 0.5;
      for (const el of ['Na', 'Cl']) {
        this.model.setStyle({ elem: el }, { sphere: { radius: ION_RADIUS[el] * k, colorscheme: cs } });
      }
    }
    if (!this.showH) this.model.setStyle({ elem: 'H' }, {});
    v.removeAllShapes();
    this.selShape = null;
    if (this.crystal === 'nacl') this.drawCell();
    if (this.selected !== null) this.drawSelection();
    v.render();
  }

  drawCell() {
    // edges of the cubic unit cell (atoms span 0 .. 2d on each axis)
    const xs = this.atoms.map((a) => a.x);
    const lo = Math.min(...xs);
    const hi = Math.max(...xs);
    const c = isDark() ? 0x8A948F : 0x9AA3AE;
    const corners = [];
    for (const x of [lo, hi]) for (const y of [lo, hi]) for (const z of [lo, hi]) corners.push({ x, y, z });
    for (let i = 0; i < 8; i++) {
      for (let j = i + 1; j < 8; j++) {
        const a = corners[i];
        const b = corners[j];
        const diff = (a.x !== b.x) + (a.y !== b.y) + (a.z !== b.z);
        if (diff === 1) this.viewer.addCylinder({ start: a, end: b, radius: 0.04, color: c, fromCap: 1, toCap: 1 });
      }
    }
  }

  setStyle(style) { this.style = style; this.applyStyle(); }
  setHydrogens(on) { this.showH = on; if (!on && this.selected !== null && this.atoms[this.selected]?.elem === 'H') this.selected = null; this.applyStyle(); }

  setSpin(on) {
    this.spinning = on;
    this.viewer.spin(on ? 'y' : false, 0.6);
  }

  reset() {
    if (this.home) this.viewer.setView(this.home);
    this.viewer.render();
  }

  // Highlight one atom (index in SDF order), or clear with null.
  select(index) {
    this.selected = index;
    if (this.selShape) { this.viewer.removeShape(this.selShape); this.selShape = null; }
    if (index !== null) this.drawSelection();
    this.viewer.render();
  }

  drawSelection() {
    const a = this.atoms[this.selected];
    if (!a || (a.elem === 'H' && !this.showH)) return;
    const r = this.style === 'spacefill' ? 2.0 : a.elem === 'H' ? 0.55 : 0.75;
    this.selShape = this.viewer.addSphere({ center: { x: a.x, y: a.y, z: a.z }, radius: r, color: 0xFFC21A, opacity: 0.55 });
  }

  atom(index) { return this.atoms[index]; }

  distance(i, j) {
    const a = this.atoms[i];
    const b = this.atoms[j];
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  }

  // Taps: atoms are picked by 3Dmol; for bonds we project bond segments to
  // the screen and take the nearest one. Double tap resets the view (A-1).
  bindTaps() {
    let down = null;
    this.onDown = (e) => {
      if (!e.isPrimary) return;
      down = { x: e.clientX, y: e.clientY, t: performance.now(), multi: false };
    };
    this.onUp = (e) => {
      if (!down || !e.isPrimary) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const dt = performance.now() - down.t;
      down = null;
      if (moved > 8 || dt > 400) return;
      const now = performance.now();
      // 3Dmol's modelToScreen() returns page coordinates
      const x = e.pageX;
      const y = e.pageY;
      if (now - this.lastTap.t < 320 && Math.hypot(x - this.lastTap.x, y - this.lastTap.y) < 30) {
        this.lastTap.t = 0;
        this.reset();
        return;
      }
      this.lastTap = { t: now, x, y };
      // let 3Dmol's own click handling (touchend/mouseup) run first
      setTimeout(() => {
        const hit = this.pendingAtom && performance.now() - this.pendingAtom.t < 300 ? this.pendingAtom.index : null;
        this.pendingAtom = null;
        if (hit !== null && this.onAtomBall(hit, x, y)) {
          if (this.cb.onAtom) this.cb.onAtom(hit);
          return;
        }
        const bond = this.pickBond(x, y);
        if (bond) { if (this.cb.onBond) this.cb.onBond(bond[0], bond[1]); }
        else if (hit !== null) { if (this.cb.onAtom) this.cb.onAtom(hit); }
        else if (this.cb.onEmpty) this.cb.onEmpty();
      }, 60);
    };
    this.el.addEventListener('pointerdown', this.onDown);
    this.el.addEventListener('pointerup', this.onUp);
  }

  // Is the page point (x, y) on the drawn sphere of atom i (not its sticks)?
  onAtomBall(i, x, y) {
    if (this.style === 'spacefill' || this.crystal === 'nacl') return true;
    const a = this.atoms[i];
    const c = this.viewer.modelToScreen({ x: a.x, y: a.y, z: a.z });
    // pixels per Angstrom: the least foreshortened bond gives the scale
    let scale = 0;
    for (const b of this.atoms) {
      for (const j of b.bonds) {
        const q = this.atoms[j];
        const p1 = this.viewer.modelToScreen({ x: b.x, y: b.y, z: b.z });
        const p2 = this.viewer.modelToScreen({ x: q.x, y: q.y, z: q.z });
        scale = Math.max(scale, Math.hypot(p1.x - p2.x, p1.y - p2.y) / (this.distance(b.index, j) || 1));
      }
    }
    if (!scale) return true;
    const r = this.style === 'stick' ? 0.2 : 0.27 * (VDW[a.elem] || 1.7);
    return Math.hypot(x - c.x, y - c.y) <= Math.max(r * scale * 1.15, 10);
  }

  pickBond(x, y) {
    if (this.style === 'spacefill' || !this.atoms) return null;
    let best = null;
    let bestD = 14; // px
    const scr = this.atoms.map((a) => this.viewer.modelToScreen({ x: a.x, y: a.y, z: a.z }));
    for (const a of this.atoms) {
      for (const j of a.bonds) {
        if (j <= a.index) continue;
        const b = this.atoms[j];
        if (!this.showH && (a.elem === 'H' || b.elem === 'H')) continue;
        const p = scr[a.index];
        const q = scr[j];
        const d = segDist(x, y, p.x, p.y, q.x, q.y);
        if (d < bestD) { bestD = d; best = [a.index, j]; }
      }
    }
    return best;
  }

  destroy() {
    if (!this.viewer) return;
    this.el.removeEventListener('pointerdown', this.onDown);
    this.el.removeEventListener('pointerup', this.onUp);
    this.ro?.disconnect();
    try {
      this.viewer.spin(false);
      this.viewer.clear();
      const canvas = this.el.querySelector('canvas');
      const gl = canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl'));
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch (e) { /* ignore */ }
    this.el.innerHTML = '';
    this.viewer = null;
  }
}

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0.15, Math.min(0.85, t)); // ignore the atom ends
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
