// Fatty-acid notation (spec B-4): the carbon chain counted from the methyl
// (omega) end with the n-3 / n-6 / n-9 position in colour, or counted from
// the carboxyl carbon (delta numbering). Also marks the position in 3D.
import { esc } from '../core/dom.js';

const N_COLORS = { 3: '#009E73', 6: '#D55E00', 7: '#CC79A7', 9: '#0072B2' };

// SDF indices of the chain carbons C1 (carboxyl) ... Cn (methyl end)
export function chainAtoms(graph) {
  const nb = (i) => graph.bonds.filter((b) => b.a === i || b.b === i).map((b) => (b.a === i ? b.b : b.a));
  const z = (i) => graph.atoms[i].z;
  const c1 = graph.atoms.findIndex((a, i) => a.z === 6 && nb(i).filter((j) => z(j) === 8).length === 2);
  if (c1 < 0) return [];
  const chain = [c1];
  for (;;) {
    const next = nb(chain[chain.length - 1]).filter((j) => z(j) === 6 && !chain.includes(j));
    if (next.length !== 1) break;
    chain.push(next[0]);
  }
  return chain;
}

export function faColor(omega) {
  return N_COLORS[omega] || '#6B7280';
}

// SVG zigzag of the chain, omega end on the left
export function chainSvg(fa, mode) {
  const n = fa.carbons;
  const W = 340;
  const pad = 22;
  const dx = Math.min(18, (W - 2 * pad - 30) / Math.max(n - 1, 1));
  const y0 = 46;
  const dy = 9;
  const col = faColor(fa.omega);
  const dbl = new Map(fa.double_bonds.map((d) => [d.pos_delta, d.geometry]));
  // carbon with delta number k is drawn at position m = n - k + 1 from the left
  const P = (k) => {
    const m = n - k + 1;
    return { x: pad + (m - 1) * dx, y: y0 + (m % 2 ? dy : -dy) };
  };
  let s = '';
  for (let k = n; k > 1; k--) {
    const a = P(k);
    const b = P(k - 1);
    const isDbl = dbl.has(k - 1); // bond between C(k-1) and C(k)
    const first = fa.omega && k - 1 === n - fa.omega; // first C=C from the omega end
    s += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${isDbl ? (first && mode === 'n' ? col : 'currentColor') : 'currentColor'}" stroke-width="${isDbl ? 2.4 : 1.6}"/>`;
    if (isDbl) {
      // second line: parallel, 3.5 px towards the middle of the zigzag, shortened
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      let nx = -(b.y - a.y) / len;
      let ny = (b.x - a.x) / len;
      const my = (a.y + b.y) / 2;
      if ((my + ny * 3.5 - y0) ** 2 > (my - y0) ** 2) { nx = -nx; ny = -ny; }
      const t = 0.18;
      const x1 = a.x + (b.x - a.x) * t + nx * 3.5;
      const y1 = a.y + (b.y - a.y) * t + ny * 3.5;
      const x2 = b.x - (b.x - a.x) * t + nx * 3.5;
      const y2 = b.y - (b.y - a.y) * t + ny * 3.5;
      s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${first && mode === 'n' ? col : 'currentColor'}" stroke-width="1.8"/>`;
      if (mode === 'd') {
        const mx = (a.x + b.x) / 2;
        s += `<text x="${mx}" y="${y0 - 22}" font-size="9" text-anchor="middle" fill="currentColor">Δ${k - 1}${dbl.get(k - 1) === 'cis' ? 'c' : 't'}</text>`;
      }
    }
  }
  // COOH at the right end
  const c1 = P(1);
  s += `<text x="${c1.x + 4}" y="${c1.y + 4}" font-size="11" font-weight="700" fill="#E5484D">COOH</text>`;
  // numbers
  for (let k = 1; k <= n; k++) {
    const p = P(k);
    const m = n - k + 1;
    const num = mode === 'n' ? m : k;
    const isTarget = mode === 'n' && fa.omega && m === fa.omega;
    if (mode === 'n' && fa.omega && m <= fa.omega) {
      s += `<circle cx="${p.x}" cy="${p.y}" r="5" fill="${col}" opacity="${isTarget ? 1 : 0.45}"/>`;
    }
    if (num === 1 || num % (n > 12 ? 2 : 1) === 0 || isTarget) {
      s += `<text x="${p.x}" y="${y0 + 30}" font-size="9" text-anchor="middle" fill="${isTarget ? col : 'currentColor'}" ${isTarget ? 'font-weight="700"' : 'opacity="0.7"'}>${num}</text>`;
    }
  }
  if (mode === 'n') {
    s += `<text x="${pad - 6}" y="${y0 + 46}" font-size="10" fill="currentColor" opacity="0.8">← ω末端（メチル基）から数える</text>`;
    if (fa.omega) {
      const p = P(n - fa.omega + 1);
      s += `<text x="${p.x}" y="${y0 - 22}" font-size="11" font-weight="700" text-anchor="middle" fill="${col}">n-${fa.omega}</text>`;
    }
  } else {
    s += `<text x="${W - pad}" y="${y0 + 46}" font-size="10" text-anchor="end" fill="currentColor" opacity="0.8">カルボキシ基の炭素から数える →</text>`;
  }
  return `<svg viewBox="0 0 ${W} 98" class="fa-svg" role="img" aria-label="${esc(fa.notation)}">${s}</svg>`;
}

export function faCardHtml(fa) {
  const nCls = fa.omega ? `n-${fa.omega}系` : '飽和脂肪酸';
  return `
  <section class="card fa-card">
    <h2 class="section-title" style="margin-top:0">脂肪酸の表し方</h2>
    <div class="fa-head"><b>${esc(fa.notation)}</b><span class="badge" style="background:${faColor(fa.omega)}22;color:${faColor(fa.omega)}">${esc(nCls)}</span></div>
    <div class="seg fa-mode" role="group" aria-label="数え方">
      <button data-fa="n" aria-pressed="true">n-（ω）表記</button>
      <button data-fa="d" aria-pressed="false">Δ表記</button>
    </div>
    <div class="fa-chart"></div>
    <p class="small muted fa-help"></p>
    ${fa.omega ? '<button class="toggle" data-fa3d aria-pressed="false">3Dで位置を表示</button>' : ''}
  </section>`;
}

export function faHelp(fa, mode) {
  if (mode === 'n') {
    return fa.omega
      ? `メチル基の端（ω末端）から数えて${fa.omega}番目の炭素に最初の二重結合があるので「n-${fa.omega}系（ω${fa.omega}）」と呼びます。栄養学ではこの数え方を使います。`
      : '二重結合がないので飽和脂肪酸です。';
  }
  return fa.double_bonds.length
    ? `カルボキシ基の炭素を1番として数えます（Δ表記）。c はシス形、t はトランス形の二重結合です。`
    : 'カルボキシ基の炭素を1番として数えます。二重結合はありません。';
}
