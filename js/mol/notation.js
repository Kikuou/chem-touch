// Ways of writing a structure (the "書き方くらべ" screen and the practice):
// all of them are drawn from one molecular graph, so atom i is the same
// atom in every notation (heavy atoms first, hydrogens after them, as in
// the SDF files of the library).
//
//   structuralSvg  構造式: every atom and bond, lines on a square grid (acyclic molecules)
//   condensedSvg   簡略構造式: CH3–CH2–OH, branches written above/below
//   rationalTokens 示性式: CH3COOH, C2H5OH, CH3CH(OH)CH3 ...
//   wedgeSvg       立体構造式（くさび形表記）: projected from 3D coordinates
//   formulaText    分子式
// Pure functions (no DOM), testable with Node.

const VALENCE = { C: 4, N: 3, O: 2, S: 2, H: 1, F: 1, Cl: 1, Br: 1, I: 1, P: 3 };

// ------------------------------------------------------------ graph

/** V2000 molfile -> { atoms: [{ el, x, y, z, chg }], bonds: [{ a, b, order }] } */
export function parseMolfile(text) {
  const lines = text.split(/\r?\n/);
  const na = parseInt(lines[3].slice(0, 3), 10);
  const nb = parseInt(lines[3].slice(3, 6), 10);
  const atoms = [];
  for (let i = 0; i < na; i++) {
    const l = lines[4 + i];
    atoms.push({ el: l.slice(31, 34).trim(), x: +l.slice(0, 10), y: +l.slice(10, 20), z: +l.slice(20, 30), chg: 0 });
  }
  const bonds = [];
  for (let i = 0; i < nb; i++) {
    const l = lines[4 + na + i];
    bonds.push({ a: +l.slice(0, 3) - 1, b: +l.slice(3, 6) - 1, order: +l.slice(6, 9) });
  }
  for (const l of lines.slice(4 + na + nb)) {
    if (!l.startsWith('M  CHG')) continue;
    const f = l.slice(6).trim().split(/\s+/).map(Number);
    for (let k = 1; k + 1 < f.length; k += 2) atoms[f[k] - 1].chg = f[k + 1];
  }
  return { atoms, bonds };
}

/**
 * Molecule with explicit hydrogens -> working graph:
 * heavy: indices of heavy atoms, hs[i]: hydrogen indices on heavy atom i,
 * nb[i]: [{ j, order }] heavy neighbours, aromatic bonds as order 4 -> 1.5.
 */
export function makeGraph(mol) {
  const n = mol.atoms.length;
  const nb = Array.from({ length: n }, () => []);
  for (const b of mol.bonds) {
    nb[b.a].push({ j: b.b, order: b.order });
    nb[b.b].push({ j: b.a, order: b.order });
  }
  const heavy = [];
  const hs = {};
  for (let i = 0; i < n; i++) {
    if (mol.atoms[i].el === 'H') continue;
    heavy.push(i);
    hs[i] = nb[i].filter((x) => mol.atoms[x.j].el === 'H').map((x) => x.j);
  }
  const hnb = {};
  for (const i of heavy) hnb[i] = nb[i].filter((x) => mol.atoms[x.j].el !== 'H');
  return { mol, atoms: mol.atoms, heavy, hs, nb: hnb, all: nb };
}

const hcount = (g, i) => g.hs[i].length;

function isAcyclic(g) {
  const edges = g.heavy.reduce((t, i) => t + g.nb[i].length, 0) / 2;
  return edges === g.heavy.length - 1;
}

// all simple paths are cheap for the small molecules of the course; the
// longest heavy-atom path is the main chain (ties: avoid =O / N at ends,
// prefer carbon at the left end)
function mainChain(g) {
  const ends = g.heavy.filter((i) => g.nb[i].length <= 1);
  let best = null;
  const score = (p) => {
    const first = p[0];
    const last = p[p.length - 1];
    const multiEnd = (i) => (g.nb[i][0] && g.nb[i][0].order > 1 && g.atoms[i].el !== 'C' ? 1 : 0);
    return [p.length, -(multiEnd(first) + multiEnd(last)), g.atoms[first].el === 'C' ? 1 : 0, g.atoms[last].el !== 'C' ? 1 : 0];
  };
  const better = (a, b) => {
    for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return a[k] > b[k];
    return false;
  };
  const walk = (from) => {
    // tree: path from `from` to every other node by BFS parents
    const par = { [from]: -1 };
    const q = [from];
    while (q.length) {
      const u = q.shift();
      for (const { j } of g.nb[u]) if (!(j in par)) { par[j] = u; q.push(j); }
    }
    for (const to of ends.length ? ends : g.heavy) {
      if (to === from) continue;
      const p = [];
      for (let u = to; u !== -1; u = par[u]) p.push(u);
      p.reverse();
      if (!best || better(score(p), score(best))) best = p;
    }
  };
  (ends.length ? ends : g.heavy).forEach(walk);
  return best || [g.heavy[0]];
}

