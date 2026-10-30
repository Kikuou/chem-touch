// Acceptance scenarios of milestones M1–M5 (spec §8), on a 375px phone viewport.
// M1:
//   search "グルコース" -> open -> rotate 3D -> skeletal/all-atom switch ->
//   2D atom tap highlights 3D -> QR share -> the shared URL opens the same molecule
//   python3 -m http.server 8000 &  ;  npm run e2e
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL || 'http://localhost:8000/';
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
// the service worker is tested on its own at the end (offline use)
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ja-JP', serviceWorkers: 'block' });
const errors = [];
ctx.on('page', (p) => p.on('pageerror', (e) => errors.push(e.message)));
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(e.message));
const step = (s) => console.log('✓', s);

await page.goto(BASE + '#/');
await page.click('a[aria-label="分子をさがす"]');
await page.fill('.search input', 'グルコース');
await page.waitForSelector('.item');
const names = await page.locator('.item .nm').allTextContents();
assert.ok(names.includes('α-D-グルコース'), 'search result contains α-D-グルコース');
step(`search "グルコース" -> ${names.join(', ')}`);

await page.locator('.item', { hasText: 'α-D-グルコース' }).click();
await page.waitForURL(/#\/compound\/alpha-d-glucose$/);
await page.waitForSelector('.v3d canvas');
await page.waitForSelector('.v2d svg');
await page.waitForTimeout(500);
step('opened #/compound/alpha-d-glucose');

const v3d = page.locator('.v3d');
const before = await v3d.screenshot();
const box = await v3d.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 30, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(300);
const after = await v3d.screenshot();
assert.ok(!before.equals(after), '3D view changes after dragging');
step('3D rotated by dragging');

assert.equal(await page.getAttribute('.v2d svg', 'aria-label'), '骨格式');
await page.click('[data-mode="full"]');
assert.equal(await page.getAttribute('.v2d svg', 'aria-label'), '全原子表示の構造式');
const fullAtoms = await page.locator('.v2d svg ellipse.hit').count();
await page.click('[data-mode="skeletal"]');
const skelAtoms = await page.locator('.v2d svg ellipse.hit').count();
assert.equal(fullAtoms, 24);
assert.equal(skelAtoms, 12);
step(`skeletal (${skelAtoms} atoms) <-> all-atom (${fullAtoms} atoms) switch`);

const v3before = await v3d.screenshot();
const atom = page.locator('.v2d svg ellipse.atom-0');
await atom.click({ force: true });
await page.waitForSelector('.info:not([hidden])');
const info = await page.textContent('.info');
assert.match(info, /O.*酸素/);
await page.waitForTimeout(200);
assert.ok(!v3before.equals(await v3d.screenshot()), '3D highlight drawn');
step(`2D atom tap -> info "${info.trim()}" and 3D highlight`);

await page.click('.subbar [data-act="share"]');
await page.waitForSelector('.sheet .qr svg');
const url = (await page.textContent('.sheet .url')).trim();
assert.match(url, /#\/compound\/alpha-d-glucose$/);
step(`QR share sheet -> ${url}`);
await page.click('[data-act="present"]');
await page.waitForSelector('.present .qr svg');
await page.keyboard.press('Escape');
step('projector QR view');

const other = await ctx.newPage();
await other.goto(url);
await other.waitForSelector('.mol-title h2');
assert.equal((await other.textContent('.mol-title h2')).trim(), 'α-D-グルコース');
await other.waitForSelector('.v3d canvas');
step('shared URL opens the same molecule in a new tab');

await other.goto(BASE + '#/view?smiles=' + encodeURIComponent('OC[C@H]1O[C@H](O)[C@H](O)[C@@H](O)[C@@H]1O'));
await other.waitForSelector('.match .info');
assert.match(await other.textContent('.match'), /α-D-グルコース/);
await other.waitForSelector('.v3d canvas');
step('#/view?smiles=... recognises the library compound and shows 3D');

// every library molecule can be drawn in 2D, all-atom and skeletal
// (RDKit throws while tidying some one-heavy-atom molecules such as water)
const draw2d = await page.evaluate(async () => {
  const { Structure2D } = await import('./js/mol/structure2d.js');
  const list = (await (await fetch('data/compounds.json')).json()).compounds.filter((c) => c.kind !== 'crystal');
  const box = document.createElement('div');
  const bad = [];
  for (const c of list) {
    const s = new Structure2D(box, {});
    try {
      await s.setMolecule({ molblock: await (await fetch('data/' + c.sdf)).text() });
      s.setMode('full');
      if (s.canSkeletal) s.setMode('skeletal');
      if (!box.querySelector('svg')) bad.push(c.id);
    } catch (e) {
      bad.push(c.id);
    }
    s.destroy?.();
  }
  return { n: list.length, bad };
});
assert.deepEqual(draw2d.bad, [], `2D drawing failed: ${draw2d.bad.join(', ')}`);
step(`all ${draw2d.n} library molecules draw a 2D structure (all-atom and skeletal)`);

// ---- M2 acceptance: compare oleic vs elaidic acid with synced rotation,
// DHA n-3 position in colour, functional groups, quiz, series
const m2 = await ctx.newPage();
await m2.goto(BASE + '#/compare/oleic-elaidic');
await m2.waitForSelector('.cmp-3d canvas');
await m2.waitForTimeout(800);
const cmpNames = await m2.locator('.cmp-name').allTextContents();
assert.deepEqual(cmpNames.map((t) => t.trim()), ['オレイン酸', 'エライジン酸']);
const cbox = await m2.locator('.cmp-3d').first().boundingBox();
await m2.mouse.move(cbox.x + cbox.width / 2, cbox.y + cbox.height / 2);
await m2.mouse.down();
await m2.mouse.move(cbox.x + cbox.width / 2 + 70, cbox.y + cbox.height / 2 + 25, { steps: 8 });
await m2.mouse.up();
await m2.waitForTimeout(300);
const views = await m2.evaluate(() => [...document.querySelectorAll('.cmp-3d')].map((e) => e.__viewer3d.viewer.getView().slice(4)));
assert.ok(Math.abs(views[0][3]) < 0.999, 'left molecule rotated');
assert.deepEqual(views[0].map((v) => v.toFixed(4)), views[1].map((v) => v.toFixed(4)), 'right follows left');
step('compare: oleic vs elaidic acid rotate together');

await m2.goto(BASE + '#/compare/alanine-enantiomers');
await m2.waitForSelector('.cmp-mirror');
await m2.waitForTimeout(800);
const mv = await m2.evaluate(() => [...document.querySelectorAll('.cmp-3d')].map((e) => e.__viewer3d.viewer.getView().slice(4)));
assert.ok(Math.abs(mv[0][1] + mv[1][1]) < 1e-6 && Math.abs(mv[0][0] - mv[1][0]) < 1e-6, 'mirror rotation');
step('compare: L/D-alanine shown as mirror images');

await m2.goto(BASE + '#/compound/dha');
await m2.waitForSelector('.fa-card svg');
assert.match(await m2.textContent('.fa-card'), /n-3/);
await m2.waitForSelector('.v3d canvas');
await m2.click('[data-fa3d]');
await m2.waitForTimeout(300);
const groups = await m2.evaluate(() => document.querySelector('.v3d').__viewer3d.groups.map((g) => g.label));
assert.ok(groups.includes('n-3'), 'n-3 marked in 3D');
step('DHA: n-3 position coloured in the chart and in 3D');

await m2.goto(BASE + '#/compound/aspartame');
await m2.waitForSelector('.fg button');
await m2.click('[data-act="fg"]');
await m2.waitForTimeout(300);
const fg = await m2.evaluate(() => document.querySelector('.v3d').__viewer3d.groups.length);
assert.ok(fg >= 5, 'functional groups highlighted');
step(`functional groups highlighted (${fg} groups on aspartame)`);

await m2.goto(BASE + '#/quiz?id=ethanol');
await m2.waitForSelector('.quiz-text');
await m2.waitForSelector('.v2d svg');
await m2.waitForTimeout(500);
// the O of ethanol: find it from the drawn label
const oIdx = await m2.evaluate(() => {
  const svg = document.querySelector('.v2d svg');
  const e = [...svg.querySelectorAll('ellipse.hit')].find((el) => {
    const i = el.getAttribute('class').match(/atom-(\d+)/)[1];
    // heteroatom labels are drawn as paths whose class is exactly "atom-N"
    return [...svg.querySelectorAll('path')].some((p) => p.getAttribute('class') === `atom-${i}`);
  });
  return e.getAttribute('class').match(/atom-(\d+)/)[1];
});
// keep the atom away from the fixed bottom navigation before tapping
await m2.evaluate(() => document.querySelector('.v2d').scrollIntoView({ block: 'center' }));
await m2.locator(`.v2d svg ellipse.atom-${oIdx}`).click({ force: true });
assert.match(await m2.textContent('.quiz-result'), /正解/);
step('quiz: tapping the O of ethanol answers "hydroxy group"');

await m2.goto(BASE + '#/series?s=alkane');
await m2.waitForSelector('.series-svg');
await m2.locator('#n-slider').fill('4');
await m2.waitForTimeout(400);
assert.match(await m2.textContent('.series-name'), /ペンタン/);
step('series: slider changes the molecule');

// ---- M3 acceptance: assemble oleic acid (C18, cis double bond at 9),
// show it in 3D and share it; my molecules; 3D for a new molecule; free drawing
await m2.goto(BASE + '#/');
await m2.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('chemtouch:build') || k === 'chemtouch:mymols').forEach((k) => localStorage.removeItem(k)));
await m2.goto(BASE + '#/build?mode=assemble');
await m2.waitForSelector('.chain-ed');
await m2.locator('.build-slider').fill('18');
await m2.click('[data-end="cooh"]');
await m2.click('[data-tool="cis"]');
const bond9 = m2.locator('[data-bond="9"]');
await bond9.scrollIntoViewIfNeeded();
const b9 = await bond9.boundingBox();
await m2.touchscreen.tap(b9.x + b9.width / 2, b9.y + b9.height / 2);
assert.equal((await m2.textContent('.build-name h2')).trim(), 'cis-9-オクタデセン酸');
await m2.waitForSelector('.build-match .match-hit');
assert.match(await m2.textContent('.build-match .match-hit'), /オレイン酸/);
assert.match(m2.url(), /n=18&end=cooh&b=9c/);
step('build: C18 + -COOH + cis double bond at C9 -> "cis-9-オクタデセン酸" = オレイン酸');

