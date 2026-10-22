// QR reader (home "QR" button). Uses the camera in the browser:
// BarcodeDetector where available (Android Chrome), jsQR otherwise (iPhone).
// Nothing leaves the device.
import { esc, loadScript } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { goBack, navigate } from '../core/router.js';

const JSQR = new URL('../../vendor/jsqr-1.4.0/jsQR.js', import.meta.url);

// If the QR points into this app, return its hash so we can navigate
// without reloading; otherwise null.
function appHash(text) {
  try {
    const u = new URL(text, location.href);
    const here = new URL(location.href);
    if (u.origin === here.origin && u.pathname === here.pathname && u.hash.startsWith('#/')) return u.hash;
  } catch (e) { /* not a URL */ }
  return null;
}

export async function renderScan({ el }) {
  el.innerHTML = `
  <div class="page">
    <div class="subbar">
      <button class="iconbtn" data-act="back" aria-label="戻る">${icon('back')}</button>
      <h1>QRコードを読み取る</h1>
    </div>
    <div class="scan-box"><video playsinline muted></video><div class="frame"></div></div>
    <p class="small muted" style="text-align:center;margin:10px 0">枠の中にQRコードを写してください。</p>
    <div class="result"></div>
    <p class="credit" style="margin-top:12px">スマホのカメラアプリで直接読み取っても開けます。カメラの映像は端末の外に送信されません。</p>
  </div>`;
  el.querySelector('[data-act="back"]').addEventListener('click', () => goBack('#/'));
  const video = el.querySelector('video');
  const result = el.querySelector('.result');
  let stream = null;
  let raf = 0;
  let stopped = false;

  const stop = () => {
    stopped = true;
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach((t) => t.stop());
  };

  function found(text) {
    const hash = appHash(text);
    if (hash) {
      stop();
      navigate(hash);
      return;
    }
    const isUrl = /^https?:\/\//i.test(text);
    result.innerHTML = `<div class="card"><p class="small muted">読み取った内容</p><p style="overflow-wrap:anywhere;margin:4px 0 10px">${esc(text)}</p>
      ${isUrl ? `<a class="btn primary block" href="${esc(text)}" target="_blank" rel="noopener">${icon('ext')}開く</a>` : ''}</div>`;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    result.innerHTML = '<p class="empty">この端末・ブラウザではカメラを使えません。<br>カメラアプリでQRコードを読み取ってください。</p>';
    return stop;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  } catch (e) {
    result.innerHTML = `<p class="empty">カメラを起動できませんでした（${esc(e.name || e.message)}）。<br>カメラへのアクセスを許可するか、カメラアプリで読み取ってください。</p>`;
    return stop;
  }
  if (stopped) { stop(); return stop; }
  video.srcObject = stream;
  await video.play().catch(() => {});

  let detect;
  if ('BarcodeDetector' in window) {
    const bd = new window.BarcodeDetector({ formats: ['qr_code'] });
    detect = async () => {
      const codes = await bd.detect(video);
      return codes[0]?.rawValue || null;
    };
  } else {
    await loadScript(JSQR);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    detect = async () => {
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) return null;
      const scale = Math.min(1, 640 / Math.max(w, h));
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
      return code?.data || null;
    };
  }

  let last = 0;
  const loop = async (t) => {
    if (stopped) return;
    if (t - last > 200) {
      last = t;
      try {
        const text = await detect();
        if (text) { found(text); if (stopped) return; }
      } catch (e) { /* frame not ready */ }
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return stop;
}
