# ケミタッチ（仮称 / ChemTouch）

旭川市立大学 共通教養科目「化学」向け、スマホで触れる化学学習 Web アプリ。

- 3D 分子ビューア（2D 構造式と連動、官能基の色分け）
- 分子ライブラリ（化合物 193 件：化学基礎・有機化合物・脂肪酸・糖質・脂質・アミノ酸・ビタミン・食品成分・生体物質・医薬品）
- 比較モード（回転の同期、鏡像体の鏡像表示）、官能基クイズ、同族体シリーズ（沸点・融点・溶解度）、脂肪酸の n-3/n-6 表示
- URL / QR での共有、投影用の大きな QR 表示
- 「つくる」: 書き方くらべ（構造式→簡略構造式→骨格構造式、示性式・分子式・立体構造式・分子模型）、書きかえ練習（えらぶ・並べる・描く）、かんたん作図、炭素鎖の組み立て、マイ分子。作った分子をその場で 3D 化
- インタラクティブ周期表（傾向ヒートマップ・栄養ミネラル）、電子配置ビルダー、イオン結合・共有結合
- 教員提示モード（プロジェクター用）、オフライン対応（PWA）

**教員の方へ**: 授業での使い方と、化合物の追加・解説の確認のしかたは [docs/teacher_guide.md](docs/teacher_guide.md) にまとめています。

静的サイト（GitHub Pages）として無料で運用する。ログイン・個人情報・アクセス解析なし。

## ドキュメント
- **教員向けガイド（授業での使い方・化合物の追加方法）: [docs/teacher_guide.md](docs/teacher_guide.md)**
- 仕様書: [docs/spec.md](docs/spec.md)
- 構成とモジュール境界: [docs/architecture.md](docs/architecture.md)
- 開発ルール（サーバー版フェーズ用。静的サイトには適用しない）: [docs/dev_rules.md](docs/dev_rules.md)
- ホーム画面モック: [mockups/home_final.png](mockups/home_final.png)
- スクリーンショット（375px）: [docs/screenshots/](docs/screenshots/)

## ステータス
| M | 内容 | 状態 |
|---|---|---|
| M0 | 雛形・ハッシュルーティング・下部タブ・ホーム・Pages 自動デプロイ | 実装済み |
| M1 | 化合物データ生成（§3-1〜3-4、85件）、3D/2D ビューア A-1〜A-9、ライブラリ B-1〜B-2、共有 D-1〜D-4 | 実装済み（PubChem 照合は GitHub Actions で実行） |
| M2 | 残りの化合物（§3-5〜3-10、71件）、官能基ハイライト A-10〜A-12、比較 A-13〜A-16、クイズ A-17、シリーズ B-3、脂肪酸表示 B-4 | 実装済み |
| M3 | 分子ビルダー C-1〜C-9（組み立て・自由作図・マイ分子）、作った分子の 3D 化と共有 | 実装済み |
| M4 | 周期表 F-1〜F-6、電子配置ビルダー E-1〜E-5、結合への橋渡し E-6（Na→Cl の電子移動・電子式） | 実装済み |
| M5 | 教員提示モード（§5-2）、PWA（オフライン・ホーム画面に追加）、仕上げ、教員向けガイド | 実装済み |
| つくる改修 | 書き方くらべ・書きかえ練習・かんたん作図（下記）、練習用の分子 37 件を追加（C6 まで） | 実装済み |

## GitHub Pages での公開（初回のみ）
1. リポジトリを **Public** にする（無料プランの GitHub Pages は公開リポジトリが必要）
2. GitHub のリポジトリ画面で **Settings → Pages** を開く
3. **Build and deployment → Source** で **GitHub Actions** を選ぶ
4. `main` ブランチに変更が入ると `.github/workflows/pages.yml` が自動で走り、
   `https://<ユーザー名>.github.io/chem-touch/` で公開される
   （Actions タブの「Deploy to GitHub Pages」から手動実行も可能）

## 手元で動かす
ビルドは不要。リポジトリのルートで静的サーバーを起動してブラウザで開く。

```sh
python3 -m http.server 8000
# → http://localhost:8000/
```

`file://` で直接開くと ES Modules と fetch が動かないので、必ずサーバー経由で開く。

