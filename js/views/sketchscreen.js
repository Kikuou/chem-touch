// Full-screen drawing screen "なぞって描く" around the editor (js/mol/sketch.js,
// pen gestures), shared by #/build/draw and the 描く questions of 書きかえ練習:
//   top bar     close, 骨格構造式 / H も描く switch, undo, redo, clear all
//   prompt      optional (the question, with the main button 答え合わせ)
//   canvas      fills the screen; the page itself does not scroll.
//               Corner buttons: 全体を表示, and H を補う (with the number of
//               missing hydrogens) in the H も描く mode
//   hint        what can be done now
//   parts shelf O・N・−OH・=O・−COOH・消す・戻す・ほか (always in this order)
//   sheet       optional (name, formula, 3D ...); a side panel on wide screens
// Triple bonds only with くわしい表示 (core/detail.js).
// Keyboard: ⌘/Ctrl+Z undo, ⌘/Ctrl+Shift+Z or Ctrl+Y redo, F fit, Esc.
import { esc, el as h, prefs } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { isDetail } from '../core/detail.js';
import { mountSketch } from '../mol/sketch.js';

const MODES = { skeletal: '骨格構造式', full: '構造式' };

// the parts shelf (always the same order, so the hand learns it);
// 戻す (undo) and ほか follow. The benzene ring is in ほか.
const PARTS = [
  ['O', 'O', 'にする', 'o'],
  ['N', 'N', 'にする', 'n'],
  ['OH', '−OH', 'つける', 'o'],
  ['=O', '=O', 'つける', 'o'],
  ['COOH', '−COOH', 'つける', 'o sm'],
  ['erase', '×', '消す', 'del'],
];
const PART_NAME = { OH: '−OH', '=O': '=O', COOH: '−COOH', CH3: '−CH₃', NH2: '−NH₂', CHO: '−CHO', ring6a: 'ベンゼン環', ring6: 'シクロヘキサン環', ring5: 'シクロペンタン環', ring4: 'シクロブタン環', ring3: 'シクロプロパン環' };

const coachHtml = () => `
  <div class="sks-coach" role="dialog" aria-label="使い方">
    <div class="sks-coach-card">
      <b>なぞって描くの使い方</b>
      <ol>
        <li><span>1</span><p><b>指でなぞる</b>と炭素の鎖。なぞった長さで炭素の数が決まります（指の上に C4 などと出ます）</p></li>
        <li><span>2</span><p>下の部品（O・−OH・=O など）を<b>原子までドラッグ</b>。部品を押してから原子をタップしても置けます</p></li>
        <li><span>3</span><p><b>線をタップ</b>すると${isDetail() ? '単→二重→三重' : '単→二重'}。原子を<b>長押し</b>するとメニュー</p></li>
      </ol>
      <p class="small muted">2本指で拡大・移動。まちがえたら「戻す」。</p>
      <button class="btn primary block" data-act="coach-ok">はじめる</button>
    </div>
  </div>`;
const LIFT = 56; // px a dragged part floats above the finger

const svgIcon = (d, label) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"${label ? '' : ''}>${d}</svg>`;
const UNDO = svgIcon('<path d="M9 5L4 10l5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 10h10a6 6 0 0 1 0 12h-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>');
const TRASH = svgIcon('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>');
const FIT = svgIcon('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>');

/**
 * @param {HTMLElement} root   element to fill (the route element, or an overlay)
 * @param {object} o
 *   closeLabel ('閉じる'), onClose, primary {label, onClick} (shown in the
 *   prompt when there is one), promptHtml, mode, extraMore [{label, act}]
 *   (べつの描き方 in ほか), onMore(act), onChange(sketch), side (true: the
 *   sheet becomes a side panel on wide screens)
 * @returns {{ sketch, root, setSheet(html), say(msg, warn), mode, destroy() }}
 */
