// Lessons (docs/plan.md 提案5・11), all made from the lesson plan file:
//   #/lessons                目次 of 基礎の復習 (✓ = おわりの3問 done here)
//   #/lesson/<no>            身近な話題, きょうの流れ (catalog parts in order),
//                            いっせい問題 (colour card), おわりの3問.
//                            ?today=1 (the teacher's QR) also makes it today's lesson.
//                            In presentation mode a QR code of the page stays on screen.
//   #/lesson/<no>/ask?i=0    a colour-card question for the projector
//   #/lesson/<no>/end        おわりの3問 (4 choices, result kept on this device only)
import { esc } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { goBack, setQuery } from '../core/router.js';
import { lessonPlan, questions } from '../core/data.js';
import { qrSvg, shareUrl, openShareSheet } from '../core/share.js';
import { isPresent } from '../core/present.js';
import { isDetail } from '../core/detail.js';
import { resolvePart } from '../lesson/catalog.js';
import { doneMap, setDone, setToday, lessonShareHash } from '../lesson/progress.js';
import { CC } from '../lesson/colors.js';
import { glossary, linkTerms } from '../lesson/glossary.js';

const DRAFT = '<span class="draft" title="教員による確認前の下書きです">下書き</span>';

async function findLesson(no) {
  const plan = await lessonPlan();
  return { plan, lesson: plan.lessons.find((l) => String(l.no) === String(no)) || null };
}

function shell(el, title, { back = '#/', close = false, share = null } = {}) {
  el.innerHTML = `
  <div class="page">
    <div class="subbar">
      <button class="iconbtn" data-act="back" aria-label="${close ? '閉じる' : '戻る'}">${icon(close ? 'close' : 'back')}</button>
      <h1>${esc(title)}</h1>
      ${share ? `<button class="iconbtn" data-act="share" aria-label="共有・QRコード">${icon('qr')}</button>` : ''}
    </div>
    <div class="content"></div>
  </div>`;
  el.querySelector('[data-act="back"]').addEventListener('click', () => goBack(back));
  if (share) el.querySelector('[data-act="share"]').addEventListener('click', () => openShareSheet(share));
  return el.querySelector('.content');
}

const notFoundHtml = (no) => `<p class="empty">第${esc(no)}回は授業プランにありません。<br><a class="btn" style="margin-top:12px" href="#/lessons">目次へ</a></p>`;

// ---------------------------------------------------------------- 目次
export async function renderLessons({ el }) {
  const content = shell(el, '基礎の復習');
  const { plan } = await findLesson(0);
  const done = doneMap();
  content.innerHTML = `
    <p class="small muted" style="margin:0 4px 10px">${esc(plan.label || '')}の授業の目次です。✓ はこの端末で「おわりの3問」をやった回です。</p>
    <div class="ls-list">${plan.lessons.map((l) => `
      <a href="#/lesson/${l.no}"><span class="ls-no${done[l.no] ? ' on' : ''}">${l.no}</span><span class="ls-tx"><b>${esc(l.title)}</b><span>${esc(l.topic || '')}</span></span>${done[l.no] ? `<span class="ls-ok">✓ ${done[l.no].score}/${done[l.no].total}</span>` : ''}</a>`).join('')}
    </div>`;
  return null;
}

