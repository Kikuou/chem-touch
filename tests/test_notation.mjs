// Tests for the notation renderers (js/mol/notation.js) and the answer
// checking (js/mol/molcheck.js), on every molecule of data/practice.json:
//   - the 示性式 written by the app, read back as blocks, is the same molecule
//   - known 示性式 of textbook molecules
//   - 構造式 / 簡略構造式 can be drawn for every acyclic molecule
//   - R/S is ignored, cis/trans counts only when the question has it
//
//   node tests/test_notation.mjs
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import * as N from '../js/mol/notation.js';
import { parseRational, sameMolecule, moleculeKey } from '../js/mol/molcheck.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rdDir = path.join(root, 'vendor/rdkit-2026.3.6');
const code = fs.readFileSync(path.join(rdDir, 'RDKit_minimal.js'), 'utf8');
const mod = { exports: {} };
vm.runInThisContext(`(function(module, exports, require, __dirname, __filename){${code}\n})`)(
  mod, mod.exports, createRequire(import.meta.url), rdDir, path.join(rdDir, 'RDKit_minimal.js'));
const RDKit = await mod.exports({ locateFile: (f) => path.join(rdDir, f) });

const compounds = JSON.parse(fs.readFileSync(path.join(root, 'data/compounds.json'), 'utf8')).compounds;
const byId = new Map(compounds.map((c) => [c.id, c]));
const practice = JSON.parse(fs.readFileSync(path.join(root, 'data/practice.json'), 'utf8'));
const ids = practice.groups.flatMap((g) => g.items);

let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; if (!ok || process.env.VERBOSE) console.log((ok ? 'ok  ' : 'FAIL') + ' ' + msg); };

// tokens of the app's 示性式 -> blocks of the practice keyboard
function toBlocks(tokens) {
  const out = [];
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k].t;
    if (t === '(') {
      const inner = [];
      while (tokens[++k].t[0] !== ')') inner.push(tokens[k].t);
      const times = parseInt(tokens[k].t.slice(1), 10) || 1;
      for (let r = 0; r < times; r++) inner.forEach((x) => out.push(`(${x})`));
      continue;
    }
    const map = { HCOOH: ['H', 'COOH'], HCOO: ['H', 'COO'], HCHO: ['H', 'CHO'], HO: ['OH'], H2N: ['NH2'] };
    out.push(...(map[t] || [t]));
  }
  return out;
}

const TEXTBOOK = {
  ethanol: 'C2H5OH', 'acetic-acid': 'CH3COOH', 'ethyl-acetate': 'CH3COOC2H5', 'diethyl-ether': 'C2H5OC2H5',
  acetone: 'CH3COCH3', acetaldehyde: 'CH3CHO', formaldehyde: 'HCHO', 'formic-acid': 'HCOOH', methanol: 'CH3OH',
  'methyl-formate': 'HCOOCH3', '2-propanol': 'CH3CH(OH)CH3', phenol: 'C6H5OH', aniline: 'C6H5NH2', propene: 'CH2=CHCH3',
  acetylene: 'CH≡CH', '2-methylpropene': 'CH2=C(CH3)CH3', ethylene: 'CH2=CH2', isobutane: 'CH3CH(CH3)CH3', 'ethylamine': 'C2H5NH2', 'propionic-acid': 'C2H5COOH',
};

for (const id of ids) {
  const c = byId.get(id);
  check(!!c, `${id}: in the library`);
  if (!c) continue;
  const carbons = (c.formula.match(/C(\d*)(?![a-z])/) || [])[1];
  check(!carbons || +carbons <= 6, `${id}: at most 6 carbons (${c.formula})`);
  const g = N.makeGraph(N.parseMolfile(fs.readFileSync(path.join(root, 'data', c.sdf), 'utf8')));
  check(N.formulaText(g) === c.formula, `${id}: formula ${N.formulaText(g)} = ${c.formula}`);
  const tokens = N.rationalTokens(g);
  if (TEXTBOOK[id]) check(N.rationalText(g) === TEXTBOOK[id], `${id}: 示性式 ${N.rationalText(g)} (textbook ${TEXTBOOK[id]})`);
  if (tokens && !tokens.some((t) => t.t === 'C6H6')) {
    const r = parseRational(toBlocks(tokens));
    check(!r.error && sameMolecule(RDKit, r.molfile, c.smiles.replace(/[\\/]/g, '')), `${id}: 示性式 ${N.rationalText(g)} reads back as the same molecule ${r.error || ''}`);
  }
  const acyclic = !/\d/.test(c.smiles.replace(/\[[^\]]*\]/g, ''));
  if (acyclic) {
    check(!!N.structuralSvg(g), `${id}: 構造式 drawn`);
    check(!!N.condensedSvg(g), `${id}: 簡略構造式 drawn`);
  }
}

// block messages
const bad = parseRational(['CH3', 'CH3', 'CH3']);
check(/5 本/.test(bad.error || ''), `CH3CH3CH3 refused: ${bad.error}`);
const short = parseRational(['CH2', 'CH3']);
check(/たりません/.test(short.error || ''), `CH2CH3 refused: ${short.error}`);
const ok = parseRational(['OH', 'CH2', 'CH3']);
check(!ok.error && sameMolecule(RDKit, ok.molfile, 'CCO'), 'HO-CH2-CH3 is ethanol (any order is accepted)');
const ester = parseRational(['H', 'COO', 'CH3']);
check(!ester.error && sameMolecule(RDKit, ester.molfile, 'COC=O'), 'H COO CH3 is methyl formate');

// stereo rules
check(sameMolecule(RDKit, 'C[C@H](O)CC', 'CCC(C)O'), '2-butanol: R/S ignored');
check(!sameMolecule(RDKit, 'C/C=C/C', 'C/C=C\\C'), 'trans-2-butene is not cis-2-butene');
check(sameMolecule(RDKit, 'C/C=C/C', 'CC=CC'), 'no cis/trans in the question: either is right');
check(!sameMolecule(RDKit, 'COC', 'CCO'), 'dimethyl ether is not ethanol');
check(moleculeKey(RDKit, 'not a smiles') === null, 'invalid input gives no key');

console.log(`\n${ids.length} practice molecules, ${fails} failures`);
process.exit(fails ? 1 : 0);
