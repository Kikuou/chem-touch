// Stage-3 screen mockups (docs/plan.md 提案9・10): the three trial materials
// (三態・組成式パズル・pH ものさし) and the calculation practice (濃度).
// The real app shell and CSS, new screens put into #app.
//   python3 -m http.server 8000 &  ;  node mockups/stage3/make.mjs
import { chromium } from 'playwright';

const OUT = new URL('./img/', import.meta.url).pathname;
const BASE = 'http://localhost:8000/';

// deterministic pseudo-random numbers (same picture every time)
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

// a water molecule: O (red) + 2 H (white), rotated
function h2o(x, y, a, s = 1) {
  const r = (d) => [x + Math.cos(a + d) * 8.5 * s, y + Math.sin(a + d) * 8.5 * s];
  const [h1, h2] = [r(0.92), r(-0.92)];
  return `<g><circle cx="${h1[0].toFixed(1)}" cy="${h1[1].toFixed(1)}" r="${4.2 * s}" fill="#F2F3F5" stroke="#9AA3AE" stroke-width=".8"/><circle cx="${h2[0].toFixed(1)}" cy="${h2[1].toFixed(1)}" r="${4.2 * s}" fill="#F2F3F5" stroke="#9AA3AE" stroke-width=".8"/><circle cx="${x}" cy="${y}" r="${7.5 * s}" fill="#E5484D"/></g>`;
}
function stateSvg(state) {
  seed = 11;
  const W = 320, H = 230;
  let mols = '';
  let trails = '';
  if (state === 'solid') {
    for (let row = 0; row < 6; row++) for (let col = 0; col < 9; col++) {
      const x = 32 + col * 32 + (row % 2) * 16, y = 52 + row * 30;
      if (x > W - 20) continue;
      mols += h2o(x, y, (row + col) % 2 ? 0.4 : 3.6);
    }
  } else if (state === 'liquid') {
    for (let k = 0; k < 44; k++) {
      const x = 22 + rnd() * (W - 44), y = 110 + rnd() * 100;
      mols += h2o(+x.toFixed(1), +y.toFixed(1), rnd() * 6.3);
      if (k % 4 === 0) trails += `<path d="M${(x - 14).toFixed(1)} ${(y + 6).toFixed(1)} q 6 -8 12 -3" fill="none" stroke="#9AA3AE" stroke-width="1.4" stroke-linecap="round"/>`;
    }
  } else {
    for (let k = 0; k < 12; k++) {
      const x = 30 + rnd() * (W - 60), y = 30 + rnd() * (H - 60), a = rnd() * 6.3;
      trails += `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x - Math.cos(a) * 34).toFixed(1)}" y2="${(y - Math.sin(a) * 34).toFixed(1)}" stroke="#C9D2CC" stroke-width="3" stroke-linecap="round"/>`;
      mols += h2o(+x.toFixed(1), +y.toFixed(1), a);
    }
  }
  const fill = state === 'liquid' ? `<rect x="6" y="100" width="${W - 12}" height="${H - 106}" rx="10" fill="#D9ECF7"/>` : '';
  return `<svg viewBox="0 0 ${W} ${H}" width="100%"><rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="14" fill="var(--surface)" stroke="var(--line)" stroke-width="2"/>${fill}${trails}${mols}</svg>`;
}

const STATE = {
  solid: { t: -10, label: '固体（氷）', move: 'その場で ふるえている', color: '#3B82F6' },
  liquid: { t: 25, label: '液体（水）', move: 'くっついたまま 動きまわる', color: '#2F6F4F' },
  gas: { t: 110, label: '気体（水蒸気）', move: 'ばらばらに 飛びまわる', color: '#C2410C' },
};
function threeStatesHtml(state) {
  const s = STATE[state];
  const pos = ((s.t + 20) / 140) * 100;
  return `<div class="page"><div class="subbar"><button class="iconbtn">\${I('back')}</button><h1>温度と三態</h1></div>
    <div class="lb-read"><span class="lb-big">${s.t < 0 ? '−' : ''}${Math.abs(s.t)} ℃</span><span class="lb-chip" style="background:${s.color}">${s.label}</span></div>
    <div class="lb-stage">${stateSvg(state)}</div>
    <p class="lb-say">水の分子が <b>${s.move}</b>。</p>
    <div class="lb-slider">
      <div class="lb-track" style="background:linear-gradient(90deg,#3B82F6,#9AD1F5 14%,#BFE3C9 50%,#F7C59F 86%,#C2410C)"></div>
      <span class="lb-tick" style="left:${(20 / 140) * 100}%"><i></i>0 ℃<br><small>とける</small></span>
      <span class="lb-tick" style="left:${(120 / 140) * 100}%"><i></i>100 ℃<br><small>ふっとう</small></span>
      <span class="lb-thumb" style="left:${pos}%"></span>
    </div>
    <p class="lb-foot">スライダーで温度を変えてみよう（1気圧の水）</p>
  </div>`;
}

