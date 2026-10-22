// Fallback screen for unknown routes.
export function notFound({ el }) {
  el.innerHTML = `<div class="page"><p class="empty">ページが見つかりません。<br><a class="btn" style="margin-top:12px" href="#/">ホームへ</a></p></div>`;
}
