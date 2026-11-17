// 授業をつくる #/teach (docs/plan.md 提案11), for the teacher; its entry is
// in その他 when くわしい表示 is on. It edits a draft of the lesson plan kept
// on this device (localStorage), never the files themselves:
//   - lessons: add, delete, reorder; title and 身近な話題
//   - parts of a lesson: add from the catalog (or a molecule, or a topic
//     card with words only), reorder, remove
//   - questions of the colour card and おわりの3問, from the question bank
//   - この端末でためす: the whole app uses the draft on this device
//   - 書き出す: download the plan file (and copy it) to put on GitHub as
//     data/plans/<年度>.json
import { esc, el as h, prefs, toast } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { goBack, setQuery } from '../core/router.js';
import { lessonPlan, questions, compounds } from '../core/data.js';
import { resolvePart, catalogGroups } from '../lesson/catalog.js';

const KEY = 'teach:draft';
const load = () => { try { return JSON.parse(prefs.get(KEY, 'null')); } catch (e) { return null; } };
const save = (d) => prefs.set(KEY, JSON.stringify(d));
const partId = (p) => (typeof p === 'string' ? p : p.use || null);

export async function renderTeach({ el, query }) {
  let draft = load() || structuredClone(await lessonPlan({ file: true }));
  const qbank = await questions();
  let open = query.get('no') ? +query.get('no') : null; // lesson being edited
  const using = () => prefs.get('teach:use', '') === '1';

  el.innerHTML = `<div class="page"><div class="subbar"><button class="iconbtn" data-act="back" aria-label="戻る">${icon('back')}</button><h1>授業をつくる</h1></div><div class="content"></div></div>`;
  const content = el.querySelector('.content');
  el.querySelector('[data-act="back"]').addEventListener('click', () => (open !== null ? show(null) : goBack('#/more')));

  function show(no) { open = no; setQuery(no === null ? {} : { no: String(no) }); draw(); }
  function commit() { save(draft); draw(); }
  const lessonOf = (no) => draft.lessons.find((l) => l.no === no);

  async function draw() {
    if (open === null) return drawList();
    const l = lessonOf(open);
    if (!l) return show(null);
    const parts = await Promise.all((l.parts || []).map(async (p) => ({ p, r: await resolvePart(p) })));
    const qsel = (key, max) => `<div class="tc-qs">${(l[key] || []).map((id, k) => {
      const q = qbank.get(id);
      return `<div class="tc-row"><span class="tc-t">${q ? esc(q.q) : `<span class="tc-bad">${esc(id)}（問題集にない）</span>`}</span><button class="iconbtn" data-q="${key}" data-del="${k}" aria-label="外す">${icon('close')}</button></div>`;
    }).join('')}${(l[key] || []).length < max ? `<button class="btn block" data-addq="${key}">${icon('quiz')}問題を選ぶ</button>` : ''}</div>`;
    content.innerHTML = `
      <label class="tc-field"><span>第何回</span><input type="number" min="1" max="99" data-f="no" value="${l.no}" inputmode="numeric"></label>
      <label class="tc-field"><span>題名</span><input data-f="title" value="${esc(l.title || '')}"></label>
      <label class="tc-field"><span>身近な話題</span><textarea data-f="topic" rows="3">${esc(l.topic || '')}</textarea></label>
      <h2 class="ls-sec">きょうの流れ（上から順に）</h2>
      <div class="tc-parts">${parts.map(({ p, r }, k) => `<div class="tc-row"><span class="ls-n">${k + 1}</span><span class="tc-t">${r ? `<b>${esc(r.title)}</b><span class="ls-tag">${esc(r.tag)}</span>` : `<span class="tc-bad">${esc(partId(p) || '?')}（使えない部品）</span>`}</span>
        <button class="iconbtn" data-mv="${k}" data-d="-1" aria-label="上へ"${k ? '' : ' disabled'}>↑</button><button class="iconbtn" data-mv="${k}" data-d="1" aria-label="下へ"${k < parts.length - 1 ? '' : ' disabled'}>↓</button><button class="iconbtn" data-rm="${k}" aria-label="外す">${icon('close')}</button></div>`).join('')}</div>
      <div class="two" style="margin-top:8px"><button class="btn" data-act="addpart">${icon('build')}部品を足す</button><button class="btn" data-act="addcard">話題カードを足す</button></div>
      <h2 class="ls-sec">いっせい問題（色カード）</h2>${qsel('colorcards', 6)}
      <h2 class="ls-sec">おわりの3問</h2>${qsel('end3', 3)}
      <button class="btn block tc-danger" data-act="dellesson" style="margin-top:20px">この回を消す</button>`;
  }

  function drawList() {
    const sorted = [...draft.lessons].sort((a, b) => a.no - b.no);
    content.innerHTML = `
      <p class="small muted" style="margin:0 4px 10px">授業プランの<b>下書き</b>をこの端末で直します。書き出したファイルを GitHub に置くまで、学生の画面は変わりません。</p>
      <div class="tc-bar">
        <button class="btn${using() ? ' primary' : ''}" data-act="use">${using() ? '✓ この端末でためし中' : 'この端末でためす'}</button>
        <button class="btn" data-act="export">${icon('share')}書き出す</button>
      </div>
      <label class="tc-field"><span>年度の名前</span><input data-plan="label" value="${esc(draft.label || '')}"></label>
      <div class="ls-list">${sorted.map((l) => `<button data-open="${l.no}"><span class="ls-no">${l.no}</span><span class="ls-tx"><b>${esc(l.title || '（題名なし）')}</b><span>${(l.parts || []).length} 部品 ・ 問題 ${(l.colorcards || []).length + (l.end3 || []).length}</span></span>${icon('chev')}</button>`).join('')}</div>
      <div class="two" style="margin-top:10px"><button class="btn" data-act="addlesson">回を足す</button><button class="btn tc-danger" data-act="reset">ファイルの内容にもどす</button></div>`;
  }

  // ---- pickers (bottom sheets)
  function sheet(title, html, onPick) {
    const back = h(`<div class="sheet-backdrop" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="sheet"><div class="grab"></div><h2>${esc(title)}</h2>${html}<button class="btn block" data-x="close" style="margin-top:12px">閉じる</button></div></div>`);
    const close = () => { back.remove(); window.removeEventListener('hashchange', close); };
    back.addEventListener('click', (e) => {
      if (e.target === back || e.target.closest('[data-x="close"]')) return close();
      const b = e.target.closest('[data-pick]');
      if (b) { close(); onPick(b.dataset.pick); }
    });
    back.addEventListener('input', async (e) => {
      if (!e.target.matches('[data-search]')) return;
      const q = e.target.value.trim();
      const list = q ? (await compounds()).filter((c) => c.name_ja.includes(q) || (c.reading || '').includes(q)).slice(0, 20) : [];
      back.querySelector('.tc-found').innerHTML = list.map((c) => `<button class="chip" data-pick="compound:${c.id}">${esc(c.name_ja)}</button>`).join('');
    });
    window.addEventListener('hashchange', close);
    document.body.append(back);
  }

  async function pickPart(l) {
    const groups = await catalogGroups();
    const rows = await Promise.all(groups.map(async (g) => `<h3 class="pick-h">${esc(g.label)}</h3><div class="pick-row">${(await Promise.all(g.ids.map(async (id) => { const r = await resolvePart(id); return r ? `<button class="chip" data-pick="${esc(id)}">${esc(r.title)}</button>` : ''; }))).join('')}</div>`));
    sheet('部品を足す', `<h3 class="pick-h">分子（名前でさがす）</h3><input class="tc-search" data-search placeholder="例: エタノール" aria-label="分子の名前"><div class="pick-row tc-found"></div>${rows.join('')}`, (id) => {
      l.parts = [...(l.parts || []), id];
      commit();
    });
  }

  function pickQuestion(l, key) {
    const all = [...qbank.values()];
    const mine = all.filter((q) => q.lesson === l.no);
    const others = all.filter((q) => q.lesson !== l.no);
    const btn = (q) => `<button class="tc-qbtn" data-pick="${esc(q.id)}"><span class="small muted">第${q.lesson}回</span>${esc(q.q)}</button>`;
    sheet('問題を選ぶ', `<p class="small muted">問題そのものは data/questions.json にあります（ここでは選ぶだけ）。</p><h3 class="pick-h">この回の問題</h3>${mine.map(btn).join('') || '<p class="small muted">なし</p>'}<h3 class="pick-h">ほかの回の問題</h3>${others.map(btn).join('')}`, (id) => {
      l[key] = [...(l[key] || []), id];
      commit();
    });
  }

  function exportPlan() {
    const text = JSON.stringify(draft, null, 1) + '\n';
    const name = `${draft.id || 'plan'}.json`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    navigator.clipboard?.writeText(text).catch(() => {});
    sheet('書き出しました', `<p class="tc-help">ファイル <b>${esc(name)}</b> を保存しました（同じ内容をコピーもしました）。<br>GitHub の <b>data/plans/${esc(name)}</b> を開き、鉛筆のボタンで中身をすべて置きかえて「Commit changes」を押すと、学生の画面にも反映されます。くわしくは教員向けガイド「1-4b」。</p>`, () => {});
  }

  content.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const l = open !== null ? lessonOf(open) : null;
    if (b.dataset.open) return show(+b.dataset.open);
    const a = b.dataset.act;
    if (a === 'use') { prefs.set('teach:use', using() ? null : '1'); save(draft); toast(using() ? 'この端末では下書きのプランで表示します' : 'ファイルのプランにもどしました'); return draw(); }
    if (a === 'export') return exportPlan();
    if (a === 'addlesson') { const no = Math.max(0, ...draft.lessons.map((x) => x.no)) + 1; draft.lessons.push({ no, title: '', topic: '', parts: [], colorcards: [], end3: [] }); save(draft); return show(no); }
    if (a === 'reset') {
      if (!confirm('この端末の下書きを消して、ファイルの内容にもどしますか？')) return;
      prefs.set(KEY, null); prefs.set('teach:use', null);
      return lessonPlan({ file: true }).then((p) => { draft = structuredClone(p); draw(); });
    }
    if (!l) return;
    if (a === 'addpart') return pickPart(l);
    if (a === 'addcard') { const t = prompt('話題カードに書く文（例: 果物の香りはエステル）'); if (t && t.trim()) { l.parts = [...(l.parts || []), { card: t.trim() }]; commit(); } return; }
    if (a === 'dellesson') { if (confirm(`第${l.no}回を下書きから消しますか？`)) { draft.lessons = draft.lessons.filter((x) => x !== l); save(draft); show(null); } return; }
    if (b.dataset.mv !== undefined) { const k = +b.dataset.mv; const j = k + +b.dataset.d; [l.parts[k], l.parts[j]] = [l.parts[j], l.parts[k]]; return commit(); }
    if (b.dataset.rm !== undefined) { l.parts.splice(+b.dataset.rm, 1); return commit(); }
    if (b.dataset.addq) return pickQuestion(l, b.dataset.addq);
    if (b.dataset.del !== undefined) { l[b.dataset.q].splice(+b.dataset.del, 1); return commit(); }
  });
  content.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.plan) { draft[t.dataset.plan] = t.value; save(draft); return; }
    const l = open !== null ? lessonOf(open) : null;
    if (!l || !t.dataset.f) return;
    if (t.dataset.f === 'no') {
      const no = parseInt(t.value, 10);
      if (!no || draft.lessons.some((x) => x !== l && x.no === no)) { toast('その回の番号はもう使われています'); t.value = l.no; return; }
      l.no = no; open = no; setQuery({ no: String(no) });
    } else l[t.dataset.f] = t.value;
    save(draft);
  });
  draw();
  return null;
}
