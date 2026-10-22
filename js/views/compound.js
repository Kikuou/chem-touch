// Molecule detail (spec A-7, B-2, D-1): #/compound/<id> and #/view?smiles=...
import { esc, formulaHtml, toast } from '../core/dom.js';
import { goBack } from '../core/router.js';
import { icon } from '../core/icons.js';
import { compound, compounds, sdf as loadSdf } from '../core/data.js';
import { openShareSheet, compoundHash, smilesHash } from '../core/share.js';
import { mountMolPanel } from '../mol/molpanel.js';
import { getRDKit, molGraph } from '../mol/rdkit.js';
import { conformerFor } from '../mol/conformer.js';
import { formulaOf } from '../mol/similar.js';
import { faCardHtml, chainSvg, faHelp, chainAtoms, faColor } from './fatty-acid.js';

const CRYSTAL_BOND = {
  diamond: '共有結合（単結合）',
  graphite: '共有結合（層の中。π電子が層全体に広がっている）',
};

function shell(el, title) {
  el.innerHTML = `
  <div class="page wide">
    <div class="subbar">
      <button class="iconbtn" data-act="back" aria-label="戻る">${icon('back')}</button>
      <h1>${esc(title)}</h1>
      <button class="iconbtn" data-act="share" aria-label="共有・QRコード">${icon('qr')}</button>
    </div>
    <div class="content"></div>
  </div>`;
  el.querySelector('[data-act="back"]').addEventListener('click', () => goBack('#/library'));
  return el.querySelector('.content');
}

function factsHtml(c) {
  const v = c.verification || {};
  const rows = [];
  if (c.aliases?.length) rows.push(['別名', esc(c.aliases.join('、'))]);
  if (c.formula) rows.push(['分子式', formulaHtml(c.formula)]);
  if (c.mw) rows.push(['分子量', esc(c.mw.toFixed(2))]);
  if (c.fatty_acid) {
    const fa = c.fatty_acid;
    const db = fa.double_bonds.map((d) => `${d.pos_delta}${d.geometry === 'cis' ? 'c' : 't'}`).join(', ');
    rows.push(['脂肪酸', esc(fa.notation + (db ? `（Δ${db}）` : '（飽和）'))]);
  }
  if (c.smiles) rows.push(['SMILES', `<code>${esc(c.smiles)}</code>`]);
  if (c.kind !== 'crystal') {
    rows.push(['PubChem CID', c.pubchem_cid
      ? `<a href="https://pubchem.ncbi.nlm.nih.gov/compound/${c.pubchem_cid}" target="_blank" rel="noopener">${c.pubchem_cid}</a> <span class="badge ok">照合済み</span>`
      : '<span class="badge warn">未照合</span>']);
  }
  if (c.inchikey) rows.push(['InChIKey', `<code>${esc(c.inchikey)}</code>`]);
  if (c.stereo_note === 'racemic') rows.push(['立体', '鏡像体の混合物（ラセミ体）。3Dは一方を表示']);
  rows.push(['3D座標', c.sdf_source === 'pubchem-3d' ? 'PubChem 3D 配座' : (c.kind === 'crystal' ? '結晶構造の断片モデル' : 'RDKit で生成（ETKDG + MMFF94）')]);
  return `<dl class="facts">${rows.map(([k, val]) => `<dt>${k}</dt><dd>${val}</dd>`).join('')}</dl>`;
}

