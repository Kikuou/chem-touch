// Take 375px-wide screenshots of the main screens.
//   python3 -m http.server 8000 &   (from the repository root)
//   npm install && npm run screenshots
// Output: docs/screenshots/*.png
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:8000/';
const OUT = new URL('../docs/screenshots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });

async function page(scheme = 'light') {
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: scheme,
    locale: 'ja-JP',
    serviceWorkers: 'block', // page.route() must see every request
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.error('[pageerror]', e.message));
  p.on('console', (m) => { if (m.type() === 'error') console.error('[console]', m.text()); });
  return p;
}

async function shot(p, name, opts = {}) {
  await p.screenshot({ path: OUT + name + '.png', ...opts });
  console.log('saved', name);
}

const example = await (await fetch(BASE + 'data/schedule.example.json')).text();

for (const scheme of ['light', 'dark']) {
  const sfx = scheme === 'dark' ? '-dark' : '';
  const p = await page(scheme);

  // Home with a lesson band (example schedule, date fixed inside the term)
  await p.route('**/data/schedule.json', (r) => r.fulfill({ body: example, contentType: 'application/json' }));
  await p.clock.setFixedTime(new Date('2027-05-12T10:00:00+09:00'));
  await p.goto(BASE + '#/');
  await p.waitForSelector('.band');
  await shot(p, 'home' + sfx);
  await p.unroute('**/data/schedule.json');

  if (scheme === 'light') {
    // Home outside the teaching period (empty schedule -> QR in header)
    await p.goto(BASE + '#/');
    await p.reload();
    await p.waitForSelector('.grid');
    await shot(p, 'home-no-band');
  }

  await p.goto(BASE + '#/library');
  await p.waitForSelector('.cat-grid');
  await shot(p, 'library' + sfx);

  await p.goto(BASE + '#/library?q=' + encodeURIComponent('ぐるこーす'));
  await p.waitForSelector('.item');
  await p.waitForTimeout(2500); // thumbnails (RDKit.js)
  await shot(p, 'library-search' + sfx);

  await p.goto(BASE + '#/compound/alpha-d-glucose');
  await p.waitForSelector('.v3d canvas');
  await p.waitForSelector('.v2d svg');
  await p.waitForTimeout(800);
  await shot(p, 'compound' + sfx);
  await shot(p, 'compound-full' + sfx, { fullPage: true });

  if (scheme === 'light') {
    await p.click('[data-mode="full"]');
    await p.waitForTimeout(300);
    await p.locator('.viewers').screenshot({ path: OUT + 'compound-allatoms.png' });
    await p.click('[data-mode="skeletal"]');

    await p.click('.subbar [data-act="share"]');
    await p.waitForSelector('.sheet .qr svg');
    await p.waitForTimeout(500);
    await shot(p, 'share-qr');
    await p.click('[data-act="present"]');
    await p.waitForSelector('.present');
    await shot(p, 'share-present');
    await p.keyboard.press('Escape');

    await p.goto(BASE + '#/compound/nacl-crystal');
    await p.waitForSelector('.v3d canvas');
    await p.waitForTimeout(600);
    await p.locator('.viewers').screenshot({ path: OUT + 'compound-nacl.png' });

    await p.goto(BASE + '#/compound/dha');
    await p.waitForSelector('.v2d svg');
    await p.waitForTimeout(600);
    await p.locator('.viewers').screenshot({ path: OUT + 'compound-dha.png' });

    await p.goto(BASE + '#/view?smiles=' + encodeURIComponent('CC(=O)Oc1ccccc1C(=O)O') + '&name=' + encodeURIComponent('アスピリン'));
    await p.waitForSelector('.v2d svg');
    await p.waitForTimeout(600);
    await shot(p, 'view-smiles');

    // ---- M2
    await p.goto(BASE + '#/compound/aspartame');
    await p.waitForSelector('.fg button');
    await p.waitForSelector('.v3d canvas');
    await p.click('[data-act="fg"]');
    await p.waitForTimeout(600);
    await p.locator('.molpanel').screenshot({ path: OUT + 'm2-functional-groups.png' });

    for (const id of ['oleic-elaidic', 'alanine-enantiomers', 'glucose-anomers']) {
      await p.goto(BASE + '#/compare/' + id);
      await p.waitForSelector('.cmp-3d canvas');
      await p.waitForTimeout(1000);
      await shot(p, 'm2-compare-' + id);
    }

    await p.goto(BASE + '#/compound/dha');
    await p.waitForSelector('.fa-card svg');
    await p.waitForSelector('.v3d canvas');
    await p.click('[data-fa3d]');
    await p.waitForTimeout(500);
    await p.locator('.v3d').screenshot({ path: OUT + 'm2-dha-3d.png' });
    await p.locator('.fa-card').screenshot({ path: OUT + 'm2-dha-chart.png' });

    await p.goto(BASE + '#/quiz?id=lactic-acid');
    await p.waitForSelector('.v2d svg');
    await p.waitForTimeout(600);
    await shot(p, 'm2-quiz');

    await p.goto(BASE + '#/series?s=alkanol&n=3');
    await p.waitForSelector('.series-svg');
    await p.waitForSelector('.series-3d canvas');
    await p.waitForTimeout(800);
    await shot(p, 'm2-series', { fullPage: true });

    await p.goto(BASE + '#/library?cat=amino-acid');
    await p.waitForSelector('.item');
    await p.waitForTimeout(2500);
    await shot(p, 'm2-library-amino-acids');

    // M3: builder
    await p.evaluate(() => localStorage.removeItem('chemtouch:mymols'));
    await p.goto(BASE + '#/build/chain?n=18&end=cooh&b=9c');
    await p.waitForSelector('.build-match .match-hit');
    await p.locator('.chain-wrap').evaluate((e) => { e.scrollLeft = 150; });
    await p.waitForTimeout(400);
    await shot(p, 'm3-build-oleic', { fullPage: true });
    await p.goto(BASE + '#/build/chain?n=4&b=2t&g=1oh');
    await p.waitForSelector('.build-2d svg');
    await p.waitForTimeout(800);
    await p.locator('.build-card').nth(1).screenshot({ path: OUT + 'm3-build-tools.png' });
    await p.goto(BASE + '#/view?from=build&name=' + encodeURIComponent('cis-9-オクタデセン酸') + '&smiles=' + encodeURIComponent('CCCCCCCC/C=C\\CCCCCCCC(=O)O'));
    await p.waitForSelector('.v3d canvas');
    await p.waitForTimeout(1000);
    await shot(p, 'm3-view-built');
    await p.goto(BASE + '#/view?from=build&name=' + encodeURIComponent('trans-3-ペンテン-2-オン') + '&smiles=' + encodeURIComponent('C/C=C/C(C)=O'));
    await p.waitForSelector('.v3d canvas', { timeout: 60000 });
    await p.waitForTimeout(1000);
    await shot(p, 'm3-view-generated', { fullPage: true });
    await p.goto(BASE + '#/build/advanced?smiles=' + encodeURIComponent('CC(=O)Oc1ccccc1C(=O)O'));
    await p.waitForSelector('.build-match .section-title');
    await p.waitForTimeout(800);
    await shot(p, 'm3-draw');
    await p.evaluate(() => {
      const now = Date.now();
      localStorage.setItem('chemtouch:mymols', JSON.stringify([
        { id: 'a', name: '自作のオレイン酸', smiles: 'CCCCCCCC/C=C\\CCCCCCCC(=O)O', build: { n: '18', end: 'cooh', b: '9c' }, created: now, updated: now },
        { id: 'b', name: 'trans-2-ブテン-1-オール', smiles: 'C/C=C/CO', build: { n: '4', b: '2t', g: '1oh' }, created: now, updated: now },
        { id: 'c', name: '描いたアスピリン', smiles: 'CC(=O)Oc1ccccc1C(=O)O', created: now, updated: now },
      ]));
    });
    await p.goto(BASE + '#/build/mine');
    await p.waitForSelector('.mine .thumb svg');
    await p.waitForTimeout(500);
    await shot(p, 'm3-mine');

    // つくる (reworked): top, 書き方くらべ, かんたん作図, 書きかえ練習
    await p.evaluate(() => Object.keys(localStorage).filter((k) => /^chemtouch:(sketch|practice|notation)/.test(k)).forEach((k) => localStorage.removeItem(k)));
    await p.goto(BASE + '#/build');
    await p.waitForSelector('.bt-card');
    await shot(p, 't-build-top');
    await p.goto(BASE + '#/build/notation?id=acetic-acid');
    await p.waitForSelector('.nt-big svg');
    await p.waitForTimeout(1200);
    await shot(p, 't-notation-acetic', { fullPage: true });
    await p.goto(BASE + '#/build/notation?id=ethyl-acetate&step=2');
    await p.waitForSelector('.nt-big svg');
    await p.click('[data-k="rational"] .nt-a >> text=COO');
    await p.waitForTimeout(1200);
    await shot(p, 't-notation-highlight');
    await p.goto(BASE + '#/build/draw');
    await p.waitForSelector('.sks-coach');
    await shot(p, 't-draw-coach');
    await p.click('[data-act="coach-ok"]');
    await p.goto(BASE + '#/build/draw?smiles=' + encodeURIComponent('CC(=O)O'));
    await p.waitForSelector('.sks-sheet .build-match:empty, .sks-sheet .sks-peek b');
    {
      const c = await p.locator('svg.sk .sk-node').nth(0).boundingBox();
      await p.touchscreen.tap(c.x + c.width / 2, c.y + c.height / 2);
    }
    await p.waitForTimeout(600);
    await shot(p, 't-draw');
    await p.click('[data-act="sheet"]');
    await p.waitForTimeout(800);
    await shot(p, 't-draw-sheet');
    await p.goto(BASE + '#/build/draw?smiles=' + encodeURIComponent('CCO'));
    await p.waitForSelector('svg.sk .sk-node');
    await p.click('[data-act="mode-full"]');
    await p.waitForTimeout(600);
    await shot(p, 't-draw-full');
    await p.click('[data-act="mode-skeletal"]');
    await p.setViewportSize({ width: 1280, height: 800 });
    await p.goto(BASE + '#/build/draw?smiles=' + encodeURIComponent('CC(=O)O'));
    await p.waitForSelector('.sks-sheet .build-match:not(:empty)');
    await p.waitForTimeout(800);
    await shot(p, 't-draw-desktop');
    await p.setViewportSize({ width: 375, height: 812 });
    await p.evaluate(() => localStorage.removeItem('chemtouch:sketch:last'));
    await p.goto(BASE + '#/build/draw2');
    await p.waitForSelector('svg.sk .sk-empty');
    await p.waitForTimeout(400);
    await shot(p, 't-draw2-empty');
    await p.goto(BASE + '#/build/draw2?smiles=' + encodeURIComponent('CCCC(=O)O'));
    await p.waitForSelector('.sks-sheet .sks-peek b');
    await p.click('[data-part="OH"]');
    await p.waitForTimeout(400);
    await shot(p, 't-draw2');
    for (const [mode, focus] of [['choose', '2-propanol'], ['blocks', 'ethyl-acetate'], ['draw', 'acetic-acid']]) {
      await p.goto(BASE + `#/build/practice?mode=${mode}&focus=${focus}`);
      await p.waitForSelector('.pr-setup');
      if (mode === 'choose') await shot(p, 't-practice-setup');
      await p.click('[data-act="start"]');
      await p.waitForSelector('.pr-q');
      if (mode === 'blocks') {
        for (const b of ['CH3', 'COO', 'C2H5']) await p.click(`.pr-key[data-b="${b}"]`);
        await p.click('[data-act="check"]');
      }
      if (mode === 'choose') {
        await p.locator('.pr-opt').first().click();
      }
      if (mode === 'draw') {
        await p.waitForSelector('.sks-layer svg.sk');
        await p.waitForTimeout(600);
        await shot(p, 't-practice-draw');
        continue;
      }
      await p.waitForTimeout(600);
      await shot(p, `t-practice-${mode}`, { fullPage: true });
    }

    // M4: periodic table, electrons, bonds
    for (const [hash, name, full] of [
      ['#/periodic?view=class&fit=0', 'm4-periodic', false],
      ['#/periodic?view=en&fit=1', 'm4-periodic-en-fit', false],
      ['#/periodic?view=class&filter=mineral&fit=0', 'm4-periodic-minerals', false],
      ['#/periodic/Fe', 'm4-element-fe', true],
      ['#/bond?type=covalent&m=h2o', 'm4-lewis-h2o', false],
    ]) {
      await p.goto(BASE + hash);
      await p.waitForSelector('.pt-el, .el-hero, .lewis');
      await p.waitForTimeout(500);
      await shot(p, name, { fullPage: full });
    }
    await p.goto(BASE + '#/electron/Na');
    await p.waitForSelector('.e-svg svg');
    await p.click('[data-act="auto"]');
    await p.waitForSelector('.ok-card');
    await shot(p, 'm4-electron-na', { fullPage: true });
    await p.goto(BASE + '#/bond?type=ionic');
    await p.waitForSelector('.bond-svg');
    await p.click('[data-act="give"]');
    await p.waitForSelector('[data-act="crystal"]:not([hidden])');
    await shot(p, 'm4-ionic-nacl');
  }
  if (scheme === 'dark') {
    await p.goto(BASE + '#/periodic?view=class&fit=1');
    await p.waitForSelector('.pt-el');
    await p.waitForTimeout(400);
    await shot(p, 'm4-periodic-dark');
    await p.goto(BASE + '#/build/chain?n=18&end=cooh&b=9c');
    await p.waitForSelector('.build-match .match-hit');
    await shot(p, 'm3-build-dark');
    await p.goto(BASE + '#/build/notation?id=ethyl-acetate&step=3');
    await p.waitForSelector('.nt-big svg');
    await p.waitForTimeout(1200);
    await shot(p, 't-notation-dark');
  }
  await p.context().close();
}

// M5: teacher presentation mode on a projector-sized screen
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, locale: 'ja-JP', serviceWorkers: 'block' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.error('[pageerror]', e.message));
  for (const [hash, name, sel] of [
    ['?present=1#/compound/alpha-d-glucose', 'm5-present-glucose', '.v3d canvas'],
    ['?present=1#/compare/oleic-elaidic', 'm5-present-compare', '.cmp-3d canvas'],
    ['?present=1#/periodic?view=en&fit=0', 'm5-present-periodic', '.pt-el'],
    ['?present=1#/bond?type=covalent&m=co2', 'm5-present-lewis', '.lewis'],
  ]) {
    await p.goto(BASE + hash);
    await p.waitForSelector(sel);
    // the automatic rotation is too heavy for the software WebGL used here
    await p.evaluate(() => document.querySelectorAll('[data-act="spin"][aria-pressed="true"]').forEach((b) => b.click()));
    await p.waitForTimeout(3000);
    await shot(p, name);
  }
  await p.click('.present-bar [data-act="qr"]');
  await p.waitForSelector('.present .qr svg');
  await shot(p, 'm5-present-qr');
  await ctx.close();
}

await browser.close();
