// Homologous series (spec B-3): a carbon-number slider that grows the
// molecule, and line charts of boiling point, melting point and water
// solubility. Values and their sources come from data/series.json
// (scripts/build_series.py, PubChem experimental properties).
import { esc, formulaHtml, onThemeChange } from '../core/dom.js';
import { compounds, sdf as loadSdf } from '../core/data.js';
import { setQuery } from '../core/router.js';
import { Viewer3D, webglAvailable } from '../mol/viewer3d.js';

let seriesDoc = null;
async function loadSeries() {
  if (!seriesDoc) {
    seriesDoc = fetch(new URL('../../data/series.json', import.meta.url)).then((r) => r.json());
  }
  return seriesDoc;
}

const COL = { bp: '#D55E00', mp: '#0072B2', sol: '#009E73' };

// line chart; points = [{x, y|null}], cur = x of the current molecule
function chart({ points, cur, color, unit, yLog = false, title, extra = [] }) {
  const W = 340;
  const H = 170;
  const L = 40;
  const R = 10;
  const T = 22;
  const B = 26;
  const xs = points.map((p) => p.x);
  const vals = points.filter((p) => p.y != null).map((p) => (yLog ? Math.log10(p.y) : p.y));
  const xmin = Math.min(...xs);
  const xmax = Math.max(...xs);
  let ymin = vals.length ? Math.min(...vals) : 0;
  let ymax = vals.length ? Math.max(...vals) : 1;
  if (ymax - ymin < 1e-9) { ymin -= 1; ymax += 1; }
  const padY = (ymax - ymin) * 0.12;
  ymin -= padY;
  ymax += padY;
  const X = (x) => L + ((x - xmin) / Math.max(xmax - xmin, 1)) * (W - L - R);
  const Y = (v) => T + (1 - (v - ymin) / (ymax - ymin)) * (H - T - B);
  let s = `<text x="${L}" y="14" font-size="11" font-weight="700" fill="currentColor">${esc(title)}</text>`;
  // grid & y labels
  for (let i = 0; i <= 4; i++) {
    const v = ymin + ((ymax - ymin) * i) / 4;
    const y = Y(v);
    const label = yLog ? fmtLog(v) : Math.round(v);
    s += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="currentColor" opacity="0.12"/>`;
    s += `<text x="${L - 4}" y="${y + 3}" font-size="9" text-anchor="end" fill="currentColor" opacity="0.7">${label}</text>`;
  }
  s += `<text x="4" y="${T - 8}" font-size="9" fill="currentColor" opacity="0.7">${esc(unit)}</text>`;
  // x labels
  xs.forEach((x) => {
    s += `<text x="${X(x)}" y="${H - 8}" font-size="9" text-anchor="middle" fill="currentColor" opacity="${x === cur ? 1 : 0.6}" ${x === cur ? 'font-weight="700"' : ''}>${x}</text>`;
  });
  s += `<text x="${W - R}" y="${H - 8 + 0}" font-size="9" text-anchor="end" fill="currentColor" opacity="0">.</text>`;
  if (cur != null) s += `<line x1="${X(cur)}" x2="${X(cur)}" y1="${T}" y2="${H - B}" stroke="currentColor" opacity="0.35" stroke-dasharray="3 3"/>`;
  // line (gaps where data is missing)
  let d = '';
  let pen = false;
  points.forEach((p) => {
    if (p.y == null) { pen = false; return; }
    const v = yLog ? Math.log10(p.y) : p.y;
    d += `${pen ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(v).toFixed(1)}`;
    pen = true;
  });
  s += `<path d="${d}" fill="none" stroke="${color}" stroke-width="2"/>`;
  points.forEach((p) => {
    if (p.y == null) return;
    const v = yLog ? Math.log10(p.y) : p.y;
    s += `<circle cx="${X(p.x)}" cy="${Y(v)}" r="${p.x === cur ? 5 : 3}" fill="${color}" ${p.x === cur ? 'stroke="var(--surface)" stroke-width="2"' : ''}/>`;
  });
  extra.forEach((e) => {
    s += `<text x="${X(e.x)}" y="${T + 8}" font-size="9" text-anchor="middle" fill="${color}" font-weight="700">${esc(e.text)}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" class="series-svg" role="img" aria-label="${esc(title)}">${s}</svg>`;
}

function fmtLog(v) {
  const n = 10 ** v;
  if (n >= 1) return n >= 100 ? Math.round(n) : n.toFixed(n >= 10 ? 0 : 1);
  return n.toPrecision(1);
}

function valueRow(label, v, unit) {
  if (!v) return `<tr><th>${label}</th><td class="muted">データなし</td><td></td></tr>`;
  const text = v.solubility
    ? (v.solubility.miscible ? '水と任意の割合で混ざる' : `${v.solubility.g_per_100ml} ${unit}`)
    : `${v.value} ${unit}`;
  return `<tr><th>${label}</th><td>${esc(text)}</td><td><a href="${esc(v.url)}" target="_blank" rel="noopener" title="${esc(v.raw)}">${esc(shortSource(v.source))}</a></td></tr>`;
}

function shortSource(s) {
  if (/HSDB/.test(s)) return 'HSDB';
  if (/CRC/.test(s)) return 'CRC Handbook';
  if (/ICSC/.test(s)) return 'ICSC';
  if (/HMDB/.test(s)) return 'HMDB';
  return s.length > 24 ? s.slice(0, 22) + '…' : s;
}

export async function renderSeries({ el, query }) {
  const [doc, list] = await Promise.all([loadSeries(), compounds()]);
  const byId = new Map(list.map((c) => [c.id, c]));
  let sid = query.get('s') || doc.series[0].id;
  let series = doc.series.find((s) => s.id === sid) || doc.series[0];
  let idx = Math.min(parseInt(query.get('n') || '0', 10) || 0, series.members.length - 1);
  const anyData = doc.series.some((s) => s.members.some((m) => m.bp || m.mp || m.sol));

  el.innerHTML = `
  <div class="page wide">
    <header class="topbar"><h1 class="brand" style="font-size:20px">同族体シリーズ</h1></header>
    <div class="chips-row" role="group" aria-label="シリーズ">
      ${doc.series.map((s) => `<button class="chip" data-s="${s.id}" aria-pressed="${s.id === series.id}">${esc(s.label.replace(/（.*）/, ''))}</button>`).join('')}
    </div>
    <section class="panel">
      <div class="panel-h"><b class="series-name"></b><a class="small series-link" href="#">くわしく</a></div>
      <div class="v3d series-3d"><div class="loading"><div class="spinner"></div></div></div>
      <div class="series-slider">
        <label for="n-slider" class="small muted">炭素数</label>
        <input id="n-slider" type="range" min="0" step="1">
        <output class="series-n"></output>
      </div>
    </section>
    <section class="panel series-charts">
      ${anyData ? '' : '<p class="small muted" style="padding:12px 14px 0">物性値は PubChem から取得中です（GitHub 上で自動取得されると表示されます）。</p>'}
      <div class="chart-bpmp"></div>
      <div class="chart-sol"></div>
      <table class="series-table"></table>
      <p class="credit" style="padding:0 14px 12px">値は PubChem に収録された実験値（出典はデータベース名のリンク先）。融点・沸点は 1 気圧での値、溶解度は水 100 mL に溶ける質量（g）です。</p>
    </section>
  </div>`;

  const slider = el.querySelector('#n-slider');
  let viewer = null;
  if (webglAvailable()) {
    const box = el.querySelector('.series-3d');
    viewer = new Viewer3D(box, {});
    await viewer.init();
    box.querySelector('.loading')?.remove();
  }

  async function show() {
    const m = series.members[idx];
    const c = byId.get(m.id);
    slider.max = String(series.members.length - 1);
    slider.value = String(idx);
    el.querySelector('.series-n').textContent = `C${m.carbons}`;
    el.querySelector('.series-name').innerHTML = `${esc(c.name_ja)}（${formulaHtml(c.formula)}）`;
    el.querySelector('.series-link').href = `#/compound/${encodeURIComponent(c.id)}`;
    setQuery({ s: series.id, n: idx });
    if (viewer) {
      const text = await loadSdf(c);
      if (series.members[idx] !== m) return; // slider moved on
      viewer.load(text, { orient: 'x', zoom: 1 });
    }
    drawCharts();
  }

  function drawCharts() {
    const m = series.members[idx];
    const pts = (k) => series.members.map((x) => ({ x: x.carbons, y: x[k] ? x[k].value : null }));
    const bp = chart({ points: pts('bp'), cur: m.carbons, color: COL.bp, unit: '°C', title: '沸点（オレンジ）' });
    const mp = chart({ points: pts('mp'), cur: m.carbons, color: COL.mp, unit: '°C', title: '融点（青）' });
    const solPts = series.members.map((x) => ({ x: x.carbons, y: x.sol && x.sol.solubility.g_per_100ml ? x.sol.solubility.g_per_100ml : null }));
    const misc = series.members.filter((x) => x.sol && x.sol.solubility.miscible).map((x) => ({ x: x.carbons, text: '∞' }));
    const sol = chart({ points: solPts, cur: m.carbons, color: COL.sol, unit: 'g/100mL', yLog: true, title: '水への溶解度（対数目盛、∞＝任意の割合で混ざる）', extra: misc });
    el.querySelector('.chart-bpmp').innerHTML = bp + mp;
    el.querySelector('.chart-sol').innerHTML = sol;
    el.querySelector('.series-table').innerHTML = `
      ${valueRow('沸点', m.bp, '°C')}
      ${valueRow('融点', m.mp, '°C')}
      ${valueRow('水への溶解度', m.sol, 'g/100 mL')}`;
  }

  slider.addEventListener('input', () => { idx = +slider.value; show(); });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-s]');
    if (!b) return;
    series = doc.series.find((s) => s.id === b.dataset.s);
    idx = 0;
    el.querySelectorAll('[data-s]').forEach((x) => x.setAttribute('aria-pressed', x === b));
    show();
  });
  const stop = onThemeChange(() => { viewer?.applyStyle(); drawCharts(); });
  await show();
  return () => { stop(); viewer?.destroy(); };
}
