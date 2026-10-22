// Acceptance scenarios of milestones M1–M3 (spec §8), on a 375px phone viewport.
// M1:
//   search "グルコース" -> open -> rotate 3D -> skeletal/all-atom switch ->
//   2D atom tap highlights 3D -> QR share -> the shared URL opens the same molecule
//   python3 -m http.server 8000 &  ;  npm run e2e
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL || 'http://localhost:8000/';
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ja-JP' });
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

assert.deepEqual(errors, [], 'no page errors');
step('no JavaScript errors');
await browser.close();
