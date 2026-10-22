// Small DOM helpers shared by all screens.

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// "C6H12O6" -> C<sub>6</sub>H<sub>12</sub>O<sub>6</sub> (HTML)
export function formulaHtml(f) {
  return esc(f).replace(/(\d+)/g, '<sub>$1</sub>');
}

// Create an element from an HTML string (first element child).
export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

const scripts = new Map();
// Load a classic (non-module) script once, e.g. a UMD library in vendor/.
export function loadScript(url) {
  const key = String(url);
  if (!scripts.has(key)) {
    scripts.set(key, new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = key;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { scripts.delete(key); reject(new Error('読み込みに失敗しました: ' + key)); };
      document.head.append(s);
    }));
  }
  return scripts.get(key);
}

let toastTimer = null;
export function toast(msg, ms = 2200) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const t = el(`<div class="toast" role="status">${esc(msg)}</div>`);
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), ms);
}

// "Dark mode is active" — follows the manual setting, else the OS setting.
export function isDark() {
  const t = document.documentElement.dataset.theme;
  if (t === 'dark') return true;
  if (t === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// Call fn whenever the effective colour scheme changes. Returns an unsubscribe.
export function onThemeChange(fn) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => fn(isDark());
  mq.addEventListener('change', handler);
  window.addEventListener('chemtouch:theme', handler);
  return () => {
    mq.removeEventListener('change', handler);
    window.removeEventListener('chemtouch:theme', handler);
  };
}

// localStorage wrappers that never throw (private mode etc.)
export const prefs = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem('chemtouch:' + key);
      return v === null ? fallback : v;
    } catch (e) { return fallback; }
  },
  set(key, value) {
    try {
      if (value === null) localStorage.removeItem('chemtouch:' + key);
      else localStorage.setItem('chemtouch:' + key, value);
    } catch (e) { /* ignore */ }
  },
};
