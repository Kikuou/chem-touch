// Molecule builder (spec C): #/build
//   ?mode=assemble&n=18&end=cooh&b=9c   assembly: chain + multiple bonds + groups (C-1 – C-5)
//   ?mode=draw&smiles=...                free drawing with the OpenChemLib editor, SMILES input (C-6, C-7)
//   ?mode=mine                           my molecules saved in this browser (C-9)
// "3Dで見る" opens #/view?smiles=..., which makes the 3D model (C-8) and
// offers sharing (D-3).
import { esc, el as h, formulaHtml, isDark, prefs, toast } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { setQuery, navigate } from '../core/router.js';
import { openShareSheet, smilesHash } from '../core/share.js';
import { getRDKit, molGraph, preloadRDKit } from '../mol/rdkit.js';
import * as A from '../mol/assemble.js';
import { libraryMatches, formulaOf } from '../mol/similar.js';
import { listMyMols, saveMyMol, renameMyMol, deleteMyMol } from '../mol/mymols.js';

const MODES = [['assemble', '組み立て'], ['draw', '自由作図'], ['mine', 'マイ分子']];
const TOOLS = [
  ['cis', 'C=C', 'シス', 'bond'],
  ['trans', 'C=C', 'トランス', 'bond'],
  ['triple', 'C≡C', '三重結合', 'bond'],
  ['oh', '-OH', 'ヒドロキシ基', 'atom'],
  ['oxo', 'C=O', 'カルボニル基', 'atom'],
  ['nh2', '-NH₂', 'アミノ基', 'atom'],
  ['me', '-CH₃', 'メチル基', 'atom'],
  ['erase', '消す', '単結合に戻す', 'both'],
];
const kindOf = (tool) => TOOLS.find((t) => t[0] === tool)?.[3];
const TOOL_HELP = {
  cis: '炭素と炭素のあいだの線をタップすると、シス形の二重結合になります。',
  trans: '炭素と炭素のあいだの線をタップすると、トランス形の二重結合になります。',
  triple: '炭素と炭素のあいだの線をタップすると、三重結合になります。',
  oh: '炭素（番号の丸）をタップすると、ヒドロキシ基 -OH がつきます。',
  oxo: '炭素をタップすると C=O（ケトンのカルボニル基）になります。鎖の端は「末端」で -CHO を選びます。',
  nh2: '炭素をタップすると、アミノ基 -NH₂ がつきます。',
  me: '炭素をタップすると、メチル基 -CH₃ の枝がつきます。',
  erase: '線をタップすると単結合に、炭素をタップするとついている基がなくなります。',
};
const DARK = { '-1': [0.86, 0.88, 0.87], 6: [0.86, 0.88, 0.87], 7: [0.45, 0.66, 1], 8: [1, 0.45, 0.47] };
const GROUP_TEXT = { oh: 'OH', nh2: 'NH₂', me: 'CH₃', oxo: 'O' };

export function svg2d(RDKit, smiles, { width = 340, height = 200 } = {}) {
  const m = RDKit.get_mol(smiles);
  if (!m) return '';
  m.set_new_coords(true);
  m.normalize_depiction();
  m.straighten_depiction();
  const o = { width, height, backgroundColour: [0, 0, 0, 0], bondLineWidth: 1.6, padding: 0.08, clearBackground: false, addStereoAnnotation: false };
  if (isDark()) o.atomColourPalette = DARK;
  const svg = m.get_svg_with_highlights(JSON.stringify(o));
  m.delete();
  return svg;
}

// Bottom sheet asking for a name (saving to my molecules).
export function askName(title, value) {
  return new Promise((resolve) => {
    const back = h(`
      <div class="sheet-backdrop" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <form class="sheet">
          <div class="grab"></div>
          <h2>${esc(title)}</h2>
          <label class="field"><span class="small muted">名前</span><input name="nm" maxlength="60" autocomplete="off" value="${esc(value)}"></label>
          <p class="small muted" style="margin:8px 0 12px">マイ分子はこの端末のブラウザにだけ保存されます（どこにも送信されません）。</p>
          <div class="acts">
            <button type="button" class="btn" data-act="cancel">やめる</button>
            <button type="submit" class="btn primary">保存</button>
          </div>
        </form>
      </div>`);
    const done = (v) => { back.remove(); resolve(v); };
    back.addEventListener('click', (e) => {
      if (e.target === back || e.target.closest('[data-act="cancel"]')) done(null);
    });
    back.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      done(back.querySelector('input').value.trim() || value);
    });
    document.body.append(back);
    const input = back.querySelector('input');
    input.focus();
    input.select();
  });
}

