// "かんたん作図": a touch-first structure editor built on "select, then act"
// (A. M. Clark, J. Cheminform. 2010: touch is good at choosing, poor at
// positioning). Tap an atom or a bond to select it; the screen then offers
// what can be done to it (extend, O, N, -OH, =O, bond order, delete) and
// the editor places new atoms itself, in the zigzag of skeletal formulas.
// Shortcuts: drag from an atom to extend it in that direction, long-press
// an atom to move it, one finger on empty space or two fingers to pan,
// pinch to zoom.
// Two ways of showing the drawing:
//   skeletal  骨格構造式: carbons are corners, H on carbon not drawn
//   full      構造式: every atom labelled, hydrogens drawn by the student
// The molecule is exported as a V2000 molfile; RDKit.js turns it into
// SMILES (implicit hydrogens filled in), so "the right molecule" is checked
// the same way whichever way it was drawn.

const VALENCE = { C: 4, N: 3, O: 2, S: 2, H: 1, F: 1, Cl: 1, Br: 1, I: 1, P: 3 };
const L = 50; // bond length (model units = px at zoom 1)
const HIT_ATOM = 26; // px on screen
const HIT_BOND = 18;
const LONG_PRESS = 450; // ms
const SLOP = 9; // px a finger may wander before a tap becomes a drag
const DY = L * Math.sqrt(3) / 2;
let uid = 0;