// ---------------------------------------------------------------- composition puzzle
const ION = {
  'Na+': ['Na', 1, 'ナトリウム'], 'K+': ['K', 1, 'カリウム'], 'Mg2+': ['Mg', 2, 'マグネシウム'], 'Ca2+': ['Ca', 2, 'カルシウム'],
  'Cl-': ['Cl', -1, '塩化'], 'O2-': ['O', -2, '酸化'], 'OH-': ['OH', -1, '水酸化'], 'CO32-': ['CO₃', -2, '炭酸'],
};
const sup = (n) => (Math.abs(n) === 1 ? '' : Math.abs(n)) + (n > 0 ? '+' : '−');
function ionTile(id, small = false) {
  const [sym, ch] = ION[id];
  const marks = Array.from({ length: Math.abs(ch) }, () => `<i>${ch > 0 ? '+' : '−'}</i>`).join('');
  return `<span class="fp-ion ${ch > 0 ? 'pos' : 'neg'}${small ? ' sm' : ''}"><b>${sym}<sup>${sup(ch)}</sup></b><span class="fp-marks">${marks}</span></span>`;
}
function puzzleHtml(stateIdx) {
  const trays = [[], ['Mg2+', 'Cl-'], ['Mg2+', 'Cl-', 'Cl-']][stateIdx];
  const total = trays.reduce((a, id) => a + ION[id][1], 0);
  const done = stateIdx === 2;
  const meter = trays.length ? trays.map((id) => { const c = ION[id][1]; return `<span class="${c > 0 ? 'p' : 'n'}">${c > 0 ? '+' : '−'}${Math.abs(c)}</span>`; }).join('<em>＋</em>') + `<em>＝</em><span class="t ${total === 0 ? 'ok' : ''}">${total > 0 ? '+' : total < 0 ? '−' : ''}${Math.abs(total)}</span>` : '<span class="muted">イオンを入れると、ここで電気の合計がわかる</span>';
  return `<div class="page"><div class="subbar"><button class="iconbtn">\${I('back')}</button><h1>組成式パズル</h1></div>
    <div class="fp-goal"><span>おだい</span><b>にがりの成分「塩化マグネシウム」をつくろう</b></div>
    <div class="fp-tray${done ? ' ok' : ''}">${trays.length ? trays.map((id) => ionTile(id)).join('') : '<span class="muted small">下のイオンをタップして入れる</span>'}</div>
    <div class="fp-meter">${meter}</div>
    ${done ? `<div class="fp-done"><div class="fp-f">MgCl<sub>2</sub></div><div>塩化マグネシウム　<b>＋と−が つりあった！</b></div></div>` : `<p class="lb-say">${stateIdx === 1 ? 'まだ <b>＋1</b>。−のイオンが たりない。' : '＋と−の合計が 0 になれば できあがり。'}</p>`}
    <div class="fp-pal"><div><span class="small muted">＋のイオン</span>${['Na+', 'K+', 'Mg2+', 'Ca2+'].map((x) => ionTile(x, true)).join('')}</div>
    <div><span class="small muted">−のイオン</span>${['Cl-', 'O2-', 'OH-', 'CO32-'].map((x) => ionTile(x, true)).join('')}</div></div>
  </div>`;
}