// the valence rule: C=O on a carbon of the double bond is refused
await m2.click('[data-tool="oxo"]');
await m2.locator('[data-atom="9"]').click({ force: true });
assert.match(await m2.textContent('.toast'), /5本以上/);
step('build: a fifth bond on carbon is refused with an explanation');

await m2.click('[data-act="save"]');
await m2.fill('.sheet input', '自作のオレイン酸');
await m2.click('.sheet button[type="submit"]');
await m2.click('[data-act="view"]');
await m2.waitForURL(/#\/view\?/);
await m2.waitForSelector('.v3d canvas');
assert.match(await m2.textContent('.match'), /オレイン酸/);
step('build -> 3D view (library 3D model of oleic acid)');

await m2.click('[data-act="share2"]');
const builtUrl = (await m2.textContent('.sheet .url')).trim();
await m2.keyboard.press('Escape');
const m3 = await ctx.newPage();
await m3.goto(builtUrl);
await m3.waitForSelector('.v3d canvas');
assert.match(await m3.textContent('.match'), /オレイン酸/);
await m3.close();
step(`shared URL of the built molecule opens it: ${builtUrl.replace(/^.*#/, '#')}`);

await m2.goto(BASE + '#/build?mode=mine');
await m2.waitForSelector('.mine');
assert.match(await m2.textContent('.mine .nm'), /自作のオレイン酸/);
step('my molecules: the saved molecule is listed');

await m2.goto(BASE + '#/view?from=build&smiles=' + encodeURIComponent('C/C=C/C(C)=O'));
await m2.waitForSelector('.v3d canvas', { timeout: 60000 });
assert.equal(await m2.isVisible('.gen-credit'), true);
step('3D model computed in the browser for a molecule outside the library (stereo checked)');

await m2.goto(BASE + '#/build?mode=draw');
await m2.waitForSelector('.ocl-host canvas, .ocl-host [data-openchemlib-canvas-editor]');
await m2.fill('.smiles-in', 'OCC');
await m2.click('.smiles-row button');
await m2.waitForFunction(() => /C2H6O/.test(document.querySelector('.build-facts').textContent));
const ed = await m2.locator('.ocl-host').boundingBox();
await m2.touchscreen.tap(ed.x + ed.width * 0.75, ed.y + ed.height * 0.2);
await m2.waitForFunction(() => /C4H/.test(document.querySelector('.build-facts').textContent), null, { timeout: 5000 });
step(`free drawing: SMILES input and drawing by touch (${(await m2.textContent('.build-facts')).trim()})`);

// ---- つくる (reworked): top page, 書き方くらべ, かんたん作図, 書きかえ練習
await m2.evaluate(() => Object.keys(localStorage).filter((k) => /^chemtouch:(sketch|practice|notation)/.test(k)).forEach((k) => localStorage.removeItem(k)));
await m2.goto(BASE + '#/build');
assert.equal(await m2.locator('.bt-card').count(), 3);
await m2.click('.bt-card.hero');
await m2.waitForURL(/#\/build\/notation/);
await m2.waitForSelector('.nt-big svg');
assert.equal((await m2.textContent('.nt-name')).trim(), '構造式');
await m2.locator('.nt-slider').fill('3');
assert.equal((await m2.textContent('.nt-name')).trim(), '骨格構造式');
assert.match(m2.url(), /step=3/);
await m2.click('[data-step="2"]');
assert.equal((await m2.textContent('.nt-name')).trim(), '簡略構造式');
assert.match(await m2.textContent('[data-k="rational"]'), /CH3COOH/);
// tap the O of OH in the 示性式: the same atom lights up in the 簡略構造式
const oh = m2.locator('[data-k="rational"] .nt-a', { hasText: 'OH' });
const ohAtom = (await oh.getAttribute('data-a')).split(' ')[0];
await oh.click();
assert.equal(await m2.locator(`.nt-big .nt-a.on[data-a~="${ohAtom}"]`).count(), 1);
step('書き方くらべ: slider 構造式 -> 骨格構造式, tapping OH in the 示性式 highlights it in the 簡略構造式');

await m2.goto(BASE + '#/build/draw');
await m2.waitForSelector('.sks-coach');
await m2.click('[data-act="coach-ok"]');
const tapNode = async (i) => {
  const c = await m2.locator('svg.sk .sk-node').nth(i).boundingBox();
  await m2.touchscreen.tap(c.x + c.width / 2, c.y + c.height / 2);
};
assert.equal(await m2.locator('svg.sk .sk-node').count(), 1, 'one carbon to start from');
await tapNode(0); // select it
assert.match(await m2.textContent('.sks-hint'), /C を選んでいます/);
await m2.click('[data-act="ext1"]'); // C-C (the new carbon is selected)
await m2.click('[data-act="ext1"]'); // C-C-C
await m2.click('[data-act="el-O"]'); // the end carbon becomes O: C-C-O
await m2.waitForFunction(() => /エタノール/.test(document.querySelector('.sks-sheet').textContent), null, { timeout: 10000 });
assert.match(await m2.textContent('.sks-rat'), /C2H5OH/);
assert.match(m2.url(), /smiles=/);
step('かんたん作図: select the carbon, 伸ばす twice, O にする -> エタノール, 示性式 C2H5OH');

// shortcuts with real touch events: drag from an atom extends it, the
// page itself never scrolls; tap a bond and make it double; pinch zooms
const cdp = await m2.context().newCDPSession(m2);
const touch = async (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
const mid1 = await m2.locator('svg.sk .sk-node').nth(1).boundingBox();
const from = { x: mid1.x + mid1.width / 2, y: mid1.y + mid1.height / 2 };
await touch('touchStart', [from]);
for (let i = 1; i <= 8; i++) await touch('touchMove', [{ x: from.x, y: from.y - 8 * i }]);
await touch('touchEnd', []);
await m2.waitForFunction(() => /2-プロパノール/.test(document.querySelector('.sks-sheet').textContent), null, { timeout: 10000 });
assert.equal(await m2.evaluate(() => [scrollY, document.documentElement.classList.contains('sks-lock')].join()), '0,true');
const n0 = await m2.locator('svg.sk .sk-node').nth(0).boundingBox();
await m2.touchscreen.tap((n0.x + n0.width / 2 + from.x) / 2, (n0.y + n0.height / 2 + from.y) / 2); // middle of C1-C2
assert.match(await m2.textContent('.sks-hint'), /単結合を選んでいます/);
await m2.click('[data-act="bo2"]');
await m2.waitForFunction(() => /C3H6O/.test(document.querySelector('.sks-sheet').textContent), null, { timeout: 10000 });
const zoom0 = await m2.getAttribute('svg.sk > g', 'transform');
const c0 = { x: 187, y: 300 };
await touch('touchStart', [{ x: c0.x - 30, y: c0.y, id: 1 }, { x: c0.x + 30, y: c0.y, id: 2 }]);
for (let i = 1; i <= 6; i++) await touch('touchMove', [{ x: c0.x - 30 - 10 * i, y: c0.y, id: 1 }, { x: c0.x + 30 + 10 * i, y: c0.y, id: 2 }]);
await touch('touchEnd', []);
assert.notEqual(await m2.getAttribute('svg.sk > g', 'transform'), zoom0, 'pinch changes the zoom');
await m2.click('[data-act="undo"]');
await m2.waitForFunction(() => /2-プロパノール/.test(document.querySelector('.sks-sheet').textContent), null, { timeout: 10000 });
step('かんたん作図: drag from an atom extends it (2-プロパノール) without scrolling the page, tap a bond -> 二重, pinch zoom, undo');

// always-visible controls: 構造式 (H も) mode with "H を補う", clear all with
// an undo toast, keyboard shortcuts
await m2.click('[data-act="mode-full"]');
await m2.waitForSelector('.sks-addh:not([hidden])');
const lackH = +(await m2.textContent('.sks-addh .sks-badge'));
assert.equal(lackH, 8, '2-propanol needs 8 H');
await m2.click('.sks-addh');
assert.equal(await m2.isVisible('.sks-addh'), false);
assert.equal(await m2.locator('svg.sk .sk-l.sk-H').count(), 8);
await m2.click('[data-act="mode-skeletal"]');
assert.equal(await m2.locator('svg.sk .sk-l.sk-H').count(), 0);
await m2.click('[data-act="clear"]');
await m2.waitForSelector('.sks-toast:not([hidden])');
assert.equal(await m2.locator('svg.sk .sk-node').count(), 1);
await m2.click('.sks-toast [data-act="restore"]');
await m2.waitForFunction(() => /2-プロパノール/.test(document.querySelector('.sks-sheet').textContent), null, { timeout: 10000 });
await tapNode(0);
await m2.keyboard.press('n');
await m2.waitForFunction(() => /C2H7NO/.test(document.querySelector('.sks-sheet').textContent), null, { timeout: 10000 });
await m2.keyboard.press('Control+z');
await m2.waitForFunction(() => /2-プロパノール/.test(document.querySelector('.sks-sheet').textContent), null, { timeout: 10000 });
step('かんたん作図: 構造式 mode shows "H を補う 8" and adds them, back to 骨格構造式; すべて消す -> 元に戻す; keys N and Ctrl+Z');

// なぞって描く (#/build/draw2, on trial): trace a chain, drop -OH from the
// shelf, tap a bond, long-press menu, armed part + tap
await m2.evaluate(() => localStorage.removeItem('chemtouch:sketch:last'));
await m2.goto(BASE + '#/build/draw2');
await m2.waitForSelector('svg.sk .sk-empty');
const pb = await m2.locator('svg.sk').boundingBox();
const py = pb.y + pb.height / 2;
await touch('touchStart', [{ x: pb.x + 60, y: py }]);
for (let i = 1; i <= 12; i++) await touch('touchMove', [{ x: pb.x + 60 + 175 * i / 12, y: py }]);
await touch('touchEnd', []);
await m2.waitForFunction(() => /ペンタン/.test(document.querySelector('.sks-sheet').textContent), null, { timeout: 10000 });
assert.equal(await m2.evaluate(() => scrollY), 0);
const penNode = async (i) => { const bb = await m2.locator('svg.sk .sk-node').nth(i).boundingBox(); return { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 }; };
const ohKey = await m2.locator('[data-part="OH"]').boundingBox();
const end4 = await penNode(4);
await m2.mouse.move(ohKey.x + ohKey.width / 2, ohKey.y + ohKey.height / 2);
await m2.mouse.down();
await m2.mouse.move(end4.x, end4.y + 56, { steps: 10 });
await m2.mouse.up();
await m2.waitForFunction(() => /1-ペンタノール/.test(document.querySelector('.sks-sheet').textContent), null, { timeout: 10000 });
const [q0, q1] = [await penNode(0), await penNode(1)];
await m2.touchscreen.tap((q0.x + q1.x) / 2, (q0.y + q1.y) / 2);
await m2.waitForFunction(() => /C5H10O/.test(document.querySelector('.sks-sheet').textContent), null, { timeout: 10000 });
const q2 = await penNode(2);
await touch('touchStart', [q2]);
await m2.waitForTimeout(650);
await touch('touchEnd', []);
await m2.waitForSelector('.sks-menu:not([hidden])');
await m2.click('.sks-menu [data-act="m-remove"]');
await m2.waitForFunction(() => /2つ以上|読み取れ|C2H/.test(document.querySelector('.sks-sheet').textContent) || document.querySelectorAll('svg.sk .sk-node').length === 5, null, { timeout: 10000 });
await m2.click('[data-act="undo"]');
await m2.click('[data-part="=O"]');
assert.match(await m2.textContent('.sks-hint'), /=O がつきます/);
const q3 = await penNode(3);
await m2.touchscreen.tap(q3.x, q3.y);
await m2.waitForFunction(() => /C5H8O2/.test(document.querySelector('.sks-sheet').textContent), null, { timeout: 10000 });
step('なぞって描く: trace -> ペンタン, drop -OH -> 1-ペンタノール, tap a bond -> C=C, long-press menu 消す + undo, armed =O + tap');

// 書きかえ練習 えらぶ: answer the right option for every question
await m2.goto(BASE + '#/build/practice?mode=choose&focus=ethanol');
await m2.waitForSelector('.pr-setup');
await m2.click('[data-act="start"]');
await m2.waitForSelector('.pr-opt');
assert.ok(await m2.locator('.pr-opt').count() >= 3, 'at least 3 options');
await m2.locator('.pr-opt').first().click();
assert.equal(await m2.locator('.pr-opt.ok').count(), 1);
await m2.waitForSelector('.pr-explain');
assert.match(await m2.textContent('.pr-explain'), /エタノール/);
await m2.click('[data-act="next"]');
await m2.waitForFunction(() => /2 \/ /.test(document.querySelector('.pr-top')?.textContent || ''));
step('書きかえ練習 えらぶ: answered, the right option and the explanation are shown, next question');

// 並べる: ethanol from the 構造式 etc. -> C2H5 OH; a wrong block line is explained
await m2.goto(BASE + '#/build/practice?mode=blocks&focus=ethanol');
await m2.waitForSelector('.pr-setup');
await m2.click('[data-act="start"]');
await m2.waitForSelector('.pr-key');
for (const b of ['CH3', 'CH3', 'OH']) await m2.click(`.pr-key[data-b="${b}"]`);
await m2.click('[data-act="check"]');
assert.match(await m2.textContent('.pr-result'), /5 本|たりません|本/);
for (let k = 0; k < 3; k++) await m2.click('[data-act="bs"]');
for (const b of ['OH', 'CH2', 'CH3']) await m2.click(`.pr-key[data-b="${b}"]`);
await m2.click('[data-act="check"]');
await m2.waitForSelector('.pr-result .quiz-ok');
step('書きかえ練習 並べる: CH3 CH3 OH refused with the bond count, HO-CH2-CH3 accepted as エタノール');

// 描く: draw methanol on the full-screen drawing (select C, -OH)
await m2.goto(BASE + '#/build/practice?mode=draw&focus=methanol');
await m2.waitForSelector('.pr-setup');
await m2.click('[data-act="start"]');
await m2.waitForSelector('.sks-layer svg.sk');
await tapNode(0);
await m2.click('.sks-layer [data-act="g-OH"]');
await m2.click('.sks-layer [data-act="primary"]');
await m2.waitForSelector('.pr-result .quiz-ok');
assert.equal(await m2.isVisible('.sks-layer'), false);
step('書きかえ練習 描く: methanol drawn on the full-screen drawing is accepted');

// ---- M4 acceptance: build the electron configuration of Na, give an
// electron to Cl, go to the NaCl crystal; periodic table, detail, Lewis formulas
await m2.goto(BASE + '#/periodic');
await m2.waitForSelector('.pt-el');
assert.equal(await m2.locator('.pt-el').count(), 118);
await m2.click('[data-view="en"]');
assert.match(await m2.textContent('a.pt-el[href="#/periodic/F"]'), /3\.98/);
await m2.click('[data-filter="mineral"]');
assert.equal(await m2.locator('.pt-el:not(.dim)').count(), 16);
step('periodic table: 118 elements, electronegativity heat map (F 3.98), 16 nutrition minerals');

await m2.goto(BASE + '#/periodic/Fe');
await m2.waitForSelector('.el-hero');
assert.match(await m2.textContent('.mineral'), /鉄欠乏性貧血/);
assert.match(await m2.textContent('.content'), /ヘム/);
step('element detail: Fe shows mineral information and the compound heme');

await m2.goto(BASE + '#/electron/Na');
await m2.waitForSelector('.e-svg svg');
// a wrong answer first: everything on the K shell is refused at 3
for (let i = 0; i < 3; i++) await m2.click('[data-add="0"]');
assert.match(await m2.textContent('.toast'), /最大 2 個/);
for (let i = 0; i < 8; i++) await m2.click('[data-add="1"]');
await m2.click('[data-act="check"]');
assert.match(await m2.textContent('.e-result'), /残っています/);
// the last electron by tapping the M shell ring
const ringM = m2.locator('.ring-hit[data-ring="2"]');
const rb = await ringM.boundingBox();
await m2.touchscreen.tap(rb.x + rb.width / 2, rb.y + 2);
await m2.click('[data-act="check"]');
assert.match(await m2.textContent('.e-result'), /正解/);
assert.match(await m2.textContent('.e-result'), /価電子1 個/);
step('electron builder: Na = K2 L8 M1 (capacity and missing electrons explained)');

await m2.click('[data-act="lose"]');
assert.match(await m2.textContent('.e-result'), /ネオン（Ne）と同じ電子配置/);
step('ionisation: Na -> Na+ has the electron arrangement of Ne');

await m2.click('a.bridge');
await m2.waitForURL(/#\/bond\?type=ionic/);
await m2.click('[data-act="give"]');
await m2.waitForSelector('[data-act="crystal"]:not([hidden])');
assert.match(await m2.textContent('.bond-labels'), /Ar と同じ/);
await m2.click('[data-act="crystal"]');
await m2.waitForURL(/#\/compound\/nacl-crystal/);
await m2.waitForSelector('.v3d canvas');
step('Na gives its electron to Cl (Na+ / Cl-) -> NaCl crystal in 3D');

await m2.goto(BASE + '#/bond?type=covalent&m=nh3');
await m2.waitForSelector('.lewis');
assert.equal(await m2.locator('.lewis .lp-shared').count(), 6);
assert.equal(await m2.locator('.lewis .lp-lone').count(), 2);
step('covalent: NH3 electron-dot formula with 3 shared pairs and 1 lone pair');

// ---- M5: teacher presentation mode and offline use
await m2.goto(BASE + '?present=1#/compound/water');
await m2.waitForSelector('.v3d canvas');
assert.equal(await m2.evaluate(() => document.documentElement.classList.contains('presenting')), true);
assert.equal(await m2.isVisible('.nav'), false);
await m2.waitForFunction(() => document.querySelector('[data-act="spin"]')?.getAttribute('aria-pressed') === 'true');
await m2.click('.present-bar [data-act="qr"]');
await m2.waitForSelector('.present .qr svg');
await m2.keyboard.press('Escape');
await m2.click('.present-bar [data-act="exit"]');
assert.equal(await m2.isVisible('.nav'), true);
step('presentation mode: ?present=1 -> large view, auto rotation, big QR, exit button');
await m2.close(); // stop the rotating 3D view (software WebGL in CI is CPU heavy)

const off = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, locale: 'ja-JP' });
const op = await off.newPage();
op.on('pageerror', (e) => errors.push(e.message));
await op.goto(BASE + '#/compound/water');
await op.waitForSelector('.v3d canvas');
await op.evaluate(() => navigator.serviceWorker.ready);
await op.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
await op.reload(); // controlled by the worker now; RDKit etc. pass through it
await op.waitForSelector('.v3d canvas');
await op.waitForTimeout(1500); // let the worker finish caching
await off.setOffline(true);
await op.goto(BASE + '#/compound/water');
await op.reload();
await op.waitForSelector('.v3d canvas', { timeout: 20000 });
assert.match(await op.textContent('.mol-title h2'), /水/);
step('offline: a page opened once loads again without network (service worker)');
await off.close();

assert.deepEqual(errors, [], 'no page errors');
step('no JavaScript errors');
await browser.close();