export function mountSketch(host, { mode = 'skeletal', seed = true, onChange, onSelect, onMessage } = {}) {
  let atoms = []; // { id, el, x, y }
  let bonds = []; // { a, b, order }
  let nextId = 1;
  let sel = null; // { type: 'atom'|'bond', id } (bond id = index in bonds)
  let showMode = mode;
  let view = { s: 1, ox: 0, oy: 0 };
  let shake = null;
  let autoView = true; // keep the drawing centred until the user moves the view
  const undoStack = [];
  const redoStack = [];
  const snapshot = () => JSON.stringify({ atoms, bonds, nextId });
  const restore = (s) => { const o = JSON.parse(s); atoms = o.atoms; bonds = o.bonds; nextId = o.nextId; sel = null; };
  const save = () => { undoStack.push(snapshot()); if (undoStack.length > 100) undoStack.shift(); redoStack.length = 0; };
  const latId = `sk-lat-${++uid}`;

  host.innerHTML = '';
  host.classList.add('sk-host');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'sk');
  svg.setAttribute('role', 'application');
  svg.setAttribute('aria-label', '作図エリア。原子や線をタップして選び、下のボタンで変える。');
  host.append(svg);
  const size = () => ({ W: host.clientWidth || 340, H: host.clientHeight || 400 });

  // ---------------------------------------------------------- no page scrolling
  // touch-action on the element itself and on the host; iOS Safari does not
  // always honour it for SVG content, so the touch events are also cancelled
  // (registered once, here, as non-passive listeners)
  svg.style.touchAction = 'none';
  const stop = (e) => { if (e.cancelable) e.preventDefault(); };
  svg.addEventListener('touchstart', stop, { passive: false });
  svg.addEventListener('touchmove', stop, { passive: false });
  svg.addEventListener('gesturestart', stop, { passive: false }); // iOS page zoom
  svg.addEventListener('contextmenu', stop);

  // ---------------------------------------------------------- model helpers
  const byId = (id) => atoms.find((a) => a.id === id);
  const bondsOf = (id) => bonds.filter((b) => b.a === id || b.b === id);
  const used = (id) => bondsOf(id).reduce((t, b) => t + b.order, 0);
  const free = (a) => (VALENCE[a.el] ?? 4) - used(a.id);
  const toModel = (p) => ({ x: (p.x - view.ox) / view.s, y: (p.y - view.oy) / view.s });
  const toScreen = (m) => ({ x: m.x * view.s + view.ox, y: m.y * view.s + view.oy });
  const say = (msg) => onMessage?.(msg);

  function atomAt(m, except = null, r = HIT_ATOM / view.s) {
    let best = null;
    let bd = r;
    for (const a of atoms) {
      if (a.id === except) continue;
      const d = Math.hypot(a.x - m.x, a.y - m.y);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }
  function bondAt(m) {
    let best = null;
    let bd = HIT_BOND / view.s;
    bonds.forEach((b, i) => {
      const A = byId(b.a);
      const B = byId(b.b);
      const d = segDist(m.x, m.y, A.x, A.y, B.x, B.y);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  function addAtom(el, x, y) {
    const a = { id: nextId++, el, x, y };
    atoms.push(a);
    return a;
  }

  function refuse(a, msg) {
    shake = a?.id ?? null;
    say(msg);
    setTimeout(() => { shake = null; draw(); }, 450);
  }

  function addBond(A, B, order) {
    if (A.id === B.id) return null;
    const ex = bonds.find((b) => (b.a === A.id && b.b === B.id) || (b.a === B.id && b.b === A.id));
    if (ex) return setOrder(ex, order) ? ex : null;
    if (free(A) < order || free(B) < order) {
      const X = free(A) < order ? A : B;
      refuse(X, `${X.el} の手（結合の数）が足りません。C は4本、N は3本、O は2本です。`);
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
      const X = free(A) < extra ? A : B;
      refuse(X, `${X.el} の手が足りないので、${order === 2 ? '二重' : '三重'}結合にできません。`);
      return false;
    }
    b.order = order;
    return true;
  }

  // where the next atom on `a` goes: the zigzag of skeletal formulas (the
  // new bond parallel to the bond two steps back), else the middle of the
  // widest free angle; never on top of another atom
  function growDirection(a, len = L) {
    const nbs = bondsOf(a.id).map((b) => byId(b.a === a.id ? b.b : b.a));
    const ang = (p, q) => Math.atan2(q.y - p.y, q.x - p.x);
    const cands = [];
    if (!nbs.length) cands.push(-Math.PI / 6, Math.PI / 6, (-5 * Math.PI) / 6, (5 * Math.PI) / 6, -Math.PI / 2, Math.PI / 2);
    else if (nbs.length === 1) {
      const u = ang(a, nbs[0]);
      const b2 = bondsOf(nbs[0].id).map((b) => byId(b.a === nbs[0].id ? b.b : b.a)).find((x) => x.id !== a.id);
      const opts = [u + (2 * Math.PI) / 3, u - (2 * Math.PI) / 3];
      if (b2) {
        // zigzag: parallel to b2 -> nbs[0]
        const z = ang(b2, nbs[0]);
        opts.sort((p, q) => Math.abs(Math.sin((p - z) / 2)) - Math.abs(Math.sin((q - z) / 2)));
      } else {
        opts.sort((p, q) => Math.cos(q) - Math.cos(p) || Math.sin(p) - Math.sin(q));
      }
      cands.push(...opts, u + Math.PI, u + Math.PI / 2, u - Math.PI / 2);
    } else {
      const us = nbs.map((n) => ang(a, n)).sort((p, q) => p - q);
      const gaps = us.map((u, i) => {
        const v = i + 1 < us.length ? us[i + 1] : us[0] + 2 * Math.PI;
        return { mid: (u + v) / 2, w: v - u };
      }).sort((p, q) => q.w - p.w);
      gaps.forEach((g) => cands.push(g.mid, g.mid - g.w / 4, g.mid + g.w / 4));
    }
    for (const t of cands) {
      const p = { x: a.x + len * Math.cos(t), y: a.y + len * Math.sin(t) };
      if (!atomAt(p, a.id, len * 0.45)) return p;
    }
    return null;
  }

  function changed() {
    draw();
    onChange?.(api);
  }
  function select(s) {
    sel = s;
    draw();
    onSelect?.(selection());
  }
  function selection() {
    if (!sel) return null;
    if (sel.type === 'atom') {
      const a = byId(sel.id);
      if (!a) return null;
      return { type: 'atom', el: a.el, free: free(a), bonds: bondsOf(a.id).length };
    }
    const b = bonds[sel.id];
    return b ? { type: 'bond', order: b.order } : null;
  }

  // ---------------------------------------------------------- pointer
  const pointers = new Map();
  let g = null; // one-finger gesture
  let pinch = null;
  const pt = (e) => {
    const r = svg.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  svg.addEventListener('pointerdown', (e) => {
    svg.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, pt(e));
    if (pointers.size === 2) {
      // a second finger: zoom / pan; whatever the first finger began is dropped
      if (g?.timer) clearTimeout(g.timer);
      if (g?.mode === 'move' && g.saved) { restore(undoStack.pop()); }
      g = null;
      const [p, q] = [...pointers.values()];
      autoView = false;
      pinch = { d0: Math.hypot(p.x - q.x, p.y - q.y) || 1, c0: mid(p, q), v0: { ...view } };
      draw();
      return;
    }
    if (pointers.size > 2 || pinch) return;
    const p = pt(e);
    const m = toModel(p);
    const atom = atomAt(m);
    const bond = atom ? null : bondAt(m);
    g = { start: p, cur: p, atom, bond, mode: null, v0: { ...view } };
    if (atom) {
      g.timer = setTimeout(() => {
        if (!g || g.mode) return;
        g.mode = 'move';
        navigator.vibrate?.(12);
        sel = { type: 'atom', id: atom.id };
        onSelect?.(selection());
        draw();
        say('動かせます。指をすべらせて置き直す');
      }, LONG_PRESS);
    }
  });
  svg.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, pt(e));
    if (pinch && pointers.size >= 2) {
      const [p, q] = [...pointers.values()];
      const s = clamp(pinch.v0.s * (Math.hypot(p.x - q.x, p.y - q.y) / pinch.d0), 0.4, 3);
      const c = mid(p, q);
      const m0 = { x: (pinch.c0.x - pinch.v0.ox) / pinch.v0.s, y: (pinch.c0.y - pinch.v0.oy) / pinch.v0.s };
      view = { s, ox: c.x - m0.x * s, oy: c.y - m0.y * s };
      draw();
      return;
    }
    if (!g) return;
    const p = pt(e);
    g.cur = p;
    if (!g.mode && Math.hypot(p.x - g.start.x, p.y - g.start.y) > SLOP) {
      clearTimeout(g.timer);
      g.mode = g.atom ? 'extend' : 'pan';
    }
    if (g.mode === 'pan') {
      autoView = false;
      view = { ...view, ox: g.v0.ox + p.x - g.start.x, oy: g.v0.oy + p.y - g.start.y };
      draw();
    } else if (g.mode === 'extend') {
      drawPreview();
    } else if (g.mode === 'move') {
      if (!g.saved) { save(); g.saved = true; }
      const m = toModel(p);
      g.atom.x = m.x;
      g.atom.y = m.y;
      draw();
    }
  });
  const end = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pinch) {
      if (pointers.size < 2) pinch = null;
      return;
    }
    if (!g) return;
    clearTimeout(g.timer);
    const d = g;
    g = null;
    if (e.type === 'pointercancel') { draw(); return; }
    if (d.mode === 'extend') extendByDrag(d);
    else if (d.mode === 'move') { if (d.saved) changed(); else draw(); }
    else if (d.mode === 'pan') draw();
    else tap(d);
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);

  function tap(d) {
    if (d.atom) return select(sel?.type === 'atom' && sel.id === d.atom.id ? null : { type: 'atom', id: d.atom.id });
    if (d.bond !== null && d.bond !== undefined) return select(sel?.type === 'bond' && sel.id === d.bond ? null : { type: 'bond', id: d.bond });
    select(null);
  }

  // end of a drag from atom A: another atom under the finger, or one bond
  // length in the dragged direction (60° steps, so chains stay zigzag)
  function dragEnd(A, p) {
    const m = toModel(p);
    const hit = atomAt(m, A.id);
    if (hit) return { atom: hit };
    const t = Math.atan2(m.y - A.y, m.x - A.x);
    const step = Math.PI / 3;
    const tt = Math.round((t - Math.PI / 6) / step) * step + Math.PI / 6;
    const q = { x: A.x + L * Math.cos(tt), y: A.y + L * Math.sin(tt) };
    const there = atomAt(q, A.id, L * 0.45);
    return there ? { atom: there } : q;
  }

  function extendByDrag(d) {
    const A = d.atom;
    // released close to where it started: a tap after all
    if (Math.hypot(d.cur.x - d.start.x, d.cur.y - d.start.y) < (L * view.s) / 2) { tap(d); return; }
    const endp = dragEnd(A, d.cur);
    save();
    const B = endp.atom || addAtom('C', endp.x, endp.y);
    if (!addBond(A, B, 1)) {
      undoStack.pop();
      if (!endp.atom) atoms = atoms.filter((a) => a.id !== B.id);
      draw();
      return;
    }
    sel = { type: 'atom', id: B.id };
    onSelect?.(selection());
    changed();
  }

  // ---------------------------------------------------------- actions on the selection
  const selAtom = () => (sel?.type === 'atom' ? byId(sel.id) : null);
  const selBond = () => (sel?.type === 'bond' ? bonds[sel.id] : null);

  // add a new atom (el) on `a` with the given bond order; returns it or null
  function sprout(a, el, order) {
    if (free(a) < order) {
      refuse(a, `${a.el} の手がもう残っていません（${a.el} は ${VALENCE[a.el]} 本）。`);
      return null;
    }
    const p = growDirection(a, el === 'H' ? L * 0.7 : L);
    if (!p) { refuse(a, 'まわりがいっぱいで、のばす場所がありません。'); return null; }
    const n = addAtom(el, p.x, p.y);
    bonds.push({ a: a.id, b: n.id, order });
    return n;
  }

  function extend(order = 1, el = 'C') {
    const a = selAtom();
    if (!a) return;
    if (free(a) < order) { refuse(a, `${a.el} の手が足りません（${a.el} は ${VALENCE[a.el]} 本）。`); return; }
    save();
    const n = sprout(a, el, order);
    if (!n) { undoStack.pop(); return; }
    sel = { type: 'atom', id: n.id };
    onSelect?.(selection());
    changed();
  }

  function setElement(el) {
    const a = selAtom();
    if (!a || a.el === el) return;
    if (used(a.id) > (VALENCE[el] ?? 4)) {
      refuse(a, `${el} の手は ${VALENCE[el]} 本なので、結合が ${used(a.id)} 本あるこの原子は ${el} にできません。`);
      return;
    }
    save();
    a.el = el;
    onSelect?.(selection());
    changed();
  }

  // groups grafted onto the selected atom; the selection stays on it
  const GROUPS = {
    OH: [['O', 1]],
    NH2: [['N', 1]],
    CH3: [['C', 1]],
    '=O': [['O', 2]],
    CHO: [['C', 1, [['O', 2]]]],
    COOH: [['C', 1, [['O', 2], ['O', 1]]]],
  };
  function addGroup(name) {
    const a = selAtom();
    const spec = GROUPS[name];
    if (!a || !spec) return;
    save();
    const ok = (function graft(at, list) {
      for (const [el, order, sub] of list) {
        const n = sprout(at, el, order);
        if (!n) return false;
        if (sub && !graft(n, sub)) return false;
      }
      return true;
    })(a, spec);
    if (!ok) { restore(undoStack.pop()); sel = { type: 'atom', id: a.id }; draw(); return; }
    onSelect?.(selection());
    changed();
  }

  function setBondOrder(order) {
    const b = selBond();
    if (!b || b.order === order) return;
    save();
    if (!setOrder(b, order)) { undoStack.pop(); return; }
    onSelect?.(selection());
    changed();
  }

  function remove() {
    if (!sel) return;
    save();
    if (sel.type === 'atom') {
      const id = sel.id;
      bonds = bonds.filter((x) => x.a !== id && x.b !== id);
      atoms = atoms.filter((x) => x.id !== id);
    } else {
      bonds.splice(sel.id, 1);
    }
    sel = null;
    if (!atoms.length && seed) seedAtom();
    onSelect?.(null);
    changed();
  }

  // every missing hydrogen drawn (構造式 mode)
  function addHydrogens() {
    save();
    let n = 0;
    for (const a of atoms.slice()) {
      if (a.el === 'H') continue;
      const want = Math.max(0, (VALENCE[a.el] ?? 0) - used(a.id));
      for (let k = 0; k < want; k++) if (sprout(a, 'H', 1)) n++;
    }
    if (!n) { undoStack.pop(); say('足りない H はありません。'); return; }
    changed();
  }

  // ring template; on a selected atom it is attached by a single bond
  function ring(n, aromatic = false) {
    save();
    const R = L / (2 * Math.sin(Math.PI / n));
    const a = selAtom();
    let cx;
    let cy;
    let rot;
    const lone = !a && atoms.length === 1 && !bonds.length;
    if (a) {
      const p = growDirection(a);
      if (!p || free(a) < 1) { undoStack.pop(); refuse(a, 'この原子には環をつけられません。'); return; }
      const t = Math.atan2(p.y - a.y, p.x - a.x);
      cx = a.x + (L + R) * Math.cos(t);
      cy = a.y + (L + R) * Math.sin(t);
      rot = t + Math.PI; // first ring atom faces the selected atom
    } else if (lone) {
      cx = atoms[0].x; cy = atoms[0].y; rot = -Math.PI / 2 + (n % 2 ? 0 : Math.PI / n);
      atoms = [];
    } else {
      const { W, H } = size();
      const m = toModel({ x: W / 2, y: H / 2 });
      cx = m.x + (atoms.length ? 2 * L : 0); cy = m.y; rot = -Math.PI / 2 + (n % 2 ? 0 : Math.PI / n);
    }
    const ids = [];
    for (let k = 0; k < n; k++) {
      const t = rot + (2 * Math.PI * k) / n;
      ids.push(addAtom('C', cx + R * Math.cos(t), cy + R * Math.sin(t)).id);
    }
    for (let k = 0; k < n; k++) bonds.push({ a: ids[k], b: ids[(k + 1) % n], order: aromatic && k % 2 === 1 ? 2 : 1 });
    if (a) bonds.push({ a: a.id, b: ids[0], order: 1 });
    sel = null;
    onSelect?.(null);
    changed();
    if (!a) fit();
  }

  function seedAtom() {
    const { W, H } = size();
    const m = toModel({ x: W / 2, y: H / 2 });
    addAtom('C', m.x, m.y);
  }

  // ---------------------------------------------------------- view
  function fit() {
    const { W, H } = size();
    if (!atoms.length) { view = { s: 1, ox: W / 2, oy: H / 2 }; draw(); return; }
    const xs = atoms.map((a) => a.x);
    const ys = atoms.map((a) => a.y);
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);
    const s = clamp(Math.min((W - 90) / (w || 1), (H - 90) / (h || 1)), 0.5, 1.2);
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
    const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    view = { s, ox: W / 2 - cx * s, oy: H / 2 - cy * s };
    draw();
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

  function labelSvg(text, x, y, el) {
    const parts = text.split(/(\d+)/).filter(Boolean);
    const body = parts.map((q) => (/^\d+$/.test(q) ? `<tspan class="sk-sub" dy="4">${q}</tspan><tspan dy="-4"></tspan>` : esc(q))).join('');
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" class="sk-l sk-${el}">${body}</text>`;
  }

  function bondSvg(A, B, order, g1, g2) {
    const len = Math.hypot(B.x - A.x, B.y - A.y) || 1;
    const ux = (B.x - A.x) / len;
    const uy = (B.y - A.y) / len;
    const ax = A.x + ux * g1; const ay = A.y + uy * g1;
    const bx = B.x - ux * g2; const by = B.y - uy * g2;
    const offs = order === 2 ? [-3.5, 3.5] : order === 3 ? [-6, 0, 6] : [0];
    return offs.map((o) => `<line x1="${(ax - uy * o).toFixed(1)}" y1="${(ay + ux * o).toFixed(1)}" x2="${(bx - uy * o).toFixed(1)}" y2="${(by + ux * o).toFixed(1)}"/>`).join('');
  }
  const gap = (t) => (t ? 11 + Math.max(0, t.length - 2) * 3 : 0);

  function draw(extra = '') {
    const { W, H } = size();
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    // visible model rectangle (for the lattice)
    const m0 = toModel({ x: 0, y: 0 });
    const m1 = toModel({ x: W, y: H });
    let under = '';
    let b = '';
    bonds.forEach((x, i) => {
      const A = byId(x.a);
      const B = byId(x.b);
      if (sel?.type === 'bond' && sel.id === i) under += `<line class="sk-selb" x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}"/>`;
      b += bondSvg(A, B, x.order, gap(label(A)), gap(label(B)));
    });
    let a = '';
    const sa = selAtom();
    for (const x of atoms) {
      const t = label(x);
      const cls = `sk-node${t ? '' : ' c'}${shake === x.id ? ' shake' : ''}`;
      if (sa === x) under += `<circle class="sk-sel" cx="${x.x}" cy="${x.y}" r="${t ? 19 : 15}"/>`;
      a += `<g class="${cls}"><circle cx="${x.x}" cy="${x.y}" r="${t ? 13 : 4.5}"/>${t ? labelSvg(t, x.x, x.y, x.el) : ''}</g>`;
    }
    // where "extend" will put the next atom
    let ghost = '';
    if (sa && free(sa) >= 1 && !g?.mode) {
      const p = growDirection(sa);
      if (p) ghost = `<line class="sk-ghost-b" x1="${sa.x}" y1="${sa.y}" x2="${p.x}" y2="${p.y}"/><circle class="sk-ghost" cx="${p.x}" cy="${p.y}" r="10"/>`;
    }
    const tr = `translate(${view.ox.toFixed(1)} ${view.oy.toFixed(1)}) scale(${view.s.toFixed(3)})`;
    svg.innerHTML = `<defs><pattern id="${latId}" width="${2 * DY}" height="${L}" patternUnits="userSpaceOnUse"><circle cx="0" cy="0" r="1.7"/><circle cx="${DY}" cy="${L / 2}" r="1.7"/><circle cx="${2 * DY}" cy="0" r="1.7"/><circle cx="0" cy="${L}" r="1.7"/><circle cx="${2 * DY}" cy="${L}" r="1.7"/></pattern></defs>`
      + `<g transform="${tr}"><rect class="sk-lat" fill="url(#${latId})" x="${m0.x - L}" y="${m0.y - L}" width="${m1.x - m0.x + 2 * L}" height="${m1.y - m0.y + 2 * L}"/>`
      + `<g class="sk-under">${under}</g>${ghost}<g class="sk-b">${b}</g>${a}${extra}</g>`;
  }

  function drawPreview() {
    if (!g) return;
    const A = g.atom;
    const e = dragEnd(A, g.cur);
    const B = e.atom || e;
    const word = e.atom ? 'つなぐ' : '離すと C';
    // the label sits above the finger so the finger does not hide it
    const bs = toScreen(B);
    const bx = bs.x;
    const by = Math.max(18, Math.min(g.cur.y, bs.y) - 46);
    const bubble = `<g transform="scale(${(1 / view.s).toFixed(3)}) translate(${(-view.ox).toFixed(1)} ${(-view.oy).toFixed(1)})"><rect class="sk-bub" x="${bx - 38}" y="${by - 13}" width="76" height="26" rx="13"/><text class="sk-bub-t" x="${bx}" y="${by}">${word}</text></g>`;
    draw(`<line class="sk-pre" x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}"/><circle class="sk-pre-dot" cx="${B.x}" cy="${B.y}" r="11"/>${bubble}`);
  }

  // ---------------------------------------------------------- export / import
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

  // a molecule given as a molfile with 2D coordinates (RDKit output: bond
  // length ~1.5), replacing the drawing
  function load(mb) {
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
    save();
    atoms = []; bonds = []; sel = null;
    const ids = raw.map((a, i) => (keep[i] ? addAtom(a.el, a.x * sc, a.y * sc).id : null));
    for (let i = 0; i < nb; i++) {
      const l = lines[4 + na + i];
      const a = +l.slice(0, 3) - 1;
      const b = +l.slice(3, 6) - 1;
      const o = +l.slice(6, 9);
      if (ids[a] && ids[b]) bonds.push({ a: ids[a], b: ids[b], order: o === 4 ? 1 : o });
    }
    onSelect?.(null);
    fit();
    changed();
  }

  const ro = new ResizeObserver(() => (autoView ? fit() : draw()));
  ro.observe(host);
  {
    const { W, H } = size();
    view = { s: 1, ox: W / 2, oy: H / 2 };
    if (seed) seedAtom();
  }
  draw();

  const api = {
    get count() { return atoms.length; },
    get bondCount() { return bonds.length; },
    get mode() { return showMode; },
    setMode(m) {
      if (m === showMode) return;
      // the skeletal view hides drawn hydrogens (they are implicit there);
      // switching back does not invent them
      if (m === 'skeletal' && atoms.some((a) => a.el === 'H')) {
        save();
        const hs = new Set(atoms.filter((a) => a.el === 'H').map((a) => a.id));
        bonds = bonds.filter((b) => !hs.has(b.a) && !hs.has(b.b));
        atoms = atoms.filter((a) => !hs.has(a.id));
        sel = null;
        onSelect?.(null);
      }
      showMode = m;
      changed();
    },
    get selection() { return selection(); },
    select(s) { select(s); },
    // tests and keyboard: select an atom by its order of creation
    selectAtom(i) { if (atoms[i]) select({ type: 'atom', id: atoms[i].id }); },
    extend,
    setElement,
    addGroup,
    setBondOrder,
    remove,
    addHydrogens,
    ring,
    fit,
    molfile,
    missingH,
    load,
    get canUndo() { return undoStack.length > 0; },
    get canRedo() { return redoStack.length > 0; },
    undo() {
      if (!undoStack.length) return;
      redoStack.push(snapshot());
      restore(undoStack.pop());
      onSelect?.(null);
      changed();
    },
    redo() {
      if (!redoStack.length) return;
      undoStack.push(snapshot());
      restore(redoStack.pop());
      onSelect?.(null);
      changed();
    },
    clear() {
      if (atoms.length <= 1 && !bonds.length) return;
      save();
      atoms = []; bonds = []; sel = null;
      if (seed) seedAtom();
      onSelect?.(null);
      changed();
    },
    destroy() { ro.disconnect(); },
  };
  return api;
}

const mid = (p, q) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
