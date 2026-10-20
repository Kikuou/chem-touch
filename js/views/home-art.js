// Lightweight SVG illustrations for the home tiles (ported from
// mockups/common.js). Static pictures keep the home screen fast; the real
// 3D viewer is only loaded on the molecule screens.

const COL = { O: '#E5484D', C: '#4B5563', N: '#3B82F6', H: '#F2F3F5' };

function sphereDefs(id) {
  return `<defs>${Object.entries(COL).map(([k, c]) => `<radialGradient id="${id}${k}" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset=".35" stop-color="${c}"/><stop offset="1" stop-color="${c}" stop-opacity="1"/></radialGradient>`).join('')}</defs>`;
}

// atoms: [element, x, y, scale?, depth?]
function mol(atoms, bonds, vb, id) {
  let s = `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${sphereDefs(id)}`;
  bonds.forEach(([a, b]) => {
    const A = atoms[a];
    const B = atoms[b];
    s += `<line x1="${A[1]}" y1="${A[2]}" x2="${B[1]}" y2="${B[2]}" stroke="#AEB4BD" stroke-width="5" stroke-linecap="round"/>`;
  });
  atoms.map((a, i) => [a, i]).sort((p, q) => (p[0][4] || 0) - (q[0][4] || 0)).forEach(([a]) => {
    const r = { O: 13, C: 12, N: 12, H: 7 }[a[0]] * (a[3] || 1);
    s += `<circle cx="${a[1]}" cy="${a[2]}" r="${r}" fill="url(#${id}${a[0]})" ${a[0] === 'H' ? 'stroke="#C9CDD3" stroke-width="1"' : ''}/>`;
  });
  return s + '</svg>';
}

// glucopyranose-like ring (pseudo 3D)
const GLU_A = [['O', 150, 60, 1, 1], ['C', 185, 82], ['C', 165, 112, 1.05, 2], ['C', 120, 117, 1.05, 2], ['C', 85, 95], ['C', 105, 64],
  ['O', 222, 72], ['O', 182, 142, 1.05, 3], ['O', 108, 148, 1.05, 3], ['O', 50, 108], ['C', 88, 36, 0.95, -1], ['O', 55, 28, 0.95, -1],
  ['H', 238, 86, 1, 4], ['H', 198, 154, 1, 4], ['H', 95, 162, 1, 4], ['H', 35, 96, 1, 4], ['H', 40, 40, 1, -1]];
const GLU_B = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [1, 6], [2, 7], [3, 8], [4, 9], [5, 10], [10, 11], [6, 12], [7, 13], [8, 14], [9, 15], [11, 16]];

export function glucoseArt(id = 'g') {
  return mol(GLU_A, GLU_B, '20 10 235 165', id);
}

// chiral centre (alanine-like) and its mirror image
export function chiralArt(id, flip) {
  const f = (x) => (flip ? 140 - x : x);
  const A = [['C', f(70), 70, 1.1, 2], ['N', f(30), 45], ['C', f(108), 40], ['O', f(118), 15, 0.9], ['O', f(140), 52, 0.9], ['C', f(60), 112, 1, 3], ['H', f(95), 95, 1.2, 4]];
  return mol(A, [[0, 1], [0, 2], [2, 3], [2, 4], [0, 5], [0, 6]], '-12 0 174 130', id);
}

// mini periodic table, highlighted atomic numbers in `hi`
export function miniTable(hi = [], cell = 6, gap = 2) {
  const rows = [
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1],
    [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  ];
  let s = '';
  let z = 0;
  rows.forEach((r, y) => r.forEach((v, x) => {
    if (!v) return;
    z++;
    const on = hi.includes(z);
    s += `<rect x="${x * (cell + gap)}" y="${y * (cell + gap)}" width="${cell}" height="${cell}" rx="1.5" fill="${on ? 'var(--accent)' : 'currentColor'}" opacity="${on ? 1 : 0.22}"/>`;
  }));
  return `<svg viewBox="0 0 ${18 * (cell + gap)} ${5 * (cell + gap)}" width="100%" aria-hidden="true">${s}</svg>`;
}

export function shellArt() {
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="9" fill="var(--accent)"/><circle cx="50" cy="50" r="22" fill="none" stroke="var(--mini-dim)" stroke-width="1.5"/><circle cx="50" cy="50" r="36" fill="none" stroke="var(--mini-dim)" stroke-width="1.5"/><g fill="var(--text)"><circle cx="72" cy="50" r="3.6"/><circle cx="28" cy="50" r="3.6"/><circle cx="50" cy="14" r="3.6"/><circle cx="50" cy="86" r="3.6"/><circle cx="25.5" cy="25.5" r="3.6"/><circle cx="74.5" cy="74.5" r="3.6"/><circle cx="74.5" cy="25.5" r="3.6"/><circle cx="25.5" cy="74.5" r="3.6"/><circle cx="86" cy="50" r="3.6"/><circle cx="14" cy="50" r="3.6"/></g></svg>`;
}

export function chainArt() {
  return `<svg viewBox="0 0 132 50" aria-hidden="true"><path d="M8 34l20-14 20 14 20-14 20 14 20-14" fill="none" stroke="var(--chain)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/><text x="104" y="14" font-size="11" fill="#E5484D" font-weight="700">OH</text></svg>`;
}
