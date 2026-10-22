// Home screen (spec §5-1): lesson band + bento grid.
import { esc } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { schedule } from '../core/data.js';
import { glucoseArt, chiralArt, miniTable, shellArt, chainArt } from './home-art.js';

const DAY = 86400000;

function parseDate(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

// Which lesson to show in the band, or null outside the teaching period.
export function pickLesson(lessons, today = new Date()) {
  const list = lessons.filter((l) => l && l.date).map((l) => ({ ...l, d: parseDate(l.date) })).sort((a, b) => a.d - b.d);
  if (!list.length) return null;
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (t < new Date(list[0].d - 7 * DAY) || t > new Date(+list[list.length - 1].d + DAY)) return null;
  const monday = new Date(+t - ((t.getDay() + 6) % 7) * DAY);
  const sunday = new Date(+monday + 6 * DAY);
  const thisWeek = list.find((l) => l.d >= monday && l.d <= sunday);
  if (thisWeek) return { label: '今週の授業', lesson: thisWeek };
  const next = list.find((l) => l.d > t);
  return next ? { label: '次回の授業', lesson: next } : null;
}

export async function renderHome({ el }) {
  const pick = pickLesson(await schedule());
  const qrBtn = `<a class="qrb" href="#/scan" aria-label="QRコードを読み取る">${icon('qr')}QR</a>`;
  const band = pick ? `
    <div class="band">
      <div style="flex:1;min-width:0">
        <div class="k">${esc(pick.label)} ・ 第${esc(pick.lesson.no)}回</div>
        <div class="bt">${esc(pick.lesson.title)}</div>
        ${(pick.lesson.links || []).length ? `<div class="links">${pick.lesson.links.map((l) => `<a href="${esc(l.href)}">${esc(l.label)}</a>`).join('')}</div>` : ''}
      </div>
      ${qrBtn}
    </div>` : '';

  el.innerHTML = `
  <div class="page">
    <header class="topbar">
      <h1 class="brand">ケミタッチ</h1>
      <div class="btns">
        ${pick ? '' : `<a class="cb inverse" href="#/scan" aria-label="QRコードを読み取る">${icon('qr')}</a>`}
        <a class="cb" href="#/library?focus=1" aria-label="分子をさがす">${icon('search')}</a>
      </div>
    </header>
    ${band}
    <div class="grid">
      <div class="t big">
        <a class="hero-link" href="#/library" aria-label="分子をさわる：ライブラリを開く"></a>
        <div class="m">${glucoseArt('hg')}</div>
        <div>
          <h3>分子をさわる</h3>
          <p>回して、拡大して、<br>官能基を見つけよう</p>
          <div class="chips">
            <a href="#/library?cat=carbohydrate">糖質</a><a href="#/library?cat=fatty-acid">脂肪酸</a><a href="#/library?cat=amino-acid">アミノ酸</a><a href="#/library?cat=vitamin">ビタミン</a>
          </div>
        </div>
        <a class="go" href="#/library">ライブラリを開く ${icon('chev')}</a>
      </div>
      <a class="t tall" href="#/periodic">
        <div><h3>周期表</h3><p>傾向・栄養ミネラル</p></div>
        <div class="pt">${miniTable([11, 19, 20, 12, 26, 30])}</div>
        <div class="minerals">
          <div class="lbl">ミネラル</div>
          <div class="els"><b>Na</b><b>K</b><b>Ca</b><b>Mg</b><b>Fe</b><b>Zn</b></div>
        </div>
        <div class="trend"><div class="lbl">傾向を見る</div><div>原子半径・電気陰性度</div></div>
      </a>
      <a class="t sq" href="#/compare">
        <div><h3>くらべる</h3><p>鏡像体・シス/トランス</p></div>
        <div class="pair"><div>${chiralArt('hm', true)}</div><i></i><div>${chiralArt('hc', false)}</div></div>
      </a>
      <a class="t sq" href="#/electron">
        <div><h3>電子配置</h3><p>K・L・M殻</p></div>
        <div class="shell">${shellArt()}</div>
      </a>
      <a class="t wide" href="#/build">
        <div class="ic">${icon('build')}</div>
        <div style="flex:1"><h3>つくる</h3><p>炭素鎖に官能基をつける</p></div>
        <div class="chain" style="width:120px">${chainArt()}</div>
      </a>
    </div>
  </div>`;
}
