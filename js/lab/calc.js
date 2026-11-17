// 計算練習 #/lab/calc?k=<kind> (docs/plan.md 提案10). One engine, many kinds:
//   1 見当をつける  4 choices (and a picture for some kinds); it is fine to stop here
//   2 穴うめ        the formula with blanks, typed on the on-screen pad
//   3 自分で計算    new numbers; a wrong answer shows the steps one by one
// An answer is right when it agrees to 2 significant figures. Each kind
// below says how to word a problem, its answer, the formula with blanks
// and the steps; the numbers are in data/labs.json "calc".
import { esc } from '../core/dom.js';
import { goBack, setQuery } from '../core/router.js';
import { labs } from '../core/data.js';

export const agrees = (x, ans) => Math.abs(x - ans) < 1e-9 || Number(Number(x).toPrecision(2)) === Number(Number(ans).toPrecision(2));
// 0.1 -> "0.1", 0.0500 -> "0.05", 1234.5 -> "1234.5" (at most 3 significant figures)
export const num = (v) => String(Number(Number(v).toPrecision(3)));
const SUBS = '₀₁₂₃₄₅₆₇₈₉';
// (no look-behind in the pattern: older iPhone Safari cannot parse it)
const sub = (s) => String(s).replace(/([A-Za-z)])(\d+)/g, (m, a, d) => a + [...d].map((c) => SUBS[c]).join(''));
const B = (v) => ({ b: v }); // a blank to fill
const F = (top, bottom) => ({ frac: [top, bottom] });

function around(ans, extra) {
  // 4 choices: the answer, ten times smaller / bigger, and one more
  const c = [ans / 10, ans, ans * 10, extra].map((v) => Number(Number(v).toPrecision(2)));
  return [...new Set(c)].filter((v) => v > 0).sort((a, b) => a - b);
}

function beaker(label, lines) {
  const dots = Array.from({ length: 9 }, (_, k) => `<circle cx="${92 + (k * 37) % 120}" cy="${82 + (k * 23) % 56}" r="3.4" fill="#9AA3AE"/>`).join('');
  return `<svg class="cp-beaker" viewBox="0 0 300 170" role="img" aria-label="${esc(lines.join('、'))}">
    <path d="M70 20 v120 a14 14 0 0 0 14 14 h132 a14 14 0 0 0 14 -14 v-120" fill="none" stroke="var(--muted)" stroke-width="3"/>
    <rect x="73" y="62" width="154" height="89" rx="10" fill="#D9ECF7"/>${dots}
    <text x="150" y="112" text-anchor="middle" font-size="15" font-weight="700" fill="#1F4D36">${esc(label)}</text>
    <g font-size="13" fill="var(--text)">${lines.map((t, k) => `<text x="236" y="${98 + k * 20}">${esc(t)}</text>`).join('')}</g></svg>`;
}

// atomic weights for problems ("H=1.0, O=16"), from data/labs.json
let AW = {};
const mm = (atoms) => Object.entries(atoms).reduce((s, [el, n]) => s + AW[el] * n, 0);
// "1.0" for H as in textbooks (a whole number below 10 gets one decimal)
const aw = (el) => (Number.isInteger(AW[el]) && AW[el] < 10 ? AW[el].toFixed(1) : String(AW[el]));
const awText = (atoms) => Object.keys(atoms).map((el) => `${el}=${aw(el)}`).join(', ');

