// たしかめる #/check (docs/plan.md 提案6): the screens to check what was
// learnt, in one place, with the できた印 kept on this device only:
// おわりの3問 (per lesson), 計算練習 (per kind), 総まとめクイズ (best score),
// and the 官能基クイズ, 書きかえ練習, 電子配置ビルダー, 用語集.
// 用語集 #/glossary?q=: all terms, searchable; terms inside a text are links.
import { esc, prefs } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { goBack, setQuery } from '../core/router.js';
import { lessonPlan } from '../core/data.js';
import { doneMap } from '../lesson/progress.js';
import { KINDS } from '../lab/calc.js';
import { glossary, linkTerms } from '../lesson/glossary.js';

export function calcDone() {
  try { return JSON.parse(prefs.get('calc:done', '{}')) || {}; } catch (e) { return {}; }
}

export async function renderCheck({ el }) {
  const plan = await lessonPlan();
  const done = doneMap();
  const cdone = calcDone();
  const best = prefs.get('review:best', '');
  const nLessons = plan.lessons.filter((l) => l.end3?.length).length;
  const nDone = plan.lessons.filter((l) => done[l.no]).length;
  const row = (href, ic, title, sub, mark = '') => `<a href="${href}">${icon(ic)}<span class="ck-tx"><b>${title}</b>${sub ? `<span>${sub}</span>` : ''}</span>${mark}${icon('chev')}</a>`;
  el.innerHTML = `
  <div class="page">
    <header class="topbar"><h1 class="brand" style="font-size:20px">たしかめる</h1></header>
    <p class="small muted" style="margin:0 4px 10px">✓ の印は、この端末にだけ残ります（先生には送られません）。</p>
    <div class="ck-meter"><div><span>おわりの3問</span><b>${nDone} / ${nLessons} 回</b></div><div><span>計算練習</span><b>${Object.keys(cdone).length} / ${Object.keys(KINDS).length} 種類</b></div><div><span>総まとめ</span><b>${best ? `${best} / 10` : '—'}</b></div></div>
    <h2 class="section-title">授業ごとに</h2>
    <div class="menu">${row('#/lessons', 'quiz', 'おわりの3問（回ごと）', '基礎の復習の目次から選ぶ', nDone ? `<span class="ls-ok">✓ ${nDone}</span>` : '')}
      ${row('#/lab/review', 'star', '総まとめクイズ', '全回の問題から10問', best ? `<span class="ls-ok">最高 ${best}</span>` : '')}</div>
    <h2 class="section-title">計算練習</h2>
    <div class="menu">${Object.entries(KINDS).map(([k, v]) => row(`#/lab/calc?k=${k}`, 'chart', esc(v.title), '', cdone[k] ? '<span class="ls-ok">✓</span>' : '')).join('')}</div>
    <h2 class="section-title">分子と電子</h2>
    <div class="menu">${row('#/quiz', 'quiz', '官能基クイズ', '分子の中の官能基をタップで答える')}
      ${row('#/build/practice', 'build', '書きかえ練習', '構造式・示性式などの書きかえ')}
      ${row('#/electron', 'shell', '電子配置ビルダー', 'K殻・L殻・M殻に電子を入れる')}
      ${row('#/lab/sort', 'table', 'なかまわけ', '純物質と混合物・単体と化合物・酸性と塩基性')}</div>
    <h2 class="section-title">ことば</h2>
    <div class="menu">${row('#/glossary', 'info', '用語集', '化学のことばの短い説明')}</div>
  </div>`;
  return null;
}

export async function renderGlossary({ el, query }) {
  const g = await glossary();
  let q = query.get('q') || '';
  el.innerHTML = `
  <div class="page">
    <div class="subbar"><button class="iconbtn" data-act="back" aria-label="戻る">${icon('back')}</button><h1>用語集</h1></div>
    <label class="search"><span class="sr-only">ことばをさがす</span>${icon('search')}<input type="search" value="${esc(q)}" placeholder="ことば・よみ でさがす" autocomplete="off"></label>
    ${g.reviewed ? '' : '<p class="small muted" style="margin:8px 4px">説明はすべて<span class="draft">下書き</span>です（先生の確認前）。</p>'}
    <div class="gl-list"></div>
  </div>`;
  el.querySelector('[data-act="back"]').addEventListener('click', () => goBack('#/check'));
  const list = el.querySelector('.gl-list');
  const sorted = [...g.terms].sort((a, b) => a.reading.localeCompare(b.reading, 'ja'));
  function draw() {
    const hit = q ? sorted.filter((t) => t.term.includes(q) || t.reading.includes(q) || t.text.includes(q)) : sorted;
    list.innerHTML = hit.length ? hit.map((t) => `<div class="gl-item${t.term === q ? ' on' : ''}" id="gl-${esc(t.term)}"><b>${esc(t.term)}</b><span class="gl-yomi">${esc(t.reading)}</span><p>${linkTerms(t.text, { skip: t.term })}</p><a class="small" href="#/lesson/${t.lesson}">第${t.lesson}回</a></div>`).join('') : '<p class="empty">見つかりませんでした。</p>';
  }
  el.querySelector('input').addEventListener('input', (e) => { q = e.target.value.trim(); setQuery(q ? { q } : {}); draw(); });
  draw();
  return null;
}