// ------------------------------------------------------------ grid layout

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

/**
 * Square-grid layout of an acyclic molecule: main chain horizontal,
 * branches vertical (two cells away when they carry hydrogens on their
 * sides), hydrogens in the free directions. Returns null when it does not
 * fit (rings, crowded atoms) -- the caller then uses RDKit's drawing.
 * withH: place hydrogen atoms (構造式) or keep them inside group labels (簡略).
 */
export function gridLayout(g, { withH = true } = {}) {
  if (!isAcyclic(g)) return null;
  const pos = {}; // atom -> [x, y]
  const used = new Map(); // "x,y" -> atom
  const take = (i, x, y) => {
    const k = `${x},${y}`;
    if (used.has(k)) return false;
    used.set(k, i);
    pos[i] = [x, y];
    return true;
  };
  const chain = mainChain(g);
  chain.forEach((i, k) => take(i, k * (withH ? 1 : 1), 0));
  const placedBonds = [];
  for (let k = 1; k < chain.length; k++) placedBonds.push([chain[k - 1], chain[k]]);

  // free directions of an atom, in order of preference
  const freeDirs = (i, prefer) => prefer.filter((d) => {
    const [dx, dy] = DIRS[d];
    return !used.has(`${pos[i][0] + dx},${pos[i][1] + dy}`);
  });

  let ok = true;
  // place a substituent tree hanging from atom `p` in direction d
  const place = (p, i, d) => {
    const [dx, dy] = DIRS[d];
    // a branch atom with hydrogens on its sides goes two cells away so
    // that those hydrogens do not touch the hydrogens of the chain
    const sideNeeds = (withH ? hcount(g, i) : 0) + g.nb[i].filter((x) => x.j !== p).length;
    const dist = d === 'up' || d === 'down' ? (sideNeeds >= 2 ? 2 : 1) : 1;
    const x = pos[p][0] + dx * dist;
    const y = pos[p][1] + dy * dist;
    if (!take(i, x, y)) { ok = false; return; }
    if (dist === 2) used.set(`${pos[p][0] + dx},${pos[p][1] + dy}`, -1); // the long bond
    placedBonds.push([p, i]);
    const order = d === 'up' ? ['up', 'left', 'right'] : d === 'down' ? ['down', 'left', 'right'] : [d, 'up', 'down'];
    for (const { j } of g.nb[i]) {
      if (j === p) continue;
      const dd = freeDirs(i, order)[0];
      if (!dd) { ok = false; return; }
      place(i, j, dd);
    }
  };
  let last = 'down';
  chain.forEach((i, k) => {
    const branches = g.nb[i].filter((x) => x.j !== chain[k - 1] && x.j !== chain[k + 1]);
    // heavy branches: alternate up/down along the chain so that branches on
    // neighbouring atoms (2,3-dimethylbutane) do not collide
    for (const { j } of branches) {
      const pref = last === 'up' ? ['down', 'up'] : ['up', 'down'];
      const dd = freeDirs(i, pref)[0];
      if (!dd) { ok = false; return; }
      place(i, j, dd);
      last = dd;
    }
    if (!branches.length) last = 'down';
  });
  if (!ok) return null;
  if (withH) {
    // hydrogens: ends of the chain outward first, then up/down
    for (const i of g.heavy) {
      const hsI = g.hs[i];
      const k = chain.indexOf(i);
      let order = ['up', 'down', 'left', 'right'];
      if (k === 0) order = ['left', 'up', 'down', 'right'];
      if (k === chain.length - 1 && k > 0) order = ['right', 'up', 'down', 'left'];
      if (chain.length === 1) order = ['left', 'right', 'up', 'down'];
      if (k < 0) {
        // branch atom: continue away from its parent first
        const parent = g.nb[i].find((x) => placedBonds.some(([a, b]) => b === i && a === x.j));
        if (parent) {
          const [px, py] = pos[parent.j];
          const away = pos[i][0] - px > 0 ? 'right' : pos[i][0] - px < 0 ? 'left' : pos[i][1] - py < 0 ? 'up' : 'down';
          order = [away, ...['up', 'down', 'left', 'right'].filter((d) => d !== away)];
        }
      }
      for (const h of hsI) {
        const dd = freeDirs(i, order)[0];
        if (!dd) return null;
        const [dx, dy] = DIRS[dd];
        if (!take(h, pos[i][0] + dx, pos[i][1] + dy)) return null;
        placedBonds.push([i, h]);
      }
    }
  }
  return { pos, chain, bonds: placedBonds };
}

