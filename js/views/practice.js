// 書きかえ練習: #/build/practice?mode=choose|blocks|draw&focus=<id>
// A molecule is shown in one way of writing; the student answers in
// another. Three ways to answer:
//   choose  えらぶ   pick the same molecule among 4 (distractors are
//                    isomers first: same molecular formula)
//   blocks  並べる   build the 示性式 from blocks (CH3, CH2, OH, COOH ...)
//   draw    描く     draw it (骨格構造式, or 構造式 with every H)
// An answer is right when it is the same molecule (molcheck.js), however
// it was written. Molecules: data/practice.json (at most 6 carbons).
import { esc, prefs, toast } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { setQuery } from '../core/router.js';
import { compounds, sdf as loadSdf, practiceSet } from '../core/data.js';
import { getRDKit } from '../mol/rdkit.js';
import * as N from '../mol/notation.js';
import { NOTATIONS, prepare, render } from '../mol/notations.js';
import { BLOCKS, parseRational, sameMolecule, moleculeKey, hasEZ, formulaKey } from '../mol/molcheck.js';
import { mountSketch } from '../mol/sketch.js';
import { toolbarHtml, moreSheet, MODE_TEXT } from './sketch.js';

const MODES = {
  choose: { name: 'えらぶ', desc: '別の書き方で書かれた4つから、同じ分子を選ぶ' },
  blocks: { name: '並べる', desc: '構造式を見て、示性式をブロックで組み立てる' },
  draw: { name: '描く', desc: '示性式などを見て、骨格構造式（または構造式）を描く' },
};
const COUNT = 10;

const shuffle = (a) => {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];
// ring molecules are drawn with RDKit for 構造式; the label stays 構造式
const nameOf = (k) => (k === 'angle' ? NOTATIONS.structural.name : NOTATIONS[k].name);
const blockHtml = (t) => esc(t).replace(/(\d+)/g, '<sub>$1</sub>');

// a notation only where it is drawn "natively" (no fallbacks), else null
function show(ctx, k) {
  const { g } = ctx;
  if (k === 'structural') return N.structuralSvg(g);
  if (k === 'condensed') return N.condensedSvg(g);
  if (k === 'rational') { const t = N.rationalHtml(g); return t ? `<div class="nt-text">${t}</div>` : null; }
  return render(ctx, k);
}