function viewHash(smiles, name, extra = {}) {
  const p = new URLSearchParams({ smiles });
  if (name) p.set('name', name);
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  return `#/view?${p.toString()}`;
}

// "近い収録化合物" card (C-5)
async function matchesHtml(smiles) {
  const r = await libraryMatches(smiles).catch(() => null);
  if (!r) return '';
  const link = (c) => `<a href="#/compound/${encodeURIComponent(c.id)}">${esc(c.name_ja)}</a>`;
  let out = '';
  if (r.exact) {
    out += `<a class="info match-hit" href="#/compound/${encodeURIComponent(r.exact.id)}">${icon('star')}<span>収録化合物「<b style="font-size:inherit">${esc(r.exact.name_ja)}</b>」と同じ分子です。解説を見る</span>${icon('chev')}</a>`;
  }
  if (r.stereo.length) out += `<p class="small" style="margin:8px 0 4px">立体（シス/トランス・鏡像）だけが違う収録化合物</p><div class="rel">${r.stereo.map(link).join('')}</div>`;
  if (r.similar.length) out += `<p class="small" style="margin:8px 0 4px">${r.exact ? '' : 'この分子に'}似ている収録化合物</p><div class="rel">${r.similar.map((x) => `${link(x.c).replace('</a>', ` <span class="muted small">${Math.round(x.sim * 100)}%</span></a>`)}`).join('')}</div>`;
  if (!out) out = '<p class="small muted">近い収録化合物は見つかりませんでした。</p>';
  return out;
}

async function factsHtml(smiles) {
  const RDKit = await getRDKit();
  const m = RDKit.get_mol(smiles);
  if (!m) return '';
  const f = formulaOf(molGraph(m));
  m.delete();
  return f ? `<span class="fm">${formulaHtml(f.formula)}</span><span class="muted">　分子量 ${f.mw.toFixed(2)}</span>` : '';
}

// ------------------------------------------------------------ assembly

function chainSvg(s, tool) {
  const dx = 40;
  const x0 = 26;
  const yUp = 82;
  const yDn = 108;
  const W = x0 * 2 + (s.n - 1) * dx;
  const H = 186;
  const pos = (i) => [x0 + (i - 1) * dx, i % 2 ? yUp : yDn];
  const bondTool = tool === 'erase' || kindOf(tool) === 'bond';
  const atomTool = tool === 'erase' || kindOf(tool) === 'atom';
  let g = '';
  for (let i = 1; i < s.n; i++) {
    const [ax, ay] = pos(i);
    const [bx, by] = pos(i + 1);
    const b = s.bonds.find((x) => x.pos === i);
    const len = Math.hypot(bx - ax, by - ay);
    const nx = -(by - ay) / len;
    const ny = (bx - ax) / len;
    const k = b ? (b.type === 'triple' ? 3 : 2) : 1;
    const offs = k === 1 ? [0] : k === 2 ? [-2.6, 2.6] : [-4.2, 0, 4.2];
    for (const o of offs) {
      g += `<line class="cb${b ? ' multi' : ''}" x1="${ax + nx * o}" y1="${ay + ny * o}" x2="${bx + nx * o}" y2="${by + ny * o}"/>`;
    }
    if (b && b.type !== 'triple') {
      const geo = A.hasGeometry(s, i);
      // label in the free band above the chain, over the middle of the bond
      g += `<text class="cbl" x="${(ax + bx) / 2}" y="16">${geo ? (b.type === 'cis' ? 'シス' : 'トランス') : '区別なし'}</text>`;
    }
    g += `<line class="hit-b${bondTool ? '' : ' off'}" data-bond="${i}" x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}"><title>C${i}–C${i + 1} の結合</title></line>`;
  }
  for (let i = 1; i <= s.n; i++) {
    const [x, y] = pos(i);
    const up = i % 2 === 1;
    const groups = s.subs.filter((x2) => x2.pos === i).map((x2) => x2.type);
    if (i === 1 && s.end === 'cooh') groups.push('oxo', 'oh');
    if (i === 1 && s.end === 'cho') groups.push('oxo');
    groups.forEach((t, k) => {
      // first group straight up/down, the next ones to the side
      const ang = [0, -0.75, 0.75, 1.5][k] ?? 0;
      const r = 40;
      const gx = x + Math.sin(ang) * r;
      const gy = y + (up ? -1 : 1) * Math.cos(ang) * r;
      const endCls = i === 1 && s.end && k >= groups.length - (s.end === 'cooh' ? 2 : 1) ? ' end' : '';
      g += `<line class="gb${t === 'oxo' ? ' dbl' : ''}" x1="${x}" y1="${y}" x2="${gx}" y2="${gy}"/>`;
      g += `<text class="gl gl-${t}${endCls}" x="${gx}" y="${gy + 5}">${GROUP_TEXT[t]}</text>`;
    });
    g += `<circle class="ca" cx="${x}" cy="${y}" r="13"/><text class="cn" x="${x}" y="${y + 4.5}">${i}</text>`;
    g += `<circle class="hit-a${atomTool ? '' : ' off'}" data-atom="${i}" cx="${x}" cy="${y}" r="20"><title>C${i}</title></circle>`;
  }
  return `<svg class="chain-ed" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="group" aria-label="炭素鎖（タップして編集）">${g}</svg>`;
}

