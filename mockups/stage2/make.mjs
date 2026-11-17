// Stage-2 screen mockups (docs/plan.md 提案1・5・11): the real app shell and
// CSS with new screens put into #app, then screenshots for review.
//   python3 -m http.server 8000 &  ;  node mockups/stage2/make.mjs
import { chromium } from 'playwright';

const OUT = new URL('./img/', import.meta.url).pathname;
const BASE = 'http://localhost:8000/';

// lessons and topics: the syllabus table of docs/plan.md §4 (topics are candidates)
const LESSONS = [
  [1, '物質を見分ける・物質の三態', '水・空気・食塩水・牛乳、ドライアイス'],
  [2, '原子のつくりと電子配置', '体をつくる元素 C・H・O・N'],
  [3, '周期表とイオン', '栄養ミネラル、スポーツドリンクの成分表示'],
  [4, 'イオン結合と組成式', '食塩、にがり、カルシウムのサプリ'],
  [5, '共有結合と分子の形', '水と CO₂ の形の違い'],
  [6, '分子間力と物質のなりたち', '水が 100 ℃ まで沸騰しない理由、水と油'],
  [7, '炭素がつくる分子と官能基', '都市ガスとお酒を構造式で書く、お酢、果物の香り'],
  [8, '原子量・分子量とモル', '角砂糖1個・水コップ1杯は何 mol？'],
  [9, '溶液の濃度', '生理食塩水と点滴、スポーツドリンク'],
  [10, '化学反応式と量の関係', 'ガスの燃焼、呼吸'],
  [11, '酸と塩基・pH', '胃液・レモン・血液・せっけん'],
  [12, '中和と塩', '胃薬（制酸薬）、酢とふくらし粉'],
  [13, '酸化と還元', 'りんごの変色とビタミンC、カイロ'],
  [14, '食べものと体の化学', '糖質・脂質・タンパク質、消化'],
  [15, 'くすり・くらしの化学と総まとめ', 'くすりの分子、せっけん、プラスチック'],
];
const DONE = [1, 2, 3, 5]; // できた印 in the mockups (example)

// colour card: Okabe–Ito colours + letter + shape (not colour alone)
const CC = [
  ['A', '#D55E00', '#fff', '●'],
  ['B', '#0072B2', '#fff', '▲'],
  ['C', '#F0E442', '#121417', '■'],
  ['D', '#009E73', '#fff', '◆'],
];