// ---------------------------------------------------------------- 各回のページ
export async function renderLesson({ el, params, query }) {
  const { plan, lesson } = await findLesson(params.no);
  if (!lesson) {
    shell(el, '授業').innerHTML = notFoundHtml(params.no);
    return null;
  }
  if (query.get('today') === '1') {
    setToday(lesson.no);
    setQuery({});
  }
  const hash = lessonShareHash(lesson.no);
  const content = shell(el, `第${lesson.no}回`, { back: '#/', share: { title: `第${lesson.no}回 ${lesson.title}`, hash } });
  const parts = (await Promise.all((lesson.parts || []).map(resolvePart))).filter(Boolean);
  await glossary().catch(() => null);
  const done = doneMap()[lesson.no];
  const teacher = isPresent() || isDetail();
  el.querySelector('.page').classList.add('ls-page');
  content.innerHTML = `
    <div class="mol-title"><h2>${esc(lesson.title)}</h2></div>
    ${lesson.topic ? `<div class="ls-topic"><b>身近な話題${plan.reviewed ? '' : DRAFT}</b><p>${linkTerms(lesson.topic)}</p></div>` : ''}
    ${parts.length ? `<h2 class="ls-sec">きょうの流れ</h2>
    <div class="ls-flow">${parts.map((p, i) => {
      const inner = `<span class="ls-n">${i + 1}</span><span class="ls-tx"><b>${esc(p.title)}</b><span class="ls-tag${p.href ? '' : ' soon'}">${esc(p.tag)}</span>${p.sub ? `<span class="ls-sub">${esc(p.sub)}</span>` : ''}</span>`;
      return p.href ? `<a href="${esc(p.href)}">${inner}${icon('chev')}</a>` : `<div class="ls-off">${inner}</div>`;
    }).join('')}</div>` : ''}
    ${lesson.colorcards?.length ? `<h2 class="ls-sec">いっせい問題</h2>
    <section class="ls-box"><h3>色カード</h3><p>先生が映した問題に、A〜D の色で答えます。画面を掲げてください。</p>
      <div class="ls-ccrow" aria-hidden="true">${CC.map((c) => `<i style="background:${c.bg};color:${c.fg}">${c.key}</i>`).join('')}</div>
      <a class="btn primary block" href="#/card" style="margin-top:12px">色カードを開く</a>
      ${teacher ? `<a class="btn block" href="#/lesson/${lesson.no}/ask" style="margin-top:8px">${icon('expand')}先生用：問題を映す（${lesson.colorcards.length}問）</a>` : ''}
    </section>` : ''}
    ${lesson.end3?.length ? `<h2 class="ls-sec">おわりの${lesson.end3.length}問</h2>
    <section class="ls-box"><h3>きょうのまとめ${done ? `<span class="ls-ok">✓ ${done.score}/${done.total}</span>` : ''}</h3><p>答えはこの端末にだけ残ります。先生には送られません。</p>
      <a class="btn primary block" href="#/lesson/${lesson.no}/end">${done ? 'もう一度やる' : 'はじめる'}</a></section>` : ''}
    <div class="ls-pqr" aria-hidden="true"><div class="ls-pqr-box">${qrSvg(shareUrl(hash))}</div><span>第${lesson.no}回のページ</span></div>`;
  return null;
}

// ---------------------------------------------------------------- いっせい問題（映す）
export async function renderAsk({ el, params, query }) {
  const { lesson } = await findLesson(params.no);
  if (!lesson || !lesson.colorcards?.length) {
    shell(el, '問題').innerHTML = notFoundHtml(params.no);
    return null;
  }
  const qs = await questions();
  const list = lesson.colorcards.map((id) => qs.get(id)).filter(Boolean);
  let i = Math.min(Math.max(parseInt(query.get('i') || '0', 10) || 0, 0), list.length - 1);
  let shown = false;
  const url = shareUrl(lessonShareHash(lesson.no));
  document.documentElement.classList.add('ls-asking');

  function draw() {
    const q = list[i];
    el.innerHTML = `
    <div class="ls-ask${shown ? ' shown' : ''}">
      <div class="ls-ask-main">
        <div class="ls-ask-k">第${lesson.no}回 ・ いっせい問題 ${i + 1} / ${list.length}${q.reviewed ? '' : DRAFT}</div>
        <h1>${esc(q.q)}</h1>
        <div class="ls-ask-o">${q.choices.map((c, k) => `
          <div class="${shown ? (k === q.answer ? 'ok' : 'ng') : ''}" style="background:${CC[k].bg};color:${CC[k].fg}"><i>${CC[k].key}<small>${CC[k].shape}</small></i><span>${esc(c)}</span></div>`).join('')}
        </div>
        ${shown ? `<p class="ls-ask-ex"><b>答え ${CC[q.answer].key}</b>　${linkTerms(q.explain || '')}</p>` : ''}
      </div>
      <aside class="ls-ask-qr"><div class="ls-pqr-box">${qrSvg(url)}</div><p><b>第${lesson.no}回のページ</b><br>スマホで読み取ると<br>色カードが使えます</p></aside>
      <div class="ls-ask-bar">
        <button class="btn" data-act="close">${icon('close')}閉じる</button>
        <button class="btn" data-act="prev"${i ? '' : ' disabled'}>‹ 前の問題</button>
        <button class="btn primary" data-act="show">${shown ? '答えをかくす' : '答えを見せる'}</button>
        <button class="btn" data-act="next"${i < list.length - 1 ? '' : ' disabled'}>次の問題 ›</button>
      </div>
    </div>`;
  }
  draw();
  el.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (!a) return;
    if (a === 'close') return goBack(`#/lesson/${lesson.no}`);
    if (a === 'show') shown = !shown;
    if (a === 'prev' && i > 0) { i--; shown = false; }
    if (a === 'next' && i < list.length - 1) { i++; shown = false; }
    setQuery({ i: String(i) });
    draw();
  });
  const onKey = (e) => {
    if (e.key === 'ArrowRight' && i < list.length - 1) { i++; shown = false; draw(); }
    else if (e.key === 'ArrowLeft' && i > 0) { i--; shown = false; draw(); }
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); shown = !shown; draw(); }
  };
  document.addEventListener('keydown', onKey);
  return () => {
    document.removeEventListener('keydown', onKey);
    document.documentElement.classList.remove('ls-asking');
  };
}

