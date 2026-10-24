// Full-screen drawing screen around the editor (js/mol/sketch.js), shared
// by かんたん作図 and the 描く questions of 書きかえ練習:
//   top bar     close, undo, redo, an optional main button (答え合わせ)
//   prompt      optional (the question)
//   canvas      fills the screen; the page itself does not scroll
//   hint        what can be done now (changes with the selection)
//   action bar  buttons for the selected atom / bond, or general ones
//   sheet       optional (name, formula, 3D ...)
import { esc, el as h, prefs } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { mountSketch } from '../mol/sketch.js';

const MODE_NAME = { skeletal: '骨格構造式', full: '構造式（H も描く）' };

const COACH = `
  <div class="sks-coach" role="dialog" aria-label="使い方">
    <div class="sks-coach-card">
      <b>かんたん作図の使い方</b>
      <ol>
        <li><span>1</span>原子（線の端や折れ目）を<b>タップして選ぶ</b></li>
        <li><span>2</span>下のボタンで<b>伸ばす・O にする・−OH をつける</b>。C の位置は自動で決まります</li>
        <li><span>3</span>線をタップすると<b>二重結合・三重結合</b>にできます</li>
      </ol>
      <p class="small muted">原子から指をすべらせても伸ばせます。長押しで原子を動かす。2本指で拡大・移動。</p>
      <button class="btn primary block" data-act="coach-ok">はじめる</button>
    </div>
  </div>`;

/**
 * @param {HTMLElement} root   element to fill (the route element, or an overlay)
 * @param {object} o
 *   title, closeLabel ('閉じる'), onClose, primary {label, onClick},
 *   promptHtml, mode, extraMore [{label, act}], onMore(act), onChange(sketch)
 * @returns {{ sketch, root, setSheet(html), say(msg, warn), destroy() }}
 */
