// Home screen (docs/plan.md 提案1): 今日の授業, 身近なもの, 基礎の復習, 道具.
// Today's lesson is the one chosen on this device (no dates: the student
// picks it, or opens the teacher's QR code); "ほかの回をえらぶ" changes it.
import { esc, el as h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { lessonPlan, lifeGroups } from '../core/data.js';
import { todayNo, setToday, doneMap } from '../lesson/progress.js';
import { CC } from '../lesson/colors.js';

const ccDots = () => `<span class="hm-dots" aria-hidden="true">${CC.map((c) => `<i style="background:${c.bg}"></i>`).join('')}</span>`;

function todayHtml(lesson) {
  if (!lesson) {
    return `<section class="hm-today">
      <div class="hm-k">今日の授業</div>
      <h2>回をえらんでください</h2>
      <p class="hm-tp">先生が言った回をえらぶと、ここにその回が出ます。</p>
      <div class="hm-acts"><button class="hm-go" data-act="pick">回をえらぶ ${icon('chev')}</button>
      <a class="hm-cc" href="#/card">${ccDots()}色カード</a></div>
    </section>`;
  }
  return `<section class="hm-today">
    <div class="hm-k">今日の授業 ・ 第${lesson.no}回</div>
    <h2>${esc(lesson.title)}</h2>
    ${lesson.topic ? `<p class="hm-tp">身近な話題: ${esc(lesson.topic)}</p>` : ''}
    <div class="hm-acts"><a class="hm-go" href="#/lesson/${lesson.no}">授業のページへ ${icon('chev')}</a>
    <a class="hm-cc" href="#/card">${ccDots()}色カード</a></div>
    <button class="hm-pick" data-act="pick">ほかの回をえらぶ</button>
  </section>`;
}

function pickSheet(lessons, today, onPick) {
  const back = h(`
    <div class="sheet-backdrop" role="dialog" aria-modal="true" aria-label="今日の授業をえらぶ">
      <div class="sheet">
        <div class="grab"></div>
        <h2>今日の授業をえらぶ</h2>
        <p class="small muted" style="text-align:center;margin:2px 0 10px">先生が言った回をえらびます。いつでも変えられます。</p>
        <div class="ls-list">${lessons.map((l) => `
          <button data-no="${l.no}"${l.no === today ? ' aria-current="true"' : ''}><span class="ls-no">${l.no}</span><span class="ls-tx"><b>${esc(l.title)}</b><span>${esc(l.topic || '')}</span></span>${l.no === today ? '<span class="ls-ok">今日</span>' : ''}</button>`).join('')}
        </div>
        <button class="btn block" data-act="close" style="margin-top:12px">閉じる</button>
      </div>
    </div>`);
  const close = () => { back.remove(); window.removeEventListener('hashchange', close); };
  back.addEventListener('click', (e) => {
    if (e.target === back || e.target.closest('[data-act="close"]')) return close();
    const b = e.target.closest('[data-no]');
    if (!b) return;
    close();
    onPick(+b.dataset.no);
  });
  window.addEventListener('hashchange', close);
  document.body.append(back);
  back.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'center' });
  return close;
}

export async function renderHome({ el }) {
  const [plan, life] = await Promise.all([lessonPlan(), lifeGroups()]);
  const lessons = plan.lessons;
  const done = doneMap();
  let closeSheet = null;

  function draw() {
    const today = lessons.find((l) => l.no === todayNo()) || null;
    el.innerHTML = `
    <div class="page">
      <header class="topbar">
        <h1 class="brand">ケミタッチ</h1>
        <div class="btns">
          <a class="cb inverse" href="#/scan" aria-label="QRコードを読み取る">${icon('qr')}</a>
          <a class="cb" href="#/library?focus=1" aria-label="分子をさがす">${icon('search')}</a>
        </div>
      </header>
      ${todayHtml(today)}
      <h2 class="hm-sec"><a href="#/life">身近なもの ${icon('chev')}</a></h2>
      <div class="hm-life">${life.map((g) => `
        <a class="${g.planned ? 'hm-planned' : ''}" href="${g.planned ? '#/life' : `#/library?life=${g.id}`}"><b>${esc(g.label)}</b><span>${esc(g.desc)}${g.planned ? '（準備中）' : ''}</span></a>`).join('')}
      </div>
      <h2 class="hm-sec">基礎の復習<a href="#/lessons">目次（全${lessons.length}回）${icon('chev')}</a></h2>
      <div class="hm-rev">${lessons.map((l) => `
        <a href="#/lesson/${l.no}"><span class="hm-no">第${l.no}回</span><b>${esc(l.title)}</b>${done[l.no] ? '<span class="hm-ok" aria-label="できた">✓</span>' : ''}</a>`).join('')}
      </div>
      <h2 class="hm-sec">道具</h2>
      <div class="hm-tools">
        <a href="#/periodic">${icon('table')}周期表</a>
        <a href="#/electron">${icon('shell')}電子配置</a>
        <a href="#/compare">${icon('compare')}くらべる</a>
        <a href="#/build/draw">${icon('build')}描く</a>
      </div>
    </div>`;
  }

  draw();
  el.addEventListener('click', (e) => {
    if (!e.target.closest('[data-act="pick"]')) return;
    closeSheet = pickSheet(lessons, todayNo(), (no) => { setToday(no); draw(); });
  });
  return () => closeSheet?.();
}
