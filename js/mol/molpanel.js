// Molecule panel = 3D viewer + 2D structure + tap information, linked
// through SDF atom indices (spec A-1 – A-9). Used by the compound detail
// screen and by #/view; M2 (compare) and M3 (builder) can mount it too.
import { esc, el, onThemeChange, prefs } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { Viewer3D, webglAvailable } from './viewer3d.js';
import { Structure2D } from './structure2d.js';
import { element } from './elements.js';

// formal charges from "M  CHG" lines of a molfile (used when there is no
// RDKit graph, e.g. for crystals)
function sdfCharges(sdf) {
  const out = {};
  for (const line of (sdf || '').split('\n')) {
    if (!line.startsWith('M  CHG')) continue;
    const f = line.slice(6).trim().split(/\s+/).map(Number);
    for (let k = 1; k + 1 < f.length; k += 2) out[f[k] - 1] = f[k + 1];
  }
  return out;
}

const STYLES = [['ballstick', '球棒'], ['spacefill', '空間充填'], ['stick', '棒']];
const BOND_NAMES = { 1: '単結合', 2: '二重結合', 3: '三重結合' };

/**
 * @param {HTMLElement} root
 * @param {object} o  { sdf?: string, smiles?: string, crystal?: string, crystalBond?: string }
 * @returns {{ destroy(): void }}
 */
