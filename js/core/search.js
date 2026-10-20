// Keyword search over the compound library (spec B-1).
// Matches Japanese name, reading, English name, aliases and formula, and
// absorbs hiragana/katakana, full-width/half-width and Greek-letter spelling
// differences.

const GREEK = [
  [/alpha|アルファ/g, 'α'], [/beta|ベータ/g, 'β'], [/gamma|ガンマ/g, 'γ'],
  [/omega|オメガ/g, 'ω'],
];

export function normalize(s) {
  let t = String(s ?? '').normalize('NFKC').toLowerCase();
  // hiragana -> katakana
  t = t.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
  for (const [re, g] of GREEK) t = t.replace(re, g);
  // drop separators that people type inconsistently
  t = t.replace(/[\s・·\-‐－−–—_,，、（）()［］\[\]「」'"]/g, '');
  return t;
}

function fields(c) {
  return [
    c.name_ja, c.reading, c.name_en, c.id, c.formula,
    ...(c.aliases || []),
    c.fatty_acid ? c.fatty_acid.notation : '',
  ].filter(Boolean).map(normalize);
}

const index = new WeakMap();

// Returns compounds sorted by relevance; empty query returns [].
export function search(list, query) {
  const q = normalize(query);
  if (!q) return [];
  const scored = [];
  for (const c of list) {
    let f = index.get(c);
    if (!f) { f = fields(c); index.set(c, f); }
    let best = 0;
    f.forEach((v, i) => {
      let s = 0;
      if (v === q) s = 100;
      else if (v.startsWith(q)) s = 60;
      else if (v.includes(q)) s = 30;
      if (s && i < 3) s += 5; // main names first
      best = Math.max(best, s);
    });
    if (best) scored.push([best, c]);
  }
  scored.sort((a, b) => b[0] - a[0] || a[1].name_ja.length - b[1].name_ja.length);
  return scored.map((x) => x[1]);
}
