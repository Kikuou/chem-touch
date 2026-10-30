// かんたん作図: #/build/draw?smiles=...
// Full-screen drawing (views/sketchscreen.js around js/mol/sketch.js):
// tap an atom or a bond, then choose what to do with it. The result sheet
// at the bottom shows the name, the formula and the 示性式; opened, it
// offers 書き方を見る, 3D, saving and sharing. The carbon-chain builder,
// SMILES input and the advanced editor are in 「ほか」.
import { esc, el as h, prefs, toast } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { setQuery, goBack } from '../core/router.js';
import { openShareSheet, smilesHash } from '../core/share.js';
import { getRDKit } from '../mol/rdkit.js';
import { prepare, molblockFromSmiles, rationalString } from '../mol/notations.js';
import { toSubHtml } from '../mol/notation.js';
import { askName, viewHash, factsHtml, matchesHtml } from './build.js';
import { saveMyMol } from '../mol/mymols.js';
import { mountSketchScreen } from './sketchscreen.js';

// SMILES of the drawing (implicit hydrogens filled in by RDKit), or null
export function sketchSmiles(RDKit, sketch) {
  if (!sketch.count) return null;
  const m = RDKit.get_mol(sketch.molfile());
  if (!m || !m.is_valid()) { m?.delete(); return null; }
  const s = m.get_smiles();
  m.delete();
  return s;
}

function askSmiles() {
  return new Promise((resolve) => {
    const back = h(`
      <div class="sheet-backdrop" role="dialog" aria-modal="true" aria-label="SMILES で入力">
        <form class="sheet">
          <div class="grab"></div>
          <h2>SMILES で入力</h2>
          <label class="field"><span class="small muted">SMILES（例: CCO はエタノール）</span><input id="sk-smiles" class="smiles-in" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
          <div class="acts" style="margin-top:12px">
            <button type="button" class="btn" data-act="cancel">やめる</button>
            <button type="submit" class="btn primary">読み込む</button>
          </div>
        </form>
      </div>`);
    const done = (v) => { back.remove(); resolve(v); };
    back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-act="cancel"]')) done(null); });
    back.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); done(back.querySelector('input').value.trim() || null); });
    document.body.append(back);
    back.querySelector('input').focus();
  });
}