const CSS = `
.nav{position:fixed}
.mk-today{background:var(--hero);color:var(--hero-text);border-radius:var(--radius-tile);padding:16px 16px 14px;position:relative}
.mk-today .k{font-size:12px;color:#9FD3B4;font-weight:700;letter-spacing:.04em}
.mk-today h2{font-size:21px;line-height:1.35;margin-top:4px}
.mk-today .tp{font-size:13px;color:var(--hero-muted);margin-top:6px;line-height:1.5}
.mk-today .acts{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}
.mk-today .go{display:inline-flex;align-items:center;gap:6px;background:#fff;color:#1D2421;font-size:14px;font-weight:700;padding:0 16px;height:44px;border-radius:99px}
.mk-today .go svg{width:16px;height:16px}
.mk-today .cc{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--hero-chip-line);color:var(--hero-chip-text);font-size:14px;font-weight:600;padding:0 14px;height:44px;border-radius:99px}
.mk-today .pick{display:block;margin-top:12px;font-size:12.5px;color:var(--hero-chip-text);text-decoration:underline;text-underline-offset:3px}
.mk-dots{display:inline-flex;gap:3px}.mk-dots i{width:9px;height:9px;border-radius:2px;display:block}
.mk-life{display:grid;grid-template-columns:1fr 1fr;gap:8px;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-card);padding:10px}
.mk-life a{background:var(--surface-2);border-radius:14px;padding:12px;min-height:74px;display:flex;flex-direction:column;justify-content:space-between}
.mk-life b{font-size:15px}.mk-life span{font-size:11.5px;color:var(--muted);line-height:1.4}
.mk-life a.mk-soon{border:1px dashed var(--line);background:transparent}
.mk-rev{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;scrollbar-width:none}
.mk-rev a{flex:none;width:136px;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:10px 12px;min-height:92px;display:flex;flex-direction:column;gap:4px;position:relative}
.mk-rev .no{font-size:11.5px;color:var(--accent);font-weight:700}
.mk-rev b{font-size:13.5px;line-height:1.35}
.mk-rev .ok{position:absolute;top:8px;right:9px;width:20px;height:20px;border-radius:50%;background:var(--accent);color:#fff;font-size:12px;display:grid;place-items:center;font-weight:700}
.mk-more-link{display:flex;justify-content:space-between;align-items:center;font-size:13.5px;font-weight:600;color:var(--accent-ink);padding:10px 4px}
.mk-tools{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.mk-tools a{background:var(--surface);border:1px solid var(--line);border-radius:16px;min-height:76px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;font-size:12px;font-weight:600}
.mk-tools svg{width:24px;height:24px;color:var(--accent)}
.mk-list{display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-card);overflow:hidden}
.mk-list a{display:flex;align-items:center;gap:12px;padding:10px 14px;min-height:62px;border-bottom:1px solid var(--line)}
.mk-list a:last-child{border-bottom:0}
.mk-list .no{flex:none;width:34px;height:34px;border-radius:10px;background:var(--accent-weak);color:var(--accent-ink);display:grid;place-items:center;font-weight:700;font-size:14px}
.mk-list .no.on{background:var(--accent);color:#fff}
.mk-list .tx{flex:1;min-width:0}.mk-list b{font-size:14.5px;display:block;line-height:1.35}
.mk-list span.s{font-size:12px;color:var(--muted);display:block;margin-top:2px;line-height:1.4}
.mk-list .ok{font-size:11px;color:var(--accent-ink);background:var(--accent-weak);border-radius:6px;padding:2px 7px;flex:none;font-weight:600}
.mk-sec{font-size:13px;font-weight:700;color:var(--muted);margin:18px 4px 8px;letter-spacing:.04em;display:flex;justify-content:space-between;align-items:baseline}
.mk-sec a{font-size:12.5px;color:var(--accent-ink)}
.mk-topic{background:var(--warn-bg);color:var(--warn-ink);border-radius:var(--radius-card);padding:14px}
.mk-topic b{font-size:12px;letter-spacing:.04em}.mk-topic p{font-size:15px;line-height:1.6;margin-top:4px;color:var(--text)}
.mk-flow{display:flex;flex-direction:column;gap:8px}
.mk-flow a{display:flex;gap:12px;align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:12px;min-height:68px}
.mk-flow .n{flex:none;width:28px;height:28px;border-radius:50%;background:var(--accent);color:#fff;font-weight:700;display:grid;place-items:center;font-size:14px}
.mk-flow .tx{flex:1;min-width:0;color:var(--text)}.mk-flow b{font-size:15px;color:var(--text)}.mk-flow span{display:block;font-size:12.5px;color:var(--muted);margin-top:2px;line-height:1.45}
.mk-flow span.tag{display:inline-block;margin-top:0;font-size:10.5px;border:1px solid var(--line);border-radius:6px;padding:1px 6px;color:var(--muted);margin-left:6px;vertical-align:2px;font-weight:600}
.mk-flow svg.i{color:var(--muted)}
.mk-ccrow{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:10px}
.mk-ccrow i{height:34px;border-radius:9px;display:grid;place-items:center;font-style:normal;font-weight:800;font-size:16px}
.mk-end{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-card);padding:14px}
.mk-end h3{font-size:16px}.mk-end p{font-size:13px;color:var(--muted);margin:4px 0 12px}
.mk-ccsel{position:fixed;inset:0;background:var(--bg);z-index:50;display:flex;flex-direction:column;padding:12px 16px 24px}
.mk-ccsel header{display:flex;align-items:center;justify-content:space-between}
.mk-ccsel header h1{font-size:17px}
.mk-ccsel p{font-size:14px;color:var(--muted);margin:6px 0 12px;text-align:center}
.mk-ccsel .g{flex:1;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:12px}
.mk-ccsel .g button{border-radius:24px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-size:64px;font-weight:800;line-height:1}
.mk-ccsel .g button small{font-size:26px}
.mk-ccup{position:fixed;inset:0;z-index:60;display:flex;flex-direction:column;align-items:center;justify-content:center}
.mk-ccup .l{font-size:260px;font-weight:800;line-height:1}
.mk-ccup .s{font-size:80px;line-height:1;margin-top:-6px}
.mk-ccup .h{position:absolute;bottom:34px;font-size:14px;opacity:.85}
.mk-q{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-card);padding:16px}
.mk-q .p{font-size:12.5px;color:var(--muted);display:flex;justify-content:space-between}
.mk-q h2{font-size:18px;line-height:1.5;margin:8px 0 14px}
.mk-q .o{display:flex;flex-direction:column;gap:8px}
.mk-q .o button{display:flex;align-items:center;gap:12px;min-height:52px;border:1px solid var(--line);border-radius:14px;padding:0 14px;font-size:15px;text-align:left;background:var(--surface)}
.mk-q .o button i{font-style:normal;font-weight:800;width:26px;height:26px;border-radius:8px;display:grid;place-items:center;font-size:13px;background:var(--surface-2);flex:none}
.mk-q .o button.ok{border-color:var(--accent);background:var(--accent-weak)}
.mk-q .o button.ok i{background:var(--accent);color:#fff}
.mk-q .o button.ng{border-color:#E5484D}
.mk-q .ex{margin-top:12px;background:var(--accent-weak);color:var(--accent-ink);border-radius:12px;padding:10px 12px;font-size:13.5px;line-height:1.6}
.mk-res{text-align:center;padding:22px 16px}
.mk-res .big{font-size:44px;font-weight:800;color:var(--accent-ink)}
.mk-res .big small{font-size:20px;color:var(--muted)}
.mk-res ul{list-style:none;text-align:left;margin:16px 0;display:flex;flex-direction:column;gap:6px}
.mk-res li{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:10px 12px;font-size:14px;display:flex;gap:10px}
.mk-res li b{flex:none;width:22px;text-align:center}
.mk-draft{display:inline-block;font-size:11px;color:var(--warn-ink);background:var(--warn-bg);border-radius:6px;padding:1px 7px;margin-left:6px;vertical-align:2px;font-weight:600}
.mk-lifehead{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.mk-lifehead a{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-card);padding:14px;min-height:150px;display:flex;flex-direction:column;gap:6px}
.mk-lifehead a b{font-size:18px}
.mk-lifehead a span{font-size:12px;color:var(--muted);line-height:1.5}
.mk-lifehead a em{font-style:normal;margin-top:auto;font-size:12px;color:var(--accent-ink);font-weight:600}
.mk-lifehead a.mk-soon{border-style:dashed}
.mk-lifehead a.mk-soon em{color:var(--warn-ink)}
.mk-pj{position:fixed;inset:0;background:var(--bg);padding:28px 40px;display:grid;grid-template-columns:1fr 230px;gap:32px}
.mk-pj .k{font-size:18px;color:var(--accent);font-weight:700}
.mk-pj h1{font-size:40px;line-height:1.35;margin:10px 0 26px}
.mk-pj .o{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.mk-pj .o div{border-radius:22px;padding:20px 22px;display:flex;align-items:center;gap:18px;font-size:28px;font-weight:700;min-height:104px}
.mk-pj .o div i{font-style:normal;font-size:46px;font-weight:800;width:64px;text-align:center;line-height:1}
.mk-pj .o div i small{display:block;font-size:22px}
.mk-pj aside{display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center}
.mk-pj aside .qr{background:#fff;border-radius:16px;padding:10px;width:210px}
.mk-pj aside .qr svg{width:100%;height:auto;display:block}
.mk-pj aside p{font-size:15px;color:var(--muted);line-height:1.5}
.mk-pj .bar{position:absolute;left:40px;bottom:24px;display:flex;gap:12px}
.mk-pj .bar .btn{font-size:17px;min-height:52px;padding:0 22px}
.mk-file{font:13px/1.65 var(--mono);white-space:pre;background:#1D2421;color:#E6EEE9;border-radius:16px;padding:16px 18px;overflow:hidden}
.mk-file .c{color:#9FB3A8}
`;

