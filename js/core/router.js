import { esc } from './dom.js';

// Hash router: "#/path/segments?query". Works on GitHub Pages because the
// server never sees the part after "#".
//
// Each module registers its screens with route(); a handler renders into the
// outlet element and may return a cleanup function (dispose 3D viewers,
// stop the camera, ...), which runs before the next screen is rendered.

const routes = [];
let outlet = null;
let cleanup = null;
let onChange = () => {};
let renderToken = 0;
let inAppSteps = 0; // hash changes since the page was opened

export function route(pattern, handler, { tab = null, title = '' } = {}) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/\/:([a-zA-Z]+)/g, (_, k) => {
    keys.push(k);
    return '/([^/]+)';
  }) + '/?$');
  routes.push({ re, keys, handler, tab, title });
}

export function parseHash(hash = location.hash) {
  const raw = hash.replace(/^#/, '') || '/';
  const qi = raw.indexOf('?');
  const path = qi >= 0 ? raw.slice(0, qi) : raw;
  const query = new URLSearchParams(qi >= 0 ? raw.slice(qi + 1) : '');
  return { path: path || '/', query };
}

export function navigate(hash, { replace = false } = {}) {
  if (!hash.startsWith('#')) hash = '#' + hash;
  if (replace) {
    history.replaceState(null, '', hash);
    render();
  } else {
    location.hash = hash;
  }
}

// Back button: go back inside the app, or to `fallback` when the page was
// opened directly (e.g. from a QR code) and there is nothing to go back to.
export function goBack(fallback = '#/') {
  if (inAppSteps > 0) {
    inAppSteps -= 2; // the back navigation itself fires hashchange (+1)
    history.back();
  } else {
    navigate(fallback);
  }
}

// Update the query string without re-rendering (e.g. while typing a search).
export function setQuery(params) {
  const { path } = parseHash();
  const qs = new URLSearchParams(params).toString();
  history.replaceState(null, '', '#' + path + (qs ? '?' + qs : ''));
}

export function startRouter(el, { onRouteChange } = {}) {
  outlet = el;
  if (onRouteChange) onChange = onRouteChange;
  window.addEventListener('hashchange', () => { inAppSteps++; render(); });
  render();
}

async function render() {
  const { path, query } = parseHash();
  let match = null;
  let params = {};
  for (const r of routes) {
    const m = path.match(r.re);
    if (m) {
      match = r;
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      break;
    }
  }
  if (typeof cleanup === 'function') {
    try { cleanup(); } catch (e) { console.error(e); }
  }
  cleanup = null;
  // a fresh container per screen: a slow handler of a previous screen can
  // only write into its own (detached) element
  outlet.innerHTML = '';
  const view = document.createElement('div');
  outlet.append(view);
  window.scrollTo(0, 0);
  if (!match) {
    match = routes.find((r) => r.re.test('/404')) || null;
    params = {};
  }
  onChange({ tab: match ? match.tab : null, path });
  if (!match) return;
  document.title = match.title ? `${match.title} | ケミタッチ` : 'ケミタッチ';
  const token = ++renderToken;
  try {
    const fn = await match.handler({ el: view, params, query, path, isCurrent: () => token === renderToken });
    if (token === renderToken) cleanup = fn;
    else if (typeof fn === 'function') fn(); // user already navigated away
  } catch (e) {
    if (token !== renderToken) return;
    console.error(e);
    view.innerHTML = `<div class="page"><p class="empty">画面の表示中にエラーが発生しました。<br><small>${esc(e.message || e)}</small></p></div>`;
  }
}