export async function renderCompound({ el, params }) {
  const c = await compound(params.id);
  if (!c) {
    shell(el, '見つかりません').innerHTML = `<p class="empty">「${esc(params.id)}」という化合物は収録されていません。<br><a class="btn" style="margin-top:12px" href="#/library">ライブラリへ</a></p>`;
    return null;
  }
  const content = shell(el, c.name_ja);
  el.querySelector('[data-act="share"]').addEventListener('click', () => openShareSheet({ title: c.name_ja, hash: compoundHash(c.id) }));
  const related = (await Promise.all((c.related || []).map((id) => compound(id)))).filter(Boolean);

  content.innerHTML = `
    <div class="mol-title">
      <h2>${esc(c.name_ja)}</h2>
      <div class="en">${esc(c.name_en)}</div>
      ${c.formula ? `<div class="fm">${formulaHtml(c.formula)}${c.mw ? `<span class="muted" style="font-weight:400">　分子量 ${c.mw.toFixed(2)}</span>` : ''}</div>` : ''}
    </div>
    <div class="molpanel"></div>
    <div class="stack">
      ${c.fatty_acid && c.categories.includes('fatty-acid') ? faCardHtml(c.fatty_acid) : ''}
      ${c.note_ja ? `<section class="card"><h2 class="section-title" style="margin-top:0">ひとこと解説${c.note_reviewed ? '' : '<span class="draft" title="教員による確認前の下書きです">下書き</span>'}</h2><p class="note">${esc(c.note_ja)}</p></section>` : ''}
      ${related.length ? `<section class="card"><h2 class="section-title" style="margin-top:0">関連する分子</h2><div class="rel">${related.map((r) => `<a href="#/compound/${encodeURIComponent(r.id)}">${esc(r.name_ja)}</a>`).join('')}</div></section>` : ''}
      <section class="card"><h2 class="section-title" style="margin-top:0">データ</h2>${factsHtml(c)}</section>
      <button class="btn primary block" data-act="share2">${icon('qr')}QRコードで共有</button>
      ${c.kind !== 'crystal' ? `<a class="btn block" href="#/quiz?id=${encodeURIComponent(c.id)}">${icon('quiz')}この分子で官能基クイズ</a>` : ''}
      <p class="credit">構造: ${c.pubchem_cid ? '<a href="https://pubchem.ncbi.nlm.nih.gov/" target="_blank" rel="noopener">PubChem</a>（パブリックドメイン）で照合' : 'PubChem 未照合（RDKit による生成）'}。解説は${c.note_reviewed ? '教員確認済み' : '確認前の下書き'}です。</p>
    </div>`;
  content.querySelector('[data-act="share2"]').addEventListener('click', () => openShareSheet({ title: c.name_ja, hash: compoundHash(c.id) }));

  const sdfText = await loadSdf(c);
  const panel = mountMolPanel(content.querySelector('.molpanel'), {
    sdf: sdfText,
    crystal: c.crystal || null,
    crystalBond: CRYSTAL_BOND[c.crystal],
  });
  const faCard = content.querySelector('.fa-card');
  if (faCard) {
    const fa = c.fatty_acid;
    const draw = (mode) => {
      faCard.querySelector('.fa-chart').innerHTML = chainSvg(fa, mode);
      faCard.querySelector('.fa-help').textContent = faHelp(fa, mode);
      faCard.querySelectorAll('[data-fa]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.fa === mode));
    };
    draw('n');
    faCard.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.fa) draw(b.dataset.fa);
      if (b.hasAttribute('data-fa3d')) {
        const on = b.getAttribute('aria-pressed') !== 'true';
        b.setAttribute('aria-pressed', on);
        await panel.ready;
        const chain = chainAtoms(panel.graph);
        if (!on || chain.length !== fa.carbons) { panel.highlight(null); return; }
        const n = fa.carbons;
        const w = (m) => chain[n - m]; // omega numbering -> SDF index
        const omegaRun = [];
        for (let m = 1; m <= fa.omega; m++) omegaRun.push(w(m));
        panel.highlight([
          { color: '#9AA3AE', label: 'ω末端', atoms: [w(1)] },
          { color: faColor(fa.omega), label: `n-${fa.omega}`, atoms: [w(fa.omega), w(fa.omega + 1)] },
          { color: faColor(fa.omega), label: '', atoms: omegaRun.slice(1, -1) },
        ].filter((g) => g.atoms.length), { labels: true });
      }
    });
  }
  return () => panel.destroy();
}

