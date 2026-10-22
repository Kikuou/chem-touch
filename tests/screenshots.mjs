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
  }
  await p.context().close();
}

await browser.close();
