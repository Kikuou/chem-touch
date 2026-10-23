// "かんたん作図": a small touch-first structure editor on a triangular
// lattice (bonds snap to 60° steps, so carbon chains come out as tidy
// zigzags). Tools: bond (single / double / triple), O, N, other elements,
// eraser. Two ways of showing the drawing:
//   skeletal  骨格構造式: carbons are corners, H on carbon not drawn
//   full      構造式: every atom labelled, hydrogens drawn by the student
// The molecule is exported as a V2000 molfile; RDKit.js turns it into
// SMILES (implicit hydrogens filled in), so "the right molecule" is checked
// the same way whichever way it was drawn.

const VALENCE = { C: 4, N: 3, O: 2, S: 2, H: 1, F: 1, Cl: 1, Br: 1, I: 1, P: 3 };
const L = 38; // bond length in px
const HIT = 17;

export function mountSketch(host, { height = 320, mode = 'skeletal', onChange, onMessage } = {}) {
  let atoms = []; // { id, el, x, y }
  let bonds = []; // { a, b, order }
  let nextId = 1;
  let tool = 'bond';
  let showMode = mode;
  const undo = [];
  const snapshot = () => JSON.stringify({ atoms, bonds, nextId });
  const restore = (s) => { const o = JSON.parse(s); atoms = o.atoms; bonds = o.bonds; nextId = o.nextId; };
  const save = () => { undo.push(snapshot()); if (undo.length > 80) undo.shift(); };

  host.innerHTML = '';
  host.classList.add('sk-host');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'sk');
  svg.setAttribute('role', 'application');
  svg.setAttribute('aria-label', '作図エリア。ドラッグで結合をのばす。原子や結合をタップして変える。');
  svg.style.height = `${height}px`;
  host.append(svg);
  let W = host.clientWidth || 340;
  const H = height;
  const DY = L * Math.sqrt(3) / 2;

  // lattice: columns DY apart, every other column shifted by L/2, so the
  // bond directions are ±30°, ±90°, ±150° (the usual zigzag of skeletal
  // formulas)
  const node = (x, y) => {
    const c = Math.round(x / DY);
    const off = (c % 2 ? L / 2 : 0);
    const r = Math.round((y - off) / L);
    return { x: c * DY, y: r * L + off };
  };
  const atomAt = (x, y, except = null) => {
    let best = null;
    let bd = HIT;
    for (const a of atoms) {
      if (a.id === except) continue;
      const d = Math.hypot(a.x - x, a.y - y);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  };
  const bondAt = (x, y) => {
    let best = null;
    let bd = 12;
    for (const b of bonds) {
      const A = byId(b.a);
      const B = byId(b.b);
      const d = segDist(x, y, A.x, A.y, B.x, B.y);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  };
  const byId = (id) => atoms.find((a) => a.id === id);
  const bondsOf = (id) => bonds.filter((b) => b.a === id || b.b === id);
  const used = (id) => bondsOf(id).reduce((t, b) => t + b.order, 0);
  const free = (a) => (VALENCE[a.el] ?? 4) - used(a.id);

  function say(msg) { onMessage?.(msg); }

  function addAtom(el, x, y) {
    const a = { id: nextId++, el, x, y };
    atoms.push(a);
    return a;
  }

  function addBond(A, B, order) {
    if (A.id === B.id) return null;
    const ex = bonds.find((b) => (b.a === A.id && b.b === B.id) || (b.a === B.id && b.b === A.id));
    if (ex) return setOrder(ex, order) ? ex : null;
    if (free(A) < order || free(B) < order) {
      say(`${free(A) < order ? A.el : B.el} の手（結合の数）が足りません。C は4本、N は3本、O は2本です。`);
      return null;
    }
    const b = { a: A.id, b: B.id, order };
    bonds.push(b);
    return b;
  }

  function setOrder(b, order) {
    const A = byId(b.a);
    const B = byId(b.b);
    const extra = order - b.order;
    if (extra > 0 && (free(A) < extra || free(B) < extra)) {
      say(`${free(A) < extra ? A.el : B.el} の手が足りないので、${order === 2 ? '二重' : '三重'}結合にできません。`);
      return false;
    }
    b.order = order;
    return true;
  }

  // direction for "tap to grow": keep zigzag (120°) away from existing bonds
  function growDirection(a) {
    const angles = bondsOf(a.id).map((b) => {
      const o = byId(b.a === a.id ? b.b : b.a);
      return Math.atan2(o.y - a.y, o.x - a.x);
    });
    const cands = [0, 1, 2, 3, 4, 5].map((k) => (k * Math.PI) / 3 + Math.PI / 6);
    let best = null;
    let bestScore = -1;
    for (const t of cands) {
      const x = a.x + L * Math.cos(t);
      const y = a.y + L * Math.sin(t);
      if (x < 12 || x > W - 12 || y < 12 || y > H - 12) continue;
      if (atomAt(x, y)) continue;
      const minGap = angles.length ? Math.min(...angles.map((u) => Math.abs(Math.atan2(Math.sin(t - u), Math.cos(t - u))))) : Math.PI;
      // prefer 120° from a single neighbour (zigzag), and going right
      const zig = angles.length === 1 ? -Math.abs(minGap - (2 * Math.PI) / 3) : minGap;
      const score = zig * 10 + Math.cos(t) * 0.5;
      if (score > bestScore) { bestScore = score; best = { x, y }; }
    }
    return best;
  }

  const ELEMENT_TOOLS = ['O', 'N', 'H', 'Cl', 'Br', 'F', 'I', 'S', 'C'];
  const orderOfTool = () => (tool === 'double' ? 2 : tool === 'triple' ? 3 : 1);

  function changed() {
    draw();
    onChange?.(api);
  }

  // ---------------------------------------------------------- pointer
  let drag = null;
  const pt = (e) => {
    const r = svg.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  svg.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary) return;
    svg.setPointerCapture(e.pointerId);
    const p = pt(e);
    drag = { start: p, from: atomAt(p.x, p.y), bond: null, moved: false, cur: p };
  });
  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = pt(e);
    drag.cur = p;
    if (Math.hypot(p.x - drag.start.x, p.y - drag.start.y) > 10) drag.moved = true;
    if (drag.moved && (tool === 'bond' || tool === 'double' || tool === 'triple' || ELEMENT_TOOLS.includes(tool))) drawPreview();
  });
  svg.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    const p = pt(e);
    if (d.moved) dragged(d, p);
    else tapped(d.start);
    changed();
  });
  svg.addEventListener('pointercancel', () => { drag = null; draw(); });

  // end point of a drag from atom A: another atom under the finger, or the
  // lattice neighbour in the dragged direction (60° steps), one bond long
  function dragEnd(A, p) {
    const hit = atomAt(p.x, p.y, A.id);
    if (hit) return { atom: hit };
    const t = Math.atan2(p.y - A.y, p.x - A.x);
    const step = Math.PI / 3;
    const k = Math.round((t - Math.PI / 6) / step);
    const tt = k * step + Math.PI / 6;
    const x = A.x + L * Math.cos(tt);
    const y = A.y + L * Math.sin(tt);
    const there = atomAt(x, y, A.id);
    return there ? { atom: there } : { x, y };
  }

  function dragged(d, p) {
    if (tool === 'erase') return;
    save();
    let A = d.from;
    if (!A) {
      const n = node(d.start.x, d.start.y);
      A = atomAt(n.x, n.y) || addAtom('C', n.x, n.y);
    }
    const end = dragEnd(A, p);
    const el = ELEMENT_TOOLS.includes(tool) ? tool : 'C';
    const B = end.atom || addAtom(el, end.x, end.y);
    if (!addBond(A, B, ELEMENT_TOOLS.includes(tool) ? 1 : orderOfTool())) {
      if (!end.atom) atoms = atoms.filter((a) => a.id !== B.id);
      if (!d.from && !bondsOf(A.id).length && atoms.length > 1) atoms = atoms.filter((a) => a.id !== A.id);
    }
  }

  function tapped(p) {
    const a = atomAt(p.x, p.y);
    const b = a ? null : bondAt(p.x, p.y);
    if (tool === 'erase') {
      if (a) { save(); bonds = bonds.filter((x) => x.a !== a.id && x.b !== a.id); atoms = atoms.filter((x) => x.id !== a.id); }
      else if (b) { save(); bonds = bonds.filter((x) => x !== b); }
      return;
    }
    if (b) {
      save();
      if (tool === 'bond') setOrder(b, b.order % 3 + 1) || setOrder(b, 1);
      else if (tool === 'double') setOrder(b, b.order === 2 ? 1 : 2);
      else if (tool === 'triple') setOrder(b, b.order === 3 ? 1 : 3);
      return;
    }
    if (a) {
      if (ELEMENT_TOOLS.includes(tool)) {
        if (a.el === tool) return;
        if (used(a.id) > (VALENCE[tool] ?? 4)) { say(`${tool} の手は${VALENCE[tool]}本なので、この原子を ${tool} にはできません。`); return; }
        save();
        a.el = tool;
        return;
      }
      // bond tools: grow a new carbon from this atom
      const order = orderOfTool();
      if (free(a) < order) { say(`${a.el} の手がもう残っていません。`); return; }
      const dir = growDirection(a);
      if (!dir) { say('のばす場所がありません。'); return; }
      save();
      const n = addAtom('C', dir.x, dir.y);
      addBond(a, n, order);
      return;
    }
    // empty place: a new atom
    const n = node(p.x, p.y);
    if (n.x < 10 || n.x > W - 10 || n.y < 10 || n.y > H - 10) return;
    save();
    addAtom(ELEMENT_TOOLS.includes(tool) ? tool : 'C', n.x, n.y);
  }

  // ---------------------------------------------------------- drawing
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function implicitH(a) {
    if (!(a.el in VALENCE) || a.el === 'H') return 0;
    return Math.max(0, VALENCE[a.el] - used(a.id));
  }

  function label(a) {
    if (showMode === 'full') return a.el;
    if (a.el === 'C') return bondsOf(a.id).length ? '' : `CH${implicitH(a) > 1 ? implicitH(a) : ''}`;
    const h = implicitH(a);
    if (!h) return a.el;
    // H on the side away from the bonds
    const left = bondsOf(a.id).some((b) => byId(b.a === a.id ? b.b : b.a).x > a.x + 4);
    const hh = h > 1 ? `H${h}` : 'H';
    return left ? `${hh}${a.el}` : `${a.el}${hh}`;
  }

  function lattice() {
    let s = '';
    for (let c = 0; c * DY < W + DY; c++) {
      const off = c % 2 ? L / 2 : 0;
      for (let r = 0; r * L + off < H + L; r++) s += `<circle cx="${c * DY}" cy="${r * L + off}" r="1.6"/>`;
    }
    return `<g class="sk-lat">${s}</g>`;
  }

  function labelSvg(text, x, y, el) {
    const parts = text.split(/(\d+)/).filter(Boolean);
    const body = parts.map((q) => (/^\d+$/.test(q) ? `<tspan class="sk-sub" dy="4">${q}</tspan><tspan dy="-4"></tspan>` : esc(q))).join('');
    return `<text x="${x}" y="${y}" class="sk-l sk-${el}">${body}</text>`;
  }

  let bg = '';
  function draw(extra = '') {
    W = host.clientWidth || W;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    if (!bg || bg.w !== W) bg = { w: W, s: lattice() };
    let b = '';
    for (const x of bonds) {
      const A = byId(x.a);
      const B = byId(x.b);
      const la = label(A);
      const lb = label(B);
      const g1 = la ? 9 + Math.max(0, la.length - 2) * 2 : 0;
      const g2 = lb ? 9 + Math.max(0, lb.length - 2) * 2 : 0;
      b += bondSvg(A, B, x.order, g1, g2);
    }
    let a = '';
    for (const x of atoms) {
      const t = label(x);
      a += `<circle class="sk-node${t ? '' : ' c'}" cx="${x.x}" cy="${x.y}" r="${t ? 11 : 4}"/>`;
      if (t) a += labelSvg(t, x.x, x.y, x.el);
    }
    const hint = atoms.length ? '' : `<text class="sk-hint" x="${W / 2}" y="${H / 2}">ここをタップするか、ドラッグして描きはじめる</text>`;
    svg.innerHTML = bg.s + `<g class="sk-b">${b}</g>` + a + extra + hint;
  }

  function bondSvg(A, B, order, g1, g2) {
    const len = Math.hypot(B.x - A.x, B.y - A.y) || 1;
    const ux = (B.x - A.x) / len;
    const uy = (B.y - A.y) / len;
    const ax = A.x + ux * g1; const ay = A.y + uy * g1;
    const bx = B.x - ux * g2; const by = B.y - uy * g2;
    const offs = order === 2 ? [-3, 3] : order === 3 ? [-5, 0, 5] : [0];
    return offs.map((o) => `<line x1="${(ax - uy * o).toFixed(1)}" y1="${(ay + ux * o).toFixed(1)}" x2="${(bx - uy * o).toFixed(1)}" y2="${(by + ux * o).toFixed(1)}"/>`).join('');
  }

  function drawPreview() {
    if (!drag) return;
    let A = drag.from;
    const start = A || node(drag.start.x, drag.start.y);
    const end = dragEnd(A || { ...start, id: -1 }, drag.cur);
    const B = end.atom || end;
    draw(`<line class="sk-pre" x1="${start.x}" y1="${start.y}" x2="${B.x}" y2="${B.y}"/><circle class="sk-pre-dot" cx="${B.x}" cy="${B.y}" r="8"/>`);
    void A;
  }

  // ---------------------------------------------------------- export
  function molfile() {
    const idx = new Map(atoms.map((a, i) => [a.id, i + 1]));
    const f = (v, w = 10) => v.toFixed(4).padStart(w);
    let s = '\n  chem-touch sketch\n\n';
    s += `${String(atoms.length).padStart(3)}${String(bonds.length).padStart(3)}  0  0  0  0  0  0  0  0999 V2000\n`;
    for (const a of atoms) s += `${f(a.x / L * 1.5)}${f(-a.y / L * 1.5)}${f(0)} ${a.el.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0\n`;
    for (const b of bonds) s += `${String(idx.get(b.a)).padStart(3)}${String(idx.get(b.b)).padStart(3)}${String(b.order).padStart(3)}  0\n`;
    return s + 'M  END\n';
  }

  // hydrogens still missing in "full" mode (all hydrogens drawn by hand)
  function missingH() {
    return atoms.filter((a) => a.el !== 'H').reduce((t, a) => t + implicitH(a), 0);
  }

  // place a molecule given as a molfile with 2D coordinates (RDKit output:
  // bond length ~1.5) in the middle of the canvas
  function load(mb, { append = false } = {}) {
    const lines = mb.split(/\r?\n/);
    const na = parseInt(lines[3].slice(0, 3), 10);
    const nb = parseInt(lines[3].slice(3, 6), 10);
    const raw = [];
    for (let i = 0; i < na; i++) {
      const l = lines[4 + i];
      raw.push({ x: +l.slice(0, 10), y: -l.slice(10, 20), el: l.slice(31, 34).trim() });
    }
    const keep = raw.map((a) => a.el !== 'H' || showMode === 'full');
    const sc = L / 1.5;
    const xs = raw.map((a) => a.x * sc);
    const ys = raw.map((a) => a.y * sc);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    save();
    if (!append) { atoms = []; bonds = []; }
    const dx = append && atoms.length ? W * 0.72 : W / 2;
    const ids = raw.map((a, i) => (keep[i] ? addAtom(a.el, a.x * sc - cx + dx, a.y * sc - cy + H / 2).id : null));
    for (let i = 0; i < nb; i++) {
      const l = lines[4 + na + i];
      const a = +l.slice(0, 3) - 1;
      const b = +l.slice(3, 6) - 1;
      const o = +l.slice(6, 9);
      if (ids[a] && ids[b]) bonds.push({ a: ids[a], b: ids[b], order: o === 4 ? 1 : o });
    }
    changed();
  }

  // regular ring template (benzene: alternating double bonds)
  function ring(n, aromatic = false) {
    save();
    const R = L / (2 * Math.sin(Math.PI / n));
    const cx = atoms.length ? W * 0.7 : W / 2;
    const cy = H / 2;
    const ids = [];
    for (let k = 0; k < n; k++) {
      const t = -Math.PI / 2 + (2 * Math.PI * k) / n + (n % 2 ? 0 : Math.PI / n);
      ids.push(addAtom('C', cx + R * Math.cos(t), cy + R * Math.sin(t)).id);
    }
    for (let k = 0; k < n; k++) bonds.push({ a: ids[k], b: ids[(k + 1) % n], order: aromatic && k % 2 === 0 ? 2 : 1 });
    changed();
  }

  const ro = new ResizeObserver(() => { bg = ''; draw(); });
  ro.observe(host);
  draw();

  const api = {
    get count() { return atoms.length; },
    setTool(t) { tool = t; },
    get tool() { return tool; },
    setMode(m) {
      if (m === showMode) return;
      // switching to the skeletal view hides drawn hydrogens (they are
      // implicit there); switching back does not invent them
      if (m === 'skeletal' && atoms.some((a) => a.el === 'H')) {
        save();
        const hs = new Set(atoms.filter((a) => a.el === 'H').map((a) => a.id));
        bonds = bonds.filter((b) => !hs.has(b.a) && !hs.has(b.b));
        atoms = atoms.filter((a) => !hs.has(a.id));
      }
      showMode = m;
      changed();
    },
    get mode() { return showMode; },
    molfile,
    missingH,
    load,
    ring,
    undo() { if (undo.length) { restore(undo.pop()); changed(); } },
    clear() { if (atoms.length) { save(); atoms = []; bonds = []; changed(); } },
    destroy() { ro.disconnect(); },
  };
  return api;
}

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