// ------------------------------------------------------------ labels

const SUBS = '₀₁₂₃₄₅₆₇₈₉';

// group label of a heavy atom with its hydrogens: CH3, OH, NH2, C ...
export function groupLabel(g, i, { hLeft = false } = {}) {
  const el = g.atoms[i].el;
  const h = hcount(g, i);
  if (!h) return el;
  const hh = h > 1 ? `H${h}` : 'H';
  return hLeft && el !== 'C' ? `${hh}${el}` : `${el}${hh}`;
}

// "CH3" -> SVG text with subscript digits
function svgLabel(text, cls = '') {
  const parts = text.split(/(\d+)/).filter(Boolean);
  return parts.map((p) => (/^\d+$/.test(p) ? `<tspan class="nt-sub" dy="4">${p}</tspan><tspan dy="-4"></tspan>` : `<tspan class="${cls}">${p}</tspan>`)).join('');
}

const elClass = (el) => (el === 'O' ? 'nt-o' : el === 'N' ? 'nt-n' : el === 'C' || el === 'H' ? '' : 'nt-x');

function bondLines(x1, y1, x2, y2, order, gap1, gap2) {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  const ax = x1 + ux * gap1;
  const ay = y1 + uy * gap1;
  const bx = x2 - ux * gap2;
  const by = y2 - uy * gap2;
  const offs = order === 2 ? [-2.6, 2.6] : order === 3 ? [-4, 0, 4] : [0];
  return offs.map((o) => `<line x1="${(ax - uy * o).toFixed(1)}" y1="${(ay + ux * o).toFixed(1)}" x2="${(bx - uy * o).toFixed(1)}" y2="${(by + ux * o).toFixed(1)}"/>`).join('');
}

function bondOrder(g, a, b) {
  const x = g.all[a].find((y) => y.j === b);
  return x ? (x.order === 4 ? 1.5 : x.order) : 1;
}

function frame(inner, minX, minY, maxX, maxY, label) {
  const pad = 18;
  const w = maxX - minX + pad * 2;
  const h = maxY - minY + pad * 2;
  return `<svg class="nt" width="${w.toFixed(0)}" height="${h.toFixed(0)}" viewBox="${(minX - pad).toFixed(1)} ${(minY - pad).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}" role="img" aria-label="${label}">${inner}</svg>`;
}

// ------------------------------------------------------------ 構造式

/** 構造式 (all atoms and bonds on a square grid) or null for rings */
export function structuralSvg(g, { label = '構造式' } = {}) {
  const L = gridLayout(g, { withH: true });
  if (!L) return null;
  const S = 30;
  const P = (i) => [L.pos[i][0] * S, L.pos[i][1] * S];
  let lines = '';
  let texts = '';
  for (const [a, b] of L.bonds) {
    const [x1, y1] = P(a);
    const [x2, y2] = P(b);
    lines += bondLines(x1, y1, x2, y2, bondOrder(g, a, b), 8, 8);
  }
  const xs = [];
  const ys = [];
  for (const i of Object.keys(L.pos).map(Number)) {
    const [x, y] = P(i);
    xs.push(x); ys.push(y);
    const el = g.atoms[i].el;
    texts += `<g class="nt-a" data-a="${i}"><circle class="nt-hl" cx="${x}" cy="${y}" r="11"/><text x="${x}" y="${y}" class="${elClass(el)}">${el}</text></g>`;
  }
  return frame(`<g class="nt-b">${lines}</g>${texts}`, Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), label);
}