function assembleView(root, state0, { onState }) {
  let s = state0;
  let tool = prefs.get('build:tool', 'cis');
  if (!TOOLS.some((t) => t[0] === tool)) tool = 'cis';
  root.innerHTML = `
    <section class="card build-card">
      <div class="build-row">
        <b>炭素の数</b>
        <div class="stepper">
          <button class="iconbtn" data-act="minus" aria-label="炭素を1個へらす">−</button>
          <output class="build-n" aria-live="polite"></output>
          <button class="iconbtn" data-act="plus" aria-label="炭素を1個ふやす">＋</button>
        </div>
      </div>
      <input class="build-slider" type="range" min="1" max="${A.MAX_C}" step="1" aria-label="炭素の数（1〜18）">
      <div class="build-scale small muted"><span>1</span><span>化学基礎の範囲 1〜9</span><span>脂肪酸 〜18</span></div>
      <div class="build-row" style="margin-top:12px"><b>末端（C1）</b></div>
      <div class="tool-grid end-grid" role="group" aria-label="末端の官能基">
        <button class="chip tool" data-end=""><b>なし</b><small>アルカンなど</small></button>
        <button class="chip tool" data-end="cooh"><b>-COOH</b><small>カルボキシ基</small></button>
        <button class="chip tool" data-end="cho"><b>-CHO</b><small>ホルミル基</small></button>
      </div>
    </section>
    <section class="card build-card">
      <div class="build-row"><b>道具を選んでタップ</b></div>
      <div class="tool-grid" role="group" aria-label="道具">
        ${TOOLS.map(([k, l, sub]) => `<button class="chip tool" data-tool="${k}"><b>${l}</b><small>${sub}</small></button>`).join('')}
      </div>
      <p class="small muted tool-help" aria-live="polite"></p>
      <div class="chain-wrap"></div>
    </section>
    <section class="card build-result" aria-live="polite">
      <div class="build-name"></div>
      <div class="build-facts"></div>
      <div class="build-notes small"></div>
      <div class="v2d build-2d"></div>
      <h2 class="section-title">近い収録化合物</h2>
      <div class="build-match"><p class="small muted"><span class="spinner"></span>さがしています…</p></div>
    </section>
    <div class="stack build-acts">
      <a class="btn primary block" data-act="view">${icon('atom')}3Dで見る</a>
      <div class="two">
        <button class="btn" data-act="save">${icon('star')}マイ分子に保存</button>
        <button class="btn" data-act="share">${icon('qr')}QRで共有</button>
      </div>
      <a class="btn block" data-act="draw">${icon('build')}自由作図で続きを描く</a>
    </div>`;

  const slider = root.querySelector('.build-slider');
  let matchToken = 0;
  let timer = null;

  function current() {
    const smiles = A.toSmiles(s);
    const nm = A.nameOf(s);
    return { smiles, name: nm ? nm.name : 'つくった分子', nm };
  }

  function draw() {
    root.querySelector('.build-n').textContent = `${s.n} 個`;
    slider.value = s.n;
    root.querySelectorAll('[data-end]').forEach((b) => b.setAttribute('aria-pressed', (b.dataset.end || null) === s.end));
    root.querySelectorAll('[data-tool]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.tool === tool));
    root.querySelector('.tool-help').textContent = TOOL_HELP[tool];
    const wrap = root.querySelector('.chain-wrap');
    const scroll = wrap.scrollLeft;
    wrap.innerHTML = chainSvg(s, tool);
    wrap.scrollLeft = scroll;

    const { smiles, nm } = current();
    root.querySelector('.build-name').innerHTML = nm
      ? `<h2>${esc(nm.name)}</h2>${nm.numbering === 'reversed' ? '<p class="small muted">名前では、番号を鎖の反対側からつけています（番号が小さくなる向き）。</p>' : ''}`
      : '<h2>名前をつけられません</h2>';
    const notes = [];
    const fa = A.fattyAcidNotation(s);
    if (fa) notes.push(`脂肪酸の表し方: <b>${esc(fa)}</b>`);
    for (const b of s.bonds) {
      if (b.type !== 'triple' && !A.hasGeometry(s, b.pos)) notes.push(`C${b.pos}=C${b.pos + 1} の二重結合にはシス/トランスの区別がありません。`);
    }
    const sc = A.stereocentres(s);
    if (sc.length) notes.push(`${sc.map((i) => `C${i}`).join('・')} は不斉炭素原子です。鏡像異性体（R/S）は指定していません。`);
    root.querySelector('.build-notes').innerHTML = notes.map((t) => `<p>${t}</p>`).join('');
    root.querySelector('[data-act="view"]').href = viewHash(smiles, current().name, { from: 'build' });
    root.querySelector('[data-act="draw"]').href = `#/build?mode=draw&smiles=${encodeURIComponent(smiles)}`;
    onState(s);

    clearTimeout(timer);
    const token = ++matchToken;
    timer = setTimeout(async () => {
      const RDKit = await getRDKit().catch(() => null);
      if (!RDKit || token !== matchToken) return;
      root.querySelector('.build-2d').innerHTML = svg2d(RDKit, smiles);
      root.querySelector('.build-facts').innerHTML = await factsHtml(smiles);
      const html = await matchesHtml(smiles);
      if (token === matchToken) root.querySelector('.build-match').innerHTML = html;
    }, 150);
  }

  function change(action) {
    const r = A.apply(s, action);
    if (r.error) { toast(r.error, 3200); return; }
    s = r.state;
    draw();
  }

  slider.addEventListener('input', () => change({ kind: 'n', n: +slider.value }));
  root.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-act],[data-end],[data-tool],[data-atom],[data-bond]');
    if (!t) return;
    if (t.dataset.end !== undefined) return change({ kind: 'end', end: t.dataset.end || null });
    if (t.dataset.tool) {
      tool = t.dataset.tool;
      prefs.set('build:tool', tool);
      return draw();
    }
    if (t.dataset.atom) {
      const pos = +t.dataset.atom;
      if (tool === 'erase') return change({ kind: 'clear', what: 'atom', pos });
      if (kindOf(tool) !== 'atom') return toast('この道具は、炭素と炭素のあいだの線をタップします');
      return change({ kind: 'sub', pos, type: tool });
    }
    if (t.dataset.bond) {
      const pos = +t.dataset.bond;
      if (tool === 'erase') return change({ kind: 'clear', what: 'bond', pos });
      if (kindOf(tool) !== 'bond') return toast('この道具は、炭素（番号の丸）をタップします');
      return change({ kind: 'bond', pos, type: tool });
    }
    const act = t.dataset.act;
    if (act === 'minus') change({ kind: 'n', n: s.n - 1 });
    if (act === 'plus') change({ kind: 'n', n: s.n + 1 });
    if (act === 'save') {
      const { smiles, name } = current();
      const nm = await askName('マイ分子に保存', name);
      if (nm) { saveMyMol({ name: nm, smiles, build: A.encodeState(s) }); toast('マイ分子に保存しました'); }
    }
    if (act === 'share') {
      const { smiles, name } = current();
      openShareSheet({ title: name, hash: smilesHash(smiles, name) });
    }
  });
  draw();
  return () => clearTimeout(timer);
}

