// 組成式パズル #/lab/formula?g=0..|free (sort-and-arrange type).
// Tap ions into the tray (tap again to take one out). The sum of the
// charges is always shown; when it is 0 with one kind of + and one kind
// of − ion, the composition formula and the name appear. The ions and the
// tasks (おだい) are in data/labs.json "formula".
import { esc } from '../core/dom.js';
import { setQuery } from '../core/router.js';
import { labs } from '../core/data.js';

const MAX = 6;
const SUBS = '₀₁₂₃₄₅₆₇₈₉';
const sub = (s) => String(s).replace(/\d/g, (d) => SUBS[d]);
const charge = (n) => `${Math.abs(n) > 1 ? Math.abs(n) : ''}${n > 0 ? '+' : '−'}`;
const signed = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}`;

function ionTile(ion, { small = false, idx = null } = {}) {
  const marks = Array.from({ length: Math.abs(ion.charge) }, () => `<i>${ion.charge > 0 ? '+' : '−'}</i>`).join('');
  const attr = idx === null ? `data-add="${esc(ion.id)}"` : `data-out="${idx}"`;
  const label = `${ion.symbol} ${ion.charge > 0 ? 'プラス' : 'マイナス'}${Math.abs(ion.charge) > 1 ? Math.abs(ion.charge) : ''}${idx === null ? 'を入れる' : 'を出す'}`;
  return `<button class="fp-ion ${ion.charge > 0 ? 'pos' : 'neg'}${small ? ' sm' : ''}" ${attr} aria-label="${esc(label)}"><b>${sub(ion.symbol)}<sup>${charge(ion.charge)}</sup></b><span class="fp-marks">${marks}</span></button>`;
}

// composition formula and name, or null unless exactly one cation and one anion kind
export function compose(tray, ions) {
  const byId = new Map(ions.map((i) => [i.id, i]));
  const count = new Map();
  tray.forEach((id) => count.set(id, (count.get(id) || 0) + 1));
  const kinds = [...count.keys()].map((id) => byId.get(id));
  const cat = kinds.filter((i) => i.charge > 0);
  const an = kinds.filter((i) => i.charge < 0);
  const total = tray.reduce((s, id) => s + byId.get(id).charge, 0);
  if (cat.length !== 1 || an.length !== 1 || total !== 0) return { total, cat, an, formula: null };
  const nc = count.get(cat[0].id);
  const na = count.get(an[0].id);
  // simplest ratio (e.g. Mg2+ Mg2+ O2- O2- -> MgO)
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const g = gcd(nc, na);
  const part = (ion, n) => (n === 1 ? ion.symbol : ion.group ? `(${ion.symbol})${n}` : `${ion.symbol}${n}`);
  return { total, cat, an, formula: part(cat[0], nc / g) + part(an[0], na / g), name: `${an[0].name}${cat[0].name}`, cation: cat[0].id, anion: an[0].id, reduced: g > 1 };
}

export async function render({ content, query }) {
  const { formula: data } = await labs();
  const ions = data.ions;
  const byId = new Map(ions.map((i) => [i.id, i]));
  const goals = data.goals;
  let gi = query.get('g') === 'free' ? -1 : Math.min(Math.max(parseInt(query.get('g') || '0', 10) || 0, 0), goals.length - 1);
  let tray = [];
  const draft = data.reviewed ? '' : '<span class="draft" title="教員による確認前の下書きです">下書き</span>';

  function draw() {
    const goal = gi >= 0 ? goals[gi] : null;
    const r = compose(tray, ions);
    let say;
    if (!tray.length) say = '＋と−の合計が 0 になれば できあがり。';
    else if (r.formula) {
      const ok = !goal || (goal.cation === r.cation && goal.anion === r.anion);
      say = ok ? '' : `できたのは「${esc(r.name)}」。おだいは別の物質です。`;
    } else if (r.cat.length > 1 || r.an.length > 1) say = '＋のイオンも −のイオンも、1種類ずつで作ろう。';
    else if (!r.cat.length) say = '＋のイオンも入れよう。';
    else if (!r.an.length) say = '−のイオンも入れよう。';
    else say = `まだ <b>${signed(r.total)}</b>。${r.total > 0 ? '−' : '＋'}のイオンが たりない。`;
    const done = r.formula && (!goal || (goal.cation === r.cation && goal.anion === r.anion));
    content.innerHTML = `
      <div class="chips-row" role="group" aria-label="おだい">${goals.map((_, k) => `<button class="chip" data-g="${k}" aria-pressed="${k === gi}">おだい${k + 1}</button>`).join('')}<button class="chip" data-g="free" aria-pressed="${gi < 0}">自由に</button></div>
      <div class="fp-goal">${goal ? `<span>おだい ${gi + 1}${goal.reviewed ? '' : draft}</span><b>${esc(goal.text)}</b>` : '<span>自由に</span><b>＋と−のイオンを組み合わせて、物質をつくろう</b>'}</div>
      <div class="fp-tray${done ? ' ok' : ''}" aria-label="入れたイオン">${tray.length ? tray.map((id, k) => ionTile(byId.get(id), { idx: k })).join('') : '<span class="muted small">下のイオンをタップして入れる</span>'}</div>
      <div class="fp-meter" aria-live="polite">${tray.length ? `${tray.map((id) => { const c = byId.get(id).charge; return `<span class="${c > 0 ? 'p' : 'n'}">${signed(c)}</span>`; }).join('<em>＋</em>')}<em>＝</em><span class="t${r.total === 0 ? ' ok' : ''}">${signed(r.total) || '0'}</span>` : '<span class="muted">イオンを入れると、ここで電気の合計がわかる</span>'}</div>
      ${r.formula ? `<div class="fp-done${done ? '' : ' other'}"><div class="fp-f">${esc(sub(r.formula))}</div><div>${esc(r.name)}${done ? '　<b>＋と−が つりあった！</b>' : ''}</div>${r.reduced ? '<div class="small muted">組成式は、いちばん簡単な整数の比で書きます。</div>' : ''}</div>` : ''}
      ${say ? `<p class="lb-say">${say}</p>` : ''}
      <div class="fp-pal">
        <div><span class="small muted">＋のイオン</span>${ions.filter((i) => i.charge > 0).map((i) => ionTile(i, { small: true })).join('')}</div>
        <div><span class="small muted">−のイオン</span>${ions.filter((i) => i.charge < 0).map((i) => ionTile(i, { small: true })).join('')}</div>
      </div>
      ${tray.length ? '<button class="btn block" data-act="clear" style="margin-top:12px">ぜんぶ出す</button>' : ''}`;
  }

  content.addEventListener('click', (e) => {
    const b = e.target.closest('[data-add],[data-out],[data-g],[data-act]');
    if (!b) return;
    if (b.dataset.add && tray.length < MAX) tray.push(b.dataset.add);
    else if (b.dataset.out !== undefined) tray.splice(+b.dataset.out, 1);
    else if (b.dataset.g !== undefined) { gi = b.dataset.g === 'free' ? -1 : +b.dataset.g; tray = []; setQuery({ g: gi < 0 ? 'free' : String(gi) }); }
    else if (b.dataset.act === 'clear') tray = [];
    draw();
  });
  draw();
  return null;
}
