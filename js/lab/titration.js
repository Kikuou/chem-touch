// 中和の滴定 #/lab/titration (slider type, lesson 12). Add sodium hydroxide
// solution to hydrochloric acid with the slider: the pH (strong acid and
// strong base, 25 ℃, calculated from the amounts only) moves along the
// curve, and the beaker takes the colour of the pH scale.
import { labs } from '../core/data.js';
import { STOPS } from './ph.js';

// pH after adding vb mL of base (all strong, monovalent here)
export function phAfter({ ca, va, cb }, vb) {
  const na = (ca * va) / 1000;
  const nb = (cb * vb) / 1000;
  const v = (va + vb) / 1000;
  if (Math.abs(na - nb) < 1e-12) return 7;
  return na > nb ? -Math.log10((na - nb) / v) : 14 + Math.log10((nb - na) / v);
}

export async function render({ content }) {
  const t = (await labs()).titration;
  const veq = (t.ca * t.va) / t.cb;
  const vmax = veq * 2;
  let vb = 0;
  const W = 300;
  const H = 180;
  const X = (v) => 30 + (v / vmax) * (W - 40);
  const Y = (p) => H - 20 - (p / 14) * (H - 30);
  let path = '';
  for (let v = 0; v <= vmax + 1e-9; v += vmax / 200) path += `${path ? 'L' : 'M'}${X(v).toFixed(1)} ${Y(phAfter(t, v)).toFixed(1)}`;

  content.innerHTML = `
    <div class="fp-goal"><span>じっけん</span><b>${t.ca} mol/L の塩酸 ${t.va} mL に、${t.cb} mol/L の水酸化ナトリウム水溶液を加えていく</b></div>
    <div class="lb-read"><span class="lb-big" aria-live="polite"></span><span class="lb-chip"></span></div>
    <svg class="ti-graph" viewBox="0 0 ${W} ${H}" role="img" aria-label="加えた量と pH のグラフ">
      <rect x="30" y="10" width="${W - 40}" height="${H - 30}" fill="var(--surface)" stroke="var(--line)"/>
      ${[0, 7, 14].map((p) => `<text x="24" y="${Y(p) + 4}" text-anchor="end" font-size="10" fill="var(--muted)">${p}</text><line x1="30" x2="${W - 10}" y1="${Y(p)}" y2="${Y(p)}" stroke="var(--line)" stroke-dasharray="${p === 7 ? '3 3' : '0'}"/>`).join('')}
      <line x1="${X(veq)}" x2="${X(veq)}" y1="10" y2="${H - 20}" stroke="var(--accent)" stroke-dasharray="4 3"/>
      <text x="${X(veq)}" y="${H - 6}" text-anchor="middle" font-size="10" fill="var(--accent-ink)">中和点 ${veq} mL</text>
      <text x="${W - 10}" y="${H - 6}" text-anchor="end" font-size="10" fill="var(--muted)">${vmax} mL</text>
      <path d="${path}" fill="none" stroke="var(--text)" stroke-width="2"/>
      <circle class="ti-dot" r="7" fill="#fff" stroke="var(--text)" stroke-width="3"/>
    </svg>
    <div class="lb-slider" style="margin-bottom:16px"><input type="range" class="lb-range ti-range" min="0" max="${vmax}" step="0.5" value="0" aria-label="加えた水酸化ナトリウム水溶液（mL）"></div>
    <p class="lb-say"></p>
    <p class="lb-foot">強い酸と強い塩基、25 ℃ として量だけから計算した pH です。</p>`;
  const range = content.querySelector('.ti-range');
  function update() {
    const p = phAfter(t, vb);
    const r = Math.round(p * 10) / 10;
    content.querySelector('.lb-big').textContent = `${vb} mL ・ pH ${r}`;
    const chip = content.querySelector('.lb-chip');
    chip.textContent = r < 6.95 ? '酸性' : r > 7.05 ? '塩基性' : '中性（中和点）';
    chip.style.background = STOPS[Math.round(r)];
    chip.style.color = r >= 3 && r <= 4 ? '#121417' : '#fff';
    const dot = content.querySelector('.ti-dot');
    dot.setAttribute('cx', X(vb).toFixed(1));
    dot.setAttribute('cy', Y(p).toFixed(1));
    content.querySelector('.lb-say').innerHTML = vb < veq - 1e-9
      ? `まだ <b>酸が多い</b>。H⁺ が OH⁻ より ${((t.ca * t.va - t.cb * vb) / 1000).toFixed(4).replace(/0+$/, '')} mol 多い。`
      : vb > veq + 1e-9 ? '中和点を過ぎて、<b>塩基が多い</b>。' : '<b>ちょうど中和</b>。H⁺ と OH⁻ が同じ量で、水と塩（NaCl）ができた。';
  }
  range.addEventListener('input', () => { vb = +range.value; update(); });
  update();
  return null;
}
