// Electron configuration builder (spec E-1 – E-5): #/electron/<symbol>
//   1-20 are built by tapping the shells; 21+ link to the element detail.
//   Shell model by default, orbital boxes (1s 2s 2p ...) as the advanced view.
//   After a correct answer: valence electrons, same group, noble-gas
//   arrangement, ions (remove / add electrons) and the way to bonds (E-6).
import { esc, prefs, toast } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { navigate } from '../core/router.js';
import {
  elementData, findElement, SHELLS, CAPACITY, BUILDER_MAX_Z, groundShells, sameShells, nobleLike,
  outerCount, valence, usualIon, ionLabel, ionName, orbitalFill, orbitalText,
} from './atoms.js';
import { shellSvg } from './shellsvg.js';

const RINGS = 4;
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const BONDS = { Na: 'ionic', Cl: 'ionic', H: 'covalent&m=h2', O: 'covalent&m=h2o', N: 'covalent&m=nh3', C: 'covalent&m=ch4' };

function orbitalHtml(n) {
  return `<div class="orb">${orbitalFill(n).map((o) => `
    <div class="orb-g${o.count ? '' : ' empty'}"><div class="orb-boxes">${o.arrows.map((a) => `<span class="orb-box">${a === 2 ? '↑↓' : a === 1 ? '↑' : ''}</span>`).join('')}</div><span class="orb-n">${o.name}</span></div>`).join('')}</div>
    <p class="small" style="margin-top:6px">${orbitalText(n) || '（電子なし）'}</p>
    <p class="small muted">同じ箱（オービタル）には電子が2個まで、向きを逆にして入ります。2p・3p では、まず1個ずつ別の箱に入ります（フントの規則）。4s は 3d より先に電子が入ります。</p>`;
}

