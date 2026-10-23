// かんたん作図: #/build/draw?smiles=...
// Touch-first drawing on a lattice (js/mol/sketch.js). Only the tools for
// basic organic molecules are on the toolbar (bonds, O, N, eraser); other
// elements, ring templates, the carbon-chain builder, SMILES input and the
// advanced editor are in the 「ほか」 sheet.
import { esc, el as h, prefs, toast } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { setQuery } from '../core/router.js';
import { openShareSheet, smilesHash } from '../core/share.js';
import { getRDKit } from '../mol/rdkit.js';
import { mountSketch } from '../mol/sketch.js';
import { prepare, molblockFromSmiles, rationalString } from '../mol/notations.js';
import { toSubHtml } from '../mol/notation.js';
import { askName, viewHash, factsHtml, matchesHtml } from './build.js';
import { saveMyMol } from '../mol/mymols.js';

// toolbar of the drawing screen (also used by the practice)
export const TOOLBAR = [
  ['bond', '／', '線'],
  ['double', '＝', '二重'],
  ['triple', '≡', '三重'],
  ['O', 'O', '酸素'],
  ['N', 'N', '窒素'],
  ['H', 'H', '水素'],
  ['erase', '×', '消す'],
];

export function toolbarHtml(mode) {
  return TOOLBAR.filter(([k]) => k !== 'H' || mode === 'full')
    .map(([k, l, sub]) => `<button class="sk-tool" data-tool="${k}"><b>${l}</b><small>${sub}</small></button>`).join('')
    + `<button class="sk-tool" data-act="more"><b>…</b><small>ほか</small></button>`;
}

export const MODE_TEXT = {
  skeletal: '線の端と折れ目が C。C についた H は自動でつきます。',
  full: 'H もすべて自分で描く（構造式）。足りない H は数で知らせます。',
};

// 「ほか」 sheet: returns the chosen action ({ tool } / { ring } / { href } / { smiles })
export function moreSheet({ practice = false } = {}) {
  return new Promise((resolve) => {
    const back = h(`
      <div class="sheet-backdrop" role="dialog" aria-modal="true" aria-label="ほかの道具">
        <div class="sheet">
          <div class="grab"></div>
          <h2>ほかの道具</h2>
          <h3 class="pick-h">元素</h3>
          <div class="pick-row">${['H', 'C', 'Cl', 'Br', 'F', 'S'].map((x) => `<button class="chip" data-tool="${x}">${x}</button>`).join('')}</div>
          <h3 class="pick-h">環</h3>
          <div class="pick-row">
            <button class="chip" data-ring="6a">ベンゼン環</button>
            <button class="chip" data-ring="6">シクロヘキサン</button>
            <button class="chip" data-ring="5">シクロペンタン</button>
            <button class="chip" data-ring="4">シクロブタン</button>
            <button class="chip" data-ring="3">シクロプロパン</button>
          </div>
          ${practice ? '' : `
          <h3 class="pick-h">べつの描き方</h3>
          <div class="stack">
            <a class="btn block" href="#/build/chain" data-href>${icon('build')}炭素鎖から始める（炭素数・二重結合・官能基を選ぶ）</a>
            <form class="smiles-row" data-smiles>
              <label class="sr-only" for="sk-smiles">SMILES</label>
              <input id="sk-smiles" class="smiles-in" placeholder="SMILES で入力（例: CCO）" autocomplete="off" autocapitalize="off" spellcheck="false">
              <button class="btn" type="submit">読み込む</button>
            </form>
            <a class="btn block" href="#/build/advanced" data-href>${icon('expand')}上級エディタ（すべての元素・電荷など）</a>
          </div>`}
          <button class="btn block" data-act="close" style="margin-top:12px">閉じる</button>
        </div>
      </div>`);
    const done = (v) => { back.remove(); resolve(v); };
    back.addEventListener('click', (e) => {
      if (e.target === back || e.target.closest('[data-act="close"]')) return done(null);
      const t = e.target.closest('[data-tool],[data-ring],[data-href]');
      if (!t) return;
      if (t.dataset.tool) done({ tool: t.dataset.tool });
      else if (t.dataset.ring) done({ ring: t.dataset.ring });
      else done({ href: t.getAttribute('href') });
    });
    back.querySelector('[data-smiles]')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = back.querySelector('.smiles-in').value.trim();
      if (v) done({ smiles: v });
    });
    document.body.append(back);
  });
}

// SMILES of the drawing (implicit hydrogens filled in by RDKit), or null
export function sketchSmiles(RDKit, sketch) {
  if (!sketch.count) return null;
  const m = RDKit.get_mol(sketch.molfile());
  if (!m || !m.is_valid()) { m?.delete(); return null; }
  const s = m.get_smiles();
  m.delete();
  return s;
}

