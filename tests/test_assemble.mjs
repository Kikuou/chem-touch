// Tests for the assembly mode of the builder (js/mol/assemble.js):
// SMILES (compared through InChIKeys with RDKit.js), Japanese names,
// cis/trans availability and the valence rules.
//
//   node tests/test_assemble.mjs
import fs from 'fs';
import vm from 'vm';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import * as A from '../js/mol/assemble.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rdDir = path.join(root, 'vendor/rdkit-2026.3.6');

async function loadRDKit() {
  // RDKit_minimal.js is a CommonJS/UMD file; run it with a module shim
  const code = fs.readFileSync(path.join(rdDir, 'RDKit_minimal.js'), 'utf8');
  const module = { exports: {} };
  vm.runInThisContext(`(function(module, exports, require, __dirname, __filename){${code}\n})`)(
    module, module.exports, createRequire(import.meta.url), rdDir, path.join(rdDir, 'RDKit_minimal.js'));
  return module.exports({ locateFile: (f) => path.join(rdDir, f) });
}

// [state in URL form, expected name, expected molecule (SMILES)]
const CASES = [
  ['n=1', 'メタン', 'C'],
  ['n=1&g=1oh', 'メタノール', 'CO'],
  ['n=2&g=1oh', 'エタノール', 'CCO'],
  ['n=3&g=1oh', '1-プロパノール', 'CCCO'],
  ['n=3&g=2oh', '2-プロパノール', 'CC(C)O'],
  ['n=3&g=2oxo', 'プロパノン', 'CC(C)=O'],
  ['n=3&b=1c', 'プロペン', 'C=CC'],
  ['n=4&b=2c', 'cis-2-ブテン', 'C/C=C\\C'],
  ['n=4&b=2t', 'trans-2-ブテン', 'C/C=C/C'],
  ['n=4&b=1c', '1-ブテン', 'C=CCC'],
  ['n=18&end=cooh&b=9c', 'cis-9-オクタデセン酸', 'CCCCCCCC/C=C\\CCCCCCCC(=O)O'],
  ['n=18&end=cooh&b=9t', 'trans-9-オクタデセン酸', 'CCCCCCCC/C=C/CCCCCCCC(=O)O'],
  ['n=18&end=cooh&b=9c,12c', 'cis,cis-9,12-オクタデカジエン酸', 'CCCCC/C=C\\C/C=C\\CCCCCCCC(=O)O'],
  ['n=18&end=cooh&b=9c,12c,15c', 'cis,cis,cis-9,12,15-オクタデカトリエン酸', 'CC/C=C\\C/C=C\\C/C=C\\CCCCCCCC(=O)O'],
  ['n=3&end=cooh&g=2oh', '2-ヒドロキシプロパン酸', 'CC(O)C(=O)O'],
  ['n=3&end=cooh&g=2nh2', '2-アミノプロパン酸', 'CC(N)C(=O)O'],
  ['n=3&g=2me', '2-メチルプロパン', 'CC(C)C'],
  ['n=3&g=2me,2me', '2,2-ジメチルプロパン', 'CC(C)(C)C'],
  ['n=3&g=1oh,2me', '2-メチル-1-プロパノール', 'CC(C)CO'],
  ['n=4&g=1oh,3me', '3-メチル-1-ブタノール', 'CC(C)CCO'],
  ['n=4&g=3oh', '2-ブタノール', 'CCC(C)O'],
  ['n=2&g=1oh,2oh', '1,2-エタンジオール', 'OCCO'],
  ['n=3&g=1oh,2oh,3oh', '1,2,3-プロパントリオール', 'OCC(O)CO'],
  ['n=3&end=cho&b=2c', '2-プロペナール', 'C=CC=O'],
  ['n=4&end=cooh&b=2t', 'trans-2-ブテン酸', 'C/C=C/C(=O)O'],
  ['n=4&b=1c&g=4oh', '3-ブテン-1-オール', 'C=CCCO'],
  ['n=4&b=2t&g=1oh', 'trans-2-ブテン-1-オール', 'C/C=C/CO'],
  ['n=4&b=1c,3y', '1-ブテン-3-イン', 'C#CC=C'],
  ['n=6&end=cooh&b=2t,4t', 'trans,trans-2,4-ヘキサジエン酸', 'C/C=C/C=C/C(=O)O'],
  ['n=2&end=cooh&g=2nh2', '2-アミノエタン酸', 'NCC(=O)O'],
  ['n=4&g=2oxo,3oxo', '2,3-ブタンジオン', 'CC(=O)C(C)=O'],
  ['n=5&b=3t&g=2oxo', 'trans-3-ペンテン-2-オン', 'C/C=C/C(C)=O'],
  ['n=4&b=2c&g=2me', '2-メチル-2-ブテン', 'CC=C(C)C'],
  ['n=2&b=1y', 'エチン', 'C#C'],
  ['n=4&end=cooh&g=3oxo', '3-オキソブタン酸', 'CC(=O)CC(=O)O'],
  ['n=3&g=1nh2', '1-プロパンアミン', 'CCCN'],
  ['n=6&b=1c,4c', '4-cis-1,4-ヘキサジエン', 'C=CC/C=C\\C'],
  ['n=2&end=cho', 'エタナール', 'CC=O'],
  ['n=1&end=cooh', 'メタン酸', 'O=CO'],
  ['n=1&end=cho', 'メタナール', 'C=O'],
];

