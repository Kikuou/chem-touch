// Element detail (spec F-2, F-4, F-6): #/periodic/<symbol>
import { esc, formulaHtml } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { goBack } from '../core/router.js';
import { compounds } from '../core/data.js';
import { openShareSheet } from '../core/share.js';
import {
  elementData, findElement, SHELLS, BUILDER_MAX_Z, fmtMass, fmtNum, EV_TO_KJMOL, stateJa,
  FAMILY_JA, METALLIC_JA, valence, containsElement, classOf, CLASS_JA,
} from './atoms.js';
import { shellSvg } from './shellsvg.js';

const draft = '<span class="draft" title="教員による確認前の下書きです">下書き</span>';

export async function renderElement({ el, params }) {
  const data = await elementData();
  const e = findElement(data, params.sym);
  el.innerHTML = `
  <div class="page wide">
    <div class="subbar">
      <button class="iconbtn" data-act="back" aria-label="戻る">${icon('back')}</button>
      <h1>${e ? esc(`${e.name_ja}（${e.symbol}）`) : '見つかりません'}</h1>
      <button class="iconbtn" data-act="share" aria-label="共有・QRコード">${icon('qr')}</button>
    </div>
    <div class="content"></div>
  </div>`;
  el.querySelector('[data-act="back"]').addEventListener('click', () => goBack('#/periodic'));
  const content = el.querySelector('.content');
  if (!e) {
    content.innerHTML = `<p class="empty">「${esc(params.sym)}」という元素はありません。<br><a class="btn" style="margin-top:12px" href="#/periodic">周期表へ</a></p>`;
    return null;
  }
  el.querySelector('[data-act="share"]').addEventListener('click', () => openShareSheet({ title: `${e.name_ja}（${e.symbol}）`, hash: `#/periodic/${e.symbol}` }));

  const cls = classOf(e);
  const rows = [];
  rows.push(['原子番号', String(e.z)]);
  rows.push(['原子量', fmtMass(e) ?? '—']);
  rows.push(['周期・族', e.series ? `第${e.period}周期・${e.series === 'lanthanoid' ? 'ランタノイド' : 'アクチノイド'}（3族）` : `第${e.period}周期・${e.group}族`]);
  const kinds = [e.kind === 'transition' ? '遷移元素' : '典型元素'];
  if (e.metallic) kinds.push(METALLIC_JA[e.metallic]);
  if (e.family) kinds.push(FAMILY_JA[e.family]);
  rows.push(['分類', esc(kinds.join('・'))]);
  if (e.shells) rows.push(['電子配置', `${e.shells.map((n, i) => `${SHELLS[i]}${n}`).join(' ')}${e.config ? `<br><span class="muted small">${esc(e.config)}</span>` : ''}`]);
  else if (e.config) rows.push(['電子配置', esc(e.config)]);
  const v = valence(e);
  if (v != null && e.z <= 36) rows.push(['価電子', `${v} 個`]);
  rows.push(['電気陰性度', e.en != null ? `${fmtNum(e.en, 2)}（ポーリング）` : '—']);
  rows.push(['原子半径', e.radius != null ? `${fmtNum(e.radius, 0)} pm（ファンデルワールス半径）` : '—']);
  rows.push(['第一イオン化エネルギー', e.ie != null ? `${fmtNum(e.ie, 3)} eV（${Math.round(e.ie * EV_TO_KJMOL)} kJ/mol）` : '—']);
  rows.push(['融点', e.mp != null ? `${fmtNum(e.mp - 273.15, 1)} ℃（${fmtNum(e.mp, 1)} K）` : '—']);
  if (e.state) rows.push(['常温・常圧での状態', esc(stateJa(e.state))]);

  const contain = (await compounds()).filter((c) => containsElement(c.formula, e.symbol));
  const m = e.mineral;
  const prev = data.byZ.get(e.z - 1);
  const next = data.byZ.get(e.z + 1);

  content.innerHTML = `
    <div class="el-hero c-${cls}">
      <div class="el-tile"><span class="z">${e.z}</span><b>${e.symbol}</b><span class="m">${fmtMass(e) ?? ''}</span></div>
      <div><h2>${esc(e.name_ja)}</h2><div class="en">${esc(e.name_en || '')}</div><div class="small">${esc(CLASS_JA[cls])}</div></div>
    </div>
    ${e.shells && e.z <= BUILDER_MAX_Z ? `
    <section class="card el-shell">
      ${shellSvg({ symbol: e.symbol, protons: e.z, shells: e.shells, size: 150, label: `${e.name_ja}の電子配置` })}
      <div>
        <p class="small">電子殻モデル（K・L・M・N 殻）</p>
        <a class="btn primary" href="#/electron/${e.symbol}">${icon('shell')}電子配置を組み立てる</a>
      </div>
    </section>` : ''}
    ${e.note_ja ? `<section class="card"><h2 class="section-title" style="margin-top:0">身近な用途・体内での役割${e.note_reviewed ? '' : draft}</h2><p class="note">${esc(e.note_ja)}</p></section>` : ''}
    ${m ? `<section class="card mineral"><h2 class="section-title" style="margin-top:0">栄養ミネラル（${m.class === 'major' ? '主要ミネラル' : '微量ミネラル'}）${m.reviewed ? '' : draft}</h2>
      <dl class="facts">
        <dt>おもなはたらき</dt><dd>${esc(m.role)}</dd>
        <dt>欠乏症</dt><dd>${esc(m.deficiency)}</dd>
        <dt>過剰症</dt><dd>${esc(m.excess)}</dd>
        <dt>多く含む食品</dt><dd>${esc(m.foods)}</dd>
      </dl></section>` : ''}
    ${e.body_rank ? `<p class="info" style="margin:0 0 10px">${icon('info')}<span>人体を構成する元素のうち、質量の多さで ${e.body_rank} 番目</span></p>` : ''}
    <section class="card"><h2 class="section-title" style="margin-top:0">データ</h2>
      <dl class="facts">${rows.map(([k, val]) => `<dt>${k}</dt><dd>${val}</dd>`).join('')}</dl>
    </section>
    <section class="card"><h2 class="section-title" style="margin-top:0">${esc(e.name_ja)}を含む収録化合物</h2>
      ${contain.length ? `<div class="rel">${contain.map((c) => `<a href="#/compound/${encodeURIComponent(c.id)}">${esc(c.name_ja)} <span class="muted small">${formulaHtml(c.formula)}</span></a>`).join('')}</div>` : '<p class="small muted">収録化合物にはありません。</p>'}
    </section>
    <div class="two el-nav">
      ${prev ? `<a class="btn" href="#/periodic/${prev.symbol}">← ${prev.z} ${esc(prev.symbol)}</a>` : '<span></span>'}
      ${next ? `<a class="btn" href="#/periodic/${next.symbol}">${next.z} ${esc(next.symbol)} →</a>` : '<span></span>'}
    </div>
    <p class="credit">数値: <a href="${esc(data.source.page)}" target="_blank" rel="noopener">PubChem</a>（パブリックドメイン）${data.source.status === 'fetched' ? '' : ' <span class="badge warn">未取得</span>'}。安定な同位体がない元素の原子量は、PubChem が示す代表的な同位体の値です。用途・ミネラルの説明は${e.note_reviewed || (m && m.reviewed) ? '教員確認済み' : '確認前の下書き'}です。</p>`;
  return null;
}
