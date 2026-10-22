// Electron shell model drawing (spec E-2): nucleus with its charge and
// concentric K/L/M/N shells. Electrons on the L shell and beyond are
// placed on four sites (top, right, bottom, left), one each before they
// pair up, as in Japanese textbooks.
import { SHELLS } from './atoms.js';

export function ringRadius(i, { r0 = 30, step = 24 } = {}) {
  return r0 + 12 + i * step;
}

// angles (radians, 0 = top, clockwise) of n electrons on shell i
function pairAngles(i, n) {
  const out = [];
  if (n > 8) { // not used for Z <= 20; spread evenly
    for (let k = 0; k < n; k++) out.push((2 * Math.PI * k) / n);
    return out;
  }
  if (i === 0) {
    for (let k = 0; k < n; k++) out.push(k === 0 ? 0 : Math.PI);
    return out;
  }
  for (let k = 0; k < n; k++) {
    const site = k % 4;
    const paired = n > 4 && site < n - 4;
    const base = site * Math.PI / 2;
    const off = paired ? (k >= 4 ? 0.16 : -0.16) : 0;
    out.push(base + off);
  }
  return out;
}

export function electronXY(cx, cy, i, k, n, geo) {
  const a = pairAngles(i, n)[k];
  const r = ringRadius(i, geo);
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
}

/**
 * @param {object} o
 *   symbol, protons, shells: electrons per shell, rings: number of rings to draw,
 *   size (px), label (aria), interactive (rings and electrons are tappable),
 *   cls (extra class), mark: { shell, k } electron to highlight, geo { r0, step }
 */
export function shellSvg(o) {
  const rings = Math.max(o.rings || 0, o.shells.length);
  const geo = o.geo || { r0: 30, step: 24 };
  const R = ringRadius(rings - 1, geo) + 14;
  const size = o.size || R * 2;
  const c = R;
  let g = '';
  for (let i = 0; i < rings; i++) {
    const r = ringRadius(i, geo);
    g += `<circle class="ring" cx="${c}" cy="${c}" r="${r}"/>`;
    g += `<text class="ring-l" x="${c + r * Math.sin(-0.62)}" y="${c - r * Math.cos(-0.62) + 4}">${SHELLS[i]}</text>`;
    if (o.interactive) g += `<circle class="ring-hit" data-ring="${i}" cx="${c}" cy="${c}" r="${r}"><title>${SHELLS[i]}殻に電子を置く</title></circle>`;
  }
  g += `<circle class="nucleus" cx="${c}" cy="${c}" r="${geo.r0}"/>`;
  g += `<text class="nuc-sym" x="${c}" y="${c - 2}">${o.symbol}</text>`;
  g += `<text class="nuc-z" x="${c}" y="${c + 15}">+${o.protons}</text>`;
  o.shells.forEach((n, i) => {
    for (let k = 0; k < n; k++) {
      const [x, y] = electronXY(c, c, i, k, n, geo);
      const mark = o.mark && o.mark.shell === i && o.mark.k === k ? ' mark' : '';
      g += `<circle class="el${mark}" data-shell="${i}" data-k="${k}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6"/>`;
      if (o.interactive) g += `<circle class="el-hit" data-shell="${i}" data-k="${k}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="13"><title>この電子をとる</title></circle>`;
    }
  });
  return `<svg class="shells ${o.cls || ''}" viewBox="0 0 ${R * 2} ${R * 2}" width="${size}" height="${size}" role="img" aria-label="${o.label || ''}">${g}</svg>`;
}
