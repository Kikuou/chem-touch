// 温度と三態 #/lab/states?s=water|ethanol|carbon-dioxide (slider type).
// Move the temperature: the molecules vibrate in place (solid), move
// around while staying together (liquid) or fly apart (gas). Melting and
// boiling points (1 atm) come from PubChem via data/states.json; carbon
// dioxide sublimes. With "reduce motion" the picture does not move.
import { esc } from '../core/dom.js';
import { setQuery } from '../core/router.js';
import { states } from '../core/data.js';

const W = 320;
const H = 230;
const PAD = 12;
const O = '#E5484D';
const C = '#4B5563';
const HY = '#F2F3F5';

// molecule glyphs, centred on 0,0
const at = (x, y, r, fill) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"${fill === HY ? ' stroke="#9AA3AE" stroke-width=".8"' : ''}/>`;
const GLYPH = {
  water: { r: 11, n: 40, svg: at(5.2, 6.7, 4.2, HY) + at(5.2, -6.7, 4.2, HY) + at(0, 0, 7.5, O) },
  ethanol: { r: 14, n: 28, svg: at(-10, 1, 6.5, C) + at(1, -3, 6.5, C) + at(12, 2, 6, O) + at(18.5, -2, 3.4, HY) },
  'carbon-dioxide': { r: 14, n: 34, svg: at(-11, 0, 6, O) + at(0, 0, 6.5, C) + at(11, 0, 6, O) },
};
const NAMES = {
  water: { solid: '氷', liquid: '水', gas: '水蒸気' },
  'carbon-dioxide': { solid: 'ドライアイス' },
};
const MOVE = { solid: 'その場で ふるえている', liquid: 'くっついたまま 動きまわる', gas: 'ばらばらに 飛びまわる' };
const LABEL = { solid: '固体', liquid: '液体', gas: '気体' };
const COLOR = { solid: '#3B82F6', liquid: '#2F6F4F', gas: '#C2410C' };

const fmt = (v) => `${v < 0 ? '−' : ''}${Math.abs(Math.round(v * 10) / 10)}`;
const val = (x) => (x && typeof x.value === 'number' ? x.value : null);

function stateAt(s, t) {
  if (s.kind === 'sublime') return t < val(s.sublimes) ? 'solid' : 'gas';
  return t < val(s.mp) ? 'solid' : t < val(s.bp) ? 'liquid' : 'gas';
}

function rangeOf(s) {
  if (s.kind === 'sublime') {
    const p = val(s.sublimes);
    return [Math.floor((p - 40) / 10) * 10, Math.max(Math.ceil((p + 40) / 10) * 10, 40)];
  }
  return [Math.floor((val(s.mp) - 30) / 10) * 10, Math.ceil((val(s.bp) + 30) / 10) * 10];
}

const ready = (s) => (s.kind === 'sublime' ? val(s.sublimes) !== null : val(s.mp) !== null && val(s.bp) !== null);

