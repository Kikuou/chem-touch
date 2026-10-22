// Minimal element table for atom pop-ups in the molecule viewers.
// The full periodic-table data (spec §4-5, data/elements.json) belongs to
// milestone M4; this file only covers elements that occur in molecules.

const E = {
  1: ['H', '水素', 'Hydrogen'],
  2: ['He', 'ヘリウム', 'Helium'],
  3: ['Li', 'リチウム', 'Lithium'],
  4: ['Be', 'ベリリウム', 'Beryllium'],
  5: ['B', 'ホウ素', 'Boron'],
  6: ['C', '炭素', 'Carbon'],
  7: ['N', '窒素', 'Nitrogen'],
  8: ['O', '酸素', 'Oxygen'],
  9: ['F', 'フッ素', 'Fluorine'],
  10: ['Ne', 'ネオン', 'Neon'],
  11: ['Na', 'ナトリウム', 'Sodium'],
  12: ['Mg', 'マグネシウム', 'Magnesium'],
  13: ['Al', 'アルミニウム', 'Aluminium'],
  14: ['Si', 'ケイ素', 'Silicon'],
  15: ['P', 'リン', 'Phosphorus'],
  16: ['S', '硫黄', 'Sulfur'],
  17: ['Cl', '塩素', 'Chlorine'],
  18: ['Ar', 'アルゴン', 'Argon'],
  19: ['K', 'カリウム', 'Potassium'],
  20: ['Ca', 'カルシウム', 'Calcium'],
  24: ['Cr', 'クロム', 'Chromium'],
  25: ['Mn', 'マンガン', 'Manganese'],
  26: ['Fe', '鉄', 'Iron'],
  27: ['Co', 'コバルト', 'Cobalt'],
  29: ['Cu', '銅', 'Copper'],
  30: ['Zn', '亜鉛', 'Zinc'],
  34: ['Se', 'セレン', 'Selenium'],
  35: ['Br', '臭素', 'Bromine'],
  42: ['Mo', 'モリブデン', 'Molybdenum'],
  53: ['I', 'ヨウ素', 'Iodine'],
};

const BY_SYMBOL = Object.fromEntries(Object.entries(E).map(([z, v]) => [v[0], { z: +z, symbol: v[0], ja: v[1], en: v[2] }]));

export function element(symbolOrZ) {
  if (typeof symbolOrZ === 'number') {
    const v = E[symbolOrZ];
    return v ? { z: symbolOrZ, symbol: v[0], ja: v[1], en: v[2] } : { z: symbolOrZ, symbol: '?', ja: '', en: '' };
  }
  const s = String(symbolOrZ);
  const key = s.length > 1 ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s.toUpperCase();
  return BY_SYMBOL[key] || { z: 0, symbol: key, ja: '', en: '' };
}

// Atom colours shared by the 3D and 2D views (mockup palette for C/H/O/N).
export const ATOM_COLORS = {
  light: { H: '#F2F3F5', C: '#4B5563', N: '#3B82F6', O: '#E5484D', S: '#D9A400', P: '#F08A24', Cl: '#2FAE5B', Na: '#8E6CEF', K: '#7A4FD6', Ca: '#6B9E4A', Mg: '#4FA36B', Fe: '#C46A3A', F: '#5CC28A', Br: '#A3392C', I: '#7B3FA0' },
  dark: { H: '#F2F3F5', C: '#A3ACB8', N: '#6EA8FF', O: '#FF6B70', S: '#F2C230', P: '#FF9F4A', Cl: '#4CD07A', Na: '#B39BFF', K: '#A585F0', Ca: '#8CC46A', Mg: '#6FCB8E', Fe: '#E58A5A', F: '#7EDCA6', Br: '#D0584A', I: '#A66AD0' },
};
