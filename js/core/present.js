// Teacher presentation mode (spec 5-2): larger text and 3D, big QR code,
// automatic rotation, fewer controls. For the PC + projector.
//   on:  ?present=1 in the URL (before or after the "#"), the switch in
//        "その他", or the P key
//   off: ?present=0, the "終了" button, or the P key again
// The choice is remembered on the device (prefs) until switched off.
import { el, prefs } from './dom.js';
import { icon } from './icons.js';
import { presentQR, shareUrl } from './share.js';

let bar = null;

export function isPresent() {
  return document.documentElement.classList.contains('presenting');
}

export function setPresent(on) {
  document.documentElement.classList.toggle('presenting', on);
  prefs.set('present', on ? '1' : null);
  if (on) showBar(); else hideBar();
  window.dispatchEvent(new CustomEvent('chemtouch:present', { detail: on }));
}

function showBar() {
  if (bar) return;
  bar = el(`
    <div class="present-bar" role="toolbar" aria-label="提示モード">
      <button class="pbtn" data-act="qr" title="このページの QR コードを大きく表示（Q キー）">${icon('qr')}<span>QR</span></button>
      <button class="pbtn" data-act="exit" title="提示モードを終える（P キー）">${icon('close')}<span>提示モード終了</span></button>
    </div>`);
  bar.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'qr') openQR();
    if (act === 'exit') setPresent(false);
  });
  document.body.append(bar);
}

function hideBar() {
  bar?.remove();
  bar = null;
}

function openQR() {
  const title = document.querySelector('.subbar h1, .topbar h1')?.textContent?.trim() || 'ケミタッチ';
  presentQR({ title, url: shareUrl(location.hash || '#/') });
}

// URL switch: "?present=1" before the hash, or "present=1" in the hash query
export function syncPresentFromUrl(query) {
  const v = new URLSearchParams(location.search).get('present') ?? query?.get('present');
  if (v === '1' && !isPresent()) setPresent(true);
  if (v === '0' && isPresent()) setPresent(false);
}

export function initPresent() {
  if (prefs.get('present') === '1') setPresent(true);
  syncPresentFromUrl(null);
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    if (e.key === 'p' || e.key === 'P') setPresent(!isPresent());
    if ((e.key === 'q' || e.key === 'Q') && isPresent() && !document.querySelector('.present')) openQR();
  });
}
