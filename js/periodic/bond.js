// From electrons to bonds (spec E-6): #/bond
//   ?type=ionic                Na gives its outermost electron to Cl -> Na+ and Cl-,
//                              then the NaCl crystal (3D, library compound nacl-crystal)
//   ?type=covalent&m=h2o       electron-dot (Lewis) formulas of H2, H2O, NH3, CH4, CO2:
//                              shared pairs and lone pairs, link to the 3D viewer
import { esc } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { setQuery } from '../core/router.js';
import { SHELLS, ionLabel } from './atoms.js';
import { ringRadius, electronXY } from './shellsvg.js';

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const GEO = { r0: 17, step: 17 };

function atomSvg(cx, cy, sym, protons, shells, { charge = 0, hideOuter = null, mark = null } = {}) {
  let g = '';
  const rings = shells.length;
  for (let i = 0; i < rings; i++) g += `<circle class="ring" cx="${cx}" cy="${cy}" r="${ringRadius(i, GEO)}"/>`;
  g += `<circle class="nucleus" cx="${cx}" cy="${cy}" r="${GEO.r0}"/><text class="nuc-sym small-nuc" x="${cx}" y="${cy + 1}">${sym}</text><text class="nuc-z small-z" x="${cx}" y="${cy + 12}">+${protons}</text>`;
  shells.forEach((n, i) => {
    for (let k = 0; k < n; k++) {
      if (hideOuter && hideOuter.shell === i && hideOuter.k === k) continue;
      const [x, y] = electronXY(cx, cy, i, k, n, GEO);
      const m = mark && mark.shell === i && mark.k === k ? ' moving' : '';
      g += `<circle class="el${i === rings - 1 ? ' outer' : ''}${m}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.6"/>`;
    }
  });
  if (charge) {
    const R = ringRadius(rings - 1, GEO) + 8;
    g += `<path class="ion-br" d="M${cx - R + 6} ${cy - R} h-6 v${2 * R} h6 M${cx + R - 6} ${cy - R} h6 v${2 * R} h-6"/>`;
    g += `<text class="ion-chg" x="${cx + R + 4}" y="${cy - R + 8}">${Math.abs(charge) > 1 ? Math.abs(charge) : ''}${charge > 0 ? '+' : '−'}</text>`;
  }
  return g;
}