## 化合物データ
| ファイル | 内容 | 誰が編集するか |
|---|---|---|
| `scripts/compound_sources.csv` | 化合物の元リスト（id・名前・別名・カテゴリ・SMILES・立体化学チェック・関連化合物） | 教員・開発者 |
| `data/compounds.json` | アプリが読むデータ（スクリプトが生成） | 解説文 `note_ja` / `note_reviewed` は直接編集してよい |
| `data/sdf/<id>.sdf` | 3D 座標（スクリプトが生成） | 編集しない |
| `data/categories.json` | ライブラリのカテゴリ | 教員・開発者 |
| `data/functional_groups.json` | 官能基の SMARTS・色・名前・3D ラベル | 開発者 |
| `data/comparisons.json` | 比較プリセット（解説文つき、`note_reviewed` 方式） | 教員・開発者 |
| `data/series.json` | 同族体シリーズの沸点・融点・溶解度（`scripts/build_series.py` が PubChem から取得。値ごとに出典） | 編集しない |
| `data/schedule.json` | ホームの授業帯（空配列 `[]` なら帯を隠す）。書式は `data/schedule.example.json` | 教員 |
| `scripts/element_names_ja.csv` | 元素記号と日本語名（1〜118） | 開発者 |
| `scripts/element_notes.json` | 元素の用途・体内での役割、栄養ミネラル（はたらき・欠乏症・過剰症・食品）、人体の元素組成の順位、陰イオン名。すべて下書き。確認したら `"reviewed": true` にする | 教員 |
| `data/elements.json` | 周期表のデータ（`scripts/build_elements.py` が PubChem の周期表と上の2ファイルから生成） | 編集しない |

