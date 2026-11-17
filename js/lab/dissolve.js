// とかすビーカー #/lab/dissolve (slider type, lesson 9). Two sliders: the
// water and the dissolved substance. The mass percent concentration is
// worked out in front of you; the dots in the beaker get denser.
import { esc } from '../core/dom.js';
import { labs } from '../core/data.js';

export async function render({ content }) {
  const d = (await labs()).dissolve;
  let water = d.water[2];
  let solute = d.solute[2];
  let si = 0;
  content.innerHTML = `
    <div class="chips-row" role="group" aria-label="とかすもの">${d.substances.map((s, k) => `<button class="chip" data-s="${k}" aria-pressed="${k === 0}">${esc(s)}</button>`).join('')}</div>
    <div class="lb-read"><span class="lb-big" aria-live="polite"></span><span class="lb-chip" style="background:#2C7DA0">質量パーセント濃度</span></div>
    <svg class="dv-beaker" viewBox="0 0 300 190" role="img" aria-label="ビーカー"><path d="M60 14 v140 a16 16 0 0 0 16 16 h148 a16 16 0 0 0 16 -16 v-140" fill="none" stroke="var(--muted)" stroke-width="3"/>
      <rect class="dv-water" x="63" width="174" rx="12" fill="#D9ECF7"/><g class="dv-dots"></g></svg>
    <div class="dv-eq" aria-live="polite"></div>
    <label class="dv-l">水 <b class="dv-w"></b> g</label>
    <div class="lb-slider dv-s"><input type="range" class="lb-range" data-k="water" min="${d.water[0]}" max="${d.water[1]}" step="10" value="${water}" aria-label="水（g）"></div>
    <label class="dv-l"><span class="dv-name"></span> <b class="dv-x"></b> g</label>
    <div class="lb-slider dv-s"><input type="range" class="lb-range" data-k="solute" min="${d.solute[0]}" max="${d.solute[1]}" step="1" value="${solute}" aria-label="とかすもの（g）"></div>
    <p class="lb-foot">ぜんぶとけるとして計算します。</p>`;

  function update() {
    const name = d.substances[si];
    const total = water + solute;
    const pct = total ? (solute / total) * 100 : 0;
    content.querySelector('.lb-big').textContent = `${Math.round(pct * 10) / 10} %`;
    content.querySelector('.dv-w').textContent = water;
    content.querySelector('.dv-x').textContent = solute;
    content.querySelector('.dv-name').textContent = name;
    content.querySelector('.dv-eq').innerHTML = `${solute} ÷ （${water} ＋ ${solute}）× 100 ＝ <b>${Math.round(pct * 10) / 10} %</b>`;
    // water level follows the total mass; dots follow the amount dissolved
    const h = 30 + (total / (d.water[1] + d.solute[1])) * 120;
    const rect = content.querySelector('.dv-water');
    rect.setAttribute('y', String(167 - h));
    rect.setAttribute('height', String(h));
    let dots = '';
    const n = Math.round(solute * 1.6);
    for (let k = 0; k < n; k++) {
      // spread evenly without visible rows (golden-ratio sequence)
      const x = 72 + ((k * 0.6180339) % 1) * 156;
      const y = 167 - h + 8 + ((k * 0.7548777 + 0.3) % 1) * Math.max(8, h - 16);
      dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="#6B7280"/>`;
    }
    content.querySelector('.dv-dots').innerHTML = dots;
  }
  content.addEventListener('input', (e) => {
    const r = e.target.closest('[data-k]');
    if (!r) return;
    if (r.dataset.k === 'water') water = +r.value; else solute = +r.value;
    update();
  });
  content.addEventListener('click', (e) => {
    const b = e.target.closest('[data-s]');
    if (!b) return;
    si = +b.dataset.s;
    content.querySelectorAll('[data-s]').forEach((x) => x.setAttribute('aria-pressed', x === b));
    update();
  });
  update();
  return null;
}
