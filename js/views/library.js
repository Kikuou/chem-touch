// Compound library (spec B-1): categories, keyword search, result list.
import { esc, isDark, formulaHtml } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { compounds, categories } from '../core/data.js';
import { search } from '../core/search.js';
import { setQuery } from '../core/router.js';
import { getRDKit, preloadRDKit, depict } from '../mol/rdkit.js';

const DARK = { '-1': [0.86, 0.88, 0.87], 6: [0.86, 0.88, 0.87], 7: [0.45, 0.66, 1], 8: [1, 0.45, 0.47], 17: [0.35, 0.82, 0.48] };
const thumbCache = new Map();
// library categories that have a homologous series (B-3)
const SERIES_OF = { alkane: 'alkane', alcohol: 'alkanol', 'carboxylic-acid': 'carboxylic-acid', 'fatty-acid': 'saturated-fatty-acid' };

function itemHtml(c) {
  return `<a class="item" href="#/compound/${encodeURIComponent(c.id)}">
    <div class="thumb" data-thumb="${esc(c.id)}">${c.kind === 'crystal' ? icon('hex') : ''}</div>
    <div class="tx">
      <div class="nm">${esc(c.name_ja)}</div>
      <div class="en">${esc(c.name_en)}</div>
      <div class="fm">${formulaHtml(c.formula || '')}${c.fatty_acid ? `　<span class="muted">${esc(c.fatty_acid.notation)}</span>` : ''}</div>
    </div>
    ${icon('chev')}
  </a>`;
}

async function fillThumbs(root, list) {
  const byId = new Map(list.map((c) => [c.id, c]));
  const io = new IntersectionObserver(async (entries) => {
    const RDKit = await getRDKit().catch(() => null);
    if (!RDKit) return;
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      const c = byId.get(e.target.dataset.thumb);
      if (!c || !c.smiles) continue;
      const key = c.id + (isDark() ? ':d' : ':l');
      if (!thumbCache.has(key)) {
        const m = RDKit.get_mol(c.smiles);
        if (!m) continue;
        depict(m);
        const o = { width: 128, height: 104, backgroundColour: [0, 0, 0, 0], bondLineWidth: 1.4, padding: 0.06, clearBackground: false };
        if (isDark()) o.atomColourPalette = DARK;
        thumbCache.set(key, m.get_svg_with_highlights(JSON.stringify(o)));
        m.delete();
      }
      e.target.innerHTML = thumbCache.get(key);
    }
  }, { rootMargin: '200px' });
  root.querySelectorAll('[data-thumb]').forEach((t) => io.observe(t));
  return () => io.disconnect();
}

