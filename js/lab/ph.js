// pH ものさし #/lab/ph?ph=7 (slider type). Move the pH: the H⁺ concentration
// compared with neutral water is shown in words and as a ladder of ×10.
// Everyday examples (data/labs.json "ph") are drawn as ranges under the
// scale with their sources; tap one to jump there.
import { esc } from '../core/dom.js';
import { setQuery } from '../core/router.js';
import { labs } from '../core/data.js';

// colours along the scale (0 ... 14), roughly like a universal indicator
const STOPS = ['#D7263D', '#F46036', '#F7A325', '#F3D34A', '#B5D33D', '#5FB760', '#2E9E6B', '#2A9D8F', '#2C7DA0', '#3D5A99', '#5B4B9A', '#6A3D8F', '#7A2E80', '#7F2370', '#80195E'];

// 10^n in words: 100000 -> "10万", 3162 -> "約 3,200"
function times(n) {
  const v = 10 ** n;
  const r = Number(v.toPrecision(2));
  const s = r >= 10000 && Number.isInteger(Math.log10(r)) ? `${(r / 10000).toLocaleString('ja-JP')}万` : r.toLocaleString('ja-JP');
  return Number.isInteger(n) ? s : `約 ${s}`;
}

export async function render({ content, query }) {
  const { ph: data } = await labs();
  let ph = Math.min(Math.max(parseFloat(query.get('ph') ?? '7') || 0, 0), 14);
  const draft = data.reviewed ? '' : '<span class="draft" title="教員による確認前の下書きです">下書き</span>';
  // where the thumb centre is for a pH (the thumb is 36px wide)
  const pos = (v) => `calc(18px + (100% - 36px) * ${(v / 14).toFixed(4)})`;
  const len = (a, b) => `max(8px, calc((100% - 36px) * ${((b - a) / 14).toFixed(4)}))`;

  content.innerHTML = `
    <div class="lb-read"><span class="lb-big" aria-live="polite"></span><span class="lb-chip"></span></div>
    <div class="ph-box"><div class="ph-k">水素イオン H⁺ の濃さ</div><div class="ph-times"></div><div class="ph-ladder" aria-hidden="true"></div></div>
    <p class="lb-say">pH が 1 小さくなると、H⁺ は <b>10倍</b> こくなる。</p>
    <div class="ph-scale">
      <div class="ph-bar" style="background:linear-gradient(90deg,${STOPS.join(',')})"></div>
      <input type="range" class="lb-range ph-range" min="0" max="14" step="0.1" value="${ph}" aria-label="pH">
      <div class="ph-nums" aria-hidden="true">${Array.from({ length: 15 }, (_, k) => `<span style="left:${pos(k)}">${k}</span>`).join('')}</div>
      <div class="ph-marks">${data.examples.map((x, k) => `
        <button class="ph-mark" data-k="${k}" style="left:${pos(x.low)};width:${len(x.low, x.high)};--row:${k % 2}"><i></i><span>${esc(x.name)}</span></button>`).join('')}
      </div>
    </div>
    <p class="ph-info small" aria-live="polite">身近なものの名前をタップすると、その pH へ動きます。</p>
    <details class="ph-src"><summary>身近なものの pH と出典${draft}</summary>
      <ul>${data.examples.map((x) => `<li><b>${esc(x.name)}</b> pH ${x.low}〜${x.high}${x.note ? `（${esc(x.note)}）` : ''}<br>${x.sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a>`).join('<br>')}</li>`).join('')}</ul>
    </details>`;

  const range = content.querySelector('.ph-range');
  function update() {
    const r = Math.round(ph * 10) / 10;
    content.querySelector('.lb-big').textContent = `pH ${r}`;
    const chip = content.querySelector('.lb-chip');
    chip.textContent = r < 7 ? '酸性' : r > 7 ? '塩基性' : '中性';
    chip.style.background = STOPS[Math.round(r)];
    chip.style.color = r >= 3 && r <= 4 ? '#121417' : '#fff';
    const n = 7 - r;
    content.querySelector('.ph-times').innerHTML = Math.abs(n) < 0.05
      ? '中性（酸性でも塩基性でもない）'
      : n > 0 ? `中性の <b>${times(n)} 倍</b>` : `中性の <b>${times(-n)} 分の1</b>`;
    content.querySelector('.ph-ladder').innerHTML = Array.from({ length: Math.floor(Math.abs(n) + 1e-9) }, () => `<i class="${n > 0 ? 'up' : 'down'}">${n > 0 ? '×10' : '÷10'}</i>`).join('');
  }
  range.addEventListener('input', () => { ph = +range.value; setQuery({ ph: String(ph) }); update(); });
  content.addEventListener('click', (e) => {
    const b = e.target.closest('.ph-mark');
    if (!b) return;
    const x = data.examples[+b.dataset.k];
    ph = Math.round(((x.low + x.high) / 2) * 10) / 10;
    range.value = ph;
    setQuery({ ph: String(ph) });
    content.querySelector('.ph-info').innerHTML = `<b>${esc(x.name)}</b>: pH ${x.low}〜${x.high}（出典は下）`;
    update();
  });
  update();
  return null;
}
