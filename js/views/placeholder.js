// Screens that later milestones will fill in. Each one is a single route in
// js/main.js, so M2/M3/M4 only need to replace the handler.
import { esc } from '../core/dom.js';
import { icon } from '../core/icons.js';

export function placeholder({ title, milestone, text, links = [] }) {
  return ({ el }) => {
    el.innerHTML = `
    <div class="page">
      <header class="topbar"><h1 class="brand" style="font-size:20px">${esc(title)}</h1></header>
      <div class="card" style="text-align:center;padding:28px 18px">
        <div class="ic" style="margin:0 auto 12px;width:48px;height:48px;border-radius:14px">${icon('star')}</div>
        <p style="font-weight:700">準備中です（${esc(milestone)} で公開予定）</p>
        <p class="small muted" style="margin-top:6px">${esc(text)}</p>
        ${links.map((l) => `<a class="btn" style="margin-top:14px" href="${esc(l.href)}">${esc(l.label)}</a>`).join(' ')}
      </div>
    </div>`;
  };
}

export function notFound({ el }) {
  el.innerHTML = `<div class="page"><p class="empty">ページが見つかりません。<br><a class="btn" style="margin-top:12px" href="#/">ホームへ</a></p></div>`;
}
