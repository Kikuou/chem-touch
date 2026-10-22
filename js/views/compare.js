// Compare mode (spec A-13 – A-16): two molecules side by side, rotation and
// zoom kept in step; enantiomers are shown as mirror images across a mirror.
//   #/compare                 preset list (first preset shown)
//   #/compare/<preset>?pair=1 a preset (pair index for three-molecule presets)
//   #/compare?a=<id>&b=<id>   any two library compounds
import { esc, formulaHtml, onThemeChange, prefs } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { compound, compounds, comparisons, categories, sdf as loadSdf } from '../core/data.js';
import { navigate } from '../core/router.js';
import { openShareSheet } from '../core/share.js';
import { Viewer3D, webglAvailable } from '../mol/viewer3d.js';
import { Structure2D } from '../mol/structure2d.js';
import { matchFunctionalGroups, highlightGroups } from '../mol/fgroups.js';
import { getRDKit, molGraph } from '../mol/rdkit.js';
import { element } from '../mol/elements.js';

const STYLES = [['ballstick', '球棒'], ['spacefill', '空間充填'], ['stick', '棒']];

function pairsOf(items) {
  if (items.length <= 2) return [items];
  const out = [];
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) out.push([items[i], items[j]]);
  return out;
}

export async function renderCompare({ el, params, query }) {
  const [presets, list, cats] = await Promise.all([comparisons(), compounds(), categories()]);
  let preset = null;
  let pair;
  let pairIdx = 0;
  if (params.preset) {
    preset = presets.find((p) => p.id === params.preset) || null;
  } else if (!query.get('a')) {
    preset = presets[0];
  }
  if (preset) {
    const pairs = pairsOf(preset.items);
    pairIdx = Math.min(Math.max(parseInt(query.get('pair') || '0', 10) || 0, 0), pairs.length - 1);
    pair = pairs[pairIdx];
  } else {
    pair = [query.get('a') || 'ethanol', query.get('b') || 'dimethyl-ether'];
  }
  const [A, B] = await Promise.all(pair.map((id) => compound(id)));
  const mirror = !!(preset && preset.mirror);
  const free = !preset;
  const hash = preset ? `#/compare/${preset.id}${pairIdx ? `?pair=${pairIdx}` : ''}` : `#/compare?a=${encodeURIComponent(pair[0])}&b=${encodeURIComponent(pair[1])}`;
  const style0 = prefs.get('style3d', 'ballstick');

  const options = (sel) => cats.filter((c) => !c.planned).map((c) => {
    const items = list.filter((x) => x.categories.includes(c.id) && x.kind !== 'crystal');
    if (!items.length) return '';
    return `<optgroup label="${esc(c.label)}">${items.map((x) => `<option value="${esc(x.id)}" ${x.id === sel ? 'selected' : ''}>${esc(x.name_ja)}</option>`).join('')}</optgroup>`;
  }).join('');

  el.innerHTML = `
  <div class="page wide">
    <header class="topbar">
      <h1 class="brand" style="font-size:20px">くらべる</h1>
      <div class="btns"><button class="cb" data-act="share" aria-label="この比較を共有">${icon('qr')}</button></div>
    </header>
    <div class="chips-row" role="group" aria-label="比較のプリセット">
      ${presets.map((p) => `<a class="chip" href="#/compare/${p.id}" aria-pressed="${preset && p.id === preset.id}">${esc(p.title)}</a>`).join('')}
      <a class="chip" href="#/compare?a=${encodeURIComponent(pair[0])}&b=${encodeURIComponent(pair[1])}" aria-pressed="${free}">自由に選ぶ</a>
    </div>
    ${free ? `
    <div class="card cmp-pick">
      <label><span class="small muted">左</span><select data-side="a">${options(pair[0])}</select></label>
      <label><span class="small muted">右</span><select data-side="b">${options(pair[1])}</select></label>
    </div>` : ''}
    ${preset && preset.items.length > 2 ? `
    <div class="seg cmp-pairs" role="group" aria-label="組み合わせ">
      ${pairsOf(preset.items).map((pp, i) => `<button data-pair="${i}" aria-pressed="${i === pairIdx}">${pp.map((id) => esc(list.find((x) => x.id === id)?.name_ja || id)).join(' / ')}</button>`).join('')}
    </div>` : ''}
    <section class="panel cmp-panel">
      ${preset ? `<div class="cmp-kind">${esc(preset.kind)}</div>` : ''}
      <div class="cmp-stage ${mirror ? 'mirror' : ''}">
        ${[A, B].map((c, i) => `
        <div class="cmp-cell">
          <a class="cmp-name" href="#/compound/${encodeURIComponent(c?.id || '')}">${esc(c ? c.name_ja : pair[i])}</a>
          <div class="cmp-3d" data-side="${i}"><div class="loading"><div class="spinner"></div></div></div>
        </div>`).join('')}
        ${mirror ? '<div class="cmp-mirror" aria-hidden="true"><span>鏡</span></div>' : ''}
      </div>
      <div class="tools">
        <div class="seg" role="group" aria-label="表示スタイル">
          ${STYLES.map(([k, l]) => `<button data-style="${k}" aria-pressed="${k === style0}">${l}</button>`).join('')}
        </div>
      </div>
      <div class="tools" style="padding-top:0">
        <button class="toggle" data-act="h" aria-pressed="true">${icon('hydrogen')}水素</button>
        <button class="toggle" data-act="spin" aria-pressed="false">${icon('spin')}回転</button>
        <button class="toggle" data-act="fg" aria-pressed="false">官能基</button>
        <span class="sp"></span>
        <button class="toggle" data-act="reset">${icon('reset')}視点</button>
      </div>
      <div class="info" hidden aria-live="polite"></div>
      <p class="small muted" style="padding:0 14px 12px">どちらかを回すと、もう一方も同じように回ります${mirror ? '（右は鏡に映したように動きます）' : ''}。</p>
    </section>
    <section class="panel cmp-2d">
      ${[A, B].map((c) => `
      <div class="cmp-cell">
        <div class="v2d small2d"></div>
        <div class="cmp-meta"><b>${esc(c ? c.name_ja : '')}</b><span>${c && c.formula ? formulaHtml(c.formula) : ''}</span></div>
      </div>`).join('')}
    </section>
    ${preset ? `
    <section class="card" style="margin-top:10px">
      <h2 class="section-title" style="margin-top:0">${esc(preset.kind)}${preset.note_reviewed ? '' : '<span class="draft" title="教員による確認前の下書きです">下書き</span>'}</h2>
      <p class="note">${esc(preset.note_ja)}</p>
      ${(preset.related || []).length ? `<div class="rel" style="margin-top:10px">${preset.related.map((id) => list.find((x) => x.id === id)).filter(Boolean).map((r) => `<a href="#/compound/${encodeURIComponent(r.id)}">${esc(r.name_ja)}</a>`).join('')}</div>` : ''}
    </section>` : ''}
  </div>`;

  // --- events that do not need the viewers
  el.querySelectorAll('select[data-side]').forEach((s) => s.addEventListener('change', () => {
    const a = el.querySelector('select[data-side="a"]').value;
    const b = el.querySelector('select[data-side="b"]').value;
    navigate(`#/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`, { replace: true });
  }));
  el.querySelector('[data-act="share"]').addEventListener('click', () => {
    openShareSheet({ title: `${A?.name_ja || pair[0]} と ${B?.name_ja || pair[1]}`, hash });
  });

  if (!A || !B) {
    el.querySelector('.cmp-stage').innerHTML = '<p class="empty">化合物が見つかりません。</p>';
    return null;
  }

  // --- 3D
  const viewers = [];
  const info = el.querySelector('.info');
  const sdfs = await Promise.all([loadSdf(A), loadSdf(B)]);
  const shown = mirror ? [sdfs[0], sdfs[0]] : sdfs; // mirror: right = mirror image of left
  let destroyed = false;
  if (webglAvailable()) {
    for (let i = 0; i < 2; i++) {
      const box = el.querySelector(`.cmp-3d[data-side="${i}"]`);
      const v = new Viewer3D(box, {
        onAtom: (k) => {
          const e = element(v.atom(k).elem);
          info.innerHTML = `<b>${esc(e.symbol)}</b><span>${esc([A, B][i].name_ja)} の ${esc(e.ja)}原子</span>`;
          info.hidden = false;
          viewers.forEach((w) => w.select(w === v ? k : null));
        },
        onBond: () => {},
        onEmpty: () => { info.hidden = true; viewers.forEach((w) => w.select(null)); },
      });
      try { await v.init(); } catch (e) { box.innerHTML = '<div class="loading">3D表示を読み込めませんでした。</div>'; return null; }
      if (destroyed) { v.destroy(); return null; }
      box.querySelector('.loading')?.remove();
      v.style = style0;
      // tall cells (phone): long axis vertical; wide cells: horizontal
      const orient = box.clientHeight > box.clientWidth * 1.1 ? 'y' : 'x';
      v.load(shown[i], { orient, mirror: mirror && i === 1, zoom: 0.9 });
      viewers.push(v);
    }
    viewers[0].syncWith(viewers[1], { mirror });
  } else {
    el.querySelectorAll('.cmp-3d').forEach((b) => { b.innerHTML = '<div class="loading">この端末では3D表示が使えません。</div>'; });
  }

  // --- 2D (each molecule's own structure, so the wedges show the difference)
  const s2 = [];
  el.querySelectorAll('.cmp-2d .v2d').forEach((box, i) => {
    const s = new Structure2D(box);
    s.mode = 'skeletal';
    s.setMolecule({ molblock: sdfs[i] }).catch(() => { box.innerHTML = '<p class="small muted">表示できません</p>'; });
    s2.push(s);
  });

  // --- functional groups for both molecules
  let fgOn = false;
  let fg = null;
  async function groups() {
    if (fg) return fg;
    const RDKit = await getRDKit();
    fg = await Promise.all(shown.map(async (mb) => {
      const found = await matchFunctionalGroups({ molblock: mb });
      const m = RDKit.get_mol(mb, JSON.stringify({ removeHs: false }));
      const graph = molGraph(m);
      m.delete();
      return highlightGroups(found, graph);
    }));
    return fg;
  }

  el.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.pair !== undefined) {
      navigate(`#/compare/${preset.id}?pair=${t.dataset.pair}`, { replace: true });
      return;
    }
    if (t.dataset.style) {
      el.querySelectorAll('[data-style]').forEach((b) => b.setAttribute('aria-pressed', b === t));
      viewers.forEach((v) => v.setStyle(t.dataset.style));
      prefs.set('style3d', t.dataset.style);
    }
    const act = t.dataset.act;
    const toggle = () => { const on = t.getAttribute('aria-pressed') !== 'true'; t.setAttribute('aria-pressed', on); return on; };
    if (act === 'h') { const on = toggle(); viewers.forEach((v) => v.setHydrogens(on)); }
    if (act === 'spin') { const on = toggle(); viewers[0]?.setSpin(on); }
    if (act === 'reset') viewers[0]?.reset();
    if (act === 'fg') {
      fgOn = toggle();
      const g = fgOn ? await groups() : [null, null];
      viewers.forEach((v, i) => v.setGroups(g[i], { labels: true }));
    }
    if (t.classList.contains('x')) info.hidden = true;
  });

  const stopTheme = onThemeChange(() => { viewers.forEach((v) => v.applyStyle()); s2.forEach((s) => s.render()); });
  return () => {
    destroyed = true;
    stopTheme();
    viewers.forEach((v) => v.destroy());
    s2.forEach((s) => s.destroy());
  };
}
