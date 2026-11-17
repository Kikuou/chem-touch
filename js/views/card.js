// 色カード #/card (docs/plan.md 提案5): the teacher shows a question, the
// student taps A–D, the whole screen turns that colour with the letter and
// shape, and the student holds the phone up. A tap chooses again. Nothing is
// sent or counted (no server).
import { icon } from '../core/icons.js';
import { goBack } from '../core/router.js';
import { CC } from '../lesson/colors.js';

export function renderCard({ el }) {
  document.documentElement.classList.add('cc-lock');
  let chosen = null;

  function draw() {
    if (chosen) {
      const c = CC.find((x) => x.key === chosen);
      el.innerHTML = `
        <button class="cc-up" data-act="again" style="background:${c.bg};color:${c.fg}" aria-label="${c.key}（${c.name}）。タップでえらび直す">
          <span class="cc-l">${c.key}</span><span class="cc-s">${c.shape}</span><span class="cc-h">タップでえらび直す</span>
        </button>`;
      return;
    }
    el.innerHTML = `
      <div class="cc-sel">
        <header><button class="iconbtn" data-act="close" aria-label="閉じる">${icon('close')}</button><h1>色カード</h1><span style="width:44px"></span></header>
        <p>先生の問題の答えをタップ。画面いっぱいに色が出たら、掲げてください。</p>
        <div class="cc-grid">${CC.map((c) => `<button data-key="${c.key}" style="background:${c.bg};color:${c.fg}" aria-label="${c.key}（${c.name}）">${c.key}<small>${c.shape}</small></button>`).join('')}</div>
      </div>`;
  }

  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-key],[data-act]');
    if (!b) return;
    if (b.dataset.key) chosen = b.dataset.key;
    else if (b.dataset.act === 'again') chosen = null;
    else if (b.dataset.act === 'close') return goBack('#/');
    draw();
  });
  draw();
  return () => document.documentElement.classList.remove('cc-lock');
}
