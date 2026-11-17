// 計算練習：濃度 #/lab/concentration (docs/plan.md 提案10): mass percent.
//   1 見当をつける  a picture and 4 choices (it is fine to stop here)
//   2 穴うめ        fill the blanks of the formula
//   3 自分で計算    new numbers; a wrong answer shows the steps one by one
// Numbers are typed on the on-screen pad only (no phone keyboard). An answer
// is right when it agrees to 2 significant figures. Problems: data/labs.json.
import { esc } from '../core/dom.js';
import { goBack } from '../core/router.js';
import { labs } from '../core/data.js';

const pctOf = (p) => (p.solute_g / (p.solute_g + p.water_g)) * 100;
const show = (v) => String(Math.round(v * 100) / 100);
export const agrees = (x, ans) => Math.abs(x - ans) < 1e-9 || Number(x.toPrecision(2)) === Number(ans.toPrecision(2));

function beaker(p) {
  const dots = Array.from({ length: 9 }, (_, k) => `<circle cx="${92 + (k * 37) % 120}" cy="${82 + (k * 23) % 56}" r="3.4" fill="#9AA3AE"/>`).join('');
  return `<svg class="cp-beaker" viewBox="0 0 300 170" role="img" aria-label="水 ${p.water_g} g と${esc(p.solute)} ${p.solute_g} g">
    <path d="M70 20 v120 a14 14 0 0 0 14 14 h132 a14 14 0 0 0 14 -14 v-120" fill="none" stroke="var(--muted)" stroke-width="3"/>
    <rect x="73" y="62" width="154" height="89" rx="10" fill="#D9ECF7"/>${dots}
    <text x="150" y="112" text-anchor="middle" font-size="15" font-weight="700" fill="#1F4D36">${esc(p.solute)}水</text>
    <g font-size="13" fill="var(--text)"><text x="236" y="98">水 ${p.water_g} g</text><text x="236" y="118">${esc(p.solute)} ${p.solute_g} g</text></g></svg>`;
}

const PAD = `<div class="cp-pad" role="group" aria-label="数字の入力">${['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', '⌫'].map((k) => `<button data-key="${k}" aria-label="${k === '⌫' ? '1文字消す' : k}">${k}</button>`).join('')}<button class="go" data-key="ok">決定</button></div>`;