### 元素データ（M4）
- 原子量・電子配置・電気陰性度（ポーリング）・原子半径（ファンデルワールス半径）・第一イオン化エネルギー・融点・常温での状態・金属/非金属の区分は、[PubChem の周期表](https://pubchem.ncbi.nlm.nih.gov/periodic-table/)（パブリックドメイン）から `scripts/build_elements.py` が取得する
  - PubChem に値がないもの（超重元素の電気陰性度など）は空欄（null）。推定値は入れない
- 周期・族・ブロック・族名（アルカリ金属など）・K/L/M/N 殻の電子数は、スクリプトが計算する
  - 原子番号 1〜20 の殻の電子数は、PubChem の電子配置と「K2 L8 M8 N2」の規則の両方で求め、一致しなければエラーにする
- ランタノイド・アクチノイドは表の下に置き、3族の欄に「La–Lu」「Ac–Lr」と表示する（日本の教科書と同じ）
- PubChem に届く環境（GitHub Actions の「PubChem check」）で実行する。手元で `--offline` を付けると、取得済みの値を残したまま日本語名や解説だけを更新できる

### 化合物を追加・修正する
GitHub のブラウザ画面だけで追加する手順（教員向け）は [docs/teacher_guide.md](docs/teacher_guide.md) の「2. 化合物を追加する」を参照。以下は開発者向けの手順。

1. `scripts/compound_sources.csv` に1行追加する（`id` は英小文字ケバブケース）。
   立体化学のある分子は `checks` 列に期待値を書く（書式は `scripts/chemcheck.py` の冒頭を参照）。
   - 例: `cip=S`（乳酸）、`ez=Z`（cis-2-ブテン）、`fa=18:9Z`（オレイン酸）、`sugar=a-D-Glcp`（α-D-グルコース）
   - 鏡像体の混合物は `racemic`、実際に立体を区別しないもの（クロルヘキシジンの C=N など）は `stereo-undefined`
2. 生成と検証を実行する
   ```sh
   pip install -r scripts/requirements.txt
   python scripts/build_compounds.py      # PubChem に届けば照合、届かなければ RDKit のみ
   python scripts/validate_data.py
   ```
   PubChem に届かない環境では、ブランチに push すると GitHub Actions の「PubChem check」が
   PubChem で照合し、結果を同じブランチにコミットする（Actions タブから手動実行も可）。
3. 解説文は `data/compounds.json` の `note_ja` を直接直す。確認済みにしたら `note_reviewed` を `true` にする
   （スクリプトを再実行しても `note_ja` と `note_reviewed` は保持される）。

照合結果は `data/build_report.md` にまとまる。`verification.pubchem` の意味:

| 値 | 意味 |
|---|---|
| `verified` | 同じ InChIKey の PubChem レコードがあり、CSV の名前検索も同じ CID を返した |
| `structure-only` | 構造は PubChem にあるが、名前検索は別のレコードを返した（要確認） |
| `not-found` | 同じ InChIKey のレコードが PubChem にない |
| `unverified` | PubChem に問い合わせていない（オフライン生成） |

## オフライン対応（PWA）
- `sw.js`（サービスワーカー）と `manifest.webmanifest`。スマホでは「ホーム画面に追加」でアプリのように起動できる
- アプリ本体・データ（HTML・JS・CSS・JSON・SDF）は**ネットワーク優先**で取得する。通信できない、または 4 秒以上かかるときは保存済みのものを使う。そのため、更新はすぐ反映され、教室の Wi-Fi が混んでいても一度開いたページは開ける
- `vendor/` のライブラリはフォルダ名にバージョンが入っているので**保存優先**（RDKit の WASM など大きいファイルを毎回ダウンロードしない）
- 初回に読み込んだファイルは、ページからサービスワーカーに一覧を渡して保存する（`js/main.js`）
- ライブラリを更新するときは `vendor/<名前>-<新バージョン>/` という新しいフォルダにする（古い保存が使われ続けないように）

## テスト
```sh
python scripts/validate_data.py   # データ検証（SMILES・SDF・原子数・ID・立体化学・シリーズ・比較）
python tests/test_series_parse.py # PubChem の物性値テキストの読み取りテスト
node tests/test_assemble.mjs      # ビルダーの組み立て（SMILES・日本語名・シス/トランス・価標の規則）
node tests/test_notation.mjs      # 書き方（練習用 73 分子の示性式・構造式）と答え合わせ（同じ分子か）
python tests/test_elements.py     # 周期表の配置（周期・族）と電子殻の計算
npm install                       # Playwright（スクリーンショットと E2E 用）
python3 -m http.server 8000 &
npm run e2e                       # 受け入れシナリオ（M1: 検索→3D回転→骨格式/全原子→QR共有→共有URL、
                                  #   M2: 比較の同期回転・鏡像、DHA の n-3、官能基、クイズ、シリーズ、
                                  #   M3: オレイン酸の組み立て→3D→共有、マイ分子、3D 生成、自由作図、
                                  #   つくる: 書き方くらべの切り替えと原子の連動、かんたん作図でエタノール、練習 3 モード、
                                  #   M4: 周期表・元素詳細、Na の電子配置→Na⁺→Cl へ電子を渡す→NaCl 結晶、電子式）
npm run screenshots               # 375px 幅のスクリーンショットを docs/screenshots/ に保存
```

## 使用ライブラリとライセンス
外部ライブラリはバージョンを固定して `vendor/` に同梱している（CDN を使わない）。

| ライブラリ | バージョン | ライセンス | 用途 | 選定理由 |
|---|---|---|---|---|
| [3Dmol.js](https://3dmol.csb.pitt.edu/) | 2.5.4 | BSD-3-Clause | 3D 分子表示 | WebGL で軽量、スマホのタッチ回転・ピンチに標準対応、SDF をそのまま読める。比較モード（M2）用の視点同期 API もある |
| [RDKit.js](https://www.rdkit.org/) (MinimalLib) | 2026.03.6 | BSD-3-Clause | 2D 構造式・SMILES 解析・官能基判定（SMARTS）・InChIKey | 化合物データの生成（Python 版 RDKit）と同じエンジンで、骨格式/全原子の描画・立体の楔表示が正確。WASM（約 7 MB）は分子画面でのみ遅延読み込み |
| [OpenChemLib JS](https://github.com/cheminfo/openchemlib-js) | 9.25.1 | BSD-3-Clause | ビルダーの自由作図エディタ（C-6）、作った分子の 3D 配座生成（C-8） | 下記「ビルダーのライブラリ選定」 |
| [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) | 2.0.4 | MIT | QR コード生成 | 依存なし・軽量（約 50 KB）・SVG 出力で投影しても鮮明 |
| [jsQR](https://github.com/cozmo/jsQR) | 1.4.0 | Apache-2.0 | QR 読み取り（iPhone 等） | BarcodeDetector のない Safari 用の代替。読み取り画面でのみ読み込む |

ライセンス本文は `vendor/<ライブラリ>/LICENSE` にある。

### ビルダーのライブラリ選定（M3）
- **3D 配座の生成: OpenChemLib JS**（`ConformerGenerator` + `ForceFieldMMFF94` の MMFF94s+ で 500 ステップ最適化）
  - RDKit.js（MinimalLib）は 3D 座標を生成できない（2D 座標のみ）ため、仕様の候補のうち OpenChemLib を採用した
  - 計算は Web Worker で行い、画面は固まらない。開発環境（PC のヘッドレスブラウザ）で 1.4〜4 秒。スマホ実機では未計測
  - 生成後に RDKit.js で InChIKey を比べ、原子のつながりと、SMILES で指定したシス/トランス・R/S が 3D 座標でも保たれていることを確認する。合わなければ乱数の種を変えて最大3回やり直し、だめなら 2D だけを表示する
  - 乱数の種は固定（42）なので、同じ共有 URL はどの端末でも同じ形の 3D になる
  - 収録化合物と同じ分子なら、PubChem で照合済みの 3D 座標を使う
  - 配座生成に必要なデータ（ねじれ角の統計・MMFF94 パラメータ）だけを `resources-conformer.json` として同梱した。元の `resources.json` から毒性予測などの不要な表を除いたもので、約 950 KB（gzip で約 290 KB）。本体は約 1.1 MB（gzip で約 340 KB）。どちらも「つくる」画面と、収録されていない分子の 3D 表示のときだけ読み込む
- **2D 自由作図エディタ: OpenChemLib の CanvasEditor**
  - 候補の比較
    - Ketcher: React 製で数 MB と大きく、スマホ向けの画面ではない
    - JSME: GWT 製で古く、タッチ操作が限られる
    - OpenChemLib: Pointer Events で指の操作に対応し、3D 生成と同じライブラリなので追加の読み込みがない
  - 弱点はツールバーのボタンが小さい（約 20 px）こと。そこで CSS の `transform: scale()` で最大 1.6 倍に拡大して表示している（ボタン約 32 px）
    - CSS の `zoom` ではタップ位置がずれたため、`transform` を使っている
    - 拡大すると、読み込んだ分子が画面の右に寄ってしまう。そのため `js/mol/editor2d.js` で中央に移し直している
  - 仕様のタップ領域 44 px には届かないため、表には出さず「上級エディタ」（かんたん作図の「ほか」から開く）として残した

### 「つくる」の構成（改修後）
| 画面 | URL | 内容 |
|---|---|---|
| トップ | `#/build` | 書き方くらべ・書きかえ練習・かんたん作図の3つの入口 |
| 書き方くらべ | `#/build/notation?id=acetic-acid&step=0` | スライダーで 構造式 → 構造式（結合角を考えた書き方）→ 簡略構造式 → 骨格構造式 と省略していく。下に示性式・分子式・立体構造式・分子模型。原子をタップすると全部の書き方で同じ原子が光る |
| 書きかえ練習 | `#/build/practice?mode=choose\|blocks\|draw&focus=<id>` | 出された書き方を見て別の書き方で答える（えらぶ: 4択、まちがいの選択肢は異性体を優先／並べる: 示性式をブロックで／描く: 作図）。10問 |
| かんたん作図 | `#/build/draw?smiles=...` | 点の格子の上で、指で線をのばして描く（線は 60° 刻みのジグザグ）。表の道具は 線・二重・三重・O・N・消す だけ。「ほか」に H/Cl/Br/F/S、環、炭素鎖から始める、SMILES 入力、上級エディタ |
| 炭素鎖から始める | `#/build/chain?n=18&end=cooh&b=9c` | M3 の組み立て（炭素数・二重結合・官能基） |
| 上級エディタ | `#/build/advanced?smiles=...` | OpenChemLib のエディタ（M3 の自由作図） |
| マイ分子 | `#/build/mine` | この端末に保存した分子 |

古い URL（`#/build?mode=assemble|draw|mine`）は新しい URL に転送する。

- **書き方の呼び名**: 高校化学の教科書と IUPAC の用語に合わせた。分子式／示性式（rational formula）／構造式（structural formula）／簡略構造式（condensed structural formula）／骨格構造式（skeletal formula。IUPAC Gold Book では bond-line formula、線結合構造式ともいう）／立体構造式（くさび形表記: くさびは手前、破線は奥）／分子模型
- **答え合わせ**: 書き方が違っても同じ分子なら正解（RDKit.js で InChIKey を比べる）。鏡像異性体（R/S）は区別しない。シス/トランスは、問題の分子が指定しているときだけ区別する
- **示性式**: `js/mol/notation.js` が規則で作る（例: CH3COOH、C2H5OH、CH3COOC2H5、HCOOCH3、CH3CH(OH)CH3、CH2=CHCH3）。環をもつ分子は C6H5- を除いて示性式を作らず、分子式で示す。ブロックで並べた示性式は、各原子の結合の数（C 4、O 2、N 3、H 1）を確かめてから分子にする
- **練習の分子**: `data/practice.json`（炭素数 6 まで 73 分子。アルカン・アルケン・アルキン・シクロアルカン・アルコール・エーテル・アルデヒド・ケトン・カルボン酸・エステル・アミン・ベンゼン・フェノール）。自由に編集でき、`validate_data.py` が id と炭素数を確かめる
データ生成には [RDKit](https://www.rdkit.org/)（Python, BSD-3-Clause）を使う。開発用に [Playwright](https://playwright.dev/)（Apache-2.0）を使う（配信物には含まれない）。

化合物の構造は [PubChem](https://pubchem.ncbi.nlm.nih.gov/)（パブリックドメイン）で照合する。