// ------------------------------------------------------------ free drawing

async function drawView(root, smiles0, { onSmiles }) {
  const edH = Math.round(Math.max(380, Math.min(580, window.innerHeight - 250)));
  root.innerHTML = `
    <form class="smiles-row">
      <label class="sr-only" for="smiles-in">SMILES</label>
      <input id="smiles-in" class="smiles-in" placeholder="SMILES を入力（例: CCO）" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(smiles0)}">
      <button class="btn" type="submit">読み込む</button>
    </form>
    <div class="ocl-host" style="height:${edH}px"><div class="loading"><div><div class="spinner"></div>エディタを読み込み中…</div></div></div>
    <p class="small muted" style="margin:6px 2px 10px">左の道具を選んで、白い部分をタップ・ドラッグして描きます（ドラッグで結合をのばす、原子をタップで元素を変える）。</p>
    <section class="card build-result" aria-live="polite">
      <div class="build-facts"><p class="small muted">分子を描くと、ここに分子式と近い収録化合物が出ます。</p></div>
      <div class="build-match"></div>
    </section>
    <div class="stack build-acts">
      <a class="btn primary block" data-act="view" aria-disabled="true">${icon('atom')}3Dで見る</a>
      <div class="two">
        <button class="btn" data-act="save">${icon('star')}マイ分子に保存</button>
        <button class="btn" data-act="share">${icon('qr')}QRで共有</button>
      </div>
      <button class="btn block" data-act="clear">${icon('close')}すべて消す</button>
    </div>`;
  let smiles = '';
  let token = 0;
  let timer = null;
  let editor = null;

  async function update(smi) {
    smiles = smi;
    onSmiles(smi);
    const viewBtn = root.querySelector('[data-act="view"]');
    viewBtn.setAttribute('aria-disabled', String(!smi));
    viewBtn.href = smi ? viewHash(smi, '', { from: 'draw' }) : '#/build?mode=draw';
    root.querySelector('.smiles-in').value = smi;
    clearTimeout(timer);
    const t = ++token;
    if (!smi) {
      root.querySelector('.build-facts').innerHTML = '<p class="small muted">分子を描くと、ここに分子式と近い収録化合物が出ます。</p>';
      root.querySelector('.build-match').innerHTML = '';
      return;
    }
    timer = setTimeout(async () => {
      const facts = await factsHtml(smi).catch(() => '');
      if (t !== token) return;
      root.querySelector('.build-facts').innerHTML = facts || '<p class="small">この構造は読み取れませんでした。</p>';
      const html = await matchesHtml(smi);
      if (t === token) root.querySelector('.build-match').innerHTML = `<h2 class="section-title">近い収録化合物</h2>${html}`;
    }, 350);
  }

  // canonical SMILES (RDKit) for the URL, saving and sharing
  async function canonical(smi) {
    const RDKit = await getRDKit();
    const m = RDKit.get_mol(smi);
    if (!m || !m.is_valid()) return null;
    const c = m.get_smiles();
    m.delete();
    return c;
  }

  root.querySelector('.smiles-row').addEventListener('submit', async (e) => {
    e.preventDefault();
    const raw = root.querySelector('.smiles-in').value.trim();
    if (!raw) return;
    const c = await canonical(raw);
    if (!c) { toast('この SMILES は読み取れませんでした', 3000); return; }
    if (editor && !editor.setSmiles(c)) { toast('エディタに読み込めませんでした（3Dで見ることはできます）', 3000); }
    update(c);
  });
  root.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'view' && !smiles) { e.preventDefault(); toast('先に分子を描いてください'); }
    if (act === 'clear') { editor?.clear(); update(''); }
    if ((act === 'save' || act === 'share') && !smiles) { toast('先に分子を描いてください'); return; }
    if (act === 'save') {
      const nm = await askName('マイ分子に保存', '描いた分子');
      if (nm) { saveMyMol({ name: nm, smiles }); toast('マイ分子に保存しました'); }
    }
    if (act === 'share') openShareSheet({ title: '描いた分子', hash: smilesHash(smiles, '') });
  });

  const start = smiles0 ? await canonical(smiles0) : '';
  try {
    const { mountEditor } = await import('../mol/editor2d.js');
    if (!root.isConnected) return () => {};
    editor = await mountEditor(root.querySelector('.ocl-host'), {
      height: edH,
      smiles: start || '',
      onChange: async (smi) => update(smi ? (await canonical(smi)) || smi : ''),
    });
  } catch (err) {
    console.error(err);
    root.querySelector('.ocl-host').innerHTML = `<p class="empty small">エディタを読み込めませんでした。SMILES の入力は使えます。<br>${esc(err.message || err)}</p>`;
  }
  if (start) update(start);
  return () => { clearTimeout(timer); editor?.destroy(); };
}

