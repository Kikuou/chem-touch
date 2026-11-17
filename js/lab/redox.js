// 電子の受けわたし #/lab/redox (particle type, lesson 13), in steps:
//   0 Mg (2 outer electrons) and O (6 outer electrons)
//   1 Mg hands its 2 electrons to O
//   2 Mg²⁺ (lost electrons = oxidised) and O²⁻ (gained = reduced): MgO
// The electrons slide over (no sliding with "reduce motion").
const MG = { x: 90, y: 100, r: 44 };
const O = { x: 232, y: 100, r: 36 };
const pos = (c, deg) => [c.x + c.r * Math.cos((deg * Math.PI) / 180), c.y + c.r * Math.sin((deg * Math.PI) / 180)];
const TEXT = [
  'マグネシウム Mg と酸素 O。いちばん外側の電子は Mg が <b>2個</b>、O が <b>6個</b>。',
  'Mg が外側の電子を <b>2個</b>、O にわたす。',
  'Mg は電子を失った → <b>酸化された</b>（Mg²⁺）。O は電子を受け取った → <b>還元された</b>（O²⁻）。',
];

export async function render({ content }) {
  let step = 0;
  const oSlots = [0, 60, 120, 180, 240, 300]; // O's own six electrons
  const moveTo = [150, 210]; // where Mg's two electrons land on O's shell
  content.innerHTML = `
    <div class="lb-stage"><svg viewBox="0 0 320 200" role="img" aria-label="マグネシウムと酸素の電子のようす">
      <rect x="2" y="2" width="316" height="196" rx="14" fill="var(--surface)" stroke="var(--line)" stroke-width="2"/>
      <circle cx="${MG.x}" cy="${MG.y}" r="${MG.r}" fill="none" stroke="var(--line)" stroke-width="2"/>
      <circle cx="${O.x}" cy="${O.y}" r="${O.r}" fill="none" stroke="var(--line)" stroke-width="2"/>
      <circle cx="${MG.x}" cy="${MG.y}" r="22" fill="#9AA3AE"/><text class="rx-mg" x="${MG.x}" y="${MG.y + 6}" text-anchor="middle" font-size="17" font-weight="800" fill="#fff">Mg</text>
      <circle cx="${O.x}" cy="${O.y}" r="18" fill="#E5484D"/><text class="rx-o" x="${O.x}" y="${O.y + 6}" text-anchor="middle" font-size="17" font-weight="800" fill="#fff">O</text>
      ${oSlots.map((d) => { const [x, y] = pos(O, d); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" fill="#2C7DA0"/>`; }).join('')}
      ${[0, 1].map((k) => `<circle class="rx-e" data-k="${k}" r="6.5" fill="#F7A325" stroke="#8A5300" stroke-width="1.5"/>`).join('')}
      <text class="rx-q1" x="${MG.x}" y="182" text-anchor="middle" font-size="14" font-weight="700"></text>
      <text class="rx-q2" x="${O.x}" y="182" text-anchor="middle" font-size="14" font-weight="700"></text>
    </svg></div>
    <div class="cp-steps rx-steps" aria-hidden="true"></div>
    <p class="lb-say" aria-live="polite"></p>
    <p class="rx-eq"></p>
    <div class="two"><button class="btn" data-act="prev">もどす</button><button class="btn primary" data-act="next">つぎへ</button></div>
    <p class="lb-foot">● オレンジ＝Mg からわたる電子、● 青＝O がもともと持つ電子（外側だけ）。</p>`;
  const es = [...content.querySelectorAll('.rx-e')];
  function paint() {
    es.forEach((e, k) => {
      const [x, y] = step === 0 ? pos(MG, k ? 180 : 0) : pos(O, moveTo[k]);
      e.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    });
    content.querySelector('.rx-q1').textContent = step === 2 ? 'Mg²⁺（酸化）' : '';
    content.querySelector('.rx-q2').textContent = step === 2 ? 'O²⁻（還元）' : '';
    content.querySelector('.lb-say').innerHTML = TEXT[step];
    content.querySelector('.rx-eq').innerHTML = step === 2 ? 'マグネシウムが燃える反応: 2Mg ＋ O₂ → 2MgO' : '';
    content.querySelector('.rx-steps').innerHTML = [0, 1, 2].map((k) => `<span class="${k === step ? 'on' : k < step ? 'done' : ''}">${k + 1}</span>`).join('<i></i>');
    content.querySelector('[data-act="prev"]').disabled = step === 0;
    content.querySelector('[data-act="next"]').disabled = step === 2;
  }
  content.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'next' && step < 2) step++;
    if (a === 'prev' && step > 0) step--;
    paint();
  });
  paint();
  return null;
}