export async function renderPractice({ el, query, subShell }) {
  const content = subShell(el, '書きかえ練習');
  content.innerHTML = '<p class="empty"><span class="spinner"></span>準備中…</p>';
  const [set, list, RDKit] = await Promise.all([practiceSet(), compounds(), getRDKit()]);
  if (!content.isConnected) return null;
  const byId = new Map(list.map((c) => [c.id, c]));
  const groupOf = new Map();
  set.groups.forEach((g) => g.items.forEach((id) => groupOf.set(id, g.id)));
  const allIds = set.groups.flatMap((g) => g.items).filter((id) => byId.has(id));
  const ctxCache = new Map();
  const ctxOf = async (id) => {
    if (!ctxCache.has(id)) ctxCache.set(id, loadSdf(byId.get(id)).then((mb) => prepare(RDKit, mb)));
    return ctxCache.get(id);
  };

  let mode = MODES[query.get('mode')] ? query.get('mode') : prefs.get('practice:mode', 'choose');
  if (!MODES[mode]) mode = 'choose';
  const known = set.groups.map((g) => g.id);
  let groups = new Set((prefs.get('practice:groups', '') || '').split(',').filter((x) => known.includes(x)));
  if (!groups.size) groups = new Set(known);
  let focus = query.get('focus');
  let cleanup = null;

  // ------------------------------------------------------------ setup
  function setup() {
    cleanup?.();
    cleanup = null;
    setQuery({ mode, ...(focus ? { focus } : {}) });
    content.innerHTML = `
      <section class="card pr-setup">
        <b>答え方</b>
        <div class="pr-modes" role="group" aria-label="答え方">
          ${Object.entries(MODES).map(([k, m]) => `<button class="pr-mode" data-mode="${k}"><b>${m.name}</b><span>${m.desc}</span></button>`).join('')}
        </div>
        <b>出題する分子</b>
        <div class="pick-row pr-groups">
          <button class="chip" data-all>すべて</button>
          ${set.groups.map((g) => `<button class="chip" data-g="${g.id}">${esc(g.label.replace(/（.*）/, ''))}</button>`).join('')}
        </div>
        ${focus && byId.get(focus) ? `<p class="small muted">最初の問題は「${esc(byId.get(focus).name_ja)}」です。</p>` : ''}
        <button class="btn primary block" data-act="start">${icon('quiz')}${COUNT}問はじめる</button>
      </section>
      <p class="small muted" style="margin:10px 2px">炭素数6までの分子から出題します。書き方が違っても、同じ分子なら正解です（鏡像異性体の区別はしません）。</p>`;
    const paint = () => {
      content.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === mode));
      content.querySelectorAll('[data-g]').forEach((b) => b.setAttribute('aria-pressed', groups.has(b.dataset.g)));
      content.querySelector('[data-all]').setAttribute('aria-pressed', groups.size === set.groups.length);
    };
    content.onclick = (e) => {
      const m = e.target.closest('[data-mode]');
      if (m) { mode = m.dataset.mode; prefs.set('practice:mode', mode); setQuery({ mode, ...(focus ? { focus } : {}) }); paint(); return; }
      const g = e.target.closest('[data-g]');
      if (g) {
        if (groups.size === set.groups.length) groups = new Set([g.dataset.g]);
        else if (groups.has(g.dataset.g)) groups.delete(g.dataset.g);
        else groups.add(g.dataset.g);
        if (!groups.size) groups = new Set(set.groups.map((x) => x.id));
        prefs.set('practice:groups', [...groups].join(','));
        paint();
        return;
      }
      if (e.target.closest('[data-all]')) { groups = new Set(set.groups.map((x) => x.id)); prefs.set('practice:groups', [...groups].join(',')); paint(); return; }
      if (e.target.closest('[data-act="start"]')) start();
    };
    paint();
  }

  // ------------------------------------------------------------ questions

  // molecules of the chosen groups that suit the mode (cis/trans pairs are
  // asked only where the drawing shows the shape: えらぶ with 構造式/骨格構造式)
  function pool() {
    return allIds.filter((id) => groups.has(groupOf.get(id)) && (mode === 'choose' || !hasEZ(byId.get(id).smiles)));
  }

  async function makeChoose(c) {
    const ctx = await ctxOf(c.id);
    const geo = hasEZ(c.smiles);
    let keys = geo ? ['angle', 'skeletal'] : ['structural', 'condensed', 'skeletal', 'rational'].filter((k) => show(ctx, k));
    if (!geo && !keys.includes('structural')) keys = ['angle', ...keys]; // rings
    if (keys.length < 2) return null;
    const from = pick(keys);
    const to = pick(keys.filter((k) => k !== from));
    const target = moleculeKey(RDKit, c.smiles, { keepEZ: geo });
    const f = c.formula;
    const others = shuffle(allIds.filter((id) => id !== c.id).map((id) => byId.get(id)));
    // isomers first, then the same group, then any
    const rank = (d) => (d.formula === f ? 0 : groupOf.get(d.id) === groupOf.get(c.id) ? 1 : 2);
    others.sort((a, b) => rank(a) - rank(b));
    const answer = show(ctx, to);
    const options = [{ c, html: answer, ok: true }];
    const seen = new Set([answer]);
    for (const d of others) {
      if (options.length === 4) break;
      const html = show(await ctxOf(d.id), to);
      if (!html || seen.has(html)) continue;
      if (moleculeKey(RDKit, d.smiles, { keepEZ: geo }) === target) continue;
      seen.add(html);
      options.push({ c: d, html, ok: false });
    }
    if (options.length < 3) return null;
    return { kind: 'choose', c, ctx, from, to, options: shuffle(options) };
  }

  async function makeBlocks(c) {
    const ctx = await ctxOf(c.id);
    const tokens = N.rationalTokens(ctx.g);
    if (!tokens || tokens.some((t) => t.t === 'C6H6')) return null;
    const keys = ['structural', 'condensed', 'skeletal'].filter((k) => show(ctx, k));
    if (!keys.length) return null;
    return { kind: 'blocks', c, ctx, from: pick(keys), to: 'rational' };
  }

  async function makeDraw(c) {
    const ctx = await ctxOf(c.id);
    let keys = ['rational', 'condensed', 'structural'].filter((k) => show(ctx, k));
    if (!N.structuralSvg(ctx.g)) keys.push('angle');
    return { kind: 'draw', c, ctx, from: pick(keys), to: 'skeletal' };
  }

  const MAKE = { choose: makeChoose, blocks: makeBlocks, draw: makeDraw };

  async function start() {
    const ids = shuffle(pool());
    if (focus && ids.includes(focus)) { ids.splice(ids.indexOf(focus), 1); ids.unshift(focus); }
    focus = null;
    const run = { mode, ids, next: 0, done: [] };
    content.innerHTML = '<p class="empty"><span class="spinner"></span>問題を用意しています…</p>';
    await nextQuestion(run);
  }

  async function nextQuestion(run) {
    cleanup?.();
    cleanup = null;
    if (run.done.length >= COUNT || run.next >= run.ids.length) return summary(run);
    let q = null;
    while (!q && run.next < run.ids.length) q = await MAKE[run.mode](byId.get(run.ids[run.next++]));
    if (!content.isConnected) return;
    if (!q) return summary(run);
    ask(run, q);
  }

  // ------------------------------------------------------------ one question
  function ask(run, q) {
    const n = run.done.length + 1;
    const total = Math.min(COUNT, run.ids.length);
    const right = run.done.filter((d) => d.ok).length;
    content.onclick = null;
    content.innerHTML = `
      <div class="pr-bar"><span style="width:${((n - 1) / total) * 100}%"></span></div>
      <div class="pr-top small"><span>${n} / ${total}</span><span class="quiz-score">${right} 問正解</span></div>
      <section class="card pr-q">
        <p class="pr-ask">この<b>${nameOf(q.from)}</b>の分子を、<b>${nameOf(q.to)}</b>で${q.kind === 'choose' ? 'あらわしたものはどれ？' : q.kind === 'blocks' ? '書こう。' : '描こう。'}</p>
        <div class="nt-box pr-shown">${show(q.ctx, q.from)}</div>
      </section>
      <div class="pr-answer"></div>
      <div class="quiz-result pr-result" aria-live="assertive"></div>
      <div class="pr-next"></div>`;
    const area = content.querySelector('.pr-answer');
    const result = content.querySelector('.pr-result');
    const rec = { c: q.c, ok: false, tried: false };
    let finished = false;

    function finish(ok, msg) {
      if (finished) return;
      finished = true;
      if (!rec.tried) rec.ok = ok;
      rec.tried = true;
      run.done.push(rec);
      const sk = q.ctx;
      result.innerHTML = `
        <div class="${ok ? 'quiz-ok' : 'quiz-ng'}">${ok ? `${icon('star')}正解！` : ''}${msg || ''}</div>
        <div class="pr-explain card">
          <b>${esc(q.c.name_ja)}</b>
          <div class="pr-ans-row">
            <div><span class="small muted">示性式</span><div class="nt-text">${N.rationalHtml(sk.g) || N.toSubHtml(N.formulaText(sk.g))}</div></div>
            <div><span class="small muted">骨格構造式</span>${render(sk, 'skeletal')}</div>
          </div>
          <p class="small muted">${esc(NOTATIONS[q.to === 'angle' ? 'structural' : q.to].desc)}</p>
          <a class="small" href="#/build/notation?id=${encodeURIComponent(q.c.id)}">書き方くらべで見る ›</a>
        </div>`;
      content.querySelector('.pr-next').innerHTML = `<button class="btn primary block" data-act="next">${run.done.length >= total ? '結果を見る' : '次の問題'} ${icon('chev')}</button>`;
      content.querySelector('[data-act="next"]').onclick = () => nextQuestion(run);
      content.querySelector('.pr-bar span').style.width = `${(run.done.length / total) * 100}%`;
      content.querySelector('.quiz-score').textContent = `${run.done.filter((d) => d.ok).length} 問正解`;
    }

    // a wrong try: the question stays open, but it no longer counts as right
    function miss(msg) {
      rec.tried = true;
      rec.ok = false;
      result.innerHTML = `<div class="quiz-ng">${msg}</div>`;
    }

    if (q.kind === 'choose') {
      area.innerHTML = `<div class="pr-opts">${q.options.map((o, i) => `<button class="card pr-opt" data-i="${i}"><span class="pr-no">${'ABCD'[i]}</span><div class="nt-box">${o.html}</div></button>`).join('')}</div>`;
      area.onclick = (e) => {
        const b = e.target.closest('[data-i]');
        if (!b || finished) return;
        const o = q.options[+b.dataset.i];
        area.querySelectorAll('[data-i]').forEach((x) => {
          const oo = q.options[+x.dataset.i];
          x.classList.toggle('ok', oo.ok);
          x.classList.toggle('ng', x === b && !oo.ok);
          x.disabled = true;
        });
        if (o.ok) finish(true, '');
        else finish(false, o.c.formula === q.c.formula
          ? `選んだのは「${esc(o.c.name_ja)}」。分子式は同じ（異性体）ですが、原子のつながり方がちがいます。`
          : `選んだのは「${esc(o.c.name_ja)}」。原子の種類や数を数えてみよう。`);
      };
      return;
    }

    if (q.kind === 'blocks') {
      let line = [];
      area.innerHTML = `
        <section class="card pr-blocks">
          <div class="pr-line" aria-live="polite"></div>
          <div class="pr-keys">${BLOCKS.map((b) => `<button class="pr-key${/[()=≡]/.test(b) ? ' sym' : ''}" data-b="${esc(b)}">${blockHtml(b)}</button>`).join('')}</div>
          <p class="small muted">主鎖を左から順に並べる。枝は（ ）のブロックを、つながる原子団のすぐあとに。＝・≡ は原子団のあいだに置く。</p>
          <div class="pr-acts">
            <button class="btn" data-act="bs">${icon('back')}1つ消す</button>
            <button class="btn" data-act="reveal">答えを見る</button>
            <button class="btn primary" data-act="check">答え合わせ</button>
          </div>
        </section>`;
      const paint = () => {
        area.querySelector('.pr-line').innerHTML = line.length ? line.map(blockHtml).join('<i></i>') : '<span class="muted small">下のブロックをタップして並べよう</span>';
      };
      area.onclick = (e) => {
        if (finished) return;
        const b = e.target.closest('[data-b]');
        if (b) { line.push(b.dataset.b); paint(); return; }
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (act === 'bs') { line.pop(); paint(); }
        if (act === 'reveal') finish(false, '');
        if (act === 'check') {
          const r = parseRational(line);
          if (r.error) { result.innerHTML = `<div class="quiz-ng">${esc(r.error)}</div>`; return; }
          if (sameMolecule(RDKit, r.molfile, q.c.smiles)) return finish(true, '');
          const same = formulaKey(RDKit, r.molfile) === formulaKey(RDKit, q.c.smiles);
          miss(same ? '分子式は合っていますが、ちがう分子（異性体）です。つながり方を見直そう。' : 'ちがう分子です。原子の数とつながり方を見直そう。');
        }
      };
      paint();
      return;
    }

    // draw
    let dmode = prefs.get('practice:draw', 'skeletal');
    if (!MODE_TEXT[dmode]) dmode = 'skeletal';
    let tool = 'bond';
    area.innerHTML = `
      <div class="seg sk-modes" role="group" aria-label="描き方">
        <button data-dmode="skeletal">骨格構造式で描く</button>
        <button data-dmode="full">H も描く</button>
      </div>
      <div class="sk-wrap card">
        <div class="sk-canvas"></div>
        <div class="sk-side">
          <button class="iconbtn" data-act="undo" aria-label="ひとつ戻す">戻す</button>
          <button class="iconbtn" data-act="clear" aria-label="すべて消す">${icon('close')}</button>
        </div>
      </div>
      <div class="sk-tools" role="group" aria-label="道具"></div>
      <div class="pr-acts two">
        <button class="btn" data-act="reveal">答えを見る</button>
        <button class="btn primary" data-act="check">答え合わせ</button>
      </div>`;
    const sketch = mountSketch(area.querySelector('.sk-canvas'), { height: 260, mode: dmode, onMessage: (m) => toast(m, 3000) });
    cleanup = () => sketch.destroy();
    const paint = () => {
      area.querySelectorAll('[data-dmode]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.dmode === dmode));
      const bar = area.querySelector('.sk-tools');
      bar.innerHTML = toolbarHtml(dmode);
      const onBar = [...bar.querySelectorAll('[data-tool]')].some((b) => b.dataset.tool === tool);
      bar.querySelectorAll('[data-tool]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.tool === tool));
      bar.querySelector('[data-act="more"]').setAttribute('aria-pressed', !onBar);
      if (!onBar) bar.querySelector('[data-act="more"] b').textContent = tool;
    };
    area.onclick = async (e) => {
      const m = e.target.closest('[data-dmode]');
      if (m) {
        dmode = m.dataset.dmode;
        prefs.set('practice:draw', dmode);
        if (dmode === 'skeletal' && tool === 'H') tool = 'bond';
        sketch.setMode(dmode);
        sketch.setTool(tool);
        paint();
        return;
      }
      const tb = e.target.closest('[data-tool]');
      if (tb) { tool = tb.dataset.tool; sketch.setTool(tool); paint(); return; }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'undo') sketch.undo();
      if (act === 'clear') sketch.clear();
      if (act === 'more') {
        const r = await moreSheet({ practice: true });
        if (r?.tool) { tool = r.tool; sketch.setTool(tool); paint(); }
        if (r?.ring) sketch.ring(parseInt(r.ring, 10), r.ring.endsWith('a'));
      }
      if (finished) return;
      if (act === 'reveal') finish(false, '');
      if (act === 'check') {
        if (!sketch.count) { toast('先に分子を描いてください'); return; }
        const mb = sketch.molfile();
        const m2 = RDKit.get_mol(mb);
        const valid = m2 && m2.is_valid();
        const smi = valid ? m2.get_smiles() : '';
        m2?.delete();
        if (!valid) { result.innerHTML = '<div class="quiz-ng">この形は分子として読み取れません。</div>'; return; }
        if (smi.includes('.')) { result.innerHTML = '<div class="quiz-ng">2つ以上の部分に分かれています。線でつなごう。</div>'; return; }
        if (sameMolecule(RDKit, mb, q.c.smiles)) {
          const lack = dmode === 'full' ? sketch.missingH() : 0;
          return finish(true, lack ? `（構造式では、あと ${lack} 個の H も書こう）` : '');
        }
        const same = formulaKey(RDKit, mb) === formulaKey(RDKit, q.c.smiles);
        miss(same ? '分子式は合っていますが、ちがう分子（異性体）です。つながり方を見直そう。' : 'ちがう分子です。C・O・N の数とつながり方を見直そう。');
      }
    };
    paint();
    sketch.setTool(tool);
  }

  // ------------------------------------------------------------ summary
  function summary(run) {
    cleanup?.();
    cleanup = null;
    const right = run.done.filter((d) => d.ok).length;
    content.onclick = null;
    content.innerHTML = `
      <section class="card pr-sum">
        <p class="small muted">${MODES[run.mode].name}</p>
        <p class="pr-score"><b>${right}</b> / ${run.done.length} 問正解</p>
        <div class="list">${run.done.map((d) => `
          <a class="item pr-row" href="#/build/notation?id=${encodeURIComponent(d.c.id)}">
            <span class="pr-mark ${d.ok ? 'ok' : 'ng'}">${d.ok ? '○' : '×'}</span>
            <div class="tx"><div class="nm">${esc(d.c.name_ja)}</div><div class="fm">${N.toSubHtml(esc(d.c.formula))}</div></div>
            ${icon('chev')}
          </a>`).join('')}</div>
      </section>
      <div class="stack" style="margin-top:12px">
        <button class="btn primary block" data-act="again">${icon('reset')}もう一度</button>
        <button class="btn block" data-act="setup">答え方・分子を変える</button>
      </div>`;
    content.querySelector('[data-act="again"]').onclick = () => start();
    content.querySelector('[data-act="setup"]').onclick = () => setup();
  }

  setup();
  return () => cleanup?.();
}