// ------------------------------------------------------------ my molecules

async function mineView(root) {
  const list = listMyMols();
  if (!list.length) {
    root.innerHTML = `<p class="empty">まだ保存した分子はありません。<br><span class="small">組み立て・自由作図で作った分子を「マイ分子に保存」すると、ここに並びます。<br>保存先はこの端末のブラウザだけです。</span></p>`;
    return null;
  }
  const date = (t) => new Date(t).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
  root.innerHTML = `
    <p class="small muted" style="margin:0 2px 10px">${list.length} 件。この端末のブラウザにだけ保存されています（ブラウザのデータを消すと消えます）。</p>
    <div class="list mine-list">${list.map((m) => `
      <div class="item mine" data-id="${esc(m.id)}">
        <div class="thumb" data-thumb="${esc(m.id)}"></div>
        <div class="tx">
          <div class="nm">${esc(m.name)}</div>
          <div class="en"><code>${esc(m.smiles)}</code></div>
          <div class="mine-acts">
            <a class="chip" href="${esc(viewHash(m.smiles, m.name, { from: 'mine' }))}">3D</a>
            <a class="chip" href="${esc(m.build ? `#/build?mode=assemble&${new URLSearchParams(m.build)}` : `#/build?mode=draw&smiles=${encodeURIComponent(m.smiles)}`)}">編集</a>
            <button class="chip" data-act="rename">名前</button>
            <button class="chip" data-act="delete">削除</button>
          </div>
          <div class="small muted">${date(m.updated || m.created)} 保存</div>
        </div>
      </div>`).join('')}</div>`;
  const RDKit = await getRDKit().catch(() => null);
  if (RDKit) {
    for (const m of list) {
      const t = root.querySelector(`[data-thumb="${CSS.escape(m.id)}"]`);
      if (t) t.innerHTML = svg2d(RDKit, m.smiles, { width: 128, height: 104 });
    }
  }
  // onclick (not addEventListener): the list re-renders itself after a change
  root.onclick = async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const item = b.closest('.mine');
    const m = list.find((x) => x.id === item.dataset.id);
    if (b.dataset.act === 'delete' && confirm(`「${m.name}」を削除しますか？`)) {
      deleteMyMol(m.id);
      mineView(root);
    }
    if (b.dataset.act === 'rename') {
      const nm = await askName('名前を変える', m.name);
      if (nm) { renameMyMol(m.id, nm); mineView(root); }
    }
  };
  return null;
}