function ionicView(root) {
  const NA = { x: 84, y: 104 };
  const CL = { x: 276, y: 104 };
  let done = false;
  let running = false;
  root.innerHTML = `
    <section class="card bond-card">
      <svg class="bond-svg" viewBox="0 0 360 210" role="img" aria-label="ナトリウム原子から塩素原子への電子の移動"></svg>
      <div class="bond-labels"><div class="bl-na"></div><div class="bl-cl"></div></div>
      <p class="bond-text" aria-live="polite"></p>
      <div class="stack">
        <button class="btn primary block" data-act="give">Na の電子を Cl に渡す</button>
        <a class="btn block" data-act="crystal" href="#/compound/nacl-crystal" hidden>${icon('hex')}塩化ナトリウムの結晶を3Dで見る</a>
        <button class="btn block" data-act="again" hidden>最初から</button>
      </div>
    </section>
    <section class="card"><h2 class="section-title" style="margin-top:0">イオン結合とは</h2>
      <p class="note">金属元素の原子（Na）は電子を失って陽イオンに、非金属元素の原子（Cl）は電子を受け取って陰イオンになります。どちらも貴ガスと同じ電子配置になって安定します。陽イオンと陰イオンは静電気的な力（クーロン力）で引き合い、規則正しく並んだ結晶をつくります。これがイオン結合です。</p>
      <p class="small muted" style="margin-top:8px">この図は電子の受け渡しを表したもので、実際には1個ずつの原子が出会うのではなく、たくさんのイオンが同時に結晶をつくります。</p>
    </section>`;
  const svg = root.querySelector('svg');
  const text = root.querySelector('.bond-text');

  function draw(state) {
    const naShells = state === 'after' ? [2, 8] : [2, 8, 1];
    const clShells = state === 'after' ? [2, 8, 8] : [2, 8, 7];
    svg.innerHTML = atomSvg(NA.x, NA.y, 'Na', 11, naShells, { charge: state === 'after' ? 1 : 0, hideOuter: state === 'moving' ? { shell: 2, k: 0 } : null })
      + atomSvg(CL.x, CL.y, 'Cl', 17, clShells, { charge: state === 'after' ? -1 : 0, mark: state === 'after' ? { shell: 2, k: 7 } : null })
      + (state === 'after' ? `<path class="attract" d="M${NA.x + 70} ${NA.y} H${CL.x - 74}" marker-start="url(#ar)" marker-end="url(#ar)"/><defs><marker id="ar" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="attract-head"/></marker></defs><text class="attract-t" x="180" y="${NA.y - 8}">引き合う</text>` : '');
    root.querySelector('.bl-na').innerHTML = state === 'after'
      ? `<b>${ionLabel('Na', 1)}</b> ナトリウムイオン<br><span class="small">${SHELLS.slice(0, 2).map((s, i) => s + naShells[i]).join(' ')}（Ne と同じ）</span>`
      : `<b>Na</b> ナトリウム原子<br><span class="small">K2 L8 M1（最外殻 1 個）</span>`;
    root.querySelector('.bl-cl').innerHTML = state === 'after'
      ? `<b>${ionLabel('Cl', -1)}</b> 塩化物イオン<br><span class="small">K2 L8 M8（Ar と同じ）</span>`
      : `<b>Cl</b> 塩素原子<br><span class="small">K2 L8 M7（最外殻 7 個）</span>`;
    text.innerHTML = state === 'after'
      ? 'Na は電子を1個失って <b>Na⁺</b>、Cl は電子を1個受け取って <b>Cl⁻</b> になりました。どちらも貴ガス型の電子配置です。反対の電荷をもつイオンどうしが引き合って、<b>NaCl の結晶</b>ができます。'
      : 'Na の最外殻（M殻）には電子が1個、Cl の最外殻には7個あります。Na の電子1個を Cl に渡すと、どうなるでしょう？';
    root.querySelector('[data-act="give"]').hidden = state === 'after';
    root.querySelector('[data-act="crystal"]').hidden = state !== 'after';
    root.querySelector('[data-act="again"]').hidden = state !== 'after';
  }

  async function give() {
    if (running || done) return;
    running = true;
    const [x0, y0] = electronXY(NA.x, NA.y, 2, 0, 1, GEO);
    const [x1, y1] = electronXY(CL.x, CL.y, 2, 7, 8, GEO);
    draw('moving');
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('class', 'el outer moving');
    dot.setAttribute('r', '5.2');
    svg.append(dot);
    const dur = reduced() ? 0 : 1300;
    const t0 = performance.now();
    await new Promise((resolve) => {
      const step = (now) => {
        const t = dur ? Math.min(1, (now - t0) / dur) : 1;
        const s = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2; // ease in-out
        // quadratic curve over the top
        const cx = (x0 + x1) / 2;
        const cy = Math.min(y0, y1) - 70;
        const x = (1 - s) ** 2 * x0 + 2 * (1 - s) * s * cx + s * s * x1;
        const y = (1 - s) ** 2 * y0 + 2 * (1 - s) * s * cy + s * s * y1;
        dot.setAttribute('cx', x.toFixed(1));
        dot.setAttribute('cy', y.toFixed(1));
        if (t < 1 && root.isConnected) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
    running = false;
    done = true;
    draw('after');
  }

  root.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'give') give();
    if (act === 'again') { done = false; draw('before'); }
  });
  draw('before');
}

// ------------------------------------------------------------ covalent

const LEWIS = {
  h2: {
    label: 'H₂', name: '水素分子', href: `#/view?smiles=${encodeURIComponent('[H][H]')}&name=${encodeURIComponent('水素分子')}`,
    atoms: [['H', -0.8, 0], ['H', 0.8, 0]], shared: [[0, 1, 1]], lone: [],
    structure: 'H–H', noble: 'それぞれの H は He と同じ電子配置（電子 2 個）になります。',
  },
  h2o: {
    label: 'H₂O', name: '水', href: '#/compound/water',
    atoms: [['O', 0, 0], ['H', -1.35, 0], ['H', 1.35, 0]], shared: [[0, 1, 1], [0, 2, 1]], lone: [[0, -90], [0, 90]],
    structure: 'H–O–H', noble: 'O のまわりには電子が 8 個（Ne と同じ）、H は 2 個（He と同じ）。',
  },
  nh3: {
    label: 'NH₃', name: 'アンモニア', href: '#/compound/ammonia',
    atoms: [['N', 0, 0], ['H', -1.35, 0], ['H', 1.35, 0], ['H', 0, 1.35]], shared: [[0, 1, 1], [0, 2, 1], [0, 3, 1]], lone: [[0, -90]],
    structure: 'H–N–H（下に H）', noble: 'N のまわりには電子が 8 個（Ne と同じ）、H は 2 個（He と同じ）。',
  },
  ch4: {
    label: 'CH₄', name: 'メタン', href: '#/compound/methane',
    atoms: [['C', 0, 0], ['H', -1.35, 0], ['H', 1.35, 0], ['H', 0, -1.35], ['H', 0, 1.35]], shared: [[0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1]], lone: [],
    structure: 'C から 4 本の H', noble: 'C のまわりには電子が 8 個（Ne と同じ）、H は 2 個（He と同じ）。',
  },
  co2: {
    label: 'CO₂', name: '二酸化炭素', href: '#/compound/carbon-dioxide',
    atoms: [['O', -1.5, 0], ['C', 0, 0], ['O', 1.5, 0]], shared: [[0, 1, 2], [1, 2, 2]], lone: [[0, -90], [0, 90], [2, -90], [2, 90]],
    structure: 'O=C=O（二重結合）', noble: 'C も O も、まわりの電子が 8 個（Ne と同じ）になります。',
  },
};