function homeHtml(I) {
  return `<div class="page">
    <header class="topbar"><h1 class="brand">ケミタッチ</h1><div class="btns"><a class="cb inverse">${I('qr')}</a><a class="cb">${I('search')}</a></div></header>
    <section class="mk-today">
      <div class="k">今日の授業 ・ 第7回</div>
      <h2>炭素がつくる分子と官能基</h2>
      <p class="tp">身近な話題: 都市ガスとお酒を構造式で書く、お酢、果物の香り</p>
      <div class="acts"><a class="go">授業のページへ ${I('chev')}</a><a class="cc"><span class="mk-dots">${CC.map((c) => `<i style="background:${c[1]}"></i>`).join('')}</span>色カード</a></div>
      <a class="pick">ほかの回をえらぶ</a>
    </section>
    <div class="mk-sec">身近なもの</div>
    <div class="mk-life">
      <a><b>食品</b><span>糖質・脂質・アミノ酸・ビタミン</span></a>
      <a><b>からだ</b><span>代謝・神経伝達・ホルモン</span></a>
      <a><b>くすり・医療</b><span>くすり・消毒薬・医療ガス</span></a>
      <a class="mk-soon"><b>くらし</b><span>燃料・洗剤・プラスチック（準備中）</span></a>
    </div>
    <div class="mk-sec">基礎の復習<a>目次（全15回）›</a></div>
    <div class="mk-rev">${LESSONS.slice(0, 6).map(([n, t]) => `<a><span class="no">第${n}回</span><b>${t}</b>${DONE.includes(n) ? '<span class="ok">✓</span>' : ''}</a>`).join('')}</div>
    <div class="mk-sec">道具</div>
    <div class="mk-tools"><a>${I('table')}周期表</a><a>${I('shell')}電子配置</a><a>${I('compare')}くらべる</a><a>${I('build')}描く</a></div>
    <div style="height:90px"></div>
  </div>`;
}