// ------------------------------------------------------------ 簡略構造式

/** 簡略構造式: groups (CH3, CH2, OH ...) joined by bonds; branches above/below */
export function condensedSvg(g, { label = '簡略構造式' } = {}) {
  const L = gridLayout(g, { withH: false });
  if (!L) return null;
  const CW = 8.4; // approximate width of one character (13px font)
  const labels = {};
  const widths = {};
  for (const i of g.heavy) {
    // a group at the left end of the main chain reads right to left: HO–
    const leftEnd = L.chain[0] === i && L.chain.length > 1;
    labels[i] = groupLabel(g, i, { hLeft: leftEnd });
    widths[i] = labels[i].replace(/\d/g, '').length * CW + labels[i].replace(/\D/g, '').length * 5;
  }
  // x positions: main chain spaced by label widths
  const X = {};
  const Y = {};
  let x = 0;
  L.chain.forEach((i, k) => {
    if (k) x += widths[L.chain[k - 1]] / 2 + 22 + widths[i] / 2;
    X[i] = x;
    Y[i] = 0;
  });
  // branches: same x as the atom they hang from, rows of 34px
  const placeBranch = (i) => {
    if (i in X) return;
    const parent = L.bonds.find(([a, b]) => b === i)[0];
    placeBranch(parent);
    const dy = L.pos[i][1] - L.pos[parent][1];
    const dx = L.pos[i][0] - L.pos[parent][0];
    X[i] = X[parent] + (dx ? Math.sign(dx) * (widths[parent] / 2 + 22 + widths[i] / 2) : 0);
    Y[i] = Y[parent] + (dy ? Math.sign(dy) * 34 : 0);
  };
  g.heavy.forEach(placeBranch);
  let lines = '';
  let texts = '';
  for (const [a, b] of L.bonds) {
    const horiz = Y[a] === Y[b];
    const ga = horiz ? widths[a] / 2 + 3 : 9;
    const gb = horiz ? widths[b] / 2 + 3 : 9;
    lines += bondLines(X[a], Y[a], X[b], Y[b], bondOrder(g, a, b), ga, gb);
  }
  for (const i of g.heavy) {
    texts += `<g class="nt-a" data-a="${i}"><rect class="nt-hl" x="${(X[i] - widths[i] / 2 - 3).toFixed(1)}" y="${Y[i] - 11}" width="${(widths[i] + 6).toFixed(1)}" height="22" rx="6"/><text x="${X[i].toFixed(1)}" y="${Y[i]}" class="${elClass(g.atoms[i].el)}">${svgLabel(labels[i])}</text></g>`;
  }
  const xs = g.heavy.map((i) => X[i]);
  const ys = g.heavy.map((i) => Y[i]);
  const half = Math.max(...g.heavy.map((i) => widths[i])) / 2;
  return frame(`<g class="nt-b">${lines}</g>${texts}`, Math.min(...xs) - half, Math.min(...ys), Math.max(...xs) + half, Math.max(...ys), label);
}

// ------------------------------------------------------------ 示性式

function cmpKeys(a, b) {
  for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return a[k] - b[k];
  return 0;
}

function isPhenyl(g, ring) {
  return ring.length === 6 && ring.every((i) => g.atoms[i].el === 'C');
}

// six-membered all-carbon aromatic ring (benzene ring), or null
function benzeneRing(g) {
  const arom = g.heavy.filter((i) => g.atoms[i].el === 'C' && g.nb[i].some((x) => x.order === 4 || x.order === 2));
  for (const s of arom) {
    // walk around the ring: atoms of a ring of 6 reachable through ring bonds
    const seen = [s];
    let cur = s;
    let prev = -1;
    for (let step = 0; step < 6; step++) {
      const next = g.nb[cur].map((x) => x.j).find((j) => j !== prev && arom.includes(j) && (step === 5 ? j === s : !seen.includes(j)));
      if (next === undefined) break;
      if (next === s && step === 5) return isPhenyl(g, seen) ? seen : null;
      seen.push(next);
      prev = cur;
      cur = next;
    }
  }
  return null;
}