export function mountMolPanel(root, o) {
  const has3D = !!o.sdf;
  const has2D = !o.crystal;
  const style0 = prefs.get('style3d', 'ballstick');
  const mode0 = prefs.get('mode2d', 'skeletal');
  root.innerHTML = `
    <div class="viewers">
      ${has3D ? `
      <section class="panel" aria-label="3Dモデル">
        <div class="panel-h"><b>3D</b>
          <div class="seg" role="group" aria-label="表示スタイル">
            ${STYLES.map(([k, l]) => `<button data-style="${k}" aria-pressed="${k === style0}">${l}</button>`).join('')}
          </div>
        </div>
        <div class="v3d"><div class="loading"><div><div class="spinner"></div>3Dモデルを読み込み中…</div></div></div>
        <div class="tools">
          <button class="toggle" data-act="h" aria-pressed="true" title="水素の表示">${icon('hydrogen')}水素</button>
          <button class="toggle" data-act="spin" aria-pressed="false" title="自動回転">${icon('spin')}回転</button>
          <span class="sp"></span>
          <button class="toggle" data-act="reset" title="初期視点に戻す">${icon('reset')}視点</button>
        </div>
        <div class="info" hidden aria-live="polite"></div>
      </section>` : `
      <section class="panel"><div class="v3d" style="height:auto;min-height:0"><p class="empty small">この分子の3Dモデルはまだありません。<br>（ビルダーで作った分子の3D化は M3 で対応予定）</p></div></section>`}
      ${has2D ? `
      <section class="panel" aria-label="構造式">
        <div class="panel-h"><b>構造式</b>
          <div class="seg" role="group" aria-label="構造式の表記">
            <button data-mode="skeletal" aria-pressed="${mode0 === 'skeletal'}">骨格式</button>
            <button data-mode="full" aria-pressed="${mode0 === 'full'}">全原子</button>
          </div>
        </div>
        <div class="v2d"><div class="loading"><div><div class="spinner"></div>構造式を準備中…</div></div></div>
        ${has3D ? '' : '<div class="info" hidden aria-live="polite"></div>'}
        <p class="small muted" style="padding:0 14px 12px">${has3D ? '原子をタップすると3Dと構造式の両方で光ります。' : '原子をタップすると名前を表示します。'}</p>
      </section>` : ''}
    </div>`;

  const info = root.querySelector('.info');
  let v3 = null;
  let v2 = null;
  let graph = null; // atoms/bonds with aromaticity, SDF order
  let destroyed = false;
  const charges = sdfCharges(o.sdf);

  function showInfo(html) {
    if (!info) return;
    info.innerHTML = html + `<button class="iconbtn x" aria-label="閉じる">${icon('close')}</button>`;
    info.hidden = false;
  }
  function clearSelection() {
    if (info) info.hidden = true;
    v3?.select(null);
    v2?.select(null);
  }
  function atomInfo(i) {
    const z = graph ? graph.atoms[i]?.z : null;
    const sym = v3 ? v3.atom(i)?.elem : null;
    const e = element(z ?? sym ?? '?');
    const chg = graph ? graph.atoms[i]?.chg : (charges[i] || 0);
    const sign = `${Math.abs(chg) === 1 ? '' : Math.abs(chg)}${chg > 0 ? '+' : '−'}`;
    const chgText = chg ? (o.crystal ? `　イオン（電荷 ${sign}）` : `　形式電荷 ${sign}`) : '';
    showInfo(`<b>${esc(e.symbol)}</b><span>${esc(e.ja)}（${esc(e.en)}）${chgText}</span>`);
  }
  function selectAtom(i) {
    v3?.select(i);
    v2?.select(i);
    atomInfo(i);
  }
  function bondInfo(i, j) {
    let name = '結合';
    if (o.crystal) name = o.crystalBond || '結合';
    else if (graph) {
      const b = graph.bonds.find((x) => (x.a === i && x.b === j) || (x.a === j && x.b === i));
      if (b) name = b.aromatic ? '芳香族の結合（ベンゼン環）' : (BOND_NAMES[b.order] || '結合');
    } else {
      const order = v3.atom(i).bondOrder[v3.atom(i).bonds.indexOf(j)];
      name = BOND_NAMES[order] || '結合';
    }
    const a = element(v3.atom(i).elem).symbol;
    const b = element(v3.atom(j).elem).symbol;
    v3.select(null);
    v2?.select(null);
    showInfo(`<b>${esc(a)}–${esc(b)}</b><span>${esc(name)}　結合長 ${v3.distance(i, j).toFixed(2)} Å</span>`);
  }

  root.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.classList.contains('x')) return clearSelection();
    if (t.dataset.style && v3) {
      root.querySelectorAll('[data-style]').forEach((b) => b.setAttribute('aria-pressed', b === t));
      v3.setStyle(t.dataset.style);
      prefs.set('style3d', t.dataset.style);
    }
    if (t.dataset.mode && v2) {
      root.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', b === t));
      v2.setMode(t.dataset.mode);
      prefs.set('mode2d', t.dataset.mode);
    }
    const act = t.dataset.act;
    if (act === 'h' && v3) {
      const on = t.getAttribute('aria-pressed') !== 'true';
      t.setAttribute('aria-pressed', on);
      v3.setHydrogens(on);
    }
    if (act === 'spin' && v3) {
      const on = t.getAttribute('aria-pressed') !== 'true';
      t.setAttribute('aria-pressed', on);
      v3.setSpin(on);
    }
    if (act === 'reset' && v3) v3.reset();
  });

  async function init3D() {
    const box = root.querySelector('.v3d');
    if (!webglAvailable()) {
      box.innerHTML = '<div class="loading">この端末では3D表示（WebGL）が使えません。</div>';
      return;
    }
    const v = new Viewer3D(box, {
      onAtom: (i) => selectAtom(i),
      onBond: (i, j) => bondInfo(i, j),
      onEmpty: () => clearSelection(),
    });
    try {
      await v.init();
    } catch (e) {
      box.innerHTML = `<div class="loading">3D表示ライブラリを読み込めませんでした。<br>${esc(e.message)}</div>`;
      return;
    }
    if (destroyed) { v.destroy(); return; }
    box.querySelector('.loading')?.remove();
    v.style = style0;
    v.load(o.sdf, { crystal: o.crystal });
    if (!v.hasH) root.querySelector('[data-act="h"]')?.setAttribute('disabled', '');
    box.append(el('<div class="hint">ドラッグで回転・ピンチで拡大・ダブルタップで戻す</div>'));
    v3 = v;
  }

  async function init2D() {
    const box = root.querySelector('.v2d');
    const s = new Structure2D(box, { onAtom: (i) => selectAtom(i) });
    s.mode = mode0;
    try {
      await s.setMolecule(has3D ? { molblock: o.sdf } : { smiles: o.smiles });
    } catch (e) {
      box.innerHTML = `<div class="loading">構造式を表示できませんでした。<br>${esc(e.message)}</div>`;
      return;
    }
    if (destroyed) { s.destroy(); return; }
    graph = s.graph;
    if (!s.canSkeletal) {
      root.querySelector('[data-mode="skeletal"]')?.setAttribute('disabled', '');
      s.setMode('full');
    }
    v2 = s;
  }

  const stopTheme = onThemeChange(() => {
    v3?.applyStyle();
    v2?.render();
  });

  const ready = Promise.all([
    has3D ? init3D() : null,
    has2D ? init2D() : null,
  ]);

  return {
    ready,
    destroy() {
      destroyed = true;
      stopTheme();
      v3?.destroy();
      v2?.destroy();
    },
  };
}