function pickSheet() {
  return `<div class="sheet-backdrop"><div class="sheet" style="padding-bottom:20px">
    <div class="grab"></div><h2>今日の授業をえらぶ</h2>
    <p class="small muted" style="text-align:center;margin:2px 0 10px">先生が言った回をえらびます。いつでも変えられます。</p>
    <div class="mk-list">${LESSONS.slice(3, 11).map(([n, t, s]) => `<a><span class="no${n === 7 ? ' on' : ''}">${n}</span><span class="tx"><b>${t}</b><span class="s">${s}</span></span>${n === 7 ? '<span class="ok">今日</span>' : ''}</a>`).join('')}</div>
  </div></div>`;
}

function reviewHtml(I) {
  return `<div class="page"><div class="subbar"><button class="iconbtn">${I('back')}</button><h1>基礎の復習</h1></div>
    <p class="small muted" style="margin:0 4px 10px">15回の授業の目次です。✓ はこの端末で「おわりの3問」をやった回。</p>
    <div class="mk-list">${LESSONS.map(([n, t, s]) => `<a><span class="no${DONE.includes(n) ? ' on' : ''}">${n}</span><span class="tx"><b>${t}</b><span class="s">${s}</span></span>${DONE.includes(n) ? '<span class="ok">✓ できた</span>' : ''}</a>`).join('')}</div>
    <div style="height:90px"></div></div>`;
}

function lessonHtml(I) {
  const part = (n, title, sub, tag) => `<a><span class="n">${n}</span><span class="tx"><b>${title}</b><span class="tag">${tag}</span><span>${sub}</span></span>${I('chev')}</a>`;
  return `<div class="page"><div class="subbar"><button class="iconbtn">${I('back')}</button><h1>第7回</h1><button class="iconbtn">${I('qr')}</button></div>
    <div class="mol-title"><h2>炭素がつくる分子と官能基</h2></div>
    <div class="mk-topic"><b>身近な話題</b><p>都市ガスとお酒を構造式で書く。お酢、果物の香り、あぶらの飽和／不飽和。</p></div>
    <div class="mk-sec">きょうの流れ</div>
    <div class="mk-flow">
      ${part(1, '書き方くらべ', '同じ分子を、構造式・簡略構造式・骨格構造式・示性式で', '教材')}
      ${part(2, 'メタンとエタノールを描く', 'なぞって描く（都市ガスとお酒）', '作図')}
      ${part(3, '官能基クイズ', '分子の中の −OH や −COOH を見つける', '確認')}
      ${part(4, 'オレイン酸とエライジン酸', 'くらべる（シス形とトランス形）', 'くらべる')}
    </div>
    <div class="mk-sec">いっせい問題</div>
    <div class="mk-end"><h3>色カード</h3><p>先生が映した問題に、A〜D の色で答えます。画面を掲げてください。</p>
      <div class="mk-ccrow">${CC.map((c) => `<i style="background:${c[1]};color:${c[2]}">${c[0]}</i>`).join('')}</div>
      <a class="btn primary block" style="margin-top:12px">色カードを開く</a></div>
    <div class="mk-sec">おわりの3問</div>
    <div class="mk-end"><h3>きょうのまとめ（3問）</h3><p>答えはこの端末にだけ残ります。先生には送られません。</p><a class="btn primary block">はじめる</a></div>
    <div style="height:90px"></div></div>`;
}

