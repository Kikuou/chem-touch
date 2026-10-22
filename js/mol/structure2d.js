// 2D structure view (spec A-7 – A-9) drawn with RDKit.js.
//
// Index rule: the 3D molblock (SDF) is the single source. Its atom order is
// "heavy atoms first, hydrogens last" (enforced by scripts/validate_data.py),
// so
//   - all-atom mode draws the molblock with every hydrogen -> index = SDF index
//   - skeletal mode removes the hydrogens -> heavy atom i keeps index i
// Every drawn atom is mapped back to its SDF index through `map`.
import { getRDKit, molGraph, depict } from './rdkit.js';
import { isDark } from '../core/dom.js';

const DARK_PALETTE = {
  '-1': [0.86, 0.88, 0.87], 1: [0.86, 0.88, 0.87], 6: [0.86, 0.88, 0.87],
  7: [0.45, 0.66, 1.0], 8: [1.0, 0.45, 0.47], 9: [0.5, 0.86, 0.65], 15: [1.0, 0.62, 0.3],
  16: [0.95, 0.78, 0.25], 17: [0.35, 0.82, 0.48], 35: [0.85, 0.4, 0.35], 53: [0.7, 0.45, 0.85],
};

export class Structure2D {
  /** @param {HTMLElement} el  @param {object} cb { onAtom(sdfIndex) } */
  constructor(el, cb = {}) {
    this.el = el;
    this.cb = cb;
    this.mode = 'skeletal';
    this.selected = null;
    this.views = {};
    el.addEventListener('click', (e) => this.onClick(e));
  }

  // Build both drawings from a 3D molblock (or, without 3D, from SMILES).
  async setMolecule({ molblock = null, smiles = null }) {
    const RDKit = await getRDKit();
    this.free();
    let full;
    if (molblock) {
      full = RDKit.get_mol(molblock, JSON.stringify({ removeHs: false }));
    } else {
      const tmp = RDKit.get_mol(smiles);
      if (!tmp || !tmp.is_valid()) throw new Error('SMILES を解釈できませんでした');
      full = RDKit.get_mol(tmp.add_hs(), JSON.stringify({ removeHs: false }));
      tmp.delete();
    }
    if (!full || !full.is_valid()) throw new Error('構造を読み込めませんでした');
    this.graph = molGraph(full);
    const heavyIdx = this.graph.atoms.map((a, i) => (a.z > 1 ? i : -1)).filter((i) => i >= 0);

    // skeletal: hydrogens removed, stereo kept (perceived from 3D on load)
    const skel = RDKit.get_mol(full.get_molblock(), JSON.stringify({ removeHs: true }));
    const skeletalOk = skel && skel.is_valid() && skel.get_num_atoms() === heavyIdx.length;

    depict(full);
    this.mols = { full, skel: skeletalOk ? skel : null };
    if (skeletalOk) {
      depict(skel);
    } else if (skel) {
      skel.delete();
    }
    this.maps = {
      full: this.graph.atoms.map((_, i) => i),
      skeletal: skeletalOk ? heavyIdx : null,
    };
    this.graphs = { full: this.graph, skeletal: skeletalOk ? molGraph(skel) : null };
    this.views = {};
    this.render();
  }

  get canSkeletal() { return !!this.maps?.skeletal; }

  setMode(mode) {
    this.mode = mode;
    this.render();
  }

  // Colour functional groups: [{color: '#rrggbb', atoms: [SDF indices]}]
  // (empty array / null switches it off).
  setGroups(groups) {
    this.groups = groups && groups.length ? groups : null;
    this.groupKey = this.groups ? this.groups.map((g) => g.color + g.atoms.join(',')).join('|') : '';
    this.render();
  }

  // Re-draw (also used when the colour scheme changes).
  render() {
    if (!this.mols) return;
    const mode = this.mode === 'skeletal' && this.canSkeletal ? 'skeletal' : 'full';
    const key = mode + (isDark() ? ':d' : ':l') + (this.groupKey || '');
    if (!this.views[key]) this.views[key] = this.draw(mode);
    this.el.innerHTML = this.views[key];
    this.svg = this.el.querySelector('svg');
    this.svg.removeAttribute('width');
    this.svg.removeAttribute('height');
    this.svg.setAttribute('role', 'img');
    this.svg.setAttribute('aria-label', mode === 'skeletal' ? '骨格式' : '全原子表示の構造式');
    this.activeMap = this.maps[mode];
    this.points = [...this.svg.querySelectorAll('ellipse[class^="atom-"]')].map((e) => {
      const idx = parseInt(e.getAttribute('class').slice(5), 10);
      e.classList.add('hit');
      return { el: e, idx, x: +e.getAttribute('cx'), y: +e.getAttribute('cy'), style: e.getAttribute('style') || '' };
    });
    this.paintSelection();
  }

