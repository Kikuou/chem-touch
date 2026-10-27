// Full-screen drawing screen around the editor (js/mol/sketch.js), shared
// by かんたん作図 and the 描く questions of 書きかえ練習:
//   top bar     close, 骨格構造式 / H も描く switch, undo, redo, clear all
//   prompt      optional (the question, with the main button 答え合わせ)
//   canvas      fills the screen; the page itself does not scroll.
//               Corner buttons: 全体を表示, and H を補う (with the number of
//               missing hydrogens) in the H も描く mode
//   hint        what can be done now (changes with the selection)
//   action bar  buttons for the selected atom / bond, or ring templates
//   sheet       optional (name, formula, 3D ...); a side panel on wide screens
// Keyboard: ⌘/Ctrl+Z undo, ⌘/Ctrl+Shift+Z or Ctrl+Y redo, Delete remove,
// C O N S H element, 1 2 3 bond order (or extend with it), F fit, Esc.
import { esc, el as h, prefs } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { mountSketch } from '../mol/sketch.js';

const MODES = { skeletal: '骨格構造式', full: '構造式' };

const COACH = `
  <div class="sks-coach" role="dialog" aria-label="使い方">
    <div class="sks-coach-card">
      <b>かんたん作図の使い方</b>
      <ol>
        <li><span>1</span>原子（線の端や折れ目）を<b>タップして選ぶ</b></li>
        <li><span>2</span>下のボタンで<b>伸ばす・O にする・−OH をつける</b>。C の位置は自動で決まります</li>
        <li><span>3</span>線をタップすると<b>二重結合・三重結合</b>にできます</li>
      </ol>
      <p class="small muted">上の「骨格構造式 / 構造式」で書き方を切り替え。構造式では H も描きます。原子から指をすべらせても伸ばせます。長押しで原子を動かす。2本指で拡大・移動。</p>
      <button class="btn primary block" data-act="coach-ok">はじめる</button>
    </div>
  </div>`;

const svgIcon = (d, label) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"${label ? '' : ''}>${d}</svg>`;
const UNDO = svgIcon('<path d="M9 5L4 10l5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 10h10a6 6 0 0 1 0 12h-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>');
const TRASH = svgIcon('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>');
const FIT = svgIcon('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>');