function ccSelectHtml(I) {
  return `<div class="mk-ccsel"><header><button class="iconbtn">${I('close')}</button><h1>色カード</h1><span style="width:44px"></span></header>
    <p>先生の問題の答えをタップ。画面いっぱいに色が出たら、掲げてください。</p>
    <div class="g">${CC.map(([l, bg, fg, s]) => `<button style="background:${bg};color:${fg}">${l}<small>${s}</small></button>`).join('')}</div></div>`;
}

function ccUpHtml() {
  const [l, bg, fg, s] = CC[1];
  return `<div class="mk-ccup" style="background:${bg};color:${fg}"><div class="l">${l}</div><div class="s">${s}</div><div class="h">タップでえらび直す</div></div>`;
}

function quizHtml(I) {
  return `<div class="page"><div class="subbar"><button class="iconbtn">${I('close')}</button><h1>おわりの3問</h1></div>
    <div class="mk-q"><div class="p"><span>第7回</span><span>1 / 3</span></div>
      <h2>お酢の酸っぱさのもと「酢酸」にある官能基はどれ？<span class="mk-draft">例</span></h2>
      <div class="o">
        <button><i>A</i>ヒドロキシ基（−OH）</button>
        <button class="ok"><i>B</i>カルボキシ基（−COOH）</button>
        <button><i>C</i>アミノ基（−NH₂）</button>
        <button><i>D</i>エステル結合（−COO−）</button>
      </div>
      <div class="ex">せいかい。酢酸 CH₃COOH の −COOH がカルボキシ基です。</div>
      <a class="btn primary block" style="margin-top:12px">つぎへ</a>
    </div></div>`;
}

function quizResultHtml(I) {
  return `<div class="page"><div class="subbar"><button class="iconbtn">${I('close')}</button><h1>おわりの3問</h1></div>
    <div class="mk-res"><div class="small muted">第7回 炭素がつくる分子と官能基</div>
      <div class="big">2<small> / 3 問</small></div>
      <ul>
        <li><b style="color:var(--accent)">○</b>酢酸にある官能基</li>
        <li><b style="color:var(--accent)">○</b>エタノールの示性式</li>
        <li><b style="color:#E5484D">×</b>シス形とトランス形のちがい<span class="small muted" style="margin-left:auto">見直す ›</span></li>
      </ul>
      <p class="small muted">「基礎の復習」の第7回に ✓ がつきました（この端末だけ）。</p>
      <div class="two" style="margin-top:14px"><a class="btn">もう一度</a><a class="btn primary">ホームへ</a></div>
    </div></div>`;
}

function lifeHtml(I) {
  return `<div class="page"><div class="subbar"><button class="iconbtn">${I('back')}</button><h1>身近なもの</h1><button class="iconbtn">${I('search')}</button></div>
    <div class="mk-lifehead">
      <a><b>食品</b><span>糖質・脂肪酸と脂質・アミノ酸・ビタミン・味や色の成分</span><em>見る ›</em></a>
      <a><b>からだ</b><span>エネルギーの代謝・神経伝達物質・ホルモン</span><em>見る ›</em></a>
      <a><b>くすり・医療</b><span>くすり・消毒薬・医療ガス</span><em>見る ›</em></a>
      <a class="mk-soon"><b>くらし</b><span>燃料・洗剤・プラスチックなど</span><em>化合物を追加して準備中</em></a>
    </div>
    <div class="mk-sec">化学の分類からさがす</div>
    <div class="chips-row" style="flex-wrap:wrap">${['アルカン', 'アルケン・アルキン', 'アルコール', 'カルボン酸・エステル', 'アルデヒド・ケトン', '芳香族', 'アミン', 'すべての分類 ›'].map((x) => `<a class="chip">${x}</a>`).join('')}</div>
    <div style="height:90px"></div></div>`;
}