export const KINDS = {
  'mass-percent': {
    title: '質量パーセント濃度',
    unit: '%',
    q: (p) => `水 ${p.water_g} g に ${p.solute} ${p.solute_g} g をとかした。質量パーセント濃度は何 %？`,
    ans: (p) => (p.solute_g / (p.solute_g + p.water_g)) * 100,
    fig: (p) => beaker(`${p.solute}水`, [`水 ${p.water_g} g`, `${p.solute} ${p.solute_g} g`]),
    choices: (p, a) => around(a, 100 - a),
    because: (p, a) => `${p.solute}水 ${p.solute_g + p.water_g} g のうち ${p.solute_g} g が${p.solute}なので、だいたい ${num(a)} %。`,
    lead: '濃度（%）＝ 溶質 ÷ 溶液 × 100。溶液は「水 ＋ とけているもの」の全部。',
    eq: (p, a) => [F([p.solute_g], [p.water_g, ' ＋ ', B(p.solute_g)]), ' × 100 ＝ ', B(a), ' %'],
    steps: (p, a) => [`溶液の質量 ＝ ${p.water_g} ＋ ${p.solute_g} ＝ ${p.water_g + p.solute_g} g`, `${p.solute_g} ÷ ${p.water_g + p.solute_g} ＝ ${num(p.solute_g / (p.water_g + p.solute_g))}`, `× 100 ＝ ${num(a)} %`],
  },
  'molar-mass': {
    title: '分子量',
    unit: '',
    q: (p) => `${p.name} ${sub(p.formula)} の分子量は？（原子量 ${awText(p.atoms)}）`,
    ans: (p) => mm(p.atoms),
    choices: (p, a) => around(a, a * 2),
    because: (p, a) => `${Object.entries(p.atoms).map(([el, n]) => `${el} が ${n} 個`).join('、')}。たすと ${num(a)}。`,
    lead: '分子量は、分子の中の原子の原子量をぜんぶたしたもの。',
    eq: (p, a) => [...Object.entries(p.atoms).flatMap(([el, n], k) => [k ? ' ＋ ' : '', `${aw(el)} × `, B(n)]), ' ＝ ', B(a)],
    steps: (p, a) => [...Object.entries(p.atoms).map(([el, n]) => `${el}: ${aw(el)} × ${n} ＝ ${num(AW[el] * n)}`), `たして ${num(a)}`],
  },
  mol: {
    title: '質量と物質量（mol）',
    unit: 'mol',
    q: (p) => `${p.name} ${p.g} g は何 mol？（${sub(p.formula)} の分子量 ${num(mm(p.atoms))}）`,
    ans: (p) => p.g / mm(p.atoms),
    choices: (p, a) => around(a, p.g * mm(p.atoms)),
    because: (p, a) => `1 mol が ${num(mm(p.atoms))} g なので、${p.g} g はその ${num(a)} 倍。`,
    lead: '物質量（mol）＝ 質量（g）÷ 1 mol の質量（分子量に g をつけたもの）',
    eq: (p, a) => [B(p.g), ' g ÷ ', B(num(mm(p.atoms))), ' g/mol ＝ ', B(a), ' mol'],
    steps: (p, a) => [`1 mol の質量 ＝ ${num(mm(p.atoms))} g`, `${p.g} ÷ ${num(mm(p.atoms))} ＝ ${num(a)} mol`],
  },
  molarity: {
    title: 'モル濃度',
    unit: 'mol/L',
    q: (p) => `${p.name} ${p.g} g（分子量 ${num(mm(p.atoms))}）を水にとかして ${p.ml} mL にした。モル濃度は何 mol/L？`,
    ans: (p) => (p.g / mm(p.atoms)) / (p.ml / 1000),
    fig: (p) => beaker(`${p.ml} mL`, [p.name, `${p.g} g`]),
    choices: (p, a) => around(a, p.g / mm(p.atoms)),
    because: (p, a) => `${num(p.g / mm(p.atoms))} mol が ${num(p.ml / 1000)} L にとけているので ${num(a)} mol/L。`,
    lead: 'モル濃度 ＝ とけている物質量（mol）÷ 溶液の体積（L）。1000 mL ＝ 1 L。',
    eq: (p, a) => [B(num(p.g / mm(p.atoms))), ' mol ÷ ', B(num(p.ml / 1000)), ' L ＝ ', B(a), ' mol/L'],
    steps: (p, a) => [`物質量 ＝ ${p.g} ÷ ${num(mm(p.atoms))} ＝ ${num(p.g / mm(p.atoms))} mol`, `体積 ＝ ${p.ml} mL ＝ ${num(p.ml / 1000)} L`, `${num(p.g / mm(p.atoms))} ÷ ${num(p.ml / 1000)} ＝ ${num(a)} mol/L`],
  },
  dilution: {
    title: 'うすめる計算',
    unit: p => p.unit,
    q: (p) => `${p.c} ${p.unit} の${p.name} ${p.v1} mL に水を加えて、全体を ${p.v2} mL にした。濃度は何 ${p.unit}？`,
    ans: (p) => (p.c * p.v1) / p.v2,
    choices: (p, a) => around(a, p.c * (p.v2 / p.v1)),
    because: (p, a) => `体積が ${num(p.v2 / p.v1)} 倍になったので、濃度は ${num(p.v2 / p.v1)} 分の1。`,
    lead: 'うすめても、とけている物質の量は変わらない：濃度 × 体積 が同じ。',
    eq: (p, a) => [`${p.c} × ${p.v1} ＝ `, B(a), ' × ', B(p.v2)],
    steps: (p, a) => [`とけている量は ${p.c} × ${p.v1} ＝ ${num(p.c * p.v1)}`, `それが ${p.v2} mL に広がる：${num(p.c * p.v1)} ÷ ${p.v2} ＝ ${num(a)} ${p.unit}`],
  },
  stoich: {
    title: '反応式と量の関係',
    unit: 'mol',
    q: (p) => `${p.eq}。${p.a_name} ${p.mol} mol と反応する（またはできる）${p.b_name}は何 mol？`,
    ans: (p) => (p.mol * p.cb) / p.ca,
    choices: (p, a) => around(a, p.mol),
    because: (p, a) => `係数の比 ${p.ca} : ${p.cb} が物質量の比。${p.mol} mol なら ${num(a)} mol。`,
    lead: '反応式の係数の比 ＝ 物質量（mol）の比。',
    eq: (p, a) => [B(p.ca), ' : ', B(p.cb), ` ＝ ${p.mol} : `, B(a)],
    steps: (p, a) => [`係数は ${p.a_name} ${p.ca}、${p.b_name} ${p.cb}`, `${p.ca} : ${p.cb} ＝ ${p.mol} : x`, `x ＝ ${p.mol} × ${p.cb} ÷ ${p.ca} ＝ ${num(a)} mol`],
  },
  ph: {
    title: 'pH と水素イオンの濃さ',
    unit: '',
    q: (p) => `水素イオンの濃さが 1.0 × 10⁻${String(p.n).replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d])} mol/L の水溶液の pH は？`,
    ans: (p) => p.n,
    choices: (p, a) => [...new Set([a - 1, a, a + 1, 14 - a].filter((v) => v >= 0 && v <= 14))].sort((x, y) => x - y),
    because: (p, a) => `10 の −${a} 乗なので pH ${a}。`,
    lead: '[H⁺] ＝ 1.0 × 10⁻ⁿ mol/L のとき、pH ＝ n。',
    eq: (p, a) => ['[H⁺] ＝ 1.0 × 10 の −', B(p.n), ' 乗 → pH ＝ ', B(a)],
    steps: (p, a) => [`10 の何乗かを見る：−${p.n} 乗`, `pH ＝ ${a}`],
  },
  neutral: {
    title: '中和の量的関係',
    unit: 'mL',
    q: (p) => `${p.c_a} mol/L の${p.acid} ${p.v_a} mL をちょうど中和するのに、${p.c_b} mol/L の${p.base}は何 mL いる？`,
    ans: (p) => (p.n_a * p.c_a * p.v_a) / (p.n_b * p.c_b),
    choices: (p, a) => around(a, p.v_a),
    because: (p, a) => `酸の H⁺ の量と塩基の OH⁻ の量が同じになるところ：${num(a)} mL。`,
    lead: '（酸の価数）×（濃度）×（体積）＝（塩基の価数）×（濃度）×（体積）',
    eq: (p, a) => [B(p.n_a), ` × ${p.c_a} × ${p.v_a} ＝ `, B(p.n_b), ` × ${p.c_b} × `, B(a)],
    steps: (p, a) => [`${p.acid}は ${p.n_a} 価、${p.base}は ${p.n_b} 価`, `H⁺ の量：${p.n_a} × ${p.c_a} × ${p.v_a} ＝ ${num(p.n_a * p.c_a * p.v_a)}`, `${num(p.n_a * p.c_a * p.v_a)} ÷ (${p.n_b} × ${p.c_b}) ＝ ${num(a)} mL`],
  },
};