/**
 * 示性式 as tokens [{ t: 'CH3', atoms: [i] }, { t: '=' } ...]. Rings other
 * than a benzene ring are given as the molecular formula (sameAsFormula).
 */
export function rationalTokens(g) {
  const ring = benzeneRing(g);
  // contract a benzene ring into one unit "C6H5" / "C6H6"
  const unitOf = {};
  const units = [];
  const addUnit = (atoms, kind) => { const u = { id: units.length, atoms, kind }; units.push(u); atoms.forEach((a) => { unitOf[a] = u.id; }); return u; };
  if (ring) addUnit(ring, 'phenyl');
  if (!ring && !isAcyclic(g)) return null;
  if (ring) {
    const rest = g.heavy.filter((i) => !ring.includes(i));
    const edges = rest.reduce((t, i) => t + g.nb[i].filter((x) => !ring.includes(x.j)).length, 0) / 2;
    const links = ring.reduce((t, i) => t + g.nb[i].filter((x) => !ring.includes(x.j)).length, 0);
    if (edges + links !== rest.length) return null; // further rings
  }
  const el = (i) => g.atoms[i].el;
  const isO = (i) => el(i) === 'O';
  const dblO = (c) => g.nb[c].find((x) => x.order === 2 && isO(x.j) && g.nb[x.j].length === 1)?.j;
  // functional units on carbonyl carbons
  for (const c of g.heavy) {
    if (unitOf[c] !== undefined || el(c) !== 'C') continue;
    const o2 = dblO(c);
    if (o2 === undefined) continue;
    const singles = g.nb[c].filter((x) => x.j !== o2);
    const oSingle = singles.find((x) => isO(x.j) && x.order === 1);
    if (oSingle && hcount(g, oSingle.j) === 1) addUnit([c, o2, oSingle.j], 'COOH');
    else if (oSingle && g.nb[oSingle.j].length === 2) addUnit([c, o2, oSingle.j], 'COO');
    else if (singles.filter((x) => el(x.j) === 'C' || unitOf[x.j] !== undefined).length >= 2) addUnit([c, o2], 'CO');
    else addUnit([c, o2], 'CHO');
  }
  for (const i of g.heavy) if (unitOf[i] === undefined) addUnit([i], 'atom');

  // unit tree
  const unb = units.map(() => new Map());
  for (const i of g.heavy) {
    for (const { j, order } of g.nb[i]) {
      const a = unitOf[i];
      const b = unitOf[j];
      if (a !== b) unb[a].set(b, order === 4 ? 1 : order);
    }
  }
  // the atom of unit u that bonds to unit v (for the ester orientation)
  const contact = (u, v) => units[u].atoms.find((i) => g.nb[i].some((x) => unitOf[x.j] === v));

  // main path through units: longest; principal group at the right end
  const PRIORITY = { COOH: 6, COO: 5, CHO: 4, CO: 3 };
  const prio = (u) => PRIORITY[units[u].kind] || (units[u].kind === 'atom' && el(units[u].atoms[0]) !== 'C' ? 2 : units[u].kind === 'phenyl' ? 1 : 0);
  let best = null;
  const leaves = units.filter((u) => unb[u.id].size <= 1).map((u) => u.id);
  for (const s of leaves.length ? leaves : [0]) {
    const par = { [s]: -1 };
    const q = [s];
    while (q.length) { const u = q.shift(); for (const v of unb[u].keys()) if (!(v in par)) { par[v] = u; q.push(v); } }
    for (const t of leaves.length ? leaves : [0]) {
      const p = [];
      for (let u = t; u !== -1 && u !== undefined; u = par[u]) p.push(u);
      p.reverse();
      // longest; then the multiple bonds; then a principal group (COOH, CHO, C=O, ester) at an end;
      // then carbon at both ends (2-propanol: CH3CH(OH)CH3)
      const endHigh = Math.max(prio(p[0]), prio(p[p.length - 1])) >= 3 ? 1 : 0;
      const carbonEnds = [p[0], p[p.length - 1]].filter((u) => units[u].kind === 'atom' && el(units[u].atoms[0]) === 'C').length;
      // multiple bonds must lie on the main path (CH2=C(CH3)CH3)
      const multi = p.filter((u, k) => k && unb[p[k - 1]].get(u) > 1).length;
      const key = [p.length, multi, endHigh, carbonEnds];
      if (!best || cmpKeys(key, best.key) > 0) best = { p, key };
    }
  }
  let path = best.p;
  // ester: the acyl side (carbonyl carbon) reads first: CH3COOC2H5, HCOOCH3
  const ester = path.findIndex((u) => units[u].kind === 'COO');
  const multiPos = (p) => p.findIndex((u, k) => k && unb[p[k - 1]].get(u) > 1);
  if (ester >= 0) {
    // the carbonyl carbon must face the left part (HCOO at the very left)
    const u = units[path[ester]];
    if (ester > 0 && contact(path[ester], path[ester - 1]) !== u.atoms[0]) path = path.slice().reverse();
  } else if (path.every((u) => prio(u) === 0)) {
    // hydrocarbons: multiple bonds, then branches as near the left as
    // possible (CH2=CHCH3, CH3CH(CH3)CH2CH2CH3), like the lowest locants
    const branchPos = (p) => p.findIndex((u) => unb[u].size > 2);
    const rev = path.slice().reverse();
    const key = (p) => [multiPos(p) < 0 ? 99 : multiPos(p), branchPos(p) < 0 ? 99 : branchPos(p)];
    if (cmpKeys(key(rev), key(path)) < 0) path = rev;
  } else if (prio(path[0]) > prio(path[path.length - 1])) {
    path = path.slice().reverse();
  } else if (prio(path[0]) === prio(path[path.length - 1]) && path.length > 2) {
    // symmetric (ethers, ketones): the smaller side first, CH3OC2H5
    const mid = path.findIndex((u) => prio(u) > 0);
    if (mid > 0 && mid < path.length - 1 && mid > path.length - 1 - mid) path = path.slice().reverse();
  }

  const unitText = (u, { left, right }) => {
    const U = units[u];
    const c = U.atoms[0];
    const h = U.kind === 'phenyl' ? 0 : hcount(g, c);
    switch (U.kind) {
      case 'phenyl': return unb[u].size ? 'C6H5' : 'C6H6';
      case 'COOH': return h ? 'HCOOH' : 'COOH';
      case 'COO': return h ? 'HCOO' : 'COO';
      case 'CHO': return h === 2 ? 'HCHO' : 'CHO';
      case 'CO': return 'CO';
      default: {
        const e = el(c);
        if (e === 'C') return h ? `CH${h > 1 ? h : ''}` : 'C';
        if (!h) return e;
        const hh = h > 1 ? `H${h}` : 'H';
        // a terminal OH/NH2 written at the left end reads HO, H2N
        return left && !right ? `${hh}${e}` : `${e}${hh}`;
      }
    }
  };

  const onPath = new Set(path);
  const tokens = [];
  const emitBranch = (u, from) => {
    // a branch: its own subtree in parentheses (only simple branches occur
    // in the course; deeper ones are written out in a row)
    const parts = [];
    const walk = (x, prev) => {
      parts.push({ t: unitText(x, { left: false, right: true }), atoms: units[x].atoms });
      for (const v of unb[x].keys()) if (v !== prev && !onPath.has(v)) walk(v, x);
    };
    walk(u, from);
    return parts;
  };
  path.forEach((u, k) => {
    if (k) {
      const o = unb[path[k - 1]].get(u);
      if (o === 2) tokens.push({ t: '=' });
      if (o === 3) tokens.push({ t: '≡' });
    }
    tokens.push({ t: unitText(u, { left: k === 0, right: k === path.length - 1 && k > 0 }), atoms: units[u].atoms });
    // branches, identical ones grouped: CH(CH3)2
    const groups = new Map();
    for (const v of unb[u].keys()) {
      if (onPath.has(v)) continue;
      const parts = emitBranch(v, u);
      const key = parts.map((p) => p.t).join('');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(parts);
    }
    for (const [key, list] of groups) {
      tokens.push({ t: '(', atoms: [] });
      list.forEach((parts) => parts.forEach((p) => tokens.push({ ...p, hidden: list.indexOf(parts) > 0 })));
      tokens.push({ t: list.length > 1 ? `)${list.length}` : ')', atoms: [] });
      void key;
    }
  });
  // shown tokens: repeated branches collapse into the first one
  let out = tokens.filter((x) => !x.hidden);
  out = compressEthyl(out, g);
  return out;
}