export async function renderLibrary({ el, query }) {
  const [list, cats] = await Promise.all([compounds(), categories()]);
  let q = query.get('q') || '';
  let cat = query.get('cat') || '';
  const counts = {};
  list.forEach((c) => c.categories.forEach((k) => { counts[k] = (counts[k] || 0) + 1; }));
  const catById = new Map(cats.map((c) => [c.id, c]));

  el.innerHTML = `
  <div class="page">
    <header class="topbar"><h1 class="brand" style="font-size:20px">分子をさがす</h1></header>
    <div class="subbar" style="flex-direction:column;align-items:stretch;gap:4px">
      <label class="search">
        <span class="sr-only">キーワード</span>
        ${icon('search')}
        <input type="search" enterkeyhint="search" autocomplete="off" placeholder="名前・別名・分子式で検索" value="${esc(q)}">
        <button class="iconbtn clear" aria-label="入力を消す" ${q ? '' : 'hidden'}>${icon('close')}</button>
      </label>
      <div class="chips-row" role="group" aria-label="カテゴリ">
        <button class="chip" data-cat="" aria-pressed="${!cat}">すべて</button>
        ${cats.map((c) => `<button class="chip ${c.planned ? 'planned' : ''}" data-cat="${c.id}" aria-pressed="${cat === c.id}">${esc(c.label)}${counts[c.id] ? ` <span class="n">${counts[c.id]}</span>` : ''}</button>`).join('')}
      </div>
    </div>
    <div class="results" aria-live="polite"></div>
  </div>`;

  const input = el.querySelector('input');
  const clearBtn = el.querySelector('.clear');
  const results = el.querySelector('.results');
  let stopThumbs = null;

  function draw() {
    stopThumbs?.();
    stopThumbs = null;
    let shown = [];
    if (q) {
      shown = search(list, q);
      if (cat) shown = shown.filter((c) => c.categories.includes(cat));
      results.innerHTML = shown.length
        ? `<p class="subhead">${shown.length}件見つかりました</p><div class="list">${shown.map(itemHtml).join('')}</div>`
        : `<p class="empty">「${esc(q)}」に一致する分子は見つかりませんでした。<br><span class="small">ひらがな・カタカナ・英語名・分子式でも探せます。</span></p>`;
    } else if (cat) {
      const c = catById.get(cat);
      shown = list.filter((x) => x.categories.includes(cat));

      if (!shown.length) {
        results.innerHTML = `<p class="empty">${esc(c ? c.label : cat)}の分子は準備中です。<br><span class="small">${c && c.planned ? `（${esc(c.planned)} で追加予定）` : ''}</span></p>`;
      } else if (c && c.subs) {
        const used = new Set();
        let html = '';
        for (const s of c.subs) {
          const items = shown.filter((x) => x.categories.includes(s.id));
          items.forEach((x) => used.add(x.id));
          if (items.length) html += `<h2 class="subhead">${esc(s.label)}</h2><div class="list">${items.map(itemHtml).join('')}</div>`;
        }
        const rest = shown.filter((x) => !used.has(x.id));
        if (rest.length) html += `<h2 class="subhead">その他</h2><div class="list">${rest.map(itemHtml).join('')}</div>`;
        results.innerHTML = html;
      } else {
        results.innerHTML = `<p class="subhead">${esc(c ? c.desc : '')}</p><div class="list">${shown.map(itemHtml).join('')}</div>`;
      }
    } else {
      results.innerHTML = `<h2 class="section-title">カテゴリ</h2><div class="cat-grid">${cats.map((c) => `
        <button class="cat ${c.planned ? 'planned' : ''}" data-cat="${c.id}" style="text-align:left">
          <b>${esc(c.label)}</b><span>${counts[c.id] ? `${counts[c.id]}件・` : ''}${esc(c.desc)}${c.planned ? '（準備中）' : ''}</span>
        </button>`).join('')}</div>
        <p class="credit" style="margin-top:16px">収録: ${list.length}件。構造データは PubChem（パブリックドメイン）での照合と RDKit による3D座標生成にもとづきます。</p>`;
    }
    if (!q && cat && SERIES_OF[cat]) {
      results.insertAdjacentHTML('afterbegin', `<a class="info series-hint" href="#/series?s=${SERIES_OF[cat]}" style="margin:0 0 10px">${icon('chart')}<span>炭素数による沸点・融点の変化を見る（同族体シリーズ）</span>${icon('chev')}</a>`);
    }
    if (shown.length) {
      preloadRDKit();
      fillThumbs(results, shown).then((stop) => { stopThumbs = stop; });
    }
  }

  function selectCat(id) {
    cat = id;
    el.querySelectorAll('.chips-row .chip').forEach((b) => b.setAttribute('aria-pressed', b.dataset.cat === cat));
    el.querySelector(`.chips-row .chip[data-cat="${cat}"]`)?.scrollIntoView({ inline: 'center', block: 'nearest' });
    setQuery({ ...(q ? { q } : {}), ...(cat ? { cat } : {}) });
    draw();
  }

  let timer = null;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      q = input.value.trim();
      clearBtn.hidden = !q;
      setQuery({ ...(q ? { q } : {}), ...(cat ? { cat } : {}) });
      draw();
    }, 120);
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  clearBtn.addEventListener('click', (e) => {
    e.preventDefault();
    input.value = '';
    q = '';
    clearBtn.hidden = true;
    setQuery(cat ? { cat } : {});
    draw();
    input.focus();
  });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (b) selectCat(b.dataset.cat);
  });

  draw();
  if (cat) el.querySelector(`.chips-row .chip[data-cat="${cat}"]`)?.scrollIntoView({ inline: 'center', block: 'nearest' });
  if (query.get('focus')) input.focus();
  return () => { stopThumbs?.(); clearTimeout(timer); };
}