function lewisSvg(m) {
  const S = 62;
  const W = 300;
  const H = 230;
  const cx = W / 2;
  const cy = H / 2;
  const P = m.atoms.map(([, x, y]) => [cx + x * S, cy + y * S]);
  let g = '';
  for (const [a, b, n] of m.shared) {
    const [ax, ay] = P[a];
    const [bx, by] = P[b];
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    const len = Math.hypot(bx - ax, by - ay);
    const ux = (bx - ax) / len;
    const uy = (by - ay) / len;
    const along = n === 1 ? [0] : [-5.5, 5.5];
    for (const t of along) for (const s of [-5.5, 5.5]) {
      g += `<circle class="lp-shared" cx="${(mx + ux * t - uy * s).toFixed(1)}" cy="${(my + uy * t + ux * s).toFixed(1)}" r="4.4"/>`;
    }
  }
  for (const [a, deg] of m.lone) {
    const rad = (deg * Math.PI) / 180;
    const [ax, ay] = P[a];
    const dx = Math.cos(rad);
    const dy = Math.sin(rad);
    const x = ax + dx * 25;
    const y = ay + dy * 25;
    for (const s of [-5.5, 5.5]) g += `<circle class="lp-lone" cx="${(x - dy * s).toFixed(1)}" cy="${(y + dx * s).toFixed(1)}" r="4"/>`;
  }
  m.atoms.forEach(([sym], i) => {
    g += `<text class="lw-atom" x="${P[i][0]}" y="${P[i][1] + 8}">${sym}</text>`;
  });
  return `<svg class="lewis" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(m.name)}の電子式">${g}</svg>`;
}

function covalentView(root, key) {
  let m = LEWIS[key] ? key : 'h2o';
  root.innerHTML = `
    <div class="chips-row" role="group" aria-label="分子">${Object.entries(LEWIS).map(([k, x]) => `<button class="chip" data-m="${k}">${x.label}</button>`).join('')}</div>
    <section class="card bond-card lewis-card"></section>
    <section class="card"><h2 class="section-title" style="margin-top:0">共有結合とは</h2>
      <p class="note">非金属元素の原子どうしは、最外殻の電子を出し合って<b>電子対</b>をつくり、それを共有して結びつきます（共有結合）。結合にかかわる電子対を<b>共有電子対</b>、結合にかかわらない電子対を<b>非共有電子対</b>といいます。共有することで、それぞれの原子が貴ガスと同じ電子配置になります。</p>
    </section>`;
  const card = root.querySelector('.lewis-card');
  function draw() {
    const x = LEWIS[m];
    root.querySelectorAll('[data-m]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.m === m));
    setQuery({ type: 'covalent', m });
    const shared = x.shared.reduce((a, s) => a + s[2], 0);
    card.innerHTML = `
      <h2>${esc(x.name)} <span class="muted">${x.label}</span></h2>
      ${lewisSvg(x)}
      <div class="lw-legend small">
        <span><i class="lp-shared-k"></i>共有電子対 <b>${shared}</b> 組</span>
        <span><i class="lp-lone-k"></i>非共有電子対 <b>${x.lone.length}</b> 組</span>
      </div>
      <p class="small" style="margin-top:8px">構造式: <b>${esc(x.structure)}</b>（共有電子対 1 組を線 1 本で表す）</p>
      <p class="small muted">${esc(x.noble)}</p>
      <a class="btn primary block" href="${x.href}" style="margin-top:10px">${icon('atom')}${esc(x.name)}を3Dで見る</a>`;
  }
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-m]');
    if (b) { m = b.dataset.m; draw(); }
  });
  draw();
}

export async function renderBond({ el, query }) {
  const type = query.get('type') === 'covalent' ? 'covalent' : 'ionic';
  el.innerHTML = `
  <div class="page wide">
    <header class="topbar"><h1 class="brand" style="font-size:20px">電子と結合</h1>
      <div class="btns"><a class="cb" href="#/electron" aria-label="電子配置ビルダー">e⁻</a></div>
    </header>
    <div class="subbar build-modes">
      <div class="seg" role="group" aria-label="結合の種類">
        <a class="segl" href="#/bond?type=ionic" aria-pressed="${type === 'ionic'}">イオン結合</a>
        <a class="segl" href="#/bond?type=covalent" aria-pressed="${type === 'covalent'}">共有結合</a>
      </div>
    </div>
    <div class="content"></div>
  </div>`;
  const content = el.querySelector('.content');
  if (type === 'ionic') ionicView(content);
  else covalentView(content, query.get('m'));
  return null;
}
