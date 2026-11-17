// 用語集 (docs/plan.md 提案6): data/glossary.json. linkTerms(text) returns
// HTML where the first appearance of each term is a button; a tap shows the
// short explanation in a sheet (installed once, for the whole app). The
// longest word wins (原子量 before 原子) and the "nolink" words (二酸化炭素,
// 塩化 ...) are left alone, so 酸化 is not found inside 二酸化炭素.
import { esc, el as h } from '../core/dom.js';

let data = null;
let re = null;
let byTerm = null;

export async function glossary() {
  if (!data) {
    const r = await fetch(new URL('../../data/glossary.json', import.meta.url));
    data = r.ok ? await r.json() : { terms: [], nolink: [] };
    byTerm = new Map(data.terms.map((t) => [t.term, t]));
    const words = [...data.terms.map((t) => t.term), ...(data.nolink || [])].sort((a, b) => b.length - a.length);
    re = words.length ? new RegExp(words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g') : null;
    installSheet();
  }
  return data;
}

// plain text -> HTML with the first appearance of each term as a button
// (skip: a term not to link, e.g. the one being explained)
export function linkTerms(text, { skip = null } = {}) {
  const s = String(text ?? '');
  if (!re) return esc(s);
  const seen = new Set();
  let out = '';
  let last = 0;
  for (const m of s.matchAll(re)) {
    const t = byTerm.get(m[0]);
    if (!t || seen.has(t.term) || t.term === skip) continue; // a nolink word, linked already, or skipped
    seen.add(t.term);
    out += esc(s.slice(last, m.index)) + `<button class="gl-term" data-term="${esc(t.term)}">${esc(m[0])}</button>`;
    last = m.index + m[0].length;
  }
  return out + esc(s.slice(last));
}

function installSheet() {
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.gl-term');
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    const t = byTerm.get(b.dataset.term);
    if (!t) return;
    const back = h(`<div class="sheet-backdrop" role="dialog" aria-modal="true" aria-label="${esc(t.term)}"><div class="sheet gl-sheet"><div class="grab"></div>
      <h2>${esc(t.term)}<span class="gl-yomi">${esc(t.reading)}</span></h2>
      <p>${esc(t.text)}${(t.reviewed ?? data.reviewed) ? '' : '<span class="draft" title="教員による確認前の下書きです">下書き</span>'}</p>
      <div class="two"><a class="btn" href="#/glossary?q=${encodeURIComponent(t.term)}">用語集で見る</a><button class="btn primary" data-x="close">閉じる</button></div></div></div>`);
    const close = () => { back.remove(); window.removeEventListener('hashchange', close); };
    back.addEventListener('click', (ev) => { if (ev.target === back || ev.target.closest('[data-x="close"], a')) close(); });
    window.addEventListener('hashchange', close);
    document.body.append(back);
  }, true);
}
