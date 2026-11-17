// 身近なもの #/life (docs/plan.md 提案1): one entry, four groups (食品・
// からだ・くすり・医療・くらし, data/categories.json "life"). Each group opens
// the library limited to its categories (#/library?life=<id>). The chemical
// classes stay below, as another way in.
import { esc } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { goBack } from '../core/router.js';
import { categories, compounds, lifeGroups } from '../core/data.js';

export async function renderLife({ el }) {
  const [groups, cats, list] = await Promise.all([lifeGroups(), categories(), compounds()]);
  const inLife = new Set(groups.flatMap((g) => g.cats));
  const count = (g) => list.filter((c) => c.categories.some((k) => g.cats.includes(k))).length;
  el.innerHTML = `
  <div class="page">
    <div class="subbar">
      <button class="iconbtn" data-act="back" aria-label="戻る">${icon('back')}</button>
      <h1>身近なもの</h1>
      <a class="iconbtn" href="#/library?focus=1" aria-label="分子をさがす">${icon('search')}</a>
    </div>
    <div class="lf-grid">${groups.map((g) => g.planned ? `
      <div class="lf-g lf-planned"><b>${esc(g.label)}</b><span>${esc(g.desc)}</span><em>${esc(g.planned)}</em></div>` : `
      <a class="lf-g" href="#/library?life=${g.id}"><b>${esc(g.label)}</b><span>${esc(g.desc)}</span><em>${count(g)}件 ›</em></a>`).join('')}
    </div>
    <h2 class="section-title">化学の分類からさがす</h2>
    <div class="lf-cats">${cats.filter((c) => !inLife.has(c.id)).map((c) => `<a class="chip" href="#/library?cat=${c.id}">${esc(c.label)}</a>`).join('')}<a class="chip" href="#/library">すべての分類 ›</a></div>
  </div>`;
  el.querySelector('[data-act="back"]').addEventListener('click', () => goBack('#/'));
  return null;
}
