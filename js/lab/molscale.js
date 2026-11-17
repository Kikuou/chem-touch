// モルのはかり #/lab/molscale (slider type, lesson 8). Choose a substance and
// move the amount in mol: its mass and the number of particles follow. One
// "bag" stands for 1 mol (6.0 × 10²³ particles).
import { esc } from '../core/dom.js';
import { labs } from '../core/data.js';

const SUBS = '₀₁₂₃₄₅₆₇₈₉';
const pretty = (f) => f.replace(/(\d+)/g, (d) => [...d].map((c) => SUBS[c]).join(''));

export async function render({ content }) {
  const all = await labs();
  const aw = all.calc.atomic_weights;
  const list = all.molscale.substances.map((s) => ({ ...s, M: Object.entries(s.atoms).reduce((t, [el, n]) => t + aw[el] * n, 0) }));
  let si = 0;
  let mol = 1;
  content.innerHTML = `
    <div class="chips-row" role="group" aria-label="物質">${list.map((s, k) => `<button class="chip" data-s="${k}" aria-pressed="${k === 0}">${esc(s.name)}</button>`).join('')}</div>
    <div class="lb-read"><span class="lb-big" aria-live="polite"></span><span class="lb-chip" style="background:#2F6F4F"></span></div>
    <div class="ms-bags" aria-hidden="true"></div>
    <div class="ms-facts" aria-live="polite"></div>
    <div class="lb-slider" style="margin-bottom:14px"><input type="range" class="lb-range ms-range" min="0.5" max="5" step="0.5" value="1" aria-label="物質量（mol）"></div>
    <p class="lb-say">1 mol の質量は、分子量（式量）に g をつけた値。</p>
    <p class="lb-foot">原子量は ${Object.entries(aw).map(([k, v]) => `${k}=${Number.isInteger(v) && v < 10 ? v.toFixed(1) : v}`).join('、')} として計算。</p>`;
  function update() {
    const s = list[si];
    const g = Math.round(s.M * mol * 10) / 10;
    content.querySelector('.lb-big').textContent = `${mol} mol`;
    content.querySelector('.lb-chip').textContent = `${s.name} ${pretty(s.formula)}`;
    const full = Math.floor(mol);
    const part = mol - full;
    content.querySelector('.ms-bags').innerHTML = Array.from({ length: full }, () => '<i class="ms-bag"><b>1 mol</b></i>').join('') + (part ? `<i class="ms-bag half" style="--f:${part}"><b>${part} mol</b></i>` : '');
    content.querySelector('.ms-facts').innerHTML = `<div><span>質量</span><b>${g} g</b><small>${Math.round(s.M * 10) / 10} g × ${mol}</small></div><div><span>粒子の数</span><b>${(6.0 * mol).toFixed(1)} × 10²³ 個</b><small>6.0 × 10²³ × ${mol}</small></div>`;
  }
  content.querySelector('.ms-range').addEventListener('input', (e) => { mol = +e.target.value; update(); });
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
