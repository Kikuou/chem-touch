// 金属と自由電子 #/lab/metal (particle type, lesson 6). Metal ions (+) sit in
// rows; free electrons (−) move among them. "電池をつなぐ" makes the
// electrons drift one way: that is an electric current. With "reduce
// motion" the electrons stand still (arrows show the drift).
const W = 320;
const H = 200;

export async function render({ content }) {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let on = false;
  let raf = 0;
  let last = 0;
  const ions = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 7; c++) ions.push({ x: 38 + c * 41, y: 40 + r * 40 });
  const els = Array.from({ length: 28 }, () => ({ x: 20 + Math.random() * (W - 40), y: 22 + Math.random() * (H - 44), vx: (Math.random() - 0.5) * 120, vy: (Math.random() - 0.5) * 120 }));

  content.innerHTML = `
    <div class="lb-stage"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="金属の中の陽イオンと自由電子">
      <rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="14" fill="#E9ECEF" stroke="var(--line)" stroke-width="2"/>
      ${ions.map((p) => `<g transform="translate(${p.x} ${p.y})"><circle r="13" fill="#9AA3AE"/><text y="5" text-anchor="middle" font-size="16" font-weight="800" fill="#fff">+</text></g>`).join('')}
      <g class="mt-arrows" stroke="#2C7DA0" stroke-width="2.5" fill="none"></g>
      <g class="mt-e">${els.map(() => '<circle r="5" fill="#2C7DA0"/>').join('')}</g>
    </svg></div>
    <p class="lb-say"></p>
    <button class="btn primary block mt-btn" data-act="toggle"></button>
    <p class="lb-foot">● 灰色＝金属の陽イオン、● 青＝自由電子。自由電子は特定の原子にしばられず、金属全体を動きまわる。</p>`;
  const nodes = [...content.querySelectorAll('.mt-e circle')];

  function paint() {
    els.forEach((e, k) => { nodes[k].setAttribute('cx', e.x.toFixed(1)); nodes[k].setAttribute('cy', e.y.toFixed(1)); });
    content.querySelector('.mt-arrows').innerHTML = on && still ? [60, 100, 140].map((y) => `<path d="M40 ${y} H280 M270 ${y - 8} L282 ${y} L270 ${y + 8}"/>`).join('') : '';
    content.querySelector('.lb-say').innerHTML = on ? '自由電子が <b>そろって一方向へ</b> 動く。これが電流（電子の流れ）。' : '自由電子が <b>あちこち動きまわっている</b>。';
    content.querySelector('.mt-btn').textContent = on ? '電池をはずす' : '電池をつなぐ';
  }
  function tick(t) {
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
    last = t;
    for (const e of els) {
      e.vx += (Math.random() - 0.5) * 60 + (on ? 160 * dt : 0); // the battery pushes them to the right
      e.vy += (Math.random() - 0.5) * 60;
      e.vx = Math.max(-140, Math.min(on ? 220 : 140, e.vx)) * 0.98;
      e.vy *= 0.98;
      e.x += e.vx * dt; e.y += e.vy * dt;
      if (e.x > W - 12) { if (on) e.x = 12; else { e.x = W - 12; e.vx = -Math.abs(e.vx); } }
      if (e.x < 12) { if (on) e.x = W - 12; else { e.x = 12; e.vx = Math.abs(e.vx); } }
      if (e.y < 12 || e.y > H - 12) { e.vy = -e.vy; e.y = Math.min(Math.max(e.y, 12), H - 12); }
    }
    paint();
    raf = requestAnimationFrame(tick);
  }
  content.addEventListener('click', (e) => {
    if (!e.target.closest('[data-act="toggle"]')) return;
    on = !on;
    paint();
  });
  paint();
  if (!still) raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