// CH3CH2- next to a functional group or at the end of a short chain is
// written C2H5: C2H5OH, CH3COOC2H5, C2H5OC2H5, C2H5NH2
function compressEthyl(tokens, g) {
  const isFG = (t) => t && /^(OH|HO|O|COOH|COO|HCOO|CHO|CO|NH2|H2N|NH|N|C6H5)$/.test(t.t);
  const out = tokens.slice();
  // left end
  if (out[0]?.t === 'CH3' && out[1]?.t === 'CH2' && isFG(out[2])) {
    out.splice(0, 2, { t: 'C2H5', atoms: [...out[0].atoms, ...out[1].atoms] });
  }
  const n = out.length;
  if (out[n - 1]?.t === 'CH3' && out[n - 2]?.t === 'CH2' && isFG(out[n - 3])) {
    out.splice(n - 2, 2, { t: 'C2H5', atoms: [...out[n - 2].atoms, ...out[n - 1].atoms] });
  }
  void g;
  return out;
}

export function rationalText(g) {
  const t = rationalTokens(g);
  return t ? t.map((x) => x.t).join('') : null;
}

// HTML with subscripts; every token keeps its atoms for highlighting
export function rationalHtml(g) {
  const t = rationalTokens(g);
  if (!t) return null;
  return t.map((x) => {
    const html = x.t.replace(/(\d+)/g, '<sub>$1</sub>').replace(/^\)<sub>(\d+)<\/sub>$/, ')<sub>$1</sub>');
    const cls = /O|N/.test(x.t) && !/C/.test(x.t) ? ' nt-o' : '';
    return x.atoms && x.atoms.length ? `<span class="nt-a${cls}" data-a="${x.atoms.join(' ')}">${html}</span>` : `<span>${html}</span>`;
  }).join('');
}

