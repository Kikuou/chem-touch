// 書き方くらべ: #/build/notation?id=<library id> (or ?smiles=...)
// One molecule in every way of writing it. The slider walks the omission
// ladder 構造式 → 構造式（結合角） → 簡略構造式 → 骨格構造式; below it the
// 示性式, 分子式, 立体構造式 and the 3D model. Tapping an atom lights the
// same atom in every notation.
import { esc, el as h, prefs } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { setQuery } from '../core/router.js';
import { compound, compounds, sdf as loadSdf, practiceSet } from '../core/data.js';
import { getRDKit } from '../mol/rdkit.js';
import { NOTATIONS, LADDER, prepare, render, molblockFromSmiles } from '../mol/notations.js';
import { Viewer3D, webglAvailable } from '../mol/viewer3d.js';

const STEP_NOTE = [
  'すべての原子と、すべての結合を書く。C の手は4本、H は1本。',
  '線を折れ線にすると、実際の分子の形（結合の角度）に近づく。原子のつながりは同じ。',
  'C–H などの線を省き、CH₃・CH₂・OH のようにまとめて書く。',
  'C と、C についた H も省く。線の端と折れ目が C。C 以外の原子（O・N）と、それについた H は書く。',
];

// sheet listing the molecules of the practice set
export async function pickMolecule(current) {
  const [set, list] = await Promise.all([practiceSet(), compounds()]);
  const byId = new Map(list.map((c) => [c.id, c]));
  return new Promise((resolve) => {
    const back = h(`
      <div class="sheet-backdrop" role="dialog" aria-modal="true" aria-label="分子を選ぶ">
        <div class="sheet pick-sheet">
          <div class="grab"></div>
          <h2>分子を選ぶ</h2>
          ${set.groups.map((g) => `<h3 class="pick-h">${esc(g.label)}</h3><div class="pick-row">${g.items.map((id) => byId.get(id)).filter(Boolean).map((c) => `<button class="chip" data-id="${esc(c.id)}" aria-pressed="${c.id === current}">${esc(c.name_ja)}</button>`).join('')}</div>`).join('')}
          <button class="btn block" data-act="close" style="margin-top:12px">閉じる</button>
        </div>
      </div>`);
    const done = (v) => { back.remove(); resolve(v); };
    back.addEventListener('click', (e) => {
      if (e.target === back || e.target.closest('[data-act="close"]')) return done(null);
      const b = e.target.closest('[data-id]');
      if (b) done(b.dataset.id);
    });
    document.body.append(back);
  });
}

