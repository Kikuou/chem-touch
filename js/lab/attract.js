// ひきあう分子 #/lab/attract (particle type, lesson 6). Water and methane are
// small molecules of nearly the same size, but at 25 ℃ water is a liquid
// and methane a gas: water molecules pull on each other (hydrogen bonds,
// drawn as dotted lines). Boiling points from PubChem (states.json and
// series.json). With "reduce motion" the picture stands still.
import { states, seriesData } from '../core/data.js';

const W = 320;
const H = 230;
const PAD = 14;
const at = (x, y, r, fill) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"${fill === '#F2F3F5' ? ' stroke="#9AA3AE" stroke-width=".8"' : ''}/>`;
const GLYPH = {
  water: at(5.2, 6.7, 4.2, '#F2F3F5') + at(5.2, -6.7, 4.2, '#F2F3F5') + at(0, 0, 7.5, '#E5484D'),
  methane: at(7, 0, 3.8, '#F2F3F5') + at(-7, 0, 3.8, '#F2F3F5') + at(0, 7, 3.8, '#F2F3F5') + at(0, -7, 3.8, '#F2F3F5') + at(0, 0, 6.5, '#4B5563'),
};
const fmt = (v) => (v === null || v === undefined ? '—' : `${v < 0 ? '−' : ''}${Math.abs(v)}`);

export async function render({ content }) {
  const [st, se] = await Promise.all([states(), seriesData()]);
  const bpWater = st.find((s) => s.id === 'water')?.bp?.value ?? null;
  const bpMethane = se.series.find((s) => s.id === 'alkane')?.members.find((m) => m.id === 'methane')?.bp?.value ?? null;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let mode = 'water';
  let raf = 0;
  let parts = [];
  let last = 0;
  const N = 30;
  const top = H - PAD - 110;

  content.innerHTML = `
    <div class="chips-row" role="group" aria-label="分子">${[['water', '水 H₂O'], ['methane', 'メタン CH₄']].map(([k, l]) => `<button class="chip" data-m="${k}" aria-pressed="${k === mode}">${l}</button>`).join('')}</div>
    <div class="lb-read"><span class="lb-big">25 ℃</span><span class="lb-chip"></span></div>
    <div class="lb-stage"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="25 ℃ の分子のようす">
      <rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="14" fill="var(--surface)" stroke="var(--line)" stroke-width="2"/>
      <rect class="at-liq" x="6" y="${top - 6}" width="${W - 12}" height="${H - top}" rx="10" fill="#D9ECF7"/>
      <g class="at-bonds" stroke="#1F6F9F" stroke-width="2.2" stroke-dasharray="3 3" stroke-linecap="round"></g><g class="at-mols"></g></svg></div>
    <p class="lb-say"></p>
    <div class="at-bp"><div><span>水の沸点</span><b>${fmt(bpWater)} ℃</b></div><div><span>メタンの沸点</span><b>${fmt(bpMethane)} ℃</b></div></div>
    <p class="credit">沸点（1気圧）: PubChem。どちらも分子量は 16〜18 くらいの小さい分子。</p>`;

  function setup() {
    cancelAnimationFrame(raf);
    const g = content.querySelector('.at-mols');
    g.innerHTML = Array.from({ length: N }, () => `<g>${GLYPH[mode]}</g>`).join('');
    const nodes = [...g.children];
    parts = nodes.map((node) => {
      const a = Math.random() * 6.3;
      const v = mode === 'water' ? 0 : 90 + Math.random() * 60;
      return { node, x: PAD + 14 + Math.random() * (W - 2 * PAD - 28), y: mode === 'water' ? top + 10 + Math.random() * (H - PAD - top - 20) : PAD + 14 + Math.random() * (H - 2 * PAD - 28), vx: Math.cos(a) * v, vy: Math.sin(a) * v, a: Math.random() * 6.3, w: (Math.random() - 0.5) * (mode === 'water' ? 2 : 6) };
    });
    content.querySelector('.at-liq').style.display = mode === 'water' ? '' : 'none';
    const chip = content.querySelector('.lb-chip');
    chip.textContent = mode === 'water' ? '液体' : '気体';
    chip.style.background = mode === 'water' ? '#2F6F4F' : '#C2410C';
    content.querySelector('.lb-say').innerHTML = mode === 'water'
      ? '水の分子は <b>おたがいに引き合う</b>（点線＝水素結合）。だから 25 ℃ でも液体。'
      : 'メタンの分子は <b>ほとんど引き合わない</b>。だから 25 ℃ では気体。';
    draw();
    if (!still) { last = 0; raf = requestAnimationFrame(tick); }
  }

  function draw() {
    let bonds = '';
    for (const p of parts) p.node.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${(p.a * 57.3).toFixed(0)})`);
    if (mode === 'water') {
      for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
        const d = Math.hypot(parts[i].x - parts[j].x, parts[i].y - parts[j].y);
        if (d < 30 && d > 14) bonds += `<line x1="${parts[i].x.toFixed(1)}" y1="${parts[i].y.toFixed(1)}" x2="${parts[j].x.toFixed(1)}" y2="${parts[j].y.toFixed(1)}"/>`;
      }
    }
    content.querySelector('.at-bonds').innerHTML = bonds;
  }

  function tick(t) {
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
    last = t;
    for (const p of parts) {
      if (mode === 'water') {
        p.vx = (p.vx + (Math.random() - 0.5) * 30) * 0.88;
        p.vy = (p.vy + (Math.random() - 0.5) * 30) * 0.88;
      }
      p.x += p.vx * dt; p.y += p.vy * dt; p.a += p.w * dt;
      const y0 = mode === 'water' ? top + 8 : PAD + 12;
      if (p.x < PAD + 12 || p.x > W - PAD - 12) { p.vx = -p.vx; p.x = Math.min(Math.max(p.x, PAD + 12), W - PAD - 12); }
      if (p.y < y0 || p.y > H - PAD - 12) { p.vy = -p.vy; p.y = Math.min(Math.max(p.y, y0), H - PAD - 12); }
    }
    draw();
    raf = requestAnimationFrame(tick);
  }

  content.addEventListener('click', (e) => {
    const b = e.target.closest('[data-m]');
    if (!b) return;
    mode = b.dataset.m;
    content.querySelectorAll('[data-m]').forEach((x) => x.setAttribute('aria-pressed', x === b));
    setup();
  });
  setup();
  return () => cancelAnimationFrame(raf);
}
