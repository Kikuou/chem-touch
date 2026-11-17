// Hands-on materials (docs/plan.md 提案9・10): #/lab/<id>. One material =
// one screen = one idea; each lives in js/lab/<id>.js and is loaded when
// opened. The ids are also the catalog parts "lab:<id>" (js/lesson/catalog.js).
import { esc } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { goBack, navigate } from '../core/router.js';

export const LABS = {
  states: { title: '温度と三態', load: () => import('../lab/states.js') },
  formula: { title: '組成式パズル', load: () => import('../lab/formula.js') },
  ph: { title: 'pH ものさし', load: () => import('../lab/ph.js') },
  sort: { title: 'なかまわけ', load: () => import('../lab/sort.js') },
  attract: { title: 'ひきあう分子', load: () => import('../lab/attract.js') },
  metal: { title: '金属と自由電子', load: () => import('../lab/metal.js') },
  mwcount: { title: '分子量カウンター', load: () => import('../lab/mwcount.js') },
  molscale: { title: 'モルのはかり', load: () => import('../lab/molscale.js') },
  dissolve: { title: 'とかすビーカー', load: () => import('../lab/dissolve.js') },
  balance: { title: '反応式の天びん', load: () => import('../lab/balance.js') },
  titration: { title: '中和の滴定', load: () => import('../lab/titration.js') },
  redox: { title: '電子の受けわたし', load: () => import('../lab/redox.js') },
  review: { title: '総まとめクイズ', load: () => import('../lab/review.js') },
  calc: { title: '計算練習', load: () => import('../lab/calc.js'), full: true }, // ?k=<kind>
};

// sub bar + content area; full = no tab bar (the number pad needs the room)
export function labShell(el, title, { close = false } = {}) {
  el.innerHTML = `
  <div class="page">
    <div class="subbar">
      <button class="iconbtn" data-act="back" aria-label="${close ? '閉じる' : '戻る'}">${icon(close ? 'close' : 'back')}</button>
      <h1>${esc(title)}</h1>
    </div>
    <div class="content"></div>
  </div>`;
  el.querySelector('[data-act="back"]').addEventListener('click', () => goBack('#/'));
  return el.querySelector('.content');
}

export async function renderLab(ctx) {
  // old URL of the first calculation practice
  if (ctx.params.id === 'concentration') { navigate('#/lab/calc?k=mass-percent', { replace: true }); return null; }
  const lab = LABS[ctx.params.id];
  if (!lab) {
    labShell(ctx.el, '教材').innerHTML = `<p class="empty">「${esc(ctx.params.id)}」という教材はありません。</p>`;
    return null;
  }
  if (lab.full) document.documentElement.classList.add('lb-full');
  const mod = await lab.load();
  const stop = await mod.render({ ...ctx, content: labShell(ctx.el, lab.title, { close: lab.full }) });
  return () => {
    document.documentElement.classList.remove('lb-full');
    stop?.();
  };
}