const unitOf = (k, p) => (typeof k.unit === 'function' ? k.unit(p) : k.unit);
const PAD = `<div class="cp-pad" role="group" aria-label="数字の入力">${['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', '⌫'].map((k) => `<button data-key="${k}" aria-label="${k === '⌫' ? '1文字消す' : k}">${k}</button>`).join('')}<button class="go" data-key="ok">決定</button></div>`;

export function setWeights(w) { AW = w; }

// できた印 of the calculation practice (たしかめる), on this device only
function markDone(id) {
  try {
    const d = JSON.parse(localStorage.getItem('chemtouch:calc:done') || '{}');
    d[id] = true;
    localStorage.setItem('chemtouch:calc:done', JSON.stringify(d));
  } catch (e) { /* no storage */ }
}

export async function render({ content, query, el }) {
  const data = (await labs()).calc;
  setWeights(data.atomic_weights);
  const id = KINDS[query.get('k')] ? query.get('k') : 'mass-percent';
  const kind = KINDS[id];
  const problems = data.kinds[id].problems;
  el.querySelector('.subbar h1').textContent = `計算練習：${kind.title}`;
  const [first, ...rest] = problems;
  const a1 = kind.ans(first);
  let step = 1;
  let picked = null;
  let blanks = [];
  let bi = 0;
  let fills = [];
  let msg = '';
  let p3 = null;
  let typed = '';
  let hints = 0;
  let solved = false;
  let wrong = false;

  const head = () => `<div class="cp-steps" aria-label="ステップ ${step} / 3">${[1, 2, 3].map((k) => `<span class="${k === step ? 'on' : k < step ? 'done' : ''}">${k < step ? '✓' : k}</span>`).join('<i></i>')}</div>
    <div class="cp-k">${['', 'ステップ1 ・ 見当をつける', 'ステップ2 ・ 穴うめ', 'ステップ3 ・ 自分で計算'][step]}</div>`;

  // the formula of step 2 as HTML; blanks are numbered in reading order
  function eqHtml(tokens) {
    let n = 0;
    const one = (t) => {
      if (t && typeof t === 'object' && 'b' in t) {
        const k = n++;
        return `<u class="${k === bi ? 'cur' : ''}${k < bi ? ' ok' : ''}">${esc(fills[k] || '') || '□'}</u>`;
      }
      if (t && typeof t === 'object' && t.frac) return `<span class="fr"><span>${t.frac[0].map(one).join('')}</span><span>${t.frac[1].map(one).join('')}</span></span>`;
      return esc(String(t));
    };
    return tokens.map(one).join('');
  }
  function collect(tokens) {
    const out = [];
    const walk = (t) => {
      if (t && typeof t === 'object' && 'b' in t) out.push(Number(t.b));
      else if (t && typeof t === 'object' && t.frac) { t.frac[0].forEach(walk); t.frac[1].forEach(walk); }
    };
    tokens.forEach(walk);
    return out;
  }

  function draw() {
    let html = head();
    if (step === 1) {
      const ch = kind.choices(first, a1);
      const right = ch.findIndex((c) => agrees(c, a1));
      html += `<div class="cp-card"><p class="cp-q">${esc(kind.q(first))}<br><span class="small muted">だいたいどれくらい？</span></p>
        ${kind.fig ? kind.fig(first) : ''}
        <div class="ls-q-o">${ch.map((c, k) => `<button data-pick="${k}" class="${picked === null ? '' : k === right ? 'ok' : k === picked ? 'ng' : ''}"${picked === null ? '' : ' disabled'}><i>${'ABCD'[k]}</i>${num(c)} ${esc(unitOf(kind, first))}</button>`).join('')}</div>
        ${picked === null ? '' : `<div class="ls-q-ex${picked === right ? '' : ' ng'}">${picked === right ? 'せいかい。' : 'ちがいます。'}${esc(kind.because(first, a1))}</div>
        <div class="two" style="margin-top:12px"><button class="btn" data-act="end">ここで終える</button><button class="btn primary" data-act="to2">ステップ2へ</button></div>`}</div>`;
    } else if (step === 2) {
      const tokens = kind.eq(first, a1);
      const done = bi >= blanks.length;
      html += `<div class="cp-card"><p class="cp-q">${esc(kind.q(first))}</p>
        <p class="small muted">${esc(kind.lead)}</p>
        <div class="cp-eq big">${eqHtml(tokens)}</div>
        <p class="small ${msg ? 'cp-msg' : 'muted'}" aria-live="polite">${msg || '□ に数字を入れて「決定」。'}</p>
        ${done ? '<div class="two" style="margin-top:12px"><button class="btn" data-act="end">ここで終える</button><button class="btn primary" data-act="to3">ステップ3へ</button></div>' : ''}</div>
        ${done ? '' : PAD}`;
    } else {
      const a = kind.ans(p3);
      const steps = kind.steps(p3, a);
      html += `<div class="cp-card"><p class="cp-q">${esc(kind.q(p3))}</p>
        <div class="cp-ans${solved ? ' ok' : wrong ? ' ng' : ''}" aria-live="polite">${esc(typed) || '<span class="muted">?</span>'} <small>${esc(unitOf(kind, p3))}</small></div>
        ${solved ? `<div class="ls-q-ex">せいかい！ ${esc(steps.join('、'))}</div>
          <div class="two" style="margin-top:12px"><button class="btn" data-act="end">終える</button><button class="btn primary" data-act="again">もう1問</button></div>`
        : hints ? `<div class="cp-hint"><b>ちがいます。手順を1つずつ見よう</b><ol>${steps.map((s, k) => `<li class="${k < hints ? 'on' : ''}">${k < hints ? esc(s) : '…'}</li>`).join('')}</ol>${hints < steps.length ? '<button class="btn block" data-act="hint">つぎの手順を見る</button>' : ''}</div>` : ''}
        </div>${solved ? '' : PAD}`;
    }
    content.innerHTML = html;
  }

  const edit = (s, k) => (k === '⌫' ? s.slice(0, -1) : k === '.' && s.includes('.') ? s : s.length >= 7 ? s : s + k);
  function key(k) {
    if (step === 2 && bi < blanks.length) {
      if (k === 'ok') {
        const v = parseFloat(fills[bi]);
        if (Number.isNaN(v)) return;
        if (agrees(v, blanks[bi])) { bi++; msg = bi >= blanks.length ? 'せいかい！' : ''; } else msg = `ちがいます。${kind.lead}`;
      } else fills[bi] = edit(fills[bi] || '', k);
    } else if (step === 3 && !solved) {
      if (k === 'ok') {
        const v = parseFloat(typed);
        if (Number.isNaN(v)) return;
        if (agrees(v, kind.ans(p3))) { solved = true; markDone(id); } else { wrong = true; hints = Math.max(hints, 1); }
      } else { typed = edit(typed, k); wrong = false; }
    } else return;
    draw();
  }
  function next3() {
    const pool = rest.filter((p) => p !== p3);
    p3 = pool[Math.floor(Math.random() * pool.length)] || first;
    typed = ''; hints = 0; solved = false; wrong = false;
  }

  content.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick],[data-act],[data-key]');
    if (!b) return;
    if (b.dataset.pick !== undefined && picked === null) picked = +b.dataset.pick;
    else if (b.dataset.key) return key(b.dataset.key);
    else if (b.dataset.act === 'to2') { step = 2; blanks = collect(kind.eq(first, a1)); bi = 0; fills = []; msg = ''; }
    else if (b.dataset.act === 'to3') { step = 3; next3(); }
    else if (b.dataset.act === 'again') next3();
    else if (b.dataset.act === 'hint') hints++;
    else if (b.dataset.act === 'end') return goBack('#/');
    draw();
  });
  const onKey = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key === 'Backspace' ? '⌫' : e.key === 'Enter' ? 'ok' : /^[0-9.]$/.test(e.key) ? e.key : null;
    if (k) { e.preventDefault(); key(k); }
  };
  document.addEventListener('keydown', onKey);
  if (query.get('k') !== id) setQuery({ k: id });
  draw();
  return () => document.removeEventListener('keydown', onKey);
}
