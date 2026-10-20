// Sharing (spec D): the shared content lives only in the URL; the QR code
// is generated in the browser. No server is involved.
import qrcode from '../../vendor/qrcode-generator-2.0.4/qrcode.mjs';
import { el, esc, toast } from './dom.js';
import { icon } from './icons.js';

// Absolute URL of the app for a given hash, e.g. "#/compound/water".
export function shareUrl(hash) {
  const u = new URL(location.href);
  u.hash = hash.replace(/^#?/, '#');
  u.search = '';
  return u.toString();
}

export function compoundHash(id) {
  return `#/compound/${encodeURIComponent(id)}`;
}

export function smilesHash(smiles, name) {
  const p = new URLSearchParams({ smiles });
  if (name) p.set('name', name);
  return `#/view?${p.toString()}`;
}

// margin is given in modules (the white box around the SVG adds more)
export function qrSvg(text, { margin = 2 } = {}) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: margin * 4, scalable: true, alt: { text: 'QRコード' } });
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    // fallback for older browsers / non-secure contexts
    const ta = el('<textarea style="position:fixed;opacity:0"></textarea>');
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    ta.remove();
    return ok;
  }
}

// Bottom sheet with QR, URL, copy / system share / projector mode.
export function openShareSheet({ title, hash }) {
  const url = shareUrl(hash);
  const canShare = typeof navigator.share === 'function';
  const back = el(`
    <div class="sheet-backdrop" role="dialog" aria-modal="true" aria-label="共有">
      <div class="sheet">
        <div class="grab"></div>
        <h2>${esc(title)} を共有</h2>
        <div class="qr">${qrSvg(url)}</div>
        <p class="url">${esc(url)}</p>
        <div class="acts">
          <button class="btn" data-act="copy">${icon('copy')}リンクをコピー</button>
          ${canShare ? `<button class="btn" data-act="share">${icon('share')}ほかのアプリ</button>` : `<button class="btn" data-act="close">${icon('close')}閉じる</button>`}
          <button class="btn primary full" data-act="present">${icon('expand')}投影用に大きく表示</button>
          ${canShare ? `<button class="btn full" data-act="close">閉じる</button>` : ''}
        </div>
      </div>
    </div>`);
  const close = () => {
    back.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  back.addEventListener('click', async (e) => {
    if (e.target === back) return close();
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'close') close();
    if (act === 'copy') toast((await copy(url)) ? 'リンクをコピーしました' : 'コピーできませんでした');
    if (act === 'share') {
      try { await navigator.share({ title: `${title} | ケミタッチ`, url }); } catch (err) { /* cancelled */ }
    }
    if (act === 'present') { close(); presentQR({ title, url }); }
  });
  document.addEventListener('keydown', onKey);
  document.body.append(back);
  back.querySelector('[data-act="copy"]').focus();
  return close;
}

// Full-screen QR for the projector (spec D-2).
export function presentQR({ title, url }) {
  const view = el(`
    <div class="present" role="dialog" aria-modal="true" aria-label="QRコード（投影用）">
      <button class="close" aria-label="閉じる">${icon('close')}</button>
      <div class="ttl">${esc(title)}</div>
      <div class="qr">${qrSvg(url, { margin: 1 })}</div>
      <div class="sub">${esc(url)}</div>
    </div>`);
  const close = () => {
    view.remove();
    document.removeEventListener('keydown', onKey);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  view.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.body.append(view);
  if (view.requestFullscreen && matchMedia('(min-width: 800px)').matches) {
    view.requestFullscreen().catch(() => {});
  }
  return close;
}