// [state, action, should fail]
const RULES = [
  ['n=4&b=2c', { kind: 'bond', pos: 3, type: 'cis' }, true],          // C3 would carry two double bonds
  ['n=4&b=2c', { kind: 'sub', pos: 2, type: 'oxo' }, true],           // 5 bonds on C2
  ['n=3', { kind: 'sub', pos: 1, type: 'me' }, true],                 // methyl at the chain end
  ['n=3', { kind: 'sub', pos: 3, type: 'oxo' }, true],                // terminal C=O = aldehyde
  ['n=3&end=cooh', { kind: 'bond', pos: 1, type: 'cis' }, true],      // C1 of -COOH has no free bond
  ['n=3', { kind: 'sub', pos: 2, type: 'me' }, false],
  ['n=2', { kind: 'bond', pos: 1, type: 'triple' }, false],
];

const RDKit = await loadRDKit();
const keyOf = (smi) => {
  const m = RDKit.get_mol(smi);
  const k = RDKit.get_inchikey_for_inchi(m.get_inchi());
  const tags = JSON.parse(m.get_stereo_tags());
  m.delete();
  return { k, tags };
};

let fails = 0;
const check = (ok, msg) => {
  if (!ok) fails++;
  console.log((ok ? 'ok  ' : 'FAIL') + ' ' + msg);
};

for (const [q, name, ref] of CASES) {
  const s = A.decodeState(new URLSearchParams(q));
  const smi = A.toSmiles(s);
  const got = keyOf(smi);
  const want = keyOf(ref);
  const nm = A.nameOf(s)?.name;
  const geo = s.bonds.filter((b) => b.type !== 'triple' && A.hasGeometry(s, b.pos)).length;
  check(got.k === want.k && nm === name && got.tags.CIP_bonds.length === geo,
    `${q}: ${smi} ${nm}${got.k === want.k ? '' : ` (InChIKey ${got.k} != ${want.k})`}${nm === name ? '' : ` (want ${name})`}`);
  // reading the state back from the URL gives the same state
  check(JSON.stringify(A.decodeState(new URLSearchParams(A.encodeState(s)))) === JSON.stringify(s), `${q}: URL round trip`);
}

for (const [q, action, fail] of RULES) {
  const r = A.apply(A.decodeState(new URLSearchParams(q)), action);
  check(!!r.error === fail, `${q} + ${JSON.stringify(action)} -> ${r.error || 'ok'}`);
}

check(JSON.stringify(A.stereocentres(A.decodeState(new URLSearchParams('n=4&g=2oh')))) === '[2]', '2-butanol: stereocentre C2');
check(A.stereocentres(A.decodeState(new URLSearchParams('n=5&g=3oh'))).length === 0, '3-pentanol: no stereocentre');
check(A.decodeState(new URLSearchParams('n=22&end=cooh')).n === 18, 'n is clamped to 18');
check(A.fattyAcidNotation(A.decodeState(new URLSearchParams('n=18&end=cooh&b=9c'))) === 'C18:1 n-9', 'oleic acid = C18:1 n-9');
check(A.fattyAcidNotation(A.decodeState(new URLSearchParams('n=18&end=cooh&b=9c,12c,15c'))) === 'C18:3 n-3', 'α-linolenic acid = C18:3 n-3');

console.log(`\n${fails} failures`);
process.exit(fails ? 1 : 0);