export async function render({ content, query }) {
  const list = await states();
  let sub = list.find((x) => x.id === query.get('s')) || list[0];
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let temp = 25;
  let raf = 0;
  let parts = [];
  let state = null;
  let last = 0;
  const liquidTop = H - PAD - 120;

  content.innerHTML = `
    <div class="chips-row lb-subs" role="group" aria-label="物質">${list.map((x) => `<button class="chip" data-s="${x.id}">${esc(x.name)}</button>`).join('')}</div>
    <div class="lb-body"></div>`;
  const body = content.querySelector('.lb-body');

  function lattice(g) {
    // rows from the bottom of the box, like ice sitting in a cup
    const step = g.r * 2.3;
    const cols = Math.floor((W - 2 * PAD) / step);
    const out = [];
    for (let k = 0; k < g.n; k++) {
      const row = Math.floor(k / cols);
      const col = k % cols;
      out.push({ x: PAD + step / 2 + col * step + (row % 2 ? step / 4 : -step / 4), y: H - PAD - step / 2 - row * step * 0.92, a: row % 2 ? 0.5 : -0.5 });
    }
    return out;
  }

  function setup() {
    cancelAnimationFrame(raf);
    const g = GLYPH[sub.id];
    if (!ready(sub) || !g) {
      body.innerHTML = `<p class="empty">${esc(sub.name)}の融点・沸点を PubChem で確認中です。</p>`;
      return;
    }
    const [lo, hi] = rangeOf(sub);
    temp = Math.min(Math.max(temp, lo), hi);
    // where the thumb centre is for a value (the thumb is 36px wide)
    const pos = (v) => `calc(18px + (100% - 36px) * ${((v - lo) / (hi - lo)).toFixed(4)})`;
    const ticks = sub.kind === 'sublime'
      ? [[val(sub.sublimes), '昇華（固体→気体）']]
      : [[val(sub.mp), 'とける'], [val(sub.bp), 'ふっとう']];
    const src = sub.kind === 'sublime' ? [sub.sublimes] : [sub.mp, sub.bp];
    body.innerHTML = `
      <div class="lb-read"><span class="lb-big" aria-live="polite"></span><span class="lb-chip"></span></div>
      <div class="lb-stage"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(sub.name)}の分子のようす">
        <rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="14" fill="var(--surface)" stroke="var(--line)" stroke-width="2"/>
        <rect class="lb-liq" x="6" y="${liquidTop - 6}" width="${W - 12}" height="${H - liquidTop}" rx="10" fill="#D9ECF7"/>
        <g class="lb-mols">${Array.from({ length: g.n }, () => `<g>${g.svg}</g>`).join('')}</g>
      </svg></div>
      <p class="lb-say"></p>
      <div class="lb-slider">
        <input type="range" class="lb-range" min="${lo}" max="${hi}" step="1" value="${temp}" aria-label="温度（℃）">
        ${ticks.map(([v, t]) => `<span class="lb-tick" style="left:${pos(v)}"><i></i>${fmt(v)} ℃<br><small>${t}</small></span>`).join('')}
      </div>
      <p class="lb-foot">スライダーで温度を変えてみよう（1気圧）。${sub.kind === 'sublime' ? '<br>二酸化炭素は1気圧では液体にならず、固体から直接気体になる（昇華）。' : ''}</p>
      <p class="credit">${sub.kind === 'sublime' ? `昇華する温度 ${fmt(val(sub.sublimes))} ℃` : `融点 ${fmt(val(sub.mp))} ℃・沸点 ${fmt(val(sub.bp))} ℃`}（1気圧）。出典: PubChem（${esc([...new Set(src.map((x) => x.source))].join('、'))}）</p>`;
    const nodes = [...body.querySelectorAll('.lb-mols > g')];
    const lat = lattice(g);
    parts = nodes.map((node, i) => ({ node, x: lat[i].x, y: lat[i].y, vx: 0, vy: 0, a: lat[i].a, w: 0, home: lat[i], ph: Math.random() * 6.3 }));
    state = null;
    body.querySelector('.lb-range').addEventListener('input', (e) => { temp = +e.target.value; update(); });
    update();
    if (!still) { last = 0; raf = requestAnimationFrame(tick); }
  }

  function enter(st) {
    // give the molecules what the new state needs
    for (const p of parts) {
      if (st === 'gas') {
        const a = Math.random() * 6.3;
        const v = 90 + Math.random() * 60;
        p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v; p.w = (Math.random() - 0.5) * 6;
      } else if (st === 'liquid') {
        p.vx *= 0.2; p.vy *= 0.2; p.w = (Math.random() - 0.5) * 2;
      }
      if (still) {
        if (st === 'solid') { p.x = p.home.x; p.y = p.home.y; p.a = p.home.a; }
        if (st === 'liquid') { p.x = PAD + 14 + Math.random() * (W - 2 * PAD - 28); p.y = liquidTop + 10 + Math.random() * (H - PAD - liquidTop - 20); p.a = Math.random() * 6.3; }
        if (st === 'gas') { p.x = PAD + 20 + Math.random() * (W - 2 * PAD - 40); p.y = PAD + 20 + Math.random() * (H - 2 * PAD - 40); p.a = Math.random() * 6.3; }
      }
    }
  }

  function update() {
    const st = stateAt(sub, temp);
    body.querySelector('.lb-big').textContent = `${fmt(temp)} ℃`;
    const chip = body.querySelector('.lb-chip');
    const nm = NAMES[sub.id]?.[st];
    chip.textContent = `${LABEL[st]}${nm ? `（${nm}）` : ''}`;
    chip.style.background = COLOR[st];
    body.querySelector('.lb-say').innerHTML = `${esc(sub.name)}の分子が <b>${MOVE[st]}</b>。`;
    body.querySelector('.lb-liq').style.display = st === 'liquid' ? '' : 'none';
    if (st !== state) { state = st; enter(st); }
    if (still) draw(0);
  }

  function draw(t) {
    for (const p of parts) {
      let { x, y } = p;
      if (state === 'solid') {
        // vibrate around the place in the crystal; a bit more when warmer
        const amp = 0.8 + Math.max(0, Math.min(1, (temp - rangeOf(sub)[0]) / 60)) * 1.6;
        x = p.home.x + (still ? 0 : Math.sin(t * 0.018 + p.ph) * amp);
        y = p.home.y + (still ? 0 : Math.cos(t * 0.021 + p.ph * 1.3) * amp);
        p.x = x; p.y = y; p.a = p.home.a;
      }
      p.node.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(p.a * 57.3).toFixed(0)})`);
    }
  }

  function tick(t) {
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
    last = t;
    const [lo, hi] = rangeOf(sub);
    const warm = (temp - lo) / (hi - lo);
    if (state === 'liquid') {
      const sp = 22 + warm * 30;
      for (const p of parts) {
        p.vx += (Math.random() - 0.5) * sp * 0.9;
        p.vy += (Math.random() - 0.5) * sp * 0.9 + (p.y < liquidTop ? 140 * dt * 10 : 0); // fall into the liquid
        p.vx *= 0.9; p.vy *= 0.9;
        p.x += p.vx * dt; p.y += p.vy * dt; p.a += p.w * dt;
        if (p.x < PAD + 12) { p.x = PAD + 12; p.vx = Math.abs(p.vx); }
        if (p.x > W - PAD - 12) { p.x = W - PAD - 12; p.vx = -Math.abs(p.vx); }
        if (p.y > H - PAD - 10) { p.y = H - PAD - 10; p.vy = -Math.abs(p.vy); }
        if (p.y < liquidTop + 6 && p.vy < 0 && p.y > liquidTop - 30) p.vy = Math.abs(p.vy);
      }
    } else if (state === 'gas') {
      const f = 0.8 + warm * 0.6;
      for (const p of parts) {
        p.x += p.vx * f * dt; p.y += p.vy * f * dt; p.a += p.w * dt;
        if (p.x < PAD + 12 || p.x > W - PAD - 12) { p.vx = -p.vx; p.x = Math.min(Math.max(p.x, PAD + 12), W - PAD - 12); }
        if (p.y < PAD + 12 || p.y > H - PAD - 12) { p.vy = -p.vy; p.y = Math.min(Math.max(p.y, PAD + 12), H - PAD - 12); }
      }
    } else if (state === 'solid') {
      // move back into the crystal smoothly after melting / sublimation
      for (const p of parts) {
        const dx = p.home.x - p.x;
        const dy = p.home.y - p.y;
        if (Math.abs(dx) + Math.abs(dy) > 1.5) { p.x += dx * Math.min(1, dt * 6); p.y += dy * Math.min(1, dt * 6); p.node.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${(p.home.a * 57.3).toFixed(0)})`); p.moving = true; } else p.moving = false;
      }
      if (parts.some((p) => p.moving)) { raf = requestAnimationFrame(tick); return; }
    }
    draw(t);
    raf = requestAnimationFrame(tick);
  }

  content.addEventListener('click', (e) => {
    const b = e.target.closest('[data-s]');
    if (!b) return;
    sub = list.find((x) => x.id === b.dataset.s) || sub;
    temp = 25;
    paintChips();
    setQuery({ s: sub.id });
    setup();
  });
  function paintChips() {
    content.querySelectorAll('[data-s]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.s === sub.id));
  }
  paintChips();
  setup();
  return () => cancelAnimationFrame(raf);
}
