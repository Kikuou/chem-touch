// 分子量カウンター #/lab/mwcount (lesson 8). Choose a molecule; tap each kind
// of atom to add "atomic weight × number" to the total. When every kind is
// counted, the total is the molecular weight.
import { esc } from '../core/dom.js';
import { labs } from '../core/data.js';

const SUBS = '₀₁₂₃₄₅₆₇₈₉';
const pretty = (f) => f.replace(/(\d+)/g, (d) => [...d].map((c) => SUBS[c]).join(''));
const r1 = (v) => Math.round(v * 10) / 10;

export async function render({ content }) {
  const all = await labs();
  const aw = all.calc.atomic_weights;
  const show = (el) => (Number.isInteger(aw[el]) && aw[el] < 10 ? aw[el].toFixed(1) : String(aw[el]));
  const list = all.calc.kinds['molar-mass'].problems;
  let mi = 0;
  let counted = new Set();

  function draw() {
    const m = list[mi];
    const els = Object.entries(m.atoms);
    const total = els.filter(([el]) => counted.has(el)).reduce((s, [el, n]) => s + aw[el] * n, 0);
    const done = counted.size === els.length;
    content.innerHTML = `
      <div class="chips-row" role="group" aria-label="分子">${list.map((x, k) => `<button class="chip" data-m="${k}" aria-pressed="${k === mi}">${esc(x.name)}</button>`).join('')}</div>
      <div class="lb-read"><span class="lb-big">${esc(pretty(m.formula))}</span><span class="lb-chip" style="background:#2F6F4F">${esc(m.name)}</span></div>
      <div class="mw-tiles">${els.map(([el, n]) => `<button class="mw-tile${counted.has(el) ? ' on' : ''}" data-el="${el}" aria-pressed="${counted.has(el)}"><b>${el}</b><span>${show(el)} × ${n}</span><em>${counted.has(el) ? `＝ ${r1(aw[el] * n)}` : 'タップ'}</em></button>`).join('')}</div>
      <div class="mw-sum${done ? ' ok' : ''}" aria-live="polite">${counted.size ? els.filter(([el]) => counted.has(el)).map(([el, n]) => r1(aw[el] * n)).join(' ＋ ') : '0'} ＝ <b>${r1(total)}</b></div>
      <p class="lb-say">${done ? `<b>分子量は ${r1(total)}</b>。1 mol の質量は ${r1(total)} g。` : '原子の種類ごとに「原子量 × 個数」をたしていこう。'}</p>
      <button class="btn block" data-act="reset">はじめから</button>`;
  }
  content.addEventListener('click', (e) => {
    const b = e.target.closest('[data-el],[data-m],[data-act]');
    if (!b) return;
    if (b.dataset.el) counted.add(b.dataset.el);
    else if (b.dataset.m) { mi = +b.dataset.m; counted = new Set(); }
    else counted = new Set();
    draw();
  });
  draw();
  return null;
}