// pen: true for the 'draw by tracing' editor (#/build/draw2, on trial)
export async function renderSketch({ el, query, pen = false }) {
  el.innerHTML = '<div class="sks"><p class="empty"><span class="spinner"></span>準備中…</p></div>';
  const RDKit = await getRDKit();
  if (!el.isConnected) return null;
  el.innerHTML = '<div></div>';
  let smiles = null;
  let open = false;
  let token = 0;
  let timer = null;

  // on wide screens the result is a side panel that is always open
  const wide = matchMedia('(min-width: 900px)');
  open = wide.matches;
  const onWide = () => { open = wide.matches; update(); };
  wide.addEventListener('change', onWide);

  const screen = mountSketchScreen(el.firstElementChild, {
    side: true,
    pen,
    onClose: () => goBack('#/build'),
    onChange: () => update(),
    extraMore: [
      pen ? { act: 'old', label: '前の描き方（選んでからボタン）に戻る' } : { act: 'pen', label: '試作: 指でなぞって描く' },
      { act: 'chain', label: `${icon('build')}炭素鎖から始める（炭素数・二重結合・官能基を選ぶ）` },
      { act: 'smiles', label: 'SMILES で入力' },
      { act: 'advanced', label: `${icon('expand')}上級エディタ（すべての元素・電荷など）` },
    ],
    onMore: async (a) => {
      if (a === 'chain') location.hash = '#/build/chain';
      if (a === 'pen' || a === 'old') location.hash = `#/build/${a === 'pen' ? 'draw2' : 'draw'}${smiles ? `?smiles=${encodeURIComponent(smiles)}` : ''}`;
      if (a === 'advanced') location.hash = `#/build/advanced${smiles ? `?smiles=${encodeURIComponent(smiles)}` : ''}`;
      if (a === 'smiles') {
        const s = await askSmiles();
        if (s && !loadSmiles(s)) toast('この SMILES は読み取れませんでした', 3000);
      }
    },
  });
  const { sketch } = screen;

  function loadSmiles(smi) {
    const mb = molblockFromSmiles(RDKit, smi);
    if (!mb) return false;
    sketch.load(mb);
    return true;
  }

  function sheetHtml(facts = '', matches = '') {
    if (!smiles) {
      const bad = sketch.count > 1 || sketch.bondCount;
      return `<div class="sks-peek"><span class="muted small">${bad ? 'この形は分子として読み取れません。' : '描いた分子の名前と分子式がここに出ます。'}</span></div>`;
    }
    const parts = smiles.includes('.');
    let rational = '';
    const mb = molblockFromSmiles(RDKit, smiles);
    if (mb && !parts) rational = rationalString(prepare(RDKit, mb));
    return `
      <button class="sks-peek" data-act="sheet" aria-expanded="${open}">
        <span class="sks-peek-t">${facts || '<span class="spinner sm"></span>'}${rational ? ` <span class="sks-rat">${toSubHtml(esc(rational))}</span>` : ''}</span>
        <span class="sks-chev">${icon('chev')}</span>
      </button>
      ${parts ? '<p class="sks-warn">2つ以上の部分に分かれています。線でつなごう。</p>' : ''}
      <div class="sks-more" ${open ? '' : 'hidden'}>
        <div class="sks-acts">
          <a class="btn primary" href="#/build/notation?smiles=${encodeURIComponent(smiles)}">${icon('compare')}書き方を見る</a>
          <a class="btn" href="${esc(viewHash(smiles, '', { from: 'draw' }))}">${icon('atom')}3Dで見る</a>
          <button class="btn" data-act="save">${icon('star')}保存</button>
          <button class="btn" data-act="share">${icon('qr')}共有</button>
        </div>
        <div class="build-match">${matches}</div>
      </div>`;
  }

  // name of a library compound (exact match), formula and weight
  async function factsFor(smi) {
    const RD = RDKit;
    const m = RD.get_mol(smi);
    const key = m && m.is_valid() ? RD.get_inchikey_for_inchi(m.get_inchi()) : null;
    m?.delete();
    const { compounds } = await import('../core/data.js');
    const c = key ? (await compounds()).find((x) => x.inchikey === key) : null;
    const f = await factsHtml(smi).catch(() => '');
    return `${c ? `<b>${esc(c.name_ja)}</b> ` : ''}${f}`;
  }

  function update() {
    smiles = sketchSmiles(RDKit, sketch);
    setQuery(smiles ? { smiles } : {});
    prefs.set('sketch:last', smiles || null);
    screen.setSheet(sheetHtml());
    clearTimeout(timer);
    const t = ++token;
    if (!smiles) return;
    timer = setTimeout(async () => {
      const facts = await factsFor(smiles);
      if (t !== token) return;
      screen.setSheet(sheetHtml(facts));
      const matches = await matchesHtml(smiles);
      if (t === token) screen.setSheet(sheetHtml(facts, matches));
    }, 250);
  }

  screen.root.addEventListener('click', async (e) => {
    const a = e.target.closest('.sks-sheet [data-act]')?.dataset.act;
    if (!a) return;
    if (a === 'sheet') {
      open = !open;
      screen.root.querySelector('.sks-more')?.toggleAttribute('hidden', !open);
      screen.root.querySelector('.sks-peek')?.setAttribute('aria-expanded', String(open));
      screen.root.classList.toggle('sheet-open', open);
    }
    if (a === 'save') {
      const nm = await askName('マイ分子に保存', '描いた分子');
      if (nm) { saveMyMol({ name: nm, smiles }); toast('マイ分子に保存しました'); }
    }
    if (a === 'share') openShareSheet({ title: '描いた分子', hash: smilesHash(smiles, '') });
  });

  const start = query.get('smiles') || prefs.get('sketch:last', '');
  if (!(start && loadSmiles(start))) update();
  return () => { clearTimeout(timer); wide.removeEventListener('change', onWide); screen.destroy(); };
}
