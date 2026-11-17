// Unit tests of the hands-on materials without a browser:
// composition formulas and names (組成式パズル), answer checking (計算練習).
//   node tests/test_labs.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compose } from '../js/lab/formula.js';
import { agrees } from '../js/lab/concentration.js';

const labs = JSON.parse(readFileSync(new URL('../data/labs.json', import.meta.url)));
const ions = labs.formula.ions;
let n = 0;
const ok = (tray, formula, name) => {
  const r = compose(tray, ions);
  assert.equal(r.formula, formula, `${tray.join(' ')} -> ${r.formula}`);
  if (name) assert.equal(r.name, name);
  n++;
};
ok(['Na+', 'Cl-'], 'NaCl', '塩化ナトリウム');
ok(['Mg2+', 'Cl-', 'Cl-'], 'MgCl2', '塩化マグネシウム');
ok(['Cl-', 'Mg2+', 'Cl-'], 'MgCl2');
ok(['Ca2+', 'CO32-'], 'CaCO3', '炭酸カルシウム');
ok(['Ca2+', 'OH-', 'OH-'], 'Ca(OH)2', '水酸化カルシウム');
ok(['Na+', 'Na+', 'CO32-'], 'Na2CO3', '炭酸ナトリウム');
ok(['K+', 'K+', 'O2-'], 'K2O', '酸化カリウム');
ok(['Mg2+', 'Mg2+', 'O2-', 'O2-'], 'MgO', '酸化マグネシウム'); // simplest ratio
ok(['Mg2+', 'Cl-'], null); // +1 left
ok(['Na+', 'K+', 'Cl-', 'Cl-'], null); // two kinds of cation
ok([], null);
assert.equal(compose(['Mg2+', 'Cl-'], ions).total, 1);
for (const g of labs.formula.goals) {
  // every task can be made
  const c = ions.find((i) => i.id === g.cation);
  const a = ions.find((i) => i.id === g.anion);
  const tray = [...Array(Math.abs(a.charge)).fill(c.id), ...Array(c.charge).fill(a.id)];
  assert.ok(compose(tray, ions).formula, `goal ${g.text}`);
  n++;
}

assert.ok(agrees(5, 5));
assert.ok(agrees(10.0, 10));
assert.ok(agrees(4.0, 4));
assert.ok(agrees(33, 33.333));
assert.ok(!agrees(9, 10));
assert.ok(!agrees(0.5, 5));
assert.ok(!agrees(50, 5));
n += 7;
for (const p of labs.concentration.problems) {
  const pct = (p.solute_g / (p.solute_g + p.water_g)) * 100;
  assert.ok(agrees(Number(pct.toPrecision(2)), pct), JSON.stringify(p));
  n++;
}
console.log(`${n} checks, 0 failures`);
