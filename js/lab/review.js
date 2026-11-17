// 総まとめクイズ #/lab/review (lesson 15): 10 questions drawn at random from
// the question bank of all lessons (the colour cards and おわりの3問),
// 4 choices, and at the end a link back to the lesson of each missed one.
// The best score is kept on this device only.
import { esc, prefs } from '../core/dom.js';
import { questions } from '../core/data.js';
import { CC } from '../lesson/colors.js';
import { glossary, linkTerms } from '../lesson/glossary.js';

const COUNT = 10;
const DRAFT = '<span class="draft" title="教員による確認前の下書きです">下書き</span>';

export async function render({ content }) {
  const all = [...(await questions()).values()];
  await glossary().catch(() => null);
  let list = [];
  let i = 0;
  let answers = [];
  const start = () => {
    list = [...all].sort(() => Math.random() - 0.5).slice(0, COUNT);
    i = 0;
    answers = [];
  };

  function draw() {
    if (i >= list.length) {
      const score = answers.filter((a, k) => a === list[k].answer).length;
      const best = Math.max(score, parseInt(prefs.get('review:best', '0'), 10) || 0);
      prefs.set('review:best', String(best));
      content.innerHTML = `<section class="ls-res">
        <div class="small muted">総まとめクイズ</div>
        <div class="ls-res-big">${score}<small> / ${list.length} 問</small></div>
        <p class="small muted">これまでの最高: ${best} 問（この端末だけ）</p>
        <ul>${list.map((q, k) => `<li><b class="${answers[k] === q.answer ? 'ok' : 'ng'}">${answers[k] === q.answer ? '○' : '×'}</b><span>${esc(q.q)}${answers[k] === q.answer ? '' : `<br><a class="small" href="#/lesson/${q.lesson}">第${q.lesson}回を見直す ›</a>`}</span></li>`).join('')}</ul>
        <button class="btn primary block" data-act="again">もう一度（ちがう問題）</button></section>`;
      return;
    }
    const q = list[i];
    const a = answers[i];
    const done = a !== undefined;
    content.innerHTML = `<section class="ls-q">
      <div class="ls-q-p"><span>第${q.lesson}回から</span><span>${i + 1} / ${list.length}</span></div>
      <h2>${esc(q.q)}${q.reviewed ? '' : DRAFT}</h2>
      <div class="ls-q-o">${q.choices.map((c, k) => `<button data-k="${k}" class="${done ? (k === q.answer ? 'ok' : k === a ? 'ng' : '') : ''}"${done ? ' disabled' : ''}><i>${CC[k].key}</i>${esc(c)}</button>`).join('')}</div>
      ${done ? `<div class="ls-q-ex${a === q.answer ? '' : ' ng'}">${a === q.answer ? 'せいかい。' : `ざんねん。答えは ${CC[q.answer].key}。`}${linkTerms(q.explain || '')}</div>
      <button class="btn primary block" data-act="next" style="margin-top:12px">${i < list.length - 1 ? 'つぎへ' : '結果を見る'}</button>` : ''}</section>`;
  }
  content.addEventListener('click', (e) => {
    const b = e.target.closest('[data-k],[data-act]');
    if (!b) return;
    if (b.dataset.k !== undefined && answers[i] === undefined) answers[i] = +b.dataset.k;
    else if (b.dataset.act === 'next') i++;
    else if (b.dataset.act === 'again') start();
    draw();
  });
  start();
  draw();
  return null;
}