// ------------------------------------------------------------ 分子式

export function formulaText(g) {
  const count = {};
  for (const a of g.atoms) count[a.el] = (count[a.el] || 0) + 1;
  const keys = Object.keys(count).sort((a, b) => {
    const r = (x) => (x === 'C' ? 0 : x === 'H' ? 1 : 2);
    return r(a) - r(b) || a.localeCompare(b);
  });
  return keys.map((k) => k + (count[k] > 1 ? count[k] : '')).join('');
}

export const toSubHtml = (s) => s.replace(/(\d+)/g, '<sub>$1</sub>');

// ------------------------------------------------------------ 立体構造式

// principal axes of the heavy atoms (Jacobi on the 3x3 covariance)
function principalAxes(pts) {
  const n = pts.length;
  const c = [0, 1, 2].map((k) => pts.reduce((t, p) => t + p[k], 0) / n);
  const m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of pts) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) m[a][b] += (p[a] - c[a]) * (p[b] - c[b]);
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 30; sweep++) {
    for (let p = 0; p < 2; p++) {
      for (let q = p + 1; q < 3; q++) {
        if (Math.abs(m[p][q]) < 1e-10) continue;
        const th = (m[q][q] - m[p][p]) / (2 * m[p][q]);
        const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
        const cs = 1 / Math.sqrt(t * t + 1);
        const sn = t * cs;
        for (let k = 0; k < 3; k++) {
          const a = m[k][p]; const b = m[k][q];
          m[k][p] = cs * a - sn * b; m[k][q] = sn * a + cs * b;
        }
        for (let k = 0; k < 3; k++) {
          const a = m[p][k]; const b = m[q][k];
          m[p][k] = cs * a - sn * b; m[q][k] = sn * a + cs * b;
        }
        for (let k = 0; k < 3; k++) {
          const a = v[k][p]; const b = v[k][q];
          v[k][p] = cs * a - sn * b; v[k][q] = sn * a + cs * b;
        }
      }
    }
  }
  const order = [0, 1, 2].sort((a, b) => m[b][b] - m[a][a]);
  const axes = order.map((k) => [v[0][k], v[1][k], v[2][k]]);
  // right-handed frame, so the drawing is not the mirror image
  const [a, b] = axes;
  axes[2] = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  return { c, axes };
}

