// Interactive periodic table (spec F-1, F-3 – F-5): #/periodic
//   ?view=class|radius|en|ie|mp   colouring (classification or a trend heat map)
//   &filter=mineral|body          nutrition minerals / composition of the human body
//   &fit=1                        whole table shrunk to the screen width
// Tapping an element opens #/periodic/<symbol> (detail.js).
import { esc, prefs } from '../core/dom.js';
import { setQuery } from '../core/router.js';
import { elementData, classOf, CLASS_JA, fmtNum } from './atoms.js';

const VIEWS = [
  ['class', '分類'],
  ['radius', '原子半径'],
  ['en', '電気陰性度'],
  ['ie', 'イオン化エネルギー'],
  ['mp', '融点（参考）'],
];
const TREND = {
  radius: { label: '原子半径（ファンデルワールス半径）', unit: 'pm', digits: 0, value: (e) => e.radius },
  en: { label: '電気陰性度（ポーリング）', unit: '', digits: 2, value: (e) => e.en },
  ie: { label: '第一イオン化エネルギー', unit: 'eV', digits: 1, value: (e) => e.ie },
  mp: { label: '融点', unit: '℃', digits: 0, value: (e) => (e.mp == null ? null : e.mp - 273.15) },
};
const FILTERS = [['', 'なし'], ['mineral', '栄養ミネラル'], ['body', '人体の元素組成']];
// sequential palette (light -> dark), readable in both themes with the
// value printed in the cell
const STOPS = ['#F4F1DE', '#D8E7C4', '#9CCBB0', '#5AA6A6', '#2F7A92', '#1F4E79'];