// ---------------------------------------------------------------- pH ruler
const PH_STOPS = ['#D7263D', '#F46036', '#F7A325', '#F3D34A', '#B5D33D', '#5FB760', '#2E9E6B', '#2A9D8F', '#2C7DA0', '#3D5A99', '#5B4B9A', '#6A3D8F', '#7A2E80', '#7F2370', '#80195E'];
function phHtml(ph) {
  const pos = (ph / 14) * 100;
  const steps = 7 - ph;
  const times = steps > 0 ? `中性の <b>${(10 ** steps).toLocaleString('ja-JP')} 倍</b>` : steps < 0 ? `中性の <b>${(10 ** -steps).toLocaleString('ja-JP')} 分の1</b>` : '中性（酸性でも塩基性でもない）';
  const ladder = steps > 0 ? Array.from({ length: steps }, () => '<i>×10</i>').join('') : '';
  const marks = [['胃液', 1.5], ['レモン', 2.4], ['血液', 7.4], ['せっけん水', 10]];
  return `<div class="page"><div class="subbar"><button class="iconbtn">\${I('back')}</button><h1>pH ものさし</h1></div>
    <div class="lb-read"><span class="lb-big">pH ${ph}</span><span class="lb-chip" style="background:${PH_STOPS[Math.round(ph)]}">${ph < 7 ? '酸性' : ph > 7 ? '塩基性' : '中性'}</span></div>
    <div class="ph-box"><div class="ph-k">水素イオン H⁺ の濃さ</div><div class="ph-times">${times}</div><div class="ph-ladder">${ladder}</div></div>
    <p class="lb-say">pH が 1 小さくなると、H⁺ は <b>10倍</b> こくなる。</p>
    <div class="ph-scale">
      <div class="ph-bar" style="background:linear-gradient(90deg,${PH_STOPS.join(',')})"></div>
      <div class="ph-nums">${Array.from({ length: 15 }, (_, k) => `<span>${k}</span>`).join('')}</div>
      <span class="lb-thumb" style="left:${pos}%;top:-4px"></span>
      <div class="ph-marks">${marks.map(([n, v]) => `<span style="left:${(v / 14) * 100}%"><i></i>${n}</span>`).join('')}</div>
    </div>
    <p class="lb-foot">身近なものの位置は<b>仮</b>です（出典を確かめて先生に確認してから入れる）</p>
  </div>`;
}

// ---------------------------------------------------------------- calculation practice
function beaker(water, solute, label) {
  return `<svg viewBox="0 0 300 170" width="78%" style="display:block;margin:0 auto"><path d="M70 20 v120 a14 14 0 0 0 14 14 h132 a14 14 0 0 0 14 -14 v-120" fill="none" stroke="var(--muted)" stroke-width="3"/>
    <rect x="73" y="62" width="154" height="89" rx="10" fill="#D9ECF7"/>
    ${Array.from({ length: 9 }, (_, k) => `<circle cx="${92 + (k * 37) % 120}" cy="${82 + (k * 23) % 56}" r="3.4" fill="#9AA3AE"/>`).join('')}
    <text x="150" y="112" text-anchor="middle" font-size="15" font-weight="700" fill="var(--accent-ink)">${label}</text>
    <g font-size="13" fill="var(--text)"><text x="240" y="98">水 ${water} g</text><text x="240" y="118">食塩 ${solute} g</text></g></svg>`;
}
const KEYPAD = `<div class="cp-pad">${['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', '⌫'].map((k) => `<button>${k}</button>`).join('')}<button class="go">決定</button></div>`;
function calcHtml(step) {
  const head = (n, t) => `<div class="cp-steps">${[1, 2, 3].map((k) => `<span class="${k === n ? 'on' : k < n ? 'done' : ''}">${k < n ? '✓' : k}</span>`).join('<i></i>')}</div><div class="cp-k">${t}</div>`;
  if (step === 1) {
    return `<div class="page"><div class="subbar"><button class="iconbtn">\${I('close')}</button><h1>計算練習：濃度</h1></div>
      ${head(1, 'ステップ1 ・ 見当をつける')}
      <div class="cp-card"><p class="cp-q">水 95 g に 食塩 5 g をとかした。<br>食塩水の質量パーセント濃度は、だいたいどれくらい？</p>
      ${beaker(95, 5, '食塩水 100 g')}
      <div class="ls-q-o">${['0.5 %', '5 %', '50 %', '95 %'].map((c, k) => `<button class="${k === 1 ? 'ok' : ''}"><i>${'ABCD'[k]}</i>${c}</button>`).join('')}</div>
      <div class="ls-q-ex">せいかい。100 g のうち 5 g が食塩なので、だいたい 5 %。</div>
      <div class="two" style="margin-top:12px"><a class="btn">ここで終える</a><a class="btn primary">ステップ2へ</a></div></div></div>`;
  }
  if (step === 2) {
    return `<div class="page"><div class="subbar"><button class="iconbtn">\${I('close')}</button><h1>計算練習：濃度</h1></div>
      ${head(2, 'ステップ2 ・ 穴うめ')}
      <div class="cp-card"><p class="cp-q">水 95 g に 食塩 5 g。式の □ をうめよう。</p>
      <div class="cp-eq">濃度（%）＝ <span class="fr"><span>溶質</span><span>溶液</span></span> × 100</div>
      <div class="cp-eq big">＝ <span class="fr"><span>5</span><span>95 ＋ <u class="cur">5</u></span></span> × 100 ＝ <u>□</u> %</div>
      <p class="small muted" style="margin-top:6px">溶液は「水 ＋ 溶けているもの」の全部。</p></div>
      ${KEYPAD}</div>`;
  }
  return `<div class="page"><div class="subbar"><button class="iconbtn">\${I('close')}</button><h1>計算練習：濃度</h1></div>
    ${head(3, 'ステップ3 ・ 自分で計算')}
    <div class="cp-card"><p class="cp-q">水 180 g に 砂糖 20 g をとかした。<br>質量パーセント濃度は何 %？</p>
    <div class="cp-ans ng">20 <small>%</small></div>
    <div class="cp-hint"><b>ちがいます。手順を1つずつ見よう</b>
      <ol><li class="on">溶液の質量 ＝ 180 ＋ 20 ＝ <b>200 g</b></li><li>…</li><li>…</li></ol>
      <button class="btn block">つぎの手順を見る</button></div></div>
    ${KEYPAD}</div>`;
}

