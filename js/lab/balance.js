// 反応式の天びん #/lab/balance?r=0.. (sort-and-arrange type, lesson 10).
// Change the coefficients with − / ＋; the number of each kind of atom on
// the left and the right is always shown, like a balance. When every kind
// agrees (with the smallest whole numbers) the equation is complete.
// The reactions are data (data/labs.json "reactions").
import { esc } from '../core/dom.js';
import { setQuery } from '../core/router.js';
import { labs } from '../core/data.js';

const SUBS = '₀₁₂₃₄₅₆₇₈₉';
const pretty = (f) => f.replace(/(\d+)/g, (d) => [...d].map((c) => SUBS[c]).join(''));

// "C3H8" -> { C: 3, H: 8 }; "Ca(OH)2" -> { Ca: 1, O: 2, H: 2 }
export function atoms(formula) {
  const stack = [{}];
  const re = /([A-Z][a-z]?|\(|\))(\d*)/g;
  let m;
  while ((m = re.exec(formula))) {
    const n = m[2] ? parseInt(m[2], 10) : 1;
    if (m[1] === '(') stack.push({});
    else if (m[1] === ')') {
      const g = stack.pop();
      for (const [el, c] of Object.entries(g)) stack[stack.length - 1][el] = (stack[stack.length - 1][el] || 0) + c * n;
    } else stack[stack.length - 1][m[1]] = (stack[stack.length - 1][m[1]] || 0) + n;
  }
  return stack[0];
}

export function count(side, coef) {
  const out = {};
  side.forEach((f, k) => { for (const [el, n] of Object.entries(atoms(f))) out[el] = (out[el] || 0) + n * coef[k]; });
  return out;
}

const gcdAll = (xs) => xs.reduce((a, b) => { while (b) [a, b] = [b, a % b]; return a; });

export async function render({ content, query }) {
  const list = (await labs()).reactions;
  let ri = Math.min(Math.max(parseInt(query.get('r') || '0', 10) || 0, 0), list.length - 1);
  let coef = [];
  const reset = () => { const r = list[ri]; coef = [...r.left, ...r.right].map(() => 1); };
  reset();

  function draw() {
    const r = list[ri];
    const L = coef.slice(0, r.left.length);
    const R = coef.slice(r.left.length);
    const cl = count(r.left, L);
    const cr = count(r.right, R);
    const els = [...new Set([...Object.keys(cl), ...Object.keys(cr)])];
    const even = els.every((el) => cl[el] === cr[el]);
    const simplest = gcdAll(coef) === 1;
    const done = even && simplest;
    const term = (f, k) => `<div class="rb-term"><div class="rb-co"><button data-c="${k}" data-d="-1" aria-label="${esc(f)} の係数を減らす"${coef[k] <= 1 ? ' disabled' : ''}>−</button><b class="${coef[k] === 1 ? 'one' : ''}" title="係数 1 は式では書かない">${coef[k]}</b><button data-c="${k}" data-d="1" aria-label="${esc(f)} の係数を増やす">＋</button></div><div class="rb-f">${esc(pretty(f))}</div></div>`;
    content.innerHTML = `
      <div class="chips-row" role="group" aria-label="反応">${list.map((x, k) => `<button class="chip" data-r="${k}" aria-pressed="${k === ri}">${esc(x.name)}</button>`).join('')}</div>
      <div class="rb-eq${done ? ' ok' : ''}">${r.left.map((f, k) => term(f, k)).join('<span class="rb-op">＋</span>')}<span class="rb-op">→</span>${r.right.map((f, k) => term(f, r.left.length + k)).join('<span class="rb-op">＋</span>')}</div>
      <div class="rb-scale" aria-live="polite">${els.map((el) => `<div class="rb-row${cl[el] === cr[el] ? ' ok' : ''}"><span class="rb-n">${cl[el] || 0}</span><span class="rb-el">${el}</span><span class="rb-n">${cr[el] || 0}</span><span class="rb-mark">${cl[el] === cr[el] ? '＝' : cl[el] > cr[el] ? '左が多い' : '右が多い'}</span></div>`).join('')}</div>
      <p class="lb-say">${done ? '<b>そろった！</b> 反応の前と後で、原子の種類と数は変わらない。' : even ? 'そろったけれど、もっと小さい数にできる。' : '左（反応前）と右（反応後）で、原子の数をそろえよう。'}</p>
      <button class="btn block" data-act="reset">係数をもどす</button>`;
  }

  content.addEventListener('click', (e) => {
    const b = e.target.closest('[data-c],[data-r],[data-act]');
    if (!b) return;
    if (b.dataset.c !== undefined) { const k = +b.dataset.c; coef[k] = Math.min(9, Math.max(1, coef[k] + +b.dataset.d)); }
    else if (b.dataset.r !== undefined) { ri = +b.dataset.r; reset(); setQuery({ r: String(ri) }); }
    else if (b.dataset.act === 'reset') reset();
    draw();
  });
  draw();
  return null;
}