// ------------------------------------------------------------ screen

export async function renderBuild({ el, query }) {
  let mode = query.get('mode') || prefs.get('build:mode', 'assemble');
  if (!MODES.some((m) => m[0] === mode)) mode = 'assemble';
  prefs.set('build:mode', mode);
  preloadRDKit();
  el.innerHTML = `
  <div class="page wide">
    <header class="topbar"><h1 class="brand" style="font-size:20px">つくる</h1></header>
    <div class="subbar build-modes">
      <div class="seg" role="tablist" aria-label="つくり方">
        ${MODES.map(([k, l]) => `<button role="tab" data-mode="${k}" aria-pressed="${k === mode}" aria-selected="${k === mode}">${l}</button>`).join('')}
      </div>
    </div>
    <div class="content build-content"></div>
  </div>`;
  el.querySelector('.build-modes').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]');
    if (b && b.dataset.mode !== mode) navigate(`#/build?mode=${b.dataset.mode}`, { replace: true });
  });
  const content = el.querySelector('.build-content');

  if (mode === 'assemble') {
    let s = query.get('n') ? A.decodeState(query) : null;
    if (!s) {
      const last = prefs.get('build:last', '');
      s = (last && A.decodeState(new URLSearchParams(last))) || A.emptyState(6);
    }
    return assembleView(content, s, {
      onState: (st) => {
        const q = A.encodeState(st);
        setQuery({ mode: 'assemble', ...q });
        prefs.set('build:last', new URLSearchParams(q).toString());
      },
    });
  }
  if (mode === 'draw') {
    const smiles0 = query.get('smiles') || prefs.get('build:draw', '');
    return drawView(content, smiles0, {
      onSmiles: (smi) => {
        setQuery(smi ? { mode: 'draw', smiles: smi } : { mode: 'draw' });
        prefs.set('build:draw', smi || null);
      },
    });
  }
  return mineView(content);
}