/**
 * @param {HTMLElement} root   element to fill (the route element, or an overlay)
 * @param {object} o
 *   closeLabel ('閉じる'), onClose, primary {label, onClick} (shown in the
 *   prompt when there is one), promptHtml, mode, extraMore [{label, act}],
 *   onMore(act), onChange(sketch), side (true: the sheet becomes a side
 *   panel on wide screens)
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
  let sel = null;

  const canvas = root.querySelector('.sks-canvas');
  const host = document.createElement('div');
  host.className = 'sks-draw';
  canvas.prepend(host);
  const sketch = mountSketch(host, {
    mode,
    onChange: () => { paint(); o.onChange?.(sketch); },
    onSelect: (s) => { sel = s; paint(); },
    onMessage: (m) => say(m, true),
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
    let t;
    if (!sel) {
      if (sketch.count <= 1 && !sketch.bondCount) t = 'C が1個あります。タップして選ぶと、できることが下に出ます。';
      else if (lack) t = `H があと ${lack} 個たりません。左下の「H を補う」で全部つきます。`;
      else t = '原子か線をタップして選ぶ。2本指で拡大・移動。';
    } else if (sel.type === 'atom') {
      if (mode === 'full' && sel.el !== 'H') t = `${sel.el} を選んでいます。${sel.free ? `H をあと ${sel.free} 個つけられます。` : '手（結合）が全部うまっています。'}`;
      else t = `${sel.el} を選んでいます。${sel.free ? '「伸ばす」で、薄い丸の位置に C がつきます。' : '手（結合）が全部うまっています。'}`;
    } else t = `${['', '単', '二重', '三重'][sel.order]}結合を選んでいます。種類を変えるか、消す。`;
    hint.textContent = t;
  }

  const key = (act, big, small, { cls = '', off = false, on = false } = {}) =>
    `<button class="sks-key ${cls}${on ? ' on' : ''}" data-act="${act}"${off ? ' aria-disabled="true"' : ''}><b>${big}</b><small>${small}</small></button>`;

  function paintBar() {
    if (sel?.type === 'atom') {
      const f = sel.free;
      const el = sel.el;
      const toC = key('el-C', 'C', 'にもどす');
      let slot8;
      if (mode === 'full') slot8 = key('ext-H', 'H', 'をつける', { off: f < 1 });
      else if (el === 'C' || el === 'O' || el === 'N') slot8 = key('g-CH3', '−CH₃', '枝', { off: f < 1 });
      else slot8 = toC;
      bar.className = 'sks-bar c5';
      bar.innerHTML = [
        key('ext1', '＋C', '伸ばす', { off: f < 1 }),
        key('ext2', '＝C', '二重で', { off: f < 2 }),
        key('ext3', '≡C', '三重で', { off: f < 3 }),
        key('g-OH', '−OH', 'つける', { cls: 'o', off: f < 1 }),
        key('g-=O', '=O', 'つける', { cls: 'o', off: f < 2 }),
        el === 'O' ? toC : key('el-O', 'O', 'にする', { cls: 'o' }),
        el === 'N' ? toC : key('el-N', 'N', 'にする', { cls: 'n' }),
        slot8,
        key('more', '…', 'ほか'),
        key('remove', '×', '消す', { cls: 'del' }),
      ].join('');
    } else if (sel?.type === 'bond') {
      bar.className = 'sks-bar c4';
      bar.innerHTML = [
        key('bo1', '―', '単結合', { on: sel.order === 1 }),
        key('bo2', '＝', '二重', { on: sel.order === 2 }),
        key('bo3', '≡', '三重', { on: sel.order === 3 }),
        key('remove', '×', '消す', { cls: 'del' }),
      ].join('');
    } else {
      bar.className = 'sks-bar c4';
      bar.innerHTML = [
        key('ring-6a', ringSvg(6, true), 'ベンゼン環'),
        key('ring-6', ringSvg(6), 'C6 の環'),
        key('ring-5', ringSvg(5), 'C5 の環'),
        key('more', '…', 'ほか'),
      ].join('');
    }
  }

  function paint() {
    paintBar();
    paintHint();
    root.querySelector('[data-act="undo"]').disabled = !sketch.canUndo;
    root.querySelector('[data-act="redo"]').disabled = !sketch.canRedo;
    root.querySelector('[data-act="clear"]').disabled = sketch.count <= 1 && !sketch.bondCount;
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
    if (sketch.count <= 1 && !sketch.bondCount) return;
    sketch.clear();
    clearTimeout(toastTimer);
    toastEl.hidden = false;
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 5000);
  }

  // bottom sheet with what is not on screen
  function moreSheet() {
    const atom = sel?.type === 'atom';
    const chips = (list) => `<div class="pick-row">${list.map(([act, label]) => `<button class="chip" data-m="${act}">${label}</button>`).join('')}</div>`;
    const back = h(`
      <div class="sheet-backdrop" role="dialog" aria-modal="true" aria-label="ほかの操作">
        <div class="sheet">
          <div class="grab"></div>
          <h2>${atom ? `${esc(sel.el)} にできること` : 'ほかの操作'}</h2>
          ${atom ? `<h3 class="pick-h">部品をつける</h3>${chips([['g-CH3', '−CH₃'], ['g-NH2', '−NH₂'], ['g-CHO', '−CHO'], ['g-COOH', '−COOH'], ['ring-6a', 'ベンゼン環'], ['ring-6', 'シクロヘキサン環']])}
          <h3 class="pick-h">元素を変える</h3>${chips(['C', 'O', 'N', 'S', 'Cl', 'Br', 'F', 'H'].map((x) => [`el-${x}`, x]))}
          ${mode === 'full' ? '' : chips([['ext-H', 'H をつける']])}` : `
          <h3 class="pick-h">環を置く</h3>${chips([['ring-6a', 'ベンゼン環'], ['ring-6', 'シクロヘキサン'], ['ring-5', 'シクロペンタン'], ['ring-4', 'シクロブタン'], ['ring-3', 'シクロプロパン']])}`}
          ${(o.extraMore || []).length ? `<h3 class="pick-h">べつの描き方</h3><div class="stack">${o.extraMore.map((x) => `<button class="btn block" data-m="x-${x.act}">${x.label}</button>`).join('')}</div>` : ''}
          <div class="two" style="margin-top:14px">
            <button class="btn" data-m="coach">${icon('info')}使い方</button>
            <button class="btn" data-m="close">閉じる</button>
          </div>
        </div>
      </div>`);
    back.addEventListener('click', (e) => {
      if (e.target === back) return back.remove();
      const b = e.target.closest('[data-m]');
      if (!b) return;
      back.remove();
      const m = b.dataset.m;
      if (m === 'close') return;
      if (m.startsWith('x-')) return o.onMore?.(m.slice(2));
      if (m === 'coach') return showCoach();
      act(m);
    });
    document.body.append(back);
  }

  function showCoach() {
    const c = h(COACH);
    c.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="coach-ok"]') || e.target === c) {
        prefs.set('sketch:coach', '1');
        c.remove();
      }
    });
    canvas.append(c);
  }

  function act(a) {
    if (a === 'ext1') sketch.extend(1);
    else if (a === 'ext2') sketch.extend(2);
    else if (a === 'ext3') sketch.extend(3);
    else if (a === 'ext-H') sketch.extend(1, 'H');
    else if (a.startsWith('g-')) sketch.addGroup(a.slice(2));
    else if (a.startsWith('el-')) sketch.setElement(a.slice(3));
    else if (a.startsWith('bo')) sketch.setBondOrder(+a.slice(2));
    else if (a.startsWith('ring-')) sketch.ring(parseInt(a.slice(5), 10), a.endsWith('a'));
    else if (a.startsWith('mode-')) setMode(a.slice(5));
    else if (a === 'remove') sketch.remove();
    else if (a === 'fit') sketch.fit();
    else if (a === 'allH') sketch.addHydrogens();
    else if (a === 'clear') clearAll();
    else if (a === 'restore') { toastEl.hidden = true; sketch.undo(); }
    else if (a === 'more') moreSheet();
  }

  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || !root.contains(b)) return;
    const a = b.dataset.act;
    if (a === 'close') return o.onClose?.();
    if (a === 'primary') return o.primary?.onClick?.();
    if (a === 'undo') return sketch.undo();
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
    else if (k === 'Delete' || k === 'Backspace') sketch.remove();
    else if (k === 'Escape') sketch.select(null);
    else if (k === 'f' || k === 'F') sketch.fit();
    else if (/^[123]$/.test(k)) {
      if (sel?.type === 'bond') sketch.setBondOrder(+k);
      else if (sel?.type === 'atom') sketch.extend(+k);
      else done = false;
    } else if (/^[conshCONSH]$/.test(k) && sel?.type === 'atom') {
      const el = k.toUpperCase();
      if (el === 'H' && mode === 'full') sketch.extend(1, 'H');
      else sketch.setElement(el);
    } else done = false;
    if (done) e.preventDefault();
  }
  document.addEventListener('keydown', onKey);

  paint();
  if (!prefs.get('sketch:coach', '')) showCoach();

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
      clearTimeout(msgTimer);
      clearTimeout(toastTimer);
      document.removeEventListener('keydown', onKey);
      sketch.destroy();
      document.documentElement.classList.remove('sks-lock');
    },
  };
}

// small ring icon for the ring buttons
function ringSvg(n, aromatic = false) {
  const R = 9;
  const pts = [...Array(n).keys()].map((k) => {
    const t = -Math.PI / 2 + (2 * Math.PI * k) / n;
    return [12 + R * Math.cos(t), 12 + R * Math.sin(t)];
  });
  const d = `M${pts.map((p) => p.map((v) => v.toFixed(1)).join(' ')).join('L')}Z`;
  const inner = aromatic ? `<circle cx="12" cy="12" r="4.6" fill="none" stroke="currentColor" stroke-width="1.4"/>` : '';
  return `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>${inner}</svg>`;
}