  draw(mode) {
    const mol = mode === 'skeletal' ? this.mols.skel : this.mols.full;
    const n = mol.get_num_atoms();
    const atoms = [...Array(n).keys()];
    const clear = {};
    atoms.forEach((i) => { clear[i] = [0, 0, 0, 0]; });
    const opts = {
      width: 480,
      height: 360,
      atoms,
      bonds: [],
      highlightAtomColors: clear,
      highlightRadius: 0.32,
      atomHighlightsAreCircles: true,
      fillHighlights: true,
      backgroundColour: [0, 0, 0, 0],
      bondLineWidth: 2,
      padding: 0.08,
      clearBackground: false,
    };
    if (isDark()) opts.atomColourPalette = DARK_PALETTE;
    if (this.groups) {
      // SDF index -> drawn index, then colour atoms and bonds inside a group
      const map = mode === 'skeletal' ? this.maps.skeletal : this.maps.full;
      const inv = new Map(map.map((sdf, i) => [sdf, i]));
      const owner = new Map();
      this.groups.forEach((g) => g.atoms.forEach((a) => {
        if (inv.has(a) && !owner.has(inv.get(a))) owner.set(inv.get(a), g);
      }));
      const rgba = (hex, a) => [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16) / 255).concat([a]);
      owner.forEach((g, i) => { opts.highlightAtomColors[i] = rgba(g.color, 0.55); });
      const bonds = [];
      const bondColors = {};
      this.graphs[mode].bonds.forEach((b, k) => {
        const ga = owner.get(b.a);
        if (ga && ga === owner.get(b.b)) { bonds.push(k); bondColors[k] = rgba(ga.color, 0.55); }
      });
      opts.bonds = bonds;
      opts.highlightBondColors = bondColors;
      opts.highlightRadius = 0.36;
    }
    if (mode === 'full') {
      // show every carbon as "C" (A-8: all atoms explicit)
      const labels = {};
      this.graph.atoms.forEach((a, i) => { if (a.z === 6) labels[i] = 'C'; });
      opts.atomLabels = labels;
    }
    return mol.get_svg_with_highlights(JSON.stringify(opts));
  }

  // Highlight by SDF index (null clears). In skeletal mode a hydrogen is
  // shown on the heavy atom it is attached to.
  select(sdfIndex) {
    this.selected = sdfIndex;
    this.paintSelection();
  }

  paintSelection() {
    if (!this.points) return;
    let target = this.selected;
    if (target !== null && this.mode === 'skeletal' && this.graph.atoms[target]?.z === 1) {
      const b = this.graph.bonds.find((x) => x.a === target || x.b === target);
      target = b ? (b.a === target ? b.b : b.a) : null;
    }
    for (const p of this.points) {
      const on = target !== null && this.activeMap[p.idx] === target;
      if (on) {
        p.el.style.fill = 'rgba(255, 194, 26, 0.75)';
        p.el.style.stroke = 'rgba(255, 170, 0, 0.95)';
      } else {
        p.el.setAttribute('style', p.style); // group colour or transparent
      }
    }
  }

  onClick(e) {
    if (!this.svg || !this.points?.length) return;
    const pt = this.svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = this.svg.getScreenCTM();
    if (!ctm) return;
    const p = pt.matrixTransform(ctm.inverse());
    const scale = Math.hypot(ctm.a, ctm.b) || 1;
    let best = null;
    let bestD = 24 / scale; // 24 screen px
    for (const q of this.points) {
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < bestD) { bestD = d; best = q; }
    }
    if (best && this.cb.onAtom) this.cb.onAtom(this.activeMap[best.idx]);
  }

  free() {
    if (this.mols) {
      this.mols.full?.delete();
      this.mols.skel?.delete();
    }
    this.mols = null;
  }

  destroy() {
    this.free();
    this.el.innerHTML = '';
  }
}