// #/view?smiles=...&name=... — any molecule shared by URL (spec D-1) or
// made in the builder (C-8: the 3D model is computed in the browser).
//   &from=build|draw|mine  came from the builder (back goes there)
export async function renderView({ el, query }) {
  const smiles = (query.get('smiles') || '').trim().slice(0, 500);
  const name = (query.get('name') || '').trim().slice(0, 80);
  const from = query.get('from') || '';
  const title = name || (from ? 'つくった分子' : '共有された分子');
  const content = shell(el, title);
  if (from) {
    // the back button returns to the builder even when the page was opened directly
    const back = el.querySelector('[data-act="back"]');
    back.replaceWith(back.cloneNode(true));
    el.querySelector('[data-act="back"]').addEventListener('click', () => goBack(from === 'mine' ? '#/build?mode=mine' : '#/build'));
  }
  el.querySelector('[data-act="share"]').addEventListener('click', () => openShareSheet({ title, hash: smilesHash(smiles, name) }));
  if (!smiles) {
    content.innerHTML = '<p class="empty">URL に分子（SMILES）が含まれていません。</p>';
    return null;
  }
  content.innerHTML = `
    <div class="mol-title"><h2>${esc(title)}</h2><div class="en"><code>${esc(smiles)}</code></div><div class="fm"></div></div>
    <div class="match"></div>
    <div class="molpanel"><p class="empty"><span class="spinner"></span>分子を解析中…</p></div>
    <div class="stack">
      <button class="btn primary block" data-act="share2">${icon('qr')}QRコードで共有</button>
      <div class="two">
        <button class="btn" data-act="save">${icon('star')}マイ分子に保存</button>
        <a class="btn" href="#/build?mode=draw&smiles=${encodeURIComponent(smiles)}">${icon('build')}描いて編集</a>
      </div>
      <p class="credit gen-credit" hidden>3D 座標はこの端末で計算しました（OpenChemLib の配座生成 + MMFF94s+ 最適化）。立体（シス/トランス・R/S）が SMILES と一致することを RDKit で確認しています。</p>
    </div>`;
  content.querySelector('[data-act="share2"]').addEventListener('click', () => openShareSheet({ title, hash: smilesHash(smiles, name) }));
  content.querySelector('[data-act="save"]').addEventListener('click', async () => {
    const { saveMyMol } = await import('../mol/mymols.js');
    const { askName } = await import('./build.js');
    const nm = await askName('マイ分子に保存', title);
    if (nm) { saveMyMol({ name: nm, smiles }); toast('マイ分子に保存しました'); }
  });

  // Is it one of the library compounds? Then we can show its 3D model.
  const RDKit = await getRDKit();
  const mol = RDKit.get_mol(smiles);
  if (!mol || !mol.is_valid()) {
    content.querySelector('.molpanel').innerHTML = '<p class="empty">この SMILES は解釈できませんでした。</p>';
    return null;
  }
  const key = RDKit.get_inchikey_for_inchi(mol.get_inchi());
  const f = formulaOf(molGraph(mol));
  mol.delete();
  if (f) content.querySelector('.fm').innerHTML = `${formulaHtml(f.formula)}<span class="muted" style="font-weight:400">　分子量 ${f.mw.toFixed(2)}</span>`;
  const hit = (await compounds()).find((c) => c.inchikey && c.inchikey === key);
  if (hit) {
    content.querySelector('.match').innerHTML = `<a class="info" href="#/compound/${encodeURIComponent(hit.id)}" style="margin:0 0 10px">${icon('info')}<span>収録化合物「<b style="font-size:inherit">${esc(hit.name_ja)}</b>」と同じ分子です。詳しい解説を見る</span>${icon('chev')}</a>`;
  }
  let sdfText = hit ? await loadSdf(hit) : null;
  let no3d = '';
  if (!sdfText) {
    content.querySelector('.molpanel').innerHTML = '<p class="empty"><span class="spinner"></span>3Dモデルを計算中…<br><span class="small">数秒かかることがあります</span></p>';
    try {
      sdfText = (await conformerFor(smiles)).sdf;
      content.querySelector('.gen-credit').hidden = false;
    } catch (e) {
      no3d = `3Dモデルを作れませんでした（${e.message}）。構造式は表示できます。`;
    }
    if (!content.isConnected) return null;
  }
  const panel = mountMolPanel(content.querySelector('.molpanel'), sdfText ? { sdf: sdfText } : { smiles, no3d });
  return () => panel.destroy();
}