/**
 * 立体構造式（くさび形表記）from 3D coordinates: the molecule is turned so
 * that its heavy atoms lie as flat as possible; bonds to atoms in front of
 * that plane are drawn as wedges, bonds to atoms behind it as hashed wedges.
 */
export function wedgeSvg(g, { label = '立体構造式' } = {}) {
  const pts = g.atoms.map((a) => [a.x, a.y, a.z]);
  if (pts.every((p) => p[2] === 0)) return null;
  const heavyPts = g.heavy.map((i) => pts[i]);
  const { c, axes } = principalAxes(heavyPts.length >= 3 ? heavyPts : pts);
  // only for molecules whose heavy atoms lie in one plane (zigzag chains);
  // branched or twisted ones become unreadable, the 3D model shows them
  if (heavyPts.length > 3) {
    const off = heavyPts.map((p) => Math.abs((p[0] - c[0]) * axes[2][0] + (p[1] - c[1]) * axes[2][1] + (p[2] - c[2]) * axes[2][2]));
    if (Math.max(...off) > 0.3) return null;
  }
  const S = 34;
  // turned a little about the vertical axis: hydrogens that sit
  // symmetrically in front of and behind the plane (CH2) then appear side
  // by side, as in hand-drawn wedge formulas
  const turn = (24 * Math.PI) / 180;
  const P = pts.map((p) => {
    const d = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
    const dot = (ax) => ax[0] * d[0] + ax[1] * d[1] + ax[2] * d[2];
    const x = dot(axes[0]);
    const z = dot(axes[2]);
    // depth (wedge or hashed) is judged before turning, so the bonds of a
    // flat chain stay plain lines
    return [(x * Math.cos(turn) + z * Math.sin(turn)) * S, -dot(axes[1]) * S, z];
  });
  let lines = '';
  let solids = '';
  const T = 0.45; // Å out of the plane before a bond is drawn as a wedge
  for (const b of g.mol.bonds) {
    let [i, j] = [b.a, b.b];
    if (Math.abs(P[i][2]) > Math.abs(P[j][2])) [i, j] = [j, i]; // i: nearer the plane
    const dz = P[j][2] - P[i][2];
    const [x1, y1] = P[i];
    const [x2, y2] = P[j];
    const gap1 = 8;
    const gap2 = 8;
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const ux = (x2 - x1) / len;
    const uy = (y2 - y1) / len;
    const ax = x1 + ux * gap1; const ay = y1 + uy * gap1;
    const bx = x2 - ux * gap2; const by = y2 - uy * gap2;
    if (b.order === 1 && Math.abs(dz) > T && Math.abs(P[j][2]) > T) {
      const w = 4.5;
      if (dz > 0) {
        solids += `<polygon class="nt-wedge" points="${ax.toFixed(1)},${ay.toFixed(1)} ${(bx - uy * w).toFixed(1)},${(by + ux * w).toFixed(1)} ${(bx + uy * w).toFixed(1)},${(by - ux * w).toFixed(1)}"/>`;
      } else {
        const n = 6;
        for (let k = 1; k <= n; k++) {
          const t = k / n;
          const px = ax + (bx - ax) * t;
          const py = ay + (by - ay) * t;
          const ww = w * t;
          lines += `<line x1="${(px - uy * ww).toFixed(1)}" y1="${(py + ux * ww).toFixed(1)}" x2="${(px + uy * ww).toFixed(1)}" y2="${(py - ux * ww).toFixed(1)}"/>`;
        }
      }
    } else {
      lines += bondLines(x1, y1, x2, y2, b.order === 4 ? 1.5 : b.order, gap1, gap2);
    }
  }
  let texts = '';
  P.forEach(([x, y], i) => {
    const e = g.atoms[i].el;
    texts += `<g class="nt-a" data-a="${i}"><circle class="nt-hl" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="11"/><text x="${x.toFixed(1)}" y="${y.toFixed(1)}" class="${elClass(e)}">${e}</text></g>`;
  });
  const xs = P.map((p) => p[0]);
  const ys = P.map((p) => p[1]);
  return frame(`<g class="nt-b">${lines}</g>${solids}${texts}`, Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), label);
}

// ------------------------------------------------------------ helpers for checks

export function valenceOf(el) {
  return VALENCE[el] ?? 4;
}