export async function renderSketch({ el, query, subShell }) {
  const content = subShell(el, 'かんたん作図');
  let mode = prefs.get('sketch:mode', 'skeletal');
  if (!MODE_TEXT[mode]) mode = 'skeletal';
  let tool = 'bond';
  content.innerHTML = `
    <div class="seg sk-modes" role="group" aria-label="描き方">
      <button data-mode="skeletal">骨格構造式で描く</button>
      <button data-mode="full">H も描く</button>
    </div>
    <p class="small muted sk-mode-note"></p>
    <div class="sk-wrap card">
      <div class="sk-canvas"></div>
      <div class="sk-side">
        <button class="iconbtn" data-act="undo" aria-label="ひとつ戻す">戻す</button>
        <button class="iconbtn" data-act="clear" aria-label="すべて消す">${icon('close')}</button>
      </div>
    </div>
    <div class="sk-tools" role="group" aria-label="道具"></div>
    <p class="small muted sk-help">ドラッグで線をのばす。原子をタップすると、選んだ道具で線をのばす・元素を変える。線をタップすると単→二重→三重。</p>
    <section class="card build-result sk-info" aria-live="polite"></section>
    <div class="stack build-acts">
      <a class="btn primary block" data-act="notation">${icon('compare')}書き方を見る</a>
      <div class="two">
        <a class="btn" data-act="view">${icon('atom')}3Dで見る</a>
        <button class="btn" data-act="save">${icon('star')}保存</button>
      </div>
      <button class="btn block" data-act="share">${icon('qr')}QRで共有</button>
    </div>`;

  const RDKit = await getRDKit();
  if (!content.isConnected) return null;
  let smiles = null;
  let token = 0;
  let timer = null;
  const info = content.querySelector('.sk-info');

  const sketch = mountSketch(content.querySelector('.sk-canvas'), {
    height: Math.round(Math.max(280, Math.min(400, window.innerHeight - 380))),
    mode,
    onChange: () => update(),
    onMessage: (m) => toast(m, 3000),
  });

  function paintTools() {
    content.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === mode));
    content.querySelector('.sk-mode-note').textContent = MODE_TEXT[mode];
    const bar = content.querySelector('.sk-tools');
    bar.innerHTML = toolbarHtml(mode);
    const onBar = [...bar.querySelectorAll('[data-tool]')].some((b) => b.dataset.tool === tool);
    bar.querySelectorAll('[data-tool]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.tool === tool));
    bar.querySelector('[data-act="more"]').setAttribute('aria-pressed', !onBar);
    if (!onBar) bar.querySelector('[data-act="more"] b').textContent = tool;
  }

  function update() {
    smiles = sketchSmiles(RDKit, sketch);
    setQuery(smiles ? { smiles } : {});
    prefs.set('sketch:last', smiles || null);
    for (const a of content.querySelectorAll('[data-act="notation"],[data-act="view"]')) a.setAttribute('aria-disabled', String(!smiles));
    content.querySelector('[data-act="notation"]').href = smiles ? `#/build/notation?smiles=${encodeURIComponent(smiles)}` : '#/build/draw';
    content.querySelector('[data-act="view"]').href = smiles ? viewHash(smiles, '', { from: 'draw' }) : '#/build/draw';
    clearTimeout(timer);
    const t = ++token;
    if (!smiles) {
      info.innerHTML = `<p class="small muted">${sketch.count ? 'この形は分子として読み取れません。' : '分子を描くと、ここに名前・分子式・示性式が出ます。'}</p>`;
      return;
    }
    const lack = mode === 'full' ? sketch.missingH() : 0;
    const parts = smiles.includes('.') ? '<p class="small">2つ以上の部分に分かれています。線でつなごう。</p>' : '';
    let rational = '';
    const mb = molblockFromSmiles(RDKit, smiles);
    if (mb && !smiles.includes('.')) rational = rationalString(prepare(RDKit, mb));
    info.innerHTML = `
      <div class="build-facts"><span class="spinner"></span></div>
      ${rational ? `<p class="small" style="margin:6px 0 0">示性式 <b class="sk-rat">${toSubHtml(esc(rational))}</b></p>` : ''}
      ${lack ? `<p class="small sk-lack">H があと ${lack} 個たりません（構造式では H もすべて書きます）。</p>` : ''}
      ${parts}
      <div class="build-match"></div>`;
    timer = setTimeout(async () => {
      const facts = await factsHtml(smiles).catch(() => '');
      if (t !== token) return;
      info.querySelector('.build-facts').innerHTML = facts;
      const html = await matchesHtml(smiles);
      if (t === token) info.querySelector('.build-match').innerHTML = html;
    }, 300);
  }

  function loadSmiles(smi, { append = false } = {}) {
    const mb = molblockFromSmiles(RDKit, smi);
    if (!mb) { toast('この SMILES は読み取れませんでした', 3000); return false; }
    sketch.load(mb, { append });
    return true;
  }

  content.addEventListener('click', async (e) => {
    const m = e.target.closest('[data-mode]');
    if (m) {
      mode = m.dataset.mode;
      prefs.set('sketch:mode', mode);
      if (mode === 'skeletal' && tool === 'H') tool = 'bond';
      sketch.setMode(mode);
      sketch.setTool(tool);
      paintTools();
      return;
    }
    const tb = e.target.closest('[data-tool]');
    if (tb) { tool = tb.dataset.tool; sketch.setTool(tool); paintTools(); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if ((act === 'notation' || act === 'view') && !smiles) { e.preventDefault(); toast('先に分子を描いてください'); return; }
    if (act === 'undo') sketch.undo();
    if (act === 'clear') sketch.clear();
    if (act === 'more') {
      const r = await moreSheet();
      if (!r) return;
      if (r.tool) { tool = r.tool; sketch.setTool(tool); paintTools(); }
      if (r.ring) sketch.ring(parseInt(r.ring, 10), r.ring.endsWith('a'));
      if (r.href) location.hash = r.href;
      if (r.smiles) loadSmiles(r.smiles);
    }
    if ((act === 'save' || act === 'share') && !smiles) { toast('先に分子を描いてください'); return; }
    if (act === 'save') {
      const nm = await askName('マイ分子に保存', '描いた分子');
      if (nm) { saveMyMol({ name: nm, smiles }); toast('マイ分子に保存しました'); }
    }
    if (act === 'share') openShareSheet({ title: '描いた分子', hash: smilesHash(smiles, '') });
  });

  paintTools();
  sketch.setTool(tool);
  const start = query.get('smiles') || prefs.get('sketch:last', '');
  if (start) loadSmiles(start);
  else update();
  return () => { clearTimeout(timer); sketch.destroy(); };
}
