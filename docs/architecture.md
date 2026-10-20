# 構成とモジュール境界

素の HTML / CSS / ES Modules（ビルド不要）。`index.html` が `js/main.js` を読み込み、
ハッシュルーティング（`#/...`）で画面を切り替える。GitHub Pages ではサーバーがハッシュを見ないので、
共有 URL（`#/compound/<id>` など）がそのまま機能する。

```
index.html            エントリ（下部タブを含む）
css/app.css           デザイントークン（ライト/ダーク）と全画面のスタイル
js/main.js            ルート表（画面を追加するときはここに1行足す）
js/core/              全モジュール共通
  router.js           ハッシュルーター（画面ごとに cleanup 関数を返せる）
  data.js             data/*.json と SDF の読み込み（キャッシュ）
  search.js           キーワード検索（ひらがな/カタカナ・全角/半角・α/alpha の揺れ吸収）
  share.js            共有 URL、QR 生成、投影用 QR 表示（D-1〜D-4）
  dom.js / icons.js   小さなヘルパー、線画アイコン
js/mol/               分子表示（M1〜M3 で共用）
  viewer3d.js         3Dmol.js ラッパー（回転・スタイル・水素・自動回転・原子/結合タップ）
  structure2d.js      RDKit.js による 2D 構造式（骨格式/全原子、タップ）
  molpanel.js         3D + 2D + 情報表示を連動させた部品（A-1〜A-9）
  fgroups.js          官能基の SMARTS 判定（M2 のハイライトでも使う）
  rdkit.js            RDKit.js の遅延読み込み
  elements.js         原子ポップアップ用の最小元素表（周期表データは M4 の data/elements.json）
js/views/             画面（1画面1ファイル）
  home.js, home-art.js   ホーム（授業帯 + ベントー・グリッド）
  library.js             分子ライブラリ（B-1）
  compound.js            分子詳細 #/compound/<id> と任意分子 #/view?smiles=（A-7, B-2, D-1）
  scan.js                QR 読み取り
  more.js                その他（テーマ設定・出典・ライセンス）
  placeholder.js         後続マイルストーンの仮画面
data/                 静的データ（scripts/ が生成。§4）
scripts/              データ生成・検証（Python + RDKit。本番では動かない）
vendor/               外部ライブラリ（バージョン固定）
tests/                Playwright によるスクリーンショットと E2E
```

## 後続マイルストーンの担当範囲

| M | 追加・変更するファイル | 触らない前提のもの |
|---|---|---|
| M2 比較・官能基・シリーズ | `js/views/compare.js`、`js/views/series.js`、`js/mol/molpanel.js` に官能基ハイライトのオプション、`data/comparisons.json`、`data/series.json`、CSV に §3-5〜3-10 を追記 | `js/core/*`（必要なら関数追加のみ） |
| M3 ビルダー | `js/views/build.js`、`js/mol/conformer.js`（OpenChemLib 等で 3D 化）、`#/view` で 3D が無い場合にそれを使う | ライブラリ・詳細画面 |
| M4 周期表・電子配置 | `js/periodic/`（新規ディレクトリ）、`data/elements.json`、ルート `#/periodic`・`#/electron` を差し替え | `js/mol/*` |

M1〜M3（分子系）と M4（周期表系）は `js/core/` だけを共有し、互いに import しない。

## 2D と 3D の原子番号を一致させる仕組み（A-9）
- 3D の SDF を唯一の原本にする。`scripts/build_compounds.py` は **重原子を先、水素を後** の順で SDF を書き、
  `scripts/validate_data.py` がこれを検査する。
- 全原子表示は SDF をそのまま RDKit.js で読み 2D 座標を付け直す → 原子番号 = SDF の番号。
- 骨格式は SDF から水素を除いて描く → 重原子 i の番号は SDF でも i のまま。
- 3Dmol.js の原子番号も SDF の順なので、タップした原子を相互にハイライトできる。

## 画面の作り方（ルートハンドラ）
```js
route('/example', async ({ el, params, query, isCurrent }) => {
  el.innerHTML = '...';
  return () => { /* 画面を離れるときの後片付け（3D ビューアの破棄など） */ };
}, { tab: 'library', title: '例' });
```
`el` は画面ごとに新しく作られる要素なので、非同期処理の途中で別画面に移っても前の画面が新しい画面を壊さない。
