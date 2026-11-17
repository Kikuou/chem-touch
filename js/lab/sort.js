// なかまわけ #/lab/sort?set=<id> (sort type, docs/plan.md 提案9). Each card
// goes into one of the boxes (純物質 / 混合物, 単体 / 化合物 ...). Tap a box
// under a card: right -> the card turns green with one line of why; wrong ->
// it shakes and says why. The sets are data (data/labs.json "sorts").
import { esc } from '../core/dom.js';
import { setQuery } from '../core/router.js';
import { labs } from '../core/data.js';

export async function render({ content, query }) {
  const sets = (await labs()).sorts;
  const ids = Object.keys(sets);
  let id = sets[query.get('set')] ? query.get('set') : ids[0];
  let answers = {}; // item index -> chosen box
  const draft = (s) => (s.reviewed || s.items.every((i) => i.reviewed) ? '' : '<span class="draft" title="教員による確認前の下書きです">下書き</span>');

  function draw() {
    const s = sets[id];
    const done = s.items.filter((_, k) => answers[k] === s.items[k].box).length;
    content.innerHTML = `
      <div class="chips-row" role="group" aria-label="なかまわけの種類">${ids.map((k) => `<button class="chip" data-set="${k}" aria-pressed="${k === id}">${esc(sets[k].title)}</button>`).join('')}</div>
      <div class="fp-goal"><span>なかまわけ${draft(s)}</span><b>${esc(s.prompt)}</b></div>
      <div class="so-count" aria-live="polite">${done} / ${s.items.length}${done === s.items.length ? '　<b>ぜんぶ できた！</b>' : ''}</div>
      <div class="so-list">${s.items.map((it, k) => {
        const a = answers[k];
        const st = a === undefined ? '' : a === it.box ? ' ok' : ' ng';
        return `<div class="so-item${st}"><div class="so-name">${esc(it.name)}</div>
          <div class="so-boxes" role="group" aria-label="${esc(it.name)}">${s.boxes.map((b, bi) => `<button data-k="${k}" data-b="${bi}" aria-pressed="${a === bi}"${st === ' ok' ? ' disabled' : ''}>${esc(b)}</button>`).join('')}</div>
          ${a !== undefined ? `<p class="so-why">${a === it.box ? 'せいかい。' : `ちがいます（${esc(s.boxes[it.box])}）。`}${esc(it.why || '')}</p>` : ''}</div>`;
      }).join('')}</div>
      <button class="btn block" data-act="reset" style="margin-top:12px">はじめから</button>`;
  }

  content.addEventListener('click', (e) => {
    const b = e.target.closest('[data-k],[data-set],[data-act]');
    if (!b) return;
    if (b.dataset.set) { id = b.dataset.set; answers = {}; setQuery({ set: id }); }
    else if (b.dataset.act === 'reset') answers = {};
    else answers[+b.dataset.k] = +b.dataset.b;
    draw();
  });
  draw();
  return null;
}
