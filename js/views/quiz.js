// Functional-group quiz (spec A-17): "tap the ... group of this molecule".
// Answers are checked at once and nothing is stored (phase ③ extends it).
//   #/quiz            random molecule
//   #/quiz?id=<id>    a given molecule
import { esc } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { compound, compounds, sdf as loadSdf } from '../core/data.js';
import { navigate } from '../core/router.js';
import { mountMolPanel } from '../mol/molpanel.js';
import { matchFunctionalGroups, highlightGroups } from '../mol/fgroups.js';

const score = { right: 0, total: 0 }; // this visit only

export async function renderQuiz({ el, query, isCurrent }) {
  const list = (await compounds()).filter((c) => c.kind !== 'crystal' && c.smiles);
  el.innerHTML = `
  <div class="page wide">
    <header class="topbar">
      <h1 class="brand" style="font-size:20px">官能基クイズ</h1>
      <div class="quiz-score" aria-live="polite">${score.total ? `${score.right} / ${score.total} 問正解` : ''}</div>
    </header>
    <div class="card quiz-q"><div class="spinner"></div></div>
    <div class="molpanel"></div>
    <div class="quiz-acts">
      <button class="btn" data-act="answer">${icon('info')}答えを見る</button>
      <button class="btn primary" data-act="next">次の問題 ${icon('chev')}</button>
    </div>
  </div>`;

  // pick a molecule that has at least one functional group
  let c = query.get('id') ? await compound(query.get('id')) : null;
  let sdfText = null;
  let found = [];
  for (let tries = 0; tries < 12; tries++) {
    if (!c) c = list[Math.floor(Math.random() * list.length)];
    sdfText = await loadSdf(c);
    found = await matchFunctionalGroups({ molblock: sdfText });
    if (found.length) break;
    c = null;
  }
  if (!isCurrent()) return null;
  if (!found.length) {
    el.querySelector('.quiz-q').innerHTML = '<p>この分子には出題できる官能基がありません。</p>';
    return null;
  }
  const target = found[Math.floor(Math.random() * found.length)];
  const q = el.querySelector('.quiz-q');
  q.innerHTML = `
    <div class="small muted">${esc(c.name_ja)}（${esc(c.name_en)}）</div>
    <p class="quiz-text"><b>${esc(target.group.name)}</b>の原子をタップしよう</p>
    <p class="small muted">3Dモデルと構造式のどちらをタップしてもOK。${target.matches.length > 1 ? `この分子には${target.matches.length}か所あります。` : ''}</p>
    <div class="quiz-result" aria-live="assertive"></div>`;

  const panel = mountMolPanel(el.querySelector('.molpanel'), { sdf: sdfText, groups: false });
  await panel.ready;
  if (!isCurrent()) { panel.destroy(); return null; }
  const answer = highlightGroups(found, panel.graph, new Set([target.group.id]))
    .filter((g) => g.id === target.group.id);
  const ok = new Set(answer.flatMap((g) => g.atoms));
  let answered = false;
  const result = q.querySelector('.quiz-result');

  function reveal() {
    panel.highlight(answer);
  }
  panel.onTap((i) => {
    if (answered) return false; // after the answer, taps show atom info again
    if (ok.has(i)) {
      answered = true;
      score.right++;
      score.total++;
      result.innerHTML = `<div class="quiz-ok">${icon('star')}正解！ ${esc(target.group.name)}はここです。</div>`;
      reveal();
    } else {
      result.innerHTML = '<div class="quiz-ng">ちがいます。もう一度さがしてみよう。</div>';
    }
    el.querySelector('.quiz-score').textContent = score.total ? `${score.right} / ${score.total} 問正解` : '';
    return true;
  });

  el.querySelector('.quiz-acts').addEventListener('click', (e) => {
    const act = e.target.closest('button')?.dataset.act;
    if (act === 'answer' && !answered) {
      answered = true;
      score.total++;
      el.querySelector('.quiz-score').textContent = `${score.right} / ${score.total} 問正解`;
      result.innerHTML = `<div class="quiz-ng">答え：色のついた部分が${esc(target.group.name)}です。</div>`;
      reveal();
    }
    if (act === 'next') navigate(`#/quiz?n=${Date.now() % 100000}`, { replace: true });
  });
  return () => panel.destroy();
}