export function mountSketchScreen(root, o = {}) {
  let mode = o.mode || prefs.get('sketch:mode', 'skeletal');
  if (!MODE_NAME[mode]) mode = 'skeletal';
  root.classList.add('sks');
  document.documentElement.classList.add('sks-lock');
  root.innerHTML = `
    <header class="sks-top">
      <button class="sks-x" data-act="close">${icon('close')}<span>${esc(o.closeLabel || '閉じる')}</span></button>
      <b class="sks-title">${esc(o.title || '')}</b>
      <button class="iconbtn" data-act="undo" aria-label="元に戻す">${undoIcon()}</button>
      <button class="iconbtn" data-act="redo" aria-label="やり直す">${undoIcon(true)}</button>
      ${o.primary ? `<button class="btn primary sks-primary" data-act="primary">${esc(o.primary.label)}</button>` : ''}
    </header>
    ${o.promptHtml ? `<div class="sks-prompt">${o.promptHtml}</div>` : ''}
    <div class="sks-canvas"></div>
    <div class="sks-hint" aria-live="polite"></div>
    <div class="sks-bar" role="toolbar" aria-label="できること"></div>
    <div class="sks-sheet" hidden></div>`;

  const hint = root.querySelector('.sks-hint');
  const bar = root.querySelector('.sks-bar');
  let msgTimer = null;
  let sel = null;

  const sketch = mountSketch(root.querySelector('.sks-canvas'), {
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
    let t;
    if (!sel) t = sketch.count <= 1 && !sketch.bondCount ? 'C が1個あります。タップして選ぶと、できることが下に出ます。' : '原子か線をタップして選ぶ。2本指で拡大・移動。';
    else if (sel.type === 'atom') t = `${sel.el} を選んでいます。${sel.free ? '「伸ばす」で、薄い丸の位置に C がつきます。' : '手（結合）が全部うまっています。'}`;
    else t = `${['', '単', '二重', '三重'][sel.order]}結合を選んでいます。種類を変えるか、消す。`;
    hint.textContent = t;
  }

  const key = (act, big, small, { cls = '', off = false, on = false } = {}) =>
    `<button class="sks-key ${cls}${on ? ' on' : ''}" data-act="${act}"${off ? ' aria-disabled="true"' : ''}><b>${big}</b><small>${small}</small></button>`;

  function paintBar() {
    if (sel?.type === 'atom') {
      const f = sel.free;
      bar.className = 'sks-bar c5';
      bar.innerHTML = [
        key('ext1', '＋C', '伸ばす', { off: f < 1 }),
        key('ext2', '＝C', '二重で', { off: f < 2 }),
        key('ext3', '≡C', '三重で', { off: f < 3 }),
        key('g-OH', '−OH', 'つける', { cls: 'o', off: f < 1 }),
        key('g-=O', '=O', 'つける', { cls: 'o', off: f < 2 }),
        key('el-O', 'O', 'にする', { cls: 'o', on: sel.el === 'O' }),
        key('el-N', 'N', 'にする', { cls: 'n', on: sel.el === 'N' }),
        sel.el === 'C' ? key('g-CH3', '−CH₃', '枝', { off: f < 1 }) : key('el-C', 'C', 'にもどす'),
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
        key('rings', '⬡', '環を置く'),
        key('mode', mode === 'full' ? 'H' : '∧', mode === 'full' ? 'H も描く' : '骨格構造式'),
        key('fit', '⤢', '全体を表示'),
        key('more', '…', 'ほか'),
      ].join('');
    }
  }

  function paint() {
    paintBar();
    paintHint();
    root.querySelector('[data-act="undo"]').disabled = !sketch.canUndo;
    root.querySelector('[data-act="redo"]').disabled = !sketch.canRedo;
  }

  function setMode(m) {
    mode = m;
    prefs.set('sketch:mode', m);
    sketch.setMode(m);
    say(`${MODE_NAME[m]}で描きます。${m === 'full' ? 'H は「ほか」→「H をすべて描く」でもつけられます。' : 'C についた H は自動でつきます。'}`);
  }

  // bottom sheet listing everything that is not on the bar
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
          ${mode === 'full' ? chips([['ext-H', 'H をつける']]) : ''}` : `
          <h3 class="pick-h">環を置く</h3>${chips([['ring-6a', 'ベンゼン環'], ['ring-6', 'シクロヘキサン'], ['ring-5', 'シクロペンタン'], ['ring-4', 'シクロブタン'], ['ring-3', 'シクロプロパン']])}`}
          <h3 class="pick-h">表示</h3>${chips([['mode-skeletal', '骨格構造式で描く'], ['mode-full', 'H も描く（構造式）'], ...(mode === 'full' ? [['allH', 'H をすべて描く']] : []), ['fit', '全体を表示']])}
          ${(o.extraMore || []).length ? `<h3 class="pick-h">べつの描き方</h3><div class="stack">${o.extraMore.map((x) => `<button class="btn block" data-m="x-${x.act}">${x.label}</button>`).join('')}</div>` : ''}
          <div class="two" style="margin-top:14px">
            <button class="btn" data-m="clear">${icon('close')}すべて消す</button>
            <button class="btn" data-m="coach">${icon('info')}使い方</button>
          </div>
          <button class="btn block" data-m="close" style="margin-top:8px">閉じる</button>
        </div>
      </div>`);
    back.querySelectorAll('[data-m^="mode-"]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.m === `mode-${mode}`));
    back.addEventListener('click', (e) => {
      if (e.target === back) return back.remove();
      const b = e.target.closest('[data-m]');
      if (!b) return;
      back.remove();
      const m = b.dataset.m;
      if (m === 'close') return;
      if (m.startsWith('x-')) return o.onMore?.(m.slice(2));
      if (m === 'clear') return sketch.clear();
      if (m === 'coach') return showCoach();
      if (m === 'allH') return sketch.addHydrogens();
      if (m.startsWith('mode-')) return setMode(m.slice(5));
      act(m);
    });
    document.body.append(back);
  }

  function ringSheet() {
    moreSheet();
  }

  function showCoach() {
    const c = h(COACH);
    c.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="coach-ok"]') || e.target === c) {
        prefs.set('sketch:coach', '1');
        c.remove();
      }
    });
    root.querySelector('.sks-canvas').append(c);
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
    else if (a === 'remove') sketch.remove();
    else if (a === 'fit') sketch.fit();
    else if (a === 'mode') setMode(mode === 'full' ? 'skeletal' : 'full');
    else if (a === 'rings') ringSheet();
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
      sketch.destroy();
      document.documentElement.classList.remove('sks-lock');
    },
  };
}

function undoIcon(redo = false) {
  return `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" style="${redo ? 'transform:scaleX(-1)' : ''}"><path d="M9 7L4 12l5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 12h10a6 6 0 0 1 0 12h-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" transform="translate(0 -6)"/></svg>`;
}
