// The ways of writing a structure, as used on the screens. Names follow
// IUPAC (structural formula, condensed formula, skeletal / bond-line
// formula) and the Japanese high-school terms (示性式).
//   key          name                        how it is drawn
//   structural   構造式                       own layout on a square grid (acyclic), else RDKit with all H
//   angle        構造式（結合角を考えた書き方）  RDKit, all atoms
//   condensed    簡略構造式                    own layout
//   skeletal     骨格構造式（線結合構造式）       RDKit, hydrogens on carbon omitted
//   rational     示性式                        own rules (CH3COOH, C2H5OH ...)
//   formula      分子式
//   wedge        立体構造式（くさび形表記）       projected from the 3D coordinates
//   model        分子模型                      3D viewer (handled by the screen)
import { isDark } from '../core/dom.js';
import { depict } from './rdkit.js';
import * as N from './notation.js';

export const NOTATIONS = {
  structural: { name: '構造式', short: '構造式', desc: 'すべての原子と、原子どうしの結合（共有電子対1組を線1本）を書く。' },
  angle: { name: '構造式（結合角を考えた書き方）', short: '構造式（角度）', desc: '線を折れ線にして、実際の分子の形に近づける。' },
  condensed: { name: '簡略構造式', short: '簡略構造式', desc: 'CH₃・CH₂・OH などをひとまとまりで書き、線の一部を省く。' },
  skeletal: { name: '骨格構造式', short: '骨格構造式', desc: '線の端と折れ目が炭素原子。C と、C についた H は書かない（線結合構造式ともいう）。' },
  rational: { name: '示性式', short: '示性式', desc: '官能基がわかるように、原子団ごとに1行で書く。' },
  formula: { name: '分子式', short: '分子式', desc: '原子の種類と数だけを書く。異性体は区別できない。' },
  wedge: { name: '立体構造式', short: '立体構造式', desc: 'くさび形の線は手前、破線は奥に向かう結合（くさび形表記）。' },
  model: { name: '分子模型', short: '分子模型', desc: '球と棒で、原子の並び方を立体的に表す。' },
};
// the omission ladder shown with the slider
export const LADDER = ['structural', 'angle', 'condensed', 'skeletal'];

const DARK = { '-1': [0.86, 0.88, 0.87], 1: [0.86, 0.88, 0.87], 6: [0.86, 0.88, 0.87], 7: [0.45, 0.66, 1], 8: [1, 0.45, 0.47], 17: [0.35, 0.82, 0.48] };

/**
 * Everything the notations need for one molecule.
 * @param {object} RDKit
 * @param {string} molblock  with explicit hydrogens after the heavy atoms
 *                           (library SDF, or one made by fromSmiles)
 */
export function prepare(RDKit, molblock) {
  const g = N.makeGraph(N.parseMolfile(molblock));
  return { RDKit, molblock, g, cache: {} };
}

// a molblock with explicit H and 2D coordinates from SMILES (molecules
// that are not in the library; the wedge view then needs 3D separately)
export function molblockFromSmiles(RDKit, smiles) {
  const m = RDKit.get_mol(smiles);
  if (!m || !m.is_valid()) return null;
  const mb = m.add_hs();
  m.delete();
  const h = RDKit.get_mol(mb, JSON.stringify({ removeHs: false }));
  depict(h);
  const out = h.get_molblock();
  h.delete();
  return out;
}

function rdkitSvg(ctx, { skeletal, highlight = null, width = 300, height = 190 }) {
  const { RDKit, molblock } = ctx;
  let m = RDKit.get_mol(molblock, JSON.stringify({ removeHs: false }));
  if (!m) return '';
  if (skeletal) {
    const s = RDKit.get_mol(m.get_molblock(), JSON.stringify({ removeHs: true }));
    m.delete();
    m = s;
  }
  depict(m);
  const n = m.get_num_atoms();
  // element of each atom (RDKit draws the labels of highlighted atoms in
  // black, so O and N are coloured again below)
  const z = JSON.parse(m.get_json()).molecules[0].atoms.map((a) => a.z ?? 6);
  const atoms = [...Array(n).keys()];
  const colors = {};
  atoms.forEach((i) => { colors[i] = i === highlight ? [0.18, 0.44, 0.31, 0.35] : [0, 0, 0, 0]; });
  const o = {
    width, height, atoms, bonds: [], highlightAtomColors: colors, highlightRadius: 0.34,
    atomHighlightsAreCircles: true, fillHighlights: true, backgroundColour: [0, 0, 0, 0],
    bondLineWidth: 2, padding: 0.1, clearBackground: false, addStereoAnnotation: false, fixedBondLength: 34,
  };
  if (isDark()) o.atomColourPalette = DARK;
  let svg = m.get_svg_with_highlights(JSON.stringify(o));
  m.delete();
  const dark = isDark();
  const LABEL = { 7: dark ? '#82B1FF' : '#1565C0', 8: dark ? '#FF8A80' : '#C62828', 17: dark ? '#7CDB8F' : '#2E7D32' };
  svg = svg.replace(/<path class='atom-(\d+)'([^>]*?)fill='#[0-9A-Fa-f]{6}'/g, (all, i, attrs) => `<path class='atom-${i}'${attrs}fill='${LABEL[z[+i]] || (dark ? '#DCE0DE' : '#000000')}'`);
  // RDKit draws one ellipse per atom ("atom-3"): make them tap targets
  svg = svg.replace(/<ellipse([^>]*)class='atom-(\d+)'/g, (all, attrs, i) => `<ellipse${attrs}class='atom-${i} nt-tap' data-a='${i}'`);
  return svg.replace(/<svg /, '<svg class="nt nt-rd" ');
}

/**
 * HTML of one notation (SVG or text), or null when it does not apply.
 * opts: { highlight: atom index or null }
 */
export function render(ctx, key, { highlight = null } = {}) {
  const { g } = ctx;
  switch (key) {
    case 'structural': {
      const s = N.structuralSvg(g);
      return s || rdkitSvg(ctx, { skeletal: false, highlight });
    }
    case 'angle':
      return rdkitSvg(ctx, { skeletal: false, highlight });
    case 'condensed':
      return N.condensedSvg(g);
    case 'skeletal':
      return rdkitSvg(ctx, { skeletal: true, highlight });
    case 'rational': {
      const h = N.rationalHtml(g);
      return h ? `<div class="nt-text">${h}</div>` : `<div class="nt-text">${N.toSubHtml(N.formulaText(g))}</div><p class="nt-note">環をもつこの分子では、示性式は分子式と同じに書く。</p>`;
    }
    case 'formula':
      return `<div class="nt-text">${N.toSubHtml(N.formulaText(g))}</div>`;
    case 'wedge':
      return N.wedgeSvg(g);
    default:
      return null;
  }
}

export function rationalString(ctx) {
  return N.rationalText(ctx.g) || N.formulaText(ctx.g);
}

export function formula(ctx) {
  return N.formulaText(ctx.g);
}