// ---------------------------------------------------------------- おわりの3問
export async function renderEnd({ el, params }) {
  const { lesson } = await findLesson(params.no);
  if (!lesson || !lesson.end3?.length) {
    shell(el, 'おわりの3問').innerHTML = notFoundHtml(params.no);
    return null;
  }
  const qs = await questions();
  await glossary().catch(() => null);
  const list = lesson.end3.map((id) => qs.get(id)).filter(Boolean);
  const content = shell(el, `おわりの${list.length}問`, { back: `#/lesson/${lesson.no}`, close: true });
  let i = 0;
  const answers = [];

  function drawQ() {
    const q = list[i];
    const a = answers[i];
    const answered = a !== undefined;
    content.innerHTML = `
      <section class="ls-q">
        <div class="ls-q-p"><span>第${lesson.no}回</span><span>${i + 1} / ${list.length}</span></div>
        <h2>${esc(q.q)}${q.reviewed ? '' : DRAFT}</h2>
        <div class="ls-q-o" role="group" aria-label="選択肢">${q.choices.map((c, k) => `
          <button data-k="${k}" class="${answered ? (k === q.answer ? 'ok' : k === a ? 'ng' : '') : ''}"${answered ? ' disabled' : ''}><i>${CC[k].key}</i>${esc(c)}</button>`).join('')}
        </div>
        ${answered ? `<div class="ls-q-ex${a === q.answer ? '' : ' ng'}">${a === q.answer ? 'せいかい。' : `ざんねん。答えは ${CC[q.answer].key}。`}${linkTerms(q.explain || '')}</div>
        <button class="btn primary block" data-act="next" style="margin-top:12px">${i < list.length - 1 ? 'つぎへ' : '結果を見る'}</button>` : ''}
      </section>`;
  }

  function drawResult() {
    const score = answers.filter((a, k) => a === list[k].answer).length;
    setDone(lesson.no, score, list.length);
    content.innerHTML = `
      <section class="ls-res">
        <div class="small muted">第${lesson.no}回 ${esc(lesson.title)}</div>
        <div class="ls-res-big">${score}<small> / ${list.length} 問</small></div>
        <ul>${list.map((q, k) => `<li><b class="${answers[k] === q.answer ? 'ok' : 'ng'}">${answers[k] === q.answer ? '○' : '×'}</b><span>${esc(q.q)}</span></li>`).join('')}</ul>
        <p class="small muted">「基礎の復習」の第${lesson.no}回に ✓ がつきました（この端末だけ）。</p>
        <div class="two" style="margin-top:14px"><button class="btn" data-act="again">もう一度</button><a class="btn primary" href="#/lesson/${lesson.no}">授業のページへ</a></div>
      </section>`;
  }

  content.addEventListener('click', (e) => {
    const b = e.target.closest('[data-k],[data-act]');
    if (!b) return;
    if (b.dataset.k !== undefined && answers[i] === undefined) { answers[i] = +b.dataset.k; drawQ(); }
    else if (b.dataset.act === 'next') { i++; if (i < list.length) drawQ(); else drawResult(); }
    else if (b.dataset.act === 'again') { i = 0; answers.length = 0; drawQ(); }
  });
  drawQ();
  return null;
}