export async function renderElectron({ el, params }) {
  const data = await elementData();
  let e = findElement(data, params.sym || prefs.get('electron:last', 'Na')) || data.byZ.get(11);
  if (e.z > BUILDER_MAX_Z) {
    el.innerHTML = `<div class="page"><header class="topbar"><h1 class="brand" style="font-size:20px">電子配置</h1></header>
      <div class="card" style="padding:18px"><p>電子配置ビルダーは原子番号 1〜20（化学基礎の範囲）が対象です。</p>
      <p class="small muted" style="margin:8px 0 12px">${esc(e.name_ja)}（${e.z}）の電子配置は元素の詳細で確認できます。</p>
      <a class="btn primary" href="#/periodic/${e.symbol}">${esc(e.name_ja)}の詳細</a> <a class="btn" href="#/electron/Na">ナトリウムで組み立てる</a></div></div>`;
    return null;
  }
  prefs.set('electron:last', e.symbol);
  let mode = prefs.get('electron:mode', 'shell');
  let placed = [0, 0, 0, 0];
  let charge = 0;     // after a correct answer the atom can be ionised
  let solved = false;
  let busy = false;
  let lastAdd = [];   // shell indices in the order electrons were placed

  el.innerHTML = `
  <div class="page wide">
    <header class="topbar"><h1 class="brand" style="font-size:20px">電子配置</h1>
      <div class="btns"><a class="cb" href="#/periodic" aria-label="周期表">${icon('table')}</a></div>
    </header>
    <div class="chips-row el-pick" role="group" aria-label="元素を選ぶ（原子番号1〜20）">
      ${data.elements.slice(0, BUILDER_MAX_Z).map((x) => `<a class="chip" href="#/electron/${x.symbol}" aria-pressed="${x.z === e.z}"><span class="n">${x.z}</span>${x.symbol}</a>`).join('')}
    </div>
    <div class="content">
      <div class="el-head">
        <div><h2>${esc(e.name_ja)} <span class="muted">${e.symbol}</span></h2>
          <p class="small muted">原子番号 ${e.z} → 陽子 ${e.z} 個、電子 ${e.z} 個</p></div>
        <div class="seg" role="group" aria-label="表し方">
          <button data-mode="shell">電子殻</button><button data-mode="orbital">オービタル</button>
        </div>
      </div>
      <section class="card e-stage">
        <div class="e-svg"></div>
        <div class="e-orb" hidden></div>
        <p class="e-pool" aria-live="polite"></p>
        <div class="e-add" role="group" aria-label="電子を置く殻">
          <span>置く:</span>${SHELLS.slice(0, RINGS).map((s, i) => `<button class="btn" data-add="${i}" aria-label="${s}殻に電子を置く">${s}殻</button>`).join('')}
        </div>
        <div class="e-acts">
          <button class="btn" data-act="undo">1つ戻す</button>
          <button class="btn" data-act="reset">やり直す</button>
          <button class="btn" data-act="auto">おまかせ配置</button>
          <button class="btn primary" data-act="check">判定する</button>
        </div>
        <p class="small muted e-help">殻（円）をタップするか、下のボタンで電子を置きます。置いた電子をタップすると取りのぞけます。</p>
      </section>
      <div class="e-result" aria-live="polite"></div>
    </div>
  </div>`;

  const svgBox = el.querySelector('.e-svg');
  const orbBox = el.querySelector('.e-orb');
  const result = el.querySelector('.e-result');
  const total = () => e.z - charge;
  const count = () => placed.reduce((a, b) => a + b, 0);

  function draw(mark) {
    el.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === mode));
    const shells = placed.slice(0, Math.max(1, placed.findLastIndex((n) => n > 0) + 1));
    svgBox.innerHTML = shellSvg({
      symbol: e.symbol, protons: e.z, shells: placed, rings: RINGS, interactive: !solved && !busy,
      label: `${e.name_ja}の電子殻。${shells.map((n, i) => `${SHELLS[i]}殻${n}個`).join('、')}`, mark,
    });
    orbBox.hidden = mode !== 'orbital';
    svgBox.hidden = mode === 'orbital';
    if (mode === 'orbital') orbBox.innerHTML = orbitalHtml(solved ? total() : count());
    const left = total() - count();
    el.querySelector('.e-pool').innerHTML = solved
      ? `<b>${ionLabel(e.symbol, charge)}</b>　${placed.filter((n, i) => n || i === 0).map((n, i) => `${SHELLS[i]}${n}`).join(' ')}`
      : `置く電子: <b>残り ${left} 個</b>（全部で ${total()} 個）`;
    el.querySelector('.e-add').hidden = solved || mode === 'orbital';
    el.querySelector('.e-acts').hidden = solved;
    el.querySelector('.e-help').hidden = solved || mode === 'orbital';
  }

  function add(i) {
    if (solved || busy) return;
    if (count() >= total()) { toast('電子はもう残っていません。「判定する」を押してください'); return; }
    if (placed[i] >= CAPACITY[i]) { toast(`${SHELLS[i]}殻に入る電子は最大 ${CAPACITY[i]} 個です`); return; }
    placed[i]++;
    lastAdd.push(i);
    draw();
  }

  function removeAt(i) {
    if (solved || busy || !placed[i]) return;
    placed[i]--;
    const k = lastAdd.lastIndexOf(i);
    if (k >= 0) lastAdd.splice(k, 1);
    draw();
  }

  function hint() {
    const left = total() - count();
    if (left > 0) return `まだ ${left} 個の電子が残っています。`;
    const limit = [2, 8, 8, 2];
    for (let i = 1; i < RINGS; i++) {
      if (placed[i] > 0 && placed[i - 1] < limit[i - 1]) {
        return `電子は内側の殻から入ります。${SHELLS[i - 1]}殻がまだいっぱいではありません（${SHELLS[i - 1]}殻には ${limit[i - 1]} 個まで）。`;
      }
    }
    if (placed[2] > 8) return '原子番号 20 までは、M殻に 8 個入ると次の電子は N殻に入ります（M殻の最大は 18 個ですが、ここでは 8 個で次へ進みます）。';
    if (!sameShells(placed, groundShells(total()))) return '配置がちがいます。内側の殻から順に、K殻 2 個、L殻 8 個、M殻 8 個、N殻 2 個まで入れていきます。';
    return null;
  }

  function solvedHtml() {
    const shells = placed;
    const noble = nobleLike(data, shells);
    const sameGroup = data.elements.filter((x) => x.group === e.group && x.z !== e.z && !x.series);
    const ion = usualIon(e);
    const bond = BONDS[e.symbol];
    if (charge) {
      return `<section class="card ok-card"><h2 class="section-title" style="margin-top:0">${ionLabel(e.symbol, charge)}（${esc(ionName(e, charge))}）</h2>
        <p>${charge > 0 ? `電子を ${charge} 個失って<b>陽イオン</b>になりました。陽子 ${e.z} 個に対して電子 ${total()} 個なので、全体の電荷は +${charge} です。` : `電子を ${-charge} 個受け取って<b>陰イオン</b>になりました。陽子 ${e.z} 個に対して電子 ${total()} 個なので、全体の電荷は −${-charge} です。`}</p>
        <p style="margin-top:6px">${noble ? `<b>${esc(noble.name_ja)}（${noble.symbol}）と同じ電子配置</b>（貴ガス型の電子配置）で、安定です。` : 'この電子配置は貴ガスとは同じではありません。'}</p>
        ${ionButtons()}
        ${bond ? bridgeHtml(bond) : ''}
      </section>`;
    }
    return `<section class="card ok-card">
      <h2 class="section-title" style="margin-top:0">正解！ ${esc(e.name_ja)}の電子配置</h2>
      <dl class="facts">
        <dt>電子配置</dt><dd>${shells.filter((n, i) => n || i === 0).map((n, i) => `${SHELLS[i]}殻 ${n}`).join('、')}</dd>
        <dt>最外殻電子</dt><dd>${outerCount(shells)} 個</dd>
        <dt>価電子</dt><dd>${valence(e)} 個${e.family === 'noble-gas' ? '（貴ガスは価電子 0 とする）' : ''}</dd>
        <dt>同族元素</dt><dd>${e.group}族: ${sameGroup.slice(0, 6).map((x) => `<a href="#/electron/${x.symbol}">${x.symbol}</a>`).join('、')}${sameGroup.length ? '（価電子の数が同じ）' : ''}</dd>
        <dt>貴ガス型？</dt><dd>${noble ? `はい（${esc(noble.name_ja)}）。最外殻が満たされていて安定です。` : 'いいえ'}</dd>
      </dl>
      ${ion ? `<p class="small" style="margin-top:8px">${esc(e.name_ja)}は電子を${ion > 0 ? `${ion} 個失って ${ionLabel(e.symbol, ion)}` : `${-ion} 個受け取って ${ionLabel(e.symbol, ion)}`} になりやすい元素です。下のボタンで試してみましょう。</p>` : ''}
      ${ionButtons()}
      ${bond ? bridgeHtml(bond) : ''}
    </section>`;
  }

  function ionButtons() {
    return `<div class="two" style="margin-top:10px">
      <button class="btn" data-act="lose" ${total() <= 0 || charge >= 3 ? 'disabled' : ''}>電子を1個とる（陽イオンへ）</button>
      <button class="btn" data-act="gain" ${charge <= -3 ? 'disabled' : ''}>電子を1個もらう（陰イオンへ）</button>
    </div>${charge ? '<button class="btn block" data-act="neutral" style="margin-top:8px">原子にもどす</button>' : ''}`;
  }

  function bridgeHtml(bond) {
    const ionic = bond === 'ionic';
    return `<a class="info bridge" href="#/bond?type=${bond}" style="margin:12px 0 0">${icon(ionic ? 'atom' : 'hex')}<span>${ionic ? '<b>イオン結合へ</b>: Na の電子を Cl に渡して、塩化ナトリウムの結晶をつくる' : '<b>共有結合へ</b>: 電子を出し合ってできる分子の電子式を見る'}</span>${icon('chev')}</a>`;
  }

  function solve() {
    solved = true;
    result.innerHTML = solvedHtml();
    draw();
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function auto() {
    if (busy) return;
    busy = true;
    placed = [0, 0, 0, 0];
    lastAdd = [];
    result.innerHTML = '';
    const want = groundShells(total());
    for (let i = 0; i < want.length; i++) {
      for (let k = 0; k < want[i]; k++) {
        placed[i]++;
        draw({ shell: i, k: placed[i] - 1 });
        if (!reduced()) await sleep(260);
        if (!el.isConnected) return;
      }
    }
    busy = false;
    result.innerHTML = '<p class="info" style="margin:0 0 10px">内側の殻から順に入りました。自分でも置いてみましょう（「やり直す」）。</p>';
    solve();
  }

  // ionisation: electrons leave / enter the outermost shell
  function ionise(delta) {
    const outer = placed.findLastIndex((n) => n > 0);
    if (delta < 0) {
      if (outer < 0) return;
      placed[outer]--;
      charge++;
    } else {
      const i = outer < 0 ? 0 : (placed[outer] >= (outer === 0 ? 2 : 8) ? outer + 1 : outer);
      if (i >= RINGS) return;
      placed[i]++;
      charge--;
    }
    result.innerHTML = solvedHtml();
    draw();
  }

  el.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-ring],[data-shell],[data-add],[data-act],[data-mode]');
    if (!t) return;
    if (t.dataset.mode) { mode = t.dataset.mode; prefs.set('electron:mode', mode); draw(); return; }
    if (t.dataset.add !== undefined) return add(+t.dataset.add);
    if (t.classList.contains('el-hit')) return removeAt(+t.dataset.shell);
    if (t.dataset.ring !== undefined) return add(+t.dataset.ring);
    const act = t.dataset.act;
    if (act === 'undo' && lastAdd.length) { placed[lastAdd.pop()]--; draw(); }
    if (act === 'reset') { placed = [0, 0, 0, 0]; lastAdd = []; result.innerHTML = ''; draw(); }
    if (act === 'auto') auto();
    if (act === 'check') {
      const h = hint();
      if (h) result.innerHTML = `<p class="quiz-ng e-ng">${esc(h)}</p>`;
      else solve();
    }
    if (act === 'lose') ionise(-1);
    if (act === 'gain') ionise(1);
    if (act === 'neutral') { charge = 0; placed = [...groundShells(e.z), 0, 0, 0, 0].slice(0, RINGS); result.innerHTML = solvedHtml(); draw(); }
  });
  draw();
  // keep the chosen element visible in the chip row
  el.querySelector('.el-pick [aria-pressed="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  return () => { busy = false; };
}

// #/electron without a symbol: the last element (or sodium)
export function renderElectronHome() {
  navigate(`#/electron/${prefs.get('electron:last', 'Na')}`, { replace: true });
  return null;
}