export function mountSketchScreen(root, o = {}) {
  let mode = o.mode || prefs.get('sketch:mode', 'skeletal');
  if (!MODES[mode]) mode = 'skeletal';
  root.classList.add('sks');
  root.classList.toggle('sks-side', !!o.side);
  document.documentElement.classList.add('sks-lock');
  const primary = o.primary ? `<button class="btn primary sks-primary" data-act="primary">${esc(o.primary.label)}</button>` : '';
  root.innerHTML = `
    <header class="sks-top">
      <button class="iconbtn sks-x" data-act="close" aria-label="${esc(o.closeLabel || '閉じる')}">${icon('close')}</button>
      <div class="seg sks-mode" role="group" aria-label="書き方">
        <button data-act="mode-skeletal">${MODES.skeletal}</button>
        <button data-act="mode-full">${MODES.full}<small>（H も）</small></button>
      </div>
      <button class="iconbtn" data-act="undo" aria-label="元に戻す" title="元に戻す（⌘Z）">${UNDO}</button>
      <button class="iconbtn sks-redo" data-act="redo" aria-label="やり直す" title="やり直す（⌘⇧Z）">${UNDO}</button>
      <button class="iconbtn sks-trash" data-act="clear" aria-label="すべて消す" title="すべて消す">${TRASH}</button>
    </header>
    ${o.promptHtml ? `<div class="sks-prompt"><div class="sks-prompt-q">${o.promptHtml}</div>${primary}</div>` : ''}
    <div class="sks-main">
      <div class="sks-canvas">
        <button class="sks-fab sks-fit" data-act="fit" aria-label="全体を表示" title="全体を表示（F）">${FIT}</button>
        <button class="sks-fab sks-addh" data-act="allH" hidden>H を補う<span class="sks-badge"></span></button>
        <div class="sks-toast" hidden><span>すべて消しました</span><button data-act="restore">元に戻す</button></div>
      </div>
      <div class="sks-hint" aria-live="polite"></div>
      <div class="sks-bar" role="toolbar" aria-label="できること"></div>
    </div>
    <div class="sks-sheet" hidden></div>
    ${!o.promptHtml && primary ? `<div class="sks-prompt">${primary}</div>` : ''}`;

  const hint = root.querySelector('.sks-hint');
  const bar = root.querySelector('.sks-bar');
  const toastEl = root.querySelector('.sks-toast');
  let msgTimer = null;
  let toastTimer = null;
  let sheetEl = null; // the open ほか sheet (it lives in <body>)

  const canvas = root.querySelector('.sks-canvas');
  const host = document.createElement('div');
  host.className = 'sks-draw';
  canvas.prepend(host);
  const menuEl = document.createElement('div');
  menuEl.className = 'sks-menu';
  menuEl.hidden = true;
  canvas.append(menuEl);
  const sketch = mountSketch(host, {
    mode,
    gestures: 'pen',
    seed: false,
    maxOrder: () => (isDetail() ? 3 : 2),
    onChange: () => { paint(); o.onChange?.(sketch); },
    onMessage: (m) => say(m, true),
    onMenu: (m) => showMenu(m),
  });

  function say(msg, warn = false) {
    clearTimeout(msgTimer);
    hint.textContent = msg;
    hint.classList.toggle('warn', warn);
    msgTimer = setTimeout(() => { hint.classList.remove('warn'); paintHint(); }, 3200);
  }

  function paintHint() {
    if (hint.classList.contains('warn')) return;
    const lack = mode === 'full' ? sketch.missingH() : 0;
    const a = sketch.armed;
    let t;
    if (a === 'erase') t = '消したい原子か線をタップ（もう一度「消す」を押すと終わり）。';
    else if (a) t = `${/^[A-Z][a-z]?$/.test(a) ? `原子をタップすると ${a} に変わります` : a.startsWith('ring') ? `原子をタップすると${PART_NAME[a]}がつきます（何もない所なら環だけ置きます）` : `原子をタップすると ${PART_NAME[a]} がつきます`}。もう一度押すと終わり。`;
    else if (!sketch.count) t = '指でなぞると炭素の鎖。下の部品は原子までドラッグして置く。';
    else if (lack) t = `H があと ${lack} 個たりません。左下の「H を補う」で全部つきます。`;
    else t = `なぞると鎖、線をタップで${isDetail() ? '二重・三重' : '二重'}、原子を長押しでメニュー。`;
    hint.textContent = t;
  }

  const key = (act, big, small, { cls = '', off = false, on = false } = {}) =>
    `<button class="sks-key ${cls}${on ? ' on' : ''}" data-act="${act}"${off ? ' aria-disabled="true"' : ''}><b>${big}</b><small>${small}</small></button>`;

  function paintBar() {
    bar.className = 'sks-bar c8 sks-parts';
    const a = sketch.armed;
    bar.innerHTML = PARTS.map(([part, big, small, cls]) => `<button class="sks-key sks-part ${cls || ''}${a === part ? ' on' : ''}" data-part="${part}" aria-pressed="${a === part}"><b>${big}</b><small>${small}</small></button>`).join('')
      + key('undo', UNDO, '戻す', { cls: 'sks-undo', off: !sketch.canUndo })
      + key('more', '…', 'ほか');
  }

  function paint() {
    paintBar();
    paintHint();
    root.querySelector('.sks-top [data-act="undo"]').disabled = !sketch.canUndo;
    root.querySelector('[data-act="redo"]').disabled = !sketch.canRedo;
    root.querySelector('[data-act="clear"]').disabled = !sketch.count && !sketch.bondCount;
    root.querySelectorAll('[data-act^="mode-"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.act === `mode-${mode}`)));
    const lack = mode === 'full' ? sketch.missingH() : 0;
    const addh = root.querySelector('.sks-addh');
    addh.hidden = !lack;
    addh.querySelector('.sks-badge').textContent = lack;
  }

  function setMode(m) {
    if (m === mode) return;
    mode = m;
    prefs.set('sketch:mode', m);
    sketch.setMode(m);
    say(m === 'full' ? '構造式で描きます。H もすべて描きます（左下の「H を補う」で一度につけられます）。' : '骨格構造式で描きます。C についた H は自動でつきます。');
    paint();
  }

  function clearAll() {
    if (!sketch.count && !sketch.bondCount) return;
    sketch.clear();
    clearTimeout(toastTimer);
    toastEl.hidden = false;
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 5000);
  }

  // bottom sheet ほか: more parts, and the other ways to draw
  function closeSheet() {
    sheetEl?.remove();
    sheetEl = null;
    window.removeEventListener('hashchange', closeSheet);
  }

  function moreSheet() {
    closeSheet();
    // entries marked detail: true only with くわしい表示
    const extra = (o.extraMore || []).filter((x) => !x.detail || isDetail());
    const chips = (list) => `<div class="pick-row">${list.map(([act, label]) => `<button class="chip" data-m="${act}">${label}</button>`).join('')}</div>`;
    const back = h(`
      <div class="sheet-backdrop" role="dialog" aria-modal="true" aria-label="ほかの部品">
        <div class="sheet">
          <div class="grab"></div>
          <h2>ほかの部品</h2>
          <p class="small muted" style="text-align:center;margin:0">選ぶと、原子をタップして置けるようになります。</p>
          <h3 class="pick-h">原子団</h3>${chips([['arm-CH3', '−CH₃'], ['arm-NH2', '−NH₂'], ['arm-CHO', '−CHO']])}
          <h3 class="pick-h">環</h3>${chips([['arm-ring6a', 'ベンゼン環'], ['arm-ring6', 'シクロヘキサン'], ['arm-ring5', 'シクロペンタン'], ['arm-ring4', 'シクロブタン'], ['arm-ring3', 'シクロプロパン']])}
          <h3 class="pick-h">元素に変える</h3>${chips(['C', 'S', 'Cl', 'Br', 'F', 'H'].map((x) => [`arm-${x}`, x]))}
          ${extra.length ? `<h3 class="pick-h">べつの描き方</h3><div class="stack">${extra.map((x) => `<button class="btn block" data-m="x-${x.act}">${x.label}</button>`).join('')}</div>` : ''}
          <div class="two" style="margin-top:14px">
            <button class="btn" data-m="coach">${icon('info')}使い方</button>
            <button class="btn" data-m="close">閉じる</button>
          </div>
        </div>
      </div>`);
    back.addEventListener('click', (e) => {
      if (e.target === back) return closeSheet();
      const b = e.target.closest('[data-m]');
      if (!b) return;
      closeSheet();
      const m = b.dataset.m;
      if (m === 'close') return;
      if (m.startsWith('x-')) return o.onMore?.(m.slice(2));
      if (m === 'coach') return showCoach();
      if (m.startsWith('arm-')) { sketch.arm(m.slice(4)); paint(); }
    });
    document.body.append(back);
    sheetEl = back;
    // leaving the page (e.g. the phone's back button) closes the sheet
    window.addEventListener('hashchange', closeSheet);
  }

  function showCoach() {
    const c = h(coachHtml());
    c.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="coach-ok"]') || e.target === c) {
        prefs.set('sketch:coach', '1');
        c.remove();
      }
    });
    canvas.append(c);
  }

  function act(a) {
    if (a.startsWith('m-')) { menuAct(a.slice(2)); return; }
    if (a.startsWith('mode-')) setMode(a.slice(5));
    else if (a === 'undo') sketch.undo();
    else if (a === 'fit') sketch.fit();
    else if (a === 'allH') sketch.addHydrogens();
    else if (a === 'clear') clearAll();
    else if (a === 'restore') { toastEl.hidden = true; sketch.undo(); }
    else if (a === 'more') moreSheet();
  }

  // ---- pen: parts shelf (tap = arm / disarm, drag = drop on an atom)
  function arm(part) {
    const next = sketch.armed === part ? null : part;
    sketch.arm(next);
    paint();
  }
  let pd = null;
  bar.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-part]');
    if (!b) return;
    e.preventDefault();
    b.setPointerCapture?.(e.pointerId);
    pd = { part: b.dataset.part, x: e.clientX, y: e.clientY, chip: null, btn: b };
  });
  bar.addEventListener('pointermove', (e) => {
    if (!pd) return;
    if (!pd.chip && Math.hypot(e.clientX - pd.x, e.clientY - pd.y) > 8) {
      pd.chip = document.createElement('div');
      pd.chip.className = 'sks-chip';
      pd.chip.innerHTML = pd.btn.querySelector('b').innerHTML;
      document.body.append(pd.chip);
    }
    if (pd.chip) {
      // the part floats above the finger; it lands where the chip is
      const y = e.clientY - LIFT;
      pd.chip.style.transform = `translate(${e.clientX}px, ${y}px)`;
      sketch.hoverAt(e.clientX, y);
    }
  });
  const pdEnd = (e) => {
    if (!pd) return;
    const d = pd;
    pd = null;
    if (d.chip) {
      d.chip.remove();
      sketch.hoverAt(null);
      if (e.type === 'pointerup') sketch.dropPart(d.part, e.clientX, e.clientY - LIFT);
    } else if (e.type === 'pointerup') arm(d.part);
  };
  bar.addEventListener('pointerup', pdEnd);
  bar.addEventListener('pointercancel', pdEnd);

  // ---- pen: long-press menu next to the atom / bond
  let menuFor = null;
  function showMenu(m) {
    menuFor = m;
    if (!m) { menuEl.hidden = true; return; }
    const b = (act, label, cls = '') => `<button class="${cls}" data-act="m-${act}">${label}</button>`;
    let items;
    if (m.type === 'atom') {
      items = [
        m.el !== 'C' && b('el-C', 'C にもどす'),
        m.el !== 'O' && b('el-O', 'O', 'o'),
        m.el !== 'N' && b('el-N', 'N', 'n'),
        mode === 'full' && m.free > 0 && b('ext-H', 'H をつける'),
        m.free > 0 && b('g-CH3', '−CH₃'),
        b('remove', '消す', 'del'),
      ];
    } else {
      items = [b('bo1', '単結合', m.order === 1 ? 'on' : ''), b('bo2', '二重', m.order === 2 ? 'on' : ''), (isDetail() || m.order === 3) && b('bo3', '三重', m.order === 3 ? 'on' : ''), b('remove', '消す', 'del')];
    }
    menuEl.innerHTML = items.filter(Boolean).join('');
    menuEl.hidden = false;
    const W = canvas.clientWidth;
    const w = menuEl.offsetWidth;
    menuEl.style.left = `${Math.max(6, Math.min(W - w - 6, m.x - w / 2))}px`;
    menuEl.style.top = `${Math.max(6, m.y - menuEl.offsetHeight - 34)}px`;
  }
  function menuAct(a) {
    const run = (fn) => sketch.onMenuTarget(fn);
    if (a.startsWith('el-')) run(() => sketch.setElement(a.slice(3)));
    else if (a === 'ext-H') run(() => sketch.extend(1, 'H'));
    else if (a.startsWith('g-')) run(() => sketch.addGroup(a.slice(2)));
    else if (a.startsWith('bo')) run(() => sketch.setBondOrder(+a.slice(2)));
    else if (a === 'remove') run(() => sketch.remove());
  }

  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-part]')) return;
    const b = e.target.closest('[data-act]');
    if (!b || !root.contains(b)) return;
    const a = b.dataset.act;
    if (a === 'close') return o.onClose?.();
    if (a === 'primary') return o.primary?.onClick?.();
    if (a === 'redo') return sketch.redo();
    if (a === 'coach-ok') return;
    act(a);
  });

  // keyboard (PC): only while this screen is visible and nothing else has focus
  function onKey(e) {
    if (!root.isConnected || root.closest('[hidden]') || root.hidden) return;
    if (document.querySelector('.sheet-backdrop')) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) return;
    const k = e.key;
    const mod = e.metaKey || e.ctrlKey;
    let done = true;
    if (mod && k.toLowerCase() === 'z') (e.shiftKey ? sketch.redo() : sketch.undo());
    else if (mod && k.toLowerCase() === 'y') sketch.redo();
    else if (mod) done = false;
    else if (k === 'Escape') { sketch.arm(null); showMenu(null); sketch.closeMenu(); paint(); }
    else if (k === 'f' || k === 'F') sketch.fit();
    else done = false;
    if (done) e.preventDefault();
  }
  document.addEventListener('keydown', onKey);

  paint();

  return {
    sketch,
    root,
    say,
    get mode() { return mode; },
    setSheet(html) {
      const s = root.querySelector('.sks-sheet');
      s.hidden = !html;
      s.innerHTML = html || '';
    },
    destroy() {
      closeSheet();
      clearTimeout(msgTimer);
      clearTimeout(toastTimer);
      document.removeEventListener('keydown', onKey);
      sketch.destroy();
      document.documentElement.classList.remove('sks-lock');
    },
  };
}
