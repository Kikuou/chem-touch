// "その他": display settings, about, data sources and licences.
import { prefs } from '../core/dom.js';
import { icon } from '../core/icons.js';

const LIBS = [
  ['3Dmol.js', '2.5.4', 'BSD-3-Clause', '3D分子表示', 'https://3dmol.csb.pitt.edu/'],
  ['RDKit.js (MinimalLib)', '2026.03.6', 'BSD-3-Clause', '2D構造式・SMILES解析・官能基判定', 'https://www.rdkit.org/'],
  ['qrcode-generator', '2.0.4', 'MIT', 'QRコード生成', 'https://github.com/kazuhikoarase/qrcode-generator'],
  ['jsQR', '1.4.0', 'Apache-2.0', 'QRコード読み取り（iPhone等）', 'https://github.com/cozmo/jsQR'],
];

export function applyTheme(t) {
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  prefs.set('theme', t === 'auto' ? null : t);
  window.dispatchEvent(new Event('chemtouch:theme'));
}

export function renderMore({ el }) {
  const theme = prefs.get('theme', 'auto');
  el.innerHTML = `
  <div class="page">
    <header class="topbar"><h1 class="brand" style="font-size:20px">その他</h1></header>
    <h2 class="section-title">表示</h2>
    <div class="menu">
      <div class="row">${icon('moon')}<span>テーマ</span>
        <div class="seg" role="group" aria-label="テーマ">
          ${[['auto', '自動'], ['light', 'ライト'], ['dark', 'ダーク']].map(([k, l]) => `<button data-theme="${k}" aria-pressed="${theme === k}">${l}</button>`).join('')}
        </div>
      </div>
    </div>
    <h2 class="section-title">機能</h2>
    <div class="menu">
      <a href="#/library">${icon('hex')}<span>分子ライブラリ</span></a>
      <a href="#/compare">${icon('compare')}<span>くらべる（準備中）</span></a>
      <a href="#/electron">${icon('shell')}<span>電子配置（準備中）</span></a>
      <a href="#/scan">${icon('qr')}<span>QRコードを読み取る</span></a>
    </div>
    <h2 class="section-title">このアプリについて</h2>
    <div class="card prose">
      <p>ケミタッチ（仮称）は、旭川市立大学 共通教養科目「化学」のための学習アプリです。ログインは不要で、個人情報やアクセス記録は収集しません。端末に保存するのは表示設定だけです。</p>
      <h3>データの出典</h3>
      <ul>
        <li>化合物の構造は <a href="https://pubchem.ncbi.nlm.nih.gov/" target="_blank" rel="noopener">PubChem</a>（米国国立医学図書館、パブリックドメイン）で照合しています。照合前のデータには「未照合」と表示します。</li>
        <li>3D座標は PubChem の3D配座、または RDKit（ETKDG + MMFF94）で生成したものです。</li>
        <li>「ひとこと解説」に「下書き」と表示されているものは、教員による確認前の文章です。</li>
      </ul>
      <h3>使用しているライブラリ</h3>
      <table class="lic"><thead><tr><th>名称</th><th>ライセンス</th><th>用途</th></tr></thead><tbody>
        ${LIBS.map(([n, v, l, u, href]) => `<tr><td><a href="${href}" target="_blank" rel="noopener">${n}</a><br><span class="muted small">${v}</span></td><td>${l}</td><td>${u}</td></tr>`).join('')}
      </tbody></table>
      <p class="small muted" style="margin-top:8px">ライセンス本文は vendor/ 以下の各フォルダにあります。</p>
    </div>
  </div>`;
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-theme]');
    if (!b) return;
    el.querySelectorAll('[data-theme]').forEach((x) => x.setAttribute('aria-pressed', x === b));
    applyTheme(b.dataset.theme);
  });
}
