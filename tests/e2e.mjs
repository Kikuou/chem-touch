// Acceptance scenario of milestone M1 (spec §8), on a 375px phone viewport:
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

assert.deepEqual(errors, [], 'no page errors');
step('no JavaScript errors');
await browser.close();