const CSS = `
.nav{position:fixed}
.lb-read{display:flex;align-items:center;gap:12px;margin:2px 4px 10px}
.lb-big{font-size:34px;font-weight:800;letter-spacing:-.01em}
.lb-chip{color:#fff;font-weight:700;font-size:14px;padding:6px 12px;border-radius:99px}
.lb-stage svg{display:block}
.lb-say{font-size:16px;line-height:1.6;margin:12px 4px 4px}
.lb-slider{position:relative;margin:26px 10px 44px;height:22px}
.lb-track{position:absolute;inset:4px 0;border-radius:99px}
.lb-thumb{position:absolute;top:-6px;width:34px;height:34px;margin-left:-17px;border-radius:50%;background:#fff;border:3px solid var(--text);box-shadow:var(--shadow)}
.lb-tick{position:absolute;top:28px;transform:translateX(-50%);font-size:12.5px;font-weight:700;text-align:center;line-height:1.3}
.lb-tick small{font-weight:500;color:var(--muted)}
.lb-tick i{position:absolute;top:-30px;left:50%;width:2px;height:26px;background:var(--text);opacity:.5}
.lb-foot{font-size:12.5px;color:var(--muted);margin:0 4px;line-height:1.6}
.fp-goal{background:var(--warn-bg);border-radius:14px;padding:10px 14px;display:flex;flex-direction:column;gap:2px}
.fp-goal span{font-size:11.5px;color:var(--warn-ink);font-weight:700}.fp-goal b{font-size:15px}
.fp-tray{margin-top:12px;min-height:118px;border:2px dashed var(--line);border-radius:18px;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:10px;padding:12px;background:var(--surface)}
.fp-tray.ok{border:2px solid var(--accent);background:var(--accent-weak)}
.fp-ion{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-width:78px;height:84px;border-radius:16px;font-size:24px;padding:0 10px}
.fp-ion.pos{background:#DCEBFA;color:#0B4F8A}.fp-ion.neg{background:#FBE3D6;color:#8A3207}
.fp-ion sup{font-size:.55em}
.fp-marks{display:flex;gap:4px}.fp-marks i{font-style:normal;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:15px;font-weight:800;color:#fff}
.fp-ion.pos .fp-marks i{background:#2C7DA0}.fp-ion.neg .fp-marks i{background:#C2410C}
.fp-ion.sm{min-width:0;flex:1;height:64px;font-size:17px;gap:2px}.fp-ion.sm .fp-marks i{width:15px;height:15px;font-size:11px}
.fp-meter{display:flex;align-items:center;justify-content:center;gap:6px;margin-top:10px;font-size:20px;font-weight:800;min-height:34px}
.fp-meter .p{color:#0B4F8A}.fp-meter .n{color:#8A3207}.fp-meter em{font-style:normal;color:var(--muted)}
.fp-meter .t{background:var(--warn-bg);color:var(--warn-ink);border-radius:10px;padding:2px 10px}.fp-meter .t.ok{background:var(--accent);color:#fff}
.fp-meter .muted{font-size:13px;font-weight:500}
.fp-done{text-align:center;margin:8px 0 2px;font-size:15px}.fp-f{font-size:40px;font-weight:800;color:var(--accent-ink)}
.fp-pal{display:flex;flex-direction:column;gap:8px;margin-top:12px}
.fp-pal>div{display:flex;gap:6px;align-items:center}.fp-pal>div>span{width:60px;flex:none;font-size:11.5px}
.ph-box{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:14px;min-height:118px}
.ph-k{font-size:12.5px;color:var(--muted);font-weight:700}
.ph-times{font-size:19px;margin-top:4px}
.ph-ladder{display:flex;gap:4px;flex-wrap:wrap;margin-top:10px}
.ph-ladder i{font-style:normal;font-size:12px;font-weight:700;background:#FCE3E3;color:#9B1C1C;border-radius:8px;padding:6px 8px}
.ph-scale{position:relative;margin:22px 6px 58px}
.ph-bar{height:26px;border-radius:13px}
.ph-nums{display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-top:4px;padding:0 2px}
.ph-scale .lb-thumb{top:-4px}
.ph-marks{position:absolute;left:0;right:0;top:50px}
.ph-marks span{position:absolute;transform:translateX(-50%);font-size:12px;font-weight:700;white-space:nowrap;padding-top:14px}
.ph-marks i{position:absolute;top:0;left:50%;width:2px;height:12px;background:var(--text)}
.ph-marks span:nth-child(2){padding-top:30px}.ph-marks span:nth-child(2) i{height:28px}
.cp-steps{display:flex;align-items:center;gap:0;margin:2px 4px 6px}
.cp-steps span{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font-weight:700;font-size:13px;background:var(--surface);border:1px solid var(--line);color:var(--muted)}
.cp-steps span.on{background:var(--accent);color:#fff;border-color:var(--accent)}.cp-steps span.done{background:var(--accent-weak);color:var(--accent-ink);border-color:var(--accent-weak)}
.cp-steps i{flex:1;height:2px;background:var(--line);max-width:60px}
.cp-k{font-size:13px;font-weight:700;color:var(--muted);margin:0 4px 8px}
.cp-card{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:14px}
.cp-q{font-size:16px;line-height:1.6;font-weight:600;margin-bottom:6px}
.cp-eq{font-size:15px;display:flex;align-items:center;gap:6px;margin:8px 0;flex-wrap:wrap}
.cp-eq.big{font-size:20px;font-weight:700}
.fr{display:inline-flex;flex-direction:column;align-items:center;line-height:1.25}
.fr span:first-child{border-bottom:2px solid currentColor;padding:0 6px}
.cp-eq u{text-decoration:none;display:inline-block;min-width:44px;text-align:center;border:2px solid var(--line);border-radius:8px;padding:0 6px}
.cp-eq u.cur{border-color:var(--accent);background:var(--accent-weak)}
.cp-pad{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}
.cp-pad button{height:52px;border-radius:14px;background:var(--surface);border:1px solid var(--line);font-size:22px;font-weight:600}
.cp-pad .go{grid-column:1/-1;background:var(--accent);color:#fff;border-color:var(--accent);font-size:17px}
.cp-ans{font-size:34px;font-weight:800;text-align:center;border:2px solid var(--line);border-radius:14px;padding:6px;margin:6px 0}
.cp-ans.ng{border-color:var(--danger);color:var(--danger)}.cp-ans small{font-size:18px}
.cp-hint{background:var(--warn-bg);border-radius:14px;padding:12px;margin-top:8px}
.cp-hint b{color:var(--warn-ink);font-size:14px}
.cp-hint ol{margin:8px 0 10px 20px;font-size:15px;line-height:1.9}
.cp-hint li{color:var(--muted)}.cp-hint li.on{color:var(--text)}.cp-hint li b{color:var(--text)}
`;

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
async function shot(name, html, { tab = 'home', noNav = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ja-JP', serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.goto(BASE + '#/more');
  await p.waitForTimeout(800);
  await p.addStyleTag({ content: CSS });
  await p.evaluate(async ({ html, tab, noNav }) => {
    const { icon } = await import('/js/core/icons.js');
    const fn = new Function('I', `return \`${html}\`;`);
    document.querySelector('#app').innerHTML = fn((n) => icon(n));
    document.querySelectorAll('.nav a').forEach((a) => (a.dataset.tab === tab ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    if (noNav) document.querySelector('.nav').style.display = 'none';
  }, { html: html.replace(/`/g, '\\`'), tab, noNav });
  await p.waitForTimeout(300);
  await p.screenshot({ path: OUT + name + '.png' });
  await ctx.close();
}
for (const s of ['solid', 'liquid', 'gas']) await shot('states-' + s, threeStatesHtml(s));
for (const k of [0, 1, 2]) await shot('formula-' + k, puzzleHtml(k));
await shot('ph-7', phHtml(7));
await shot('ph-2', phHtml(2));
for (const k of [1, 2, 3]) await shot('calc-' + k, calcHtml(k), { noNav: true });
await browser.close();
console.log('done');