const PLAN_FILE = `<span class="c">// 授業プラン（2027年度）の1回分の例。年度ごとに1つのファイル</span>
{
  "no": 7,
  "title": "炭素がつくる分子と官能基",
  "topic": "都市ガスとお酒を構造式で書く。お酢、果物の香り…",
  "parts": [                        <span class="c">// 教材カタログの ID を並べる</span>
    "notation:acetic-acid",         <span class="c">// 書き方くらべ</span>
    "draw:methane,ethanol",         <span class="c">// なぞって描く</span>
    "quiz:functional-groups",       <span class="c">// 官能基クイズ</span>
    "compare:oleic-elaidic",        <span class="c">// くらべる</span>
    { "card": "果物の香りはエステル", "image": "…" }  <span class="c">// 部品にない話題</span>
  ],
  "colorcards": ["q7-1", "q7-2"],   <span class="c">// いっせい問題</span>
  "end3": ["q7-a", "q7-b", "q7-c"]  <span class="c">// おわりの3問</span>
}`;

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
async function shot(name, html, { tab = 'home', full = false, w = 375, h = 812, route = '#/more', extra = '', present = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: w < 900, hasTouch: true, locale: 'ja-JP', serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.goto(BASE + route);
  await p.waitForTimeout(800);
  await p.addStyleTag({ content: CSS + extra });
  await p.evaluate(async ({ html, tab, present }) => {
    const { icon } = await import('/js/core/icons.js');
    const { qrSvg } = await import('/js/core/share.js');
    const I = (n) => icon(n);
    const fn = new Function('I', 'QR', `return \`${html}\`;`);
    document.querySelector('#app').innerHTML = fn(I, (t) => qrSvg(t));
    document.querySelectorAll('.nav a').forEach((a) => (a.dataset.tab === tab ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    if (present) document.querySelector('.nav').style.display = 'none';
    window.scrollTo(0, 0);
  }, { html, tab, present });
  await p.waitForTimeout(300);
  if (full) {
    // a taller window instead of a full-page shot, so the tab bar stays at the bottom
    const H = await p.evaluate(() => document.documentElement.scrollHeight);
    await p.setViewportSize({ width: w, height: H });
    await p.waitForTimeout(200);
  }
  await p.screenshot({ path: OUT + name + '.png' });
  await ctx.close();
}

// render on the Node side with placeholder icons, then swap in the page
const ICON = (n) => `\${I('${n}')}`;
const esc = (s) => s.replace(/`/g, '\\`');
await shot('home', esc(homeHtml(ICON)));
await shot('home-full', esc(homeHtml(ICON)), { full: true });
await shot('home-pick', esc(homeHtml(ICON) + pickSheet()));
await shot('review', esc(reviewHtml(ICON)), { full: true });
await shot('lesson', esc(lessonHtml(ICON)), { full: true });
await shot('cc-select', esc(ccSelectHtml(ICON)), { present: true });
await shot('cc-up', esc(ccUpHtml()), { present: true });
await shot('end3-q', esc(quizHtml(ICON)), { present: true });
await shot('end3-result', esc(quizResultHtml(ICON)), { present: true });
await shot('life', esc(lifeHtml(ICON)), { tab: 'library' });
const PJ = `<div class="mk-pj"><div><div class="k">第7回 ・ いっせい問題 1</div>
  <h1>お酢の酸っぱさのもと「酢酸」にある官能基はどれ？</h1>
  <div class="o">${[['ヒドロキシ基（−OH）'], ['カルボキシ基（−COOH）'], ['アミノ基（−NH₂）'], ['エステル結合（−COO−）']].map(([t], i) => `<div style="background:${CC[i][1]};color:${CC[i][2]}"><i>${CC[i][0]}<small>${CC[i][3]}</small></i>${t}</div>`).join('')}</div></div>
  <aside><div class="qr">\${QR('https://kikuou.github.io/chem-touch/#/lesson/7')}</div><p><b>第7回のページ</b><br>スマホで読み取ると<br>色カードが使えます</p></aside>
  <div class="bar"><a class="btn">‹ 前の問題</a><a class="btn primary">答えを見せる</a><a class="btn">次の問題 ›</a></div></div>`;
await shot('projector', esc(PJ), { w: 1280, h: 720, present: true });
await browser.close();
console.log('done');
export { LESSONS, CC, PLAN_FILE };