function mix(a, b, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',')})`;
}

function heat(t) {
  const s = Math.max(0, Math.min(1, t)) * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(s));
  return { bg: mix(STOPS[i], STOPS[i + 1], s - i), dark: s > 2.6 };
}

function position(e) {
  // grid row / column (1-based); f-block rows 9 and 10 after a gap row 8
  if (e.series) {
    const first = e.series === 'lanthanoid' ? 57 : 89;
    return { row: e.series === 'lanthanoid' ? 9 : 10, col: 3 + (e.z - first) };
  }
  return { row: e.period, col: e.group };
}

export async function renderPeriodic({ el, query }) {
  const data = await elementData();
  let view = query.get('view') || 'class';
  if (!VIEWS.some((v) => v[0] === view)) view = 'class';
  let filter = query.get('filter') || '';
  let fit = query.get('fit') === '1' || (!query.has('fit') && prefs.get('pt:fit') === '1');
  let onlyClass = null;

  el.innerHTML = `
  <div class="page wide">
    <header class="topbar"><h1 class="brand" style="font-size:20px">周期表</h1>
      <div class="btns"><a class="cb" href="#/electron" aria-label="電子配置ビルダー">e⁻</a></div>
    </header>
    <div class="pt-controls">
      <div class="chips-row" role="group" aria-label="色分け">${VIEWS.map(([k, l]) => `<button class="chip" data-view="${k}">${l}</button>`).join('')}</div>
      <div class="chips-row" role="group" aria-label="しぼりこみ">${FILTERS.map(([k, l]) => `<button class="chip" data-filter="${k}">${l}</button>`).join('')}
        <button class="chip" data-act="fit" aria-pressed="false">全体を縮小</button>
      </div>
    </div>
    <div class="pt-scroll"><div class="pt" role="grid" aria-label="周期表"></div></div>
    <div class="pt-legend" aria-live="polite"></div>
    <p class="credit">原子量・電子配置・電気陰性度・原子半径・イオン化エネルギー・融点: <a href="${esc(data.source.page)}" target="_blank" rel="noopener">PubChem</a>（パブリックドメイン）${data.source.status === 'fetched' ? '' : '　<span class="badge warn">PubChem 未取得</span>'}。元素をタップすると詳しい情報を表示します。</p>
  </div>`;

  const grid = el.querySelector('.pt');
  const legend = el.querySelector('.pt-legend');
  const scroller = el.querySelector('.pt-scroll');

  // "fit": cells sized so that all 18 groups fit the screen width
  function sizeCells() {
    if (!fit) { grid.style.removeProperty('--cell'); return; }
    const w = scroller.clientWidth - 32 - 18 - 18 * 2;
    grid.style.setProperty('--cell', `${Math.max(12, Math.floor(w / 18))}px`);
  }
  const onResize = () => sizeCells();
  window.addEventListener('resize', onResize);

  function draw() {
    el.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.view === view));
    el.querySelectorAll('[data-filter]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.filter === filter));
    el.querySelector('[data-act="fit"]').setAttribute('aria-pressed', fit);
    grid.classList.toggle('fit', fit);
    sizeCells();
    const q = { view };
    if (filter) q.filter = filter;
    if (fit) q.fit = '1';
    setQuery(q);
    prefs.set('pt:fit', fit ? '1' : '0');

    const trend = TREND[view];
    let lo = Infinity;
    let hi = -Infinity;
    if (trend) {
      for (const e of data.elements) {
        const v = trend.value(e);
        if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      }
    }
    let cells = '';
    for (let g = 1; g <= 18; g++) cells += `<div class="pt-h" style="grid-row:1;grid-column:${g + 1}">${g}</div>`;
    for (let p = 1; p <= 7; p++) cells += `<div class="pt-h" style="grid-row:${p + 1};grid-column:1">${p}</div>`;
    cells += `<div class="pt-series" style="grid-row:7;grid-column:4">La–Lu</div><div class="pt-series" style="grid-row:8;grid-column:4">Ac–Lr</div>`;
    for (const e of data.elements) {
      const { row, col } = position(e);
      const cls = classOf(e);
      let style = `grid-row:${row + 1};grid-column:${col + 1};`;
      let sub = '';
      let darkText = false;
      if (trend) {
        const v = trend.value(e);
        if (v == null) sub = '—';
        else {
          const h = heat((v - lo) / (hi - lo || 1));
          style += `background:${h.bg};`;
          darkText = h.dark;
          sub = fmtNum(v, trend.digits);
        }
      }
      let badge = '';
      let dim = false;
      if (filter === 'mineral') {
        if (e.mineral) badge = e.mineral.class === 'major' ? '多' : '微';
        else dim = true;
      } else if (filter === 'body') {
        if (e.body_rank) badge = String(e.body_rank);
        else dim = true;
      }
      if (onlyClass && !trend && cls !== onlyClass) dim = true;
      const name = `${e.name_ja}（${e.symbol}、原子番号${e.z}）${sub && sub !== '—' ? ` ${trend.label} ${sub}${trend.unit}` : ''}`;
      cells += `<a class="pt-el c-${cls}${trend ? ' heat' : ''}${trend && sub === '—' ? ' nodata' : ''}${darkText ? ' on-dark' : ''}${dim ? ' dim' : ''}" style="${style}" href="#/periodic/${e.symbol}" role="gridcell" aria-label="${esc(name)}">
        <span class="z">${e.z}</span><b>${e.symbol}</b>${sub ? `<span class="v">${esc(sub)}</span>` : ''}${badge ? `<i class="bd">${badge}</i>` : ''}</a>`;
    }
    grid.innerHTML = cells;

    if (trend) {
      legend.innerHTML = `<div class="pt-scale"><span>${fmtNum(lo, trend.digits)}</span><i style="background:linear-gradient(90deg,${STOPS.join(',')})"></i><span>${fmtNum(hi, trend.digits)}</span></div>
        <p class="small"><b>${trend.label}</b>${trend.unit ? `（${trend.unit}）` : ''}。色が濃いほど大きい値。数値はセルにも表示。<span class="muted">— はデータなし。</span></p>
        <p class="small muted">${{ radius: '同じ周期では右へ行くほど小さく、同じ族では下へ行くほど大きくなる傾向があります（貴ガスは測り方が違うため大きめ）。', en: '右上（フッ素）ほど大きく、左下ほど小さい傾向があります。貴ガスには値がありません。', ie: '同じ周期では右へ行くほど大きく、貴ガスで最大になります。同じ族では下へ行くほど小さくなります。', mp: '参考値です。炭素（ダイヤモンド・黒鉛）や遷移元素は高く、貴ガスやハロゲンは低い。' }[view]}</p>`;
    } else {
      const used = [...new Set(data.elements.map(classOf))];
      const order = ['alkali', 'alkaline-earth', 'transition', 'post-transition', 'metalloid', 'nonmetal', 'halogen', 'noble-gas', 'lanthanoid', 'actinoid', 'main'].filter((k) => used.includes(k));
      legend.innerHTML = `<div class="fg">${order.map((k) => `<button class="c-${k}" data-cls="${k}" aria-pressed="${onlyClass === k}">${CLASS_JA[k]}</button>`).join('')}</div>
        <p class="small muted">名前をタップすると、その分類だけを表示します。3〜12族が遷移元素、それ以外が典型元素です。</p>`;
    }
    if (filter === 'mineral') legend.insertAdjacentHTML('beforeend', '<p class="small"><b>栄養ミネラル</b>: 「多」は主要ミネラル（Na, K, Ca, Mg, P, S, Cl）、「微」は微量ミネラル（Fe, Zn, Cu, Mn, I, Se, Cr, Mo, Co）。元素をタップすると、はたらき・欠乏症・過剰症・多く含む食品を表示します。</p>');
    if (filter === 'body') legend.insertAdjacentHTML('beforeend', `<p class="small"><b>人体の元素組成</b>: 数字は${esc(data.body_note)}。</p>`);
  }

  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-view],[data-filter],[data-act],[data-cls]');
    if (!b) return;
    if (b.dataset.view) { view = b.dataset.view; onlyClass = null; }
    if (b.dataset.filter !== undefined) filter = b.dataset.filter;
    if (b.dataset.act === 'fit') fit = !fit;
    if (b.dataset.cls) onlyClass = onlyClass === b.dataset.cls ? null : b.dataset.cls;
    draw();
  });
  draw();
  return () => window.removeEventListener('resize', onResize);
}