export async function render({ content }) {
  const { concentration: data } = await labs();
  const [first, ...rest] = data.problems;
  let step = 1;
  let picked = null; // step 1
  let blank = 0; // step 2: which blank is being typed
  let fills = ['', ''];
  let p3 = null; // step 3 problem
  let typed = '';
  let tries = 0;
  let hints = 0;
  let msg = '';
  let solved = false;

  const head = () => `<div class="cp-steps" aria-label="ステップ ${step} / 3">${[1, 2, 3].map((k) => `<span class="${k === step ? 'on' : k < step ? 'done' : ''}">${k < step ? '✓' : k}</span>`).join('<i></i>')}</div>
    <div class="cp-k">${['', 'ステップ1 ・ 見当をつける', 'ステップ2 ・ 穴うめ', 'ステップ3 ・ 自分で計算'][step]}</div>`;

  function choices(ans) {
    const c = [...new Set([ans / 10, ans, ans * 10, 100 - ans].map((v) => Math.round(v * 100) / 100))].filter((v) => v > 0 && v < 100);
    return c.sort((a, b) => a - b);
  }

  function draw() {
    let html = head();
    if (step === 1) {
      const ans = pctOf(first);
      const total = first.water_g + first.solute_g;
      html += `<div class="cp-card"><p class="cp-q">水 ${first.water_g} g に ${esc(first.solute)} ${first.solute_g} g をとかした。<br>${esc(first.solute)}水の質量パーセント濃度は、だいたいどれくらい？</p>
        ${beaker(first)}
        <div class="ls-q-o">${choices(ans).map((c, k) => `<button data-pick="${c}" class="${picked === null ? '' : c === Math.round(ans * 100) / 100 ? 'ok' : c === picked ? 'ng' : ''}"${picked === null ? '' : ' disabled'}><i>${'ABCD'[k]}</i>${show(c)} %</button>`).join('')}</div>
        ${picked === null ? '' : `<div class="ls-q-ex${picked === Math.round(ans * 100) / 100 ? '' : ' ng'}">${picked === Math.round(ans * 100) / 100 ? 'せいかい。' : 'ちがいます。'}${esc(first.solute)}水 ${total} g のうち ${first.solute_g} g が${esc(first.solute)}なので、だいたい ${show(ans)} %。</div>
        <div class="two" style="margin-top:12px"><button class="btn" data-act="end">ここで終える</button><button class="btn primary" data-act="to2">ステップ2へ</button></div>`}</div>`;
    } else if (step === 2) {
      const done = blank > 1;
      const box = (k) => `<u class="${k === blank ? 'cur' : ''}${fills[k] && k < blank ? ' ok' : ''}">${esc(fills[k]) || '□'}</u>`;
      html += `<div class="cp-card"><p class="cp-q">水 ${first.water_g} g に ${esc(first.solute)} ${first.solute_g} g。式の □ をうめよう。</p>
        <div class="cp-eq">濃度（%）＝ <span class="fr"><span>溶質</span><span>溶液</span></span> × 100</div>
        <div class="cp-eq big">＝ <span class="fr"><span>${first.solute_g}</span><span>${first.water_g} ＋ ${box(0)}</span></span> × 100 ＝ ${box(1)} %</div>
        <p class="small ${msg ? 'cp-msg' : 'muted'}" aria-live="polite">${msg || '溶液は「水 ＋ とけているもの」の全部。'}</p>
        ${done ? '<div class="two" style="margin-top:12px"><button class="btn" data-act="end">ここで終える</button><button class="btn primary" data-act="to3">ステップ3へ</button></div>' : ''}</div>
        ${done ? '' : PAD}`;
    } else {
      const ans = pctOf(p3);
      const total = p3.water_g + p3.solute_g;
      const steps = [`溶液の質量 ＝ ${p3.water_g} ＋ ${p3.solute_g} ＝ <b>${total} g</b>`, `${p3.solute_g} ÷ ${total} ＝ <b>${show(p3.solute_g / total)}</b>`, `${show(p3.solute_g / total)} × 100 ＝ <b>${show(ans)} %</b>`];
      html += `<div class="cp-card"><p class="cp-q">水 ${p3.water_g} g に ${esc(p3.solute)} ${p3.solute_g} g をとかした。<br>質量パーセント濃度は何 %？</p>
        <div class="cp-ans${solved ? ' ok' : msg === 'ng' ? ' ng' : ''}" aria-live="polite">${esc(typed) || '<span class="muted">?</span>'} <small>%</small></div>
        ${solved ? `<div class="ls-q-ex">せいかい！ ${steps.map((s) => s.replace(/<\/?b>/g, '')).join('、')}</div>
          <div class="two" style="margin-top:12px"><button class="btn" data-act="end">終える</button><button class="btn primary" data-act="again">もう1問</button></div>`
        : tries ? `<div class="cp-hint"><b>ちがいます。手順を1つずつ見よう</b><ol>${steps.map((s, k) => `<li class="${k < hints ? 'on' : ''}">${k < hints ? s : '…'}</li>`).join('')}</ol>${hints < steps.length ? '<button class="btn block" data-act="hint">つぎの手順を見る</button>' : ''}</div>` : ''}
        </div>${solved ? '' : PAD}`;
    }
    content.innerHTML = html;
  }

  function key(k) {
    if (step === 2 && blank <= 1) {
      if (k === 'ok') return check2();
      fills[blank] = edit(fills[blank], k);
    } else if (step === 3 && !solved) {
      if (k === 'ok') return check3();
      typed = edit(typed, k);
      msg = '';
    } else return;
    draw();
  }
  const edit = (s, k) => (k === '⌫' ? s.slice(0, -1) : k === '.' && s.includes('.') ? s : s.length >= 6 ? s : s + k);

  function check2() {
    const v = parseFloat(fills[blank]);
    if (Number.isNaN(v)) return;
    if (blank === 0) {
      if (v === first.solute_g) { blank = 1; msg = ''; } else msg = `溶液は「水 ${first.water_g} g ＋ ${first.solute} ${first.solute_g} g」です。`;
    } else if (agrees(v, pctOf(first))) { blank = 2; msg = 'せいかい！'; } else msg = `${first.solute_g} ÷ ${first.water_g + first.solute_g} を計算して、100 をかけよう。`;
    draw();
  }

  function check3() {
    const v = parseFloat(typed);
    if (Number.isNaN(v)) return;
    if (agrees(v, pctOf(p3))) { solved = true; msg = ''; } else { tries++; hints = Math.max(hints, 1); msg = 'ng'; }
    draw();
  }

  function next3() {
    const pool = rest.filter((p) => p !== p3);
    p3 = pool[Math.floor(Math.random() * pool.length)] || first;
    typed = ''; tries = 0; hints = 0; msg = ''; solved = false;
  }

  content.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick],[data-act],[data-key]');
    if (!b) return;
    if (b.dataset.pick !== undefined && picked === null) picked = +b.dataset.pick;
    else if (b.dataset.key) return key(b.dataset.key);
    else if (b.dataset.act === 'to2') { step = 2; msg = ''; }
    else if (b.dataset.act === 'to3') { step = 3; next3(); }
    else if (b.dataset.act === 'again') next3();
    else if (b.dataset.act === 'hint') hints++;
    else if (b.dataset.act === 'end') return goBack('#/');
    draw();
  });
  // PC: the number keys work too
  const onKey = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key === 'Backspace' ? '⌫' : e.key === 'Enter' ? 'ok' : /^[0-9.]$/.test(e.key) ? e.key : null;
    if (k) { e.preventDefault(); key(k); }
  };
  document.addEventListener('keydown', onKey);
  draw();
  return () => document.removeEventListener('keydown', onKey);
}
