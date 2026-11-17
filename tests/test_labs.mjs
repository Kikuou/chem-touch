// Unit tests of the hands-on materials without a browser:
// composition formulas and names (組成式パズル), answer checking (計算練習).
//   node tests/test_labs.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compose } from '../js/lab/formula.js';
import { agrees, KINDS, setWeights } from '../js/lab/calc.js';
import { atoms, count } from '../js/lab/balance.js';
import { phAfter } from '../js/lab/titration.js';

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
// every calculation kind: a finite answer, offered among the step-1 choices,
// and one blank of the step-2 formula holds it
setWeights(labs.calc.atomic_weights);
const blanksOf = (tokens) => tokens.flatMap((t) => (t && typeof t === 'object' && 'b' in t ? [Number(t.b)] : t && t.frac ? blanksOf([...t.frac[0], ...t.frac[1]]) : []));
for (const [id, kd] of Object.entries(labs.calc.kinds)) {
  const kind = KINDS[id];
  assert.ok(kind, `kind ${id} exists in js/lab/calc.js`);
  for (const p of kd.problems) {
    const a = kind.ans(p);
    assert.ok(Number.isFinite(a) && a > 0, `${id} ${JSON.stringify(p)} -> ${a}`);
    assert.ok(kind.choices(p, a).some((c) => agrees(c, a)), `${id}: the answer is a choice`);
    assert.ok(blanksOf(kind.eq(p, a)).some((v) => agrees(v, a)), `${id}: the formula has the answer as a blank`);
    assert.ok(kind.steps(p, a).length >= 2);
    assert.ok(kind.q(p).length > 5);
    n += 5;
  }
}
assert.equal(KINDS['mass-percent'].ans({ solute_g: 5, water_g: 95 }), 5);
assert.equal(KINDS['molar-mass'].ans({ atoms: { H: 2, O: 1 } }), 18);
assert.equal(KINDS.mol.ans({ atoms: { H: 2, O: 1 }, g: 36 }), 2);
assert.equal(KINDS.molarity.ans({ atoms: { C: 6, H: 12, O: 6 }, g: 18, ml: 500 }), 0.2);
assert.equal(KINDS.dilution.ans({ c: 1, v1: 100, v2: 500 }), 0.2);
assert.equal(KINDS.stoich.ans({ ca: 1, cb: 2, mol: 3 }), 6);
assert.equal(KINDS.neutral.ans({ n_a: 2, c_a: 0.1, v_a: 10, n_b: 1, c_b: 0.1 }), 20);
n += 7;
// 反応式の天びん: formula parser and atom counts
assert.deepEqual(atoms('C3H8'), { C: 3, H: 8 });
assert.deepEqual(atoms('Ca(OH)2'), { Ca: 1, O: 2, H: 2 });
assert.deepEqual(atoms('C6H12O6'), { C: 6, H: 12, O: 6 });
assert.deepEqual(count(['CH4', 'O2'], [1, 2]), count(['CO2', 'H2O'], [1, 2]));
assert.notDeepEqual(count(['H2', 'O2'], [1, 1]), count(['H2O'], [1]));
n += 5;
// 中和の滴定 (0.10 mol/L HCl 20 mL, 0.10 mol/L NaOH)
const t = labs.titration;
assert.equal(Math.round(phAfter(t, 0) * 100) / 100, 1);
assert.equal(phAfter(t, 20), 7);
assert.ok(phAfter(t, 19.9) < 7 && phAfter(t, 20.1) > 7);
assert.equal(Math.round(phAfter(t, 40) * 100) / 100, 12.52);
n += 4;
console.log(`${n} checks, 0 failures`);