export async function renderNotation({ el, query, subShell }) {
  const content = subShell(el, '書き方くらべ');
  let id = query.get('id');
  const smiles = query.get('smiles');
  let c = null;
  if (!smiles) {
    c = await compound(id || prefs.get('notation:last', 'acetic-acid'));
    if (!c) c = await compound('acetic-acid');
  }
  content.innerHTML = '<p class="empty"><span class="spinner"></span>準備中…</p>';
  const RDKit = await getRDKit();
  let molblock;
  let name;
  if (c) {
    molblock = await loadSdf(c);
    name = c.name_ja;
    prefs.set('notation:last', c.id);
  } else {
    // a molecule that is not in the library (from the drawing screen)
    const m = RDKit.get_mol(smiles);
    const key = m && m.is_valid() ? RDKit.get_inchikey_for_inchi(m.get_inchi()) : null;
    m?.delete();
    c = key ? (await compounds()).find((x) => x.inchikey === key) : null;
    if (c) { molblock = await loadSdf(c); name = c.name_ja; } else {
      molblock = molblockFromSmiles(RDKit, smiles);
      name = query.get('name') || '描いた分子';
    }
    if (!molblock) { content.innerHTML = '<p class="empty">この分子は読み取れませんでした。</p>'; return null; }
  }
  const ctx = prepare(RDKit, molblock);
  let step = Math.max(0, Math.min(3, parseInt(query.get('step') || '0', 10) || 0));
  let hl = null;
  let viewer = null;

  content.innerHTML = `
    <div class="nt-head">
      <div><h2>${esc(name)}</h2>${c ? `<a class="small" href="#/compound/${encodeURIComponent(c.id)}">${esc(c.name_en)} ・ 詳しい解説 ›</a>` : ''}</div>
      <button class="btn" data-act="pick">${icon('compare')}ほかの分子</button>
    </div>
    <section class="card nt-main">
      <div class="nt-main-h"><b class="nt-name"></b><span class="nt-step small muted"></span></div>
      <div class="nt-box nt-big"></div>
      <p class="nt-desc small"></p>
      <label class="label" for="nt-slider">省略していく</label>
      <input id="nt-slider" class="nt-slider" type="range" min="0" max="3" step="1" value="${step}" aria-label="省略の段階">
      <div class="nt-stops">${LADDER.map((k, i) => `<button data-step="${i}">${NOTATIONS[k].short}</button>`).join('')}</div>
    </section>
    <p class="small muted" style="margin:10px 2px">原子をタップすると、すべての書き方で同じ原子が光ります。</p>
    <div class="nt-grid">
      ${['rational', 'formula', 'wedge', 'model'].map((k) => `
        <section class="card nt-card" data-k="${k}">
          <b>${NOTATIONS[k].name}</b>
          <div class="nt-box"></div>
          <p class="small muted">${NOTATIONS[k].desc}</p>
        </section>`).join('')}
    </div>
    <div class="stack">
      <a class="btn primary block" href="#/build/practice${c ? `?focus=${encodeURIComponent(c.id)}` : ''}">${icon('quiz')}書きかえ練習をする</a>
      <a class="btn block" href="#/build/draw?smiles=${encodeURIComponent(c ? c.smiles : smiles)}">${icon('build')}この分子を描いてみる</a>
    </div>`;

  const big = content.querySelector('.nt-big');
  const slider = content.querySelector('.nt-slider');

  function paintHighlight(root) {
    root.querySelectorAll('.nt-a').forEach((x) => {
      const ids = (x.dataset.a || '').split(' ').map(Number);
      x.classList.toggle('on', hl !== null && ids.includes(hl));
    });
  }

  function drawMain() {
    const k = LADDER[step];
    content.querySelector('.nt-name').textContent = NOTATIONS[k].name;
    content.querySelector('.nt-step').textContent = `${step + 1} / 4`;
    const html = render(ctx, k, { highlight: hl });
    big.innerHTML = html || '<p class="empty small">環をもつ分子では、この書き方は使いません。</p>';
    let note = STEP_NOTE[step];
    if (k === 'structural' && html && html.includes('nt-rd')) note = '環をもつ分子なので、結合の角度をつけて書いています。' + note;
    content.querySelector('.nt-desc').textContent = note;
    slider.value = step;
    content.querySelectorAll('[data-step]').forEach((b) => b.setAttribute('aria-pressed', +b.dataset.step === step));
    paintHighlight(big);
  }

  function drawCards() {
    for (const card of content.querySelectorAll('.nt-card')) {
      const k = card.dataset.k;
      const box = card.querySelector('.nt-box');
      if (k === 'model') continue;
      const html = render(ctx, k, { highlight: hl });
      box.innerHTML = html || (k === 'wedge' ? '<p class="small muted">この分子は形が立体的なので、分子模型で確かめよう。</p>' : '');
      paintHighlight(box);
    }
  }

  async function initModel() {
    const box = content.querySelector('[data-k="model"] .nt-box');
    box.classList.add('nt-3d');
    if (!webglAvailable() || !c) {
      box.innerHTML = `<p class="small muted">${c ? 'この端末では3D表示が使えません。' : '描いた分子の3Dは「3Dで見る」から。'}</p>`;
      return;
    }
    const v = new Viewer3D(box, { onAtom: (i) => select(i), onBond: () => {}, onEmpty: () => select(null) });
    try { await v.init(); } catch (e) { box.innerHTML = '<p class="small muted">3D表示を読み込めませんでした。</p>'; return; }
    if (!content.isConnected) { v.destroy(); return; }
    v.load(molblock);
    viewer = v;
  }

  function select(i) {
    hl = i;
    drawMain();
    drawCards();
    viewer?.select(i);
  }

  slider.addEventListener('input', () => { step = +slider.value; setQuery({ ...(c ? { id: c.id } : { smiles }), step: String(step) }); drawMain(); });
  content.addEventListener('click', async (e) => {
    const s = e.target.closest('[data-step]');
    if (s) { step = +s.dataset.step; setQuery({ ...(c ? { id: c.id } : { smiles }), step: String(step) }); drawMain(); return; }
    if (e.target.closest('[data-act="pick"]')) {
      const pick = await pickMolecule(c?.id);
      if (pick) location.hash = `#/build/notation?id=${encodeURIComponent(pick)}&step=${step}`;
      return;
    }
    const a = e.target.closest('[data-a]');
    if (a && !e.target.closest('[data-k="model"]')) {
      const i = parseInt(a.dataset.a, 10);
      select(hl === i ? null : i);
    }
  });
  drawMain();
  drawCards();
  initModel();
  return () => viewer?.destroy();
}
