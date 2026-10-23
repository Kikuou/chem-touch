# 教員向けガイド

ケミタッチを授業で使うための手引きです。プログラミングの知識がなくても、ブラウザで GitHub を操作するだけで作業できるように書いています。

- 公開サイト: https://kikuou.github.io/chem-touch/
- リポジトリ（データの置き場所）: https://github.com/Kikuou/chem-touch

---

## 1. 授業での使い方

### 1-1. 教員提示モード（PC ＋ プロジェクター）
プロジェクターに映しやすい表示に切り替えます。

- **入り方（どれか1つ）**
  - 「その他」→「教員提示モード」を **オン** にする
  - PC のキーボードで **P** キーを押す
  - URL の末尾に `?present=1` を付けて開く（例: `https://kikuou.github.io/chem-touch/?present=1#/compound/water`）
- **提示モードでの表示**
  - 文字と 3D 表示が大きくなる。分子は自動で回転する
  - 下部のタブや細かい説明文が隠れる
  - 右下の **QR** ボタン（または **Q** キー）で、いま映しているページの QR コードを画面いっぱいに表示する。学生はスマホのカメラで読み取ると同じページを開ける
- **終わり方**: 右下の「提示モード終了」、**P** キー、または `?present=0`
- 一度オンにすると、その PC のブラウザではオンのまま残ります（切るまで）

さらに大きくしたいときは、ブラウザの拡大（Ctrl ＋ ＋ / Mac は ⌘ ＋ ＋）を併用してください。

### 1-2. 学生に配る URL（QR）
どの画面も、URL を開けば同じ状態が表示されます。画面右上の QR ボタンから「投影用に大きく表示」もできます。

| 見せたいもの | URL の例（`https://kikuou.github.io/chem-touch/` に続けて書く） |
|---|---|
| 収録化合物 | `#/compound/alpha-d-glucose`（id は `scripts/compound_sources.csv` の1列目） |
| カテゴリ | `#/library?cat=fatty-acid` |
| 比較 | `#/compare/oleic-elaidic`、`#/compare/alanine-enantiomers` |
| 同族体シリーズ | `#/series?s=alkane` |
| 書き方くらべ | `#/build/notation?id=acetic-acid`（`&step=3` で骨格構造式から） |
| 書きかえ練習 | `#/build/practice?mode=choose`（`blocks` で示性式を並べる、`draw` で描く。`&focus=ethanol` で最初の問題を指定） |
| 描いた分子 | `#/build/draw?smiles=CCO` |
| 組み立てた分子 | `#/build/chain?n=18&end=cooh&b=9c`（オレイン酸の組み立て） |
| 任意の分子（SMILES） | `#/view?smiles=CCO&name=エタノール` |
| 元素 | `#/periodic/Na`、電子配置は `#/electron/Na` |
| 周期表の傾向 | `#/periodic?view=en`（電気陰性度）、`?filter=mineral`（栄養ミネラル） |
| イオン結合・共有結合 | `#/bond?type=ionic`、`#/bond?type=covalent&m=h2o` |

### 1-3. 1コマの流れの例（第2回「原子の構造と電子配置」）
1. PC で提示モードにして、ホームの授業帯から「電子配置」を開く
2. `#/electron/Na` を映し、Q キーで QR を表示 → 学生がスマホで開く
3. 学生が自分で電子を置いて「判定する」。教員は「おまかせ配置」で答え合わせ
4. 「電子を1個とる」で Na⁺ にして、Ne と同じ電子配置になることを確認
5. 「イオン結合へ」→ Na の電子を Cl に渡すアニメーション → 塩化ナトリウムの結晶を 3D で回す
6. 時間があれば「共有結合」タブで H₂O の電子式を見て、水の 3D へ

### 1-3b. 1コマの流れの例（有機化合物の構造式の書き方）
1. `#/build/notation?id=ethanol` を映す。スライダーを右へ動かし、構造式 → 構造式（結合角を考えた書き方）→ 簡略構造式 → 骨格構造式 と、何を省いていくかを確認する
2. 示性式の「OH」をタップ → どの書き方でも同じ O が光ることを見せる。「ほかの分子」で酢酸・酢酸エチルなどに切り替える
3. Q キーで QR を出し、学生は「書きかえ練習」→「えらぶ」を 10 問（まちがいの選択肢には、分子式が同じ異性体が優先して出ます）
4. 慣れたら「並べる」（示性式をブロックで組み立てる。結合の数が合わないと理由が出ます）、「描く」（骨格構造式を指で描く）
5. 書き方が違っても同じ分子なら正解です。鏡像異性体（R/S）は区別しません

練習に出す分子は `data/practice.json` で変えられます（炭素数 6 まで。編集のしかたは「3.」と同じ）。

### 1-4. ホームの授業帯（今週の授業）
`data/schedule.json` に授業の回・日付・単元名・リンクを書くと、ホームの最上部に「今週の授業」が出ます（空の `[]` なら帯は出ません）。書き方は `data/schedule.example.json` を見てください。

```json
[
  { "no": 2, "date": "2027-04-19", "title": "原子の構造と電子配置", "links": [{ "label": "電子配置", "href": "#/electron" }] }
]
```
編集のしかたは「3. GitHub のブラウザ画面で編集する」と同じです。

### 1-5. 教室の Wi-Fi が混んでいるとき
一度開いたページと分子は、端末に保存されます（オフライン対応）。そのため、2回目からは通信がほとんどなくても表示できます。授業の前に、学生に一度アプリを開いておいてもらうと安心です。スマホではブラウザのメニューから「ホーム画面に追加」すると、アプリのように起動できます。

---

## 2. 化合物を追加する

### 2-1. 必要な情報
`scripts/compound_sources.csv` に1行追加します。列は次のとおりです（`|` は複数の区切り）。

| 列 | 内容 | 例（乳酸） |
|---|---|---|
| `id` | 英小文字とハイフン。URL になる | `lactic-acid` |
| `name_ja` | 日本語名 | `乳酸` |
| `name_en` | 英語名 | `Lactic acid` |
| `reading` | ひらがなの読み（検索用） | `にゅうさん` |
| `aliases` | 別名（`|` 区切り、検索用） | `L-乳酸|(S)-2-ヒドロキシプロパン酸` |
| `categories` | カテゴリ（`|` 区切り。下の一覧から） | `carboxylic-acid|biomolecule` |
| `pubchem_query` | PubChem で検索する英語名 | `L-lactic acid` |
| `smiles` | 構造（SMILES）。立体も書く | `C[C@H](O)C(=O)O` |
| `checks` | 立体の確認（下記） | `cip=S` |
| `related` | 関連する収録化合物の id（`|` 区切り） | `propionic-acid|citric-acid` |
| `kind` | ふつうは空欄 | |
| `formula` | ふつうは空欄（自動） | |
| `note_ja` | ひとこと解説（2〜3文） | `ヨーグルトや漬物の酸味の成分で…` |

カテゴリの id: `basic` `alkane` `alkene-alkyne` `alcohol` `carboxylic-acid` `aldehyde-ketone` `ether` `fatty-acid` `carbohydrate` `amino-acid` `lipid` `vitamin` `food` `biomolecule` `drug`（小分類は `data/categories.json`）

**SMILES の調べ方**: PubChem（https://pubchem.ncbi.nlm.nih.gov/）で化合物を開き、「Isomeric SMILES」をコピーします。アプリの「つくる」→「かんたん作図」で描くと、アドレス欄の `smiles=` の後ろに SMILES が出ます（「ほか」→「上級エディタ」でも表示されます）。

**立体の確認 `checks`**（立体のある分子だけ。書いておくと、PubChem の構造と食い違ったときにエラーで知らせます）
- 不斉炭素: `cip=S`（R/S）
- 二重結合: `ez=Z`（シス型）、`ez=E`（トランス型）
- 脂肪酸: `fa=18:9Z`（炭素数:二重結合の位置と向き。複数は `fa=18:9Z,12Z`）
- 糖: `sugar=a-D-Glcp`（α-D-グルコピラノース）
- 鏡像体の混合物: `racemic`
- 迷ったら空欄でかまいません（開発者が確認します）

### 2-2. GitHub のブラウザ画面で追加する手順
1. https://github.com/Kikuou/chem-touch/blob/main/scripts/compound_sources.csv を開く
2. 右上の **鉛筆アイコン（Edit this file）** を押す
3. いちばん下に1行追加する。カンマを含む解説文は `"…"` で囲む
4. 右上の **Commit changes…** を押す
5. 「**Create a new branch for this commit and start a pull request**」を選び、**Propose changes** を押す
6. 次の画面で **Create pull request** を押す
7. 数分待つと、GitHub が自動で次の処理をします。
   - 「**PubChem check**」が PubChem で名前・構造・立体を照合し、3D 座標を作ってコミットを追加する
   - 結果は PR の「Checks」タブ → PubChem check → Summary で見られる。`verified` なら照合済み
   - 「**Check data**」がデータ全体を検査する。緑のチェックなら問題なし
8. 問題がなければ PR の **Merge pull request** → **Confirm merge**。1〜2分で公開サイトに反映されます

赤い ✕ が出たら、PR のコメントでそのまま開発者に相談してください。

### 2-3. 解説文を直す・確認済みにする
- 収録化合物の解説: `data/compounds.json` の `note_ja` を直接直します
  - 確認が済んだものは `"note_reviewed": false` を `true` にします（画面の「下書き」の印が消えます）
  - スクリプトを再実行しても、`note_ja` と `note_reviewed` は消えません
- 比較の解説: `data/comparisons.json` の `note_ja` と `note_reviewed`
- 元素の用途・栄養ミネラルの説明: `scripts/element_notes.json`
  - 全部確認したら、`"reviewed": false` を `true` にします
  - これらは「PubChem check」が `data/elements.json` に反映します
- 編集の手順は 2-2 と同じです（鉛筆アイコン → 新しいブランチで PR → マージ）

---

## 3. GitHub のブラウザ画面で編集する（共通）
どのファイルも、2-2 と同じ「鉛筆アイコン → Commit changes… → 新しいブランチ → Pull request → Merge」で変えられます。

- `main` に直接コミットすることもできますが、PR にすると自動チェックが通ってから反映できるので安全です
- 間違えてマージしても、PR の画面の **Revert** で元に戻せます

## 4. 困ったとき
| 症状 | 対処 |
|---|---|
| 公開サイトが更新されない | ブラウザで再読み込み（スマホは画面を下に引っぱる）。GitHub の Actions タブで「Deploy to GitHub Pages」が緑になっているか確認 |
| 3D が表示されない | 古い端末で WebGL が使えない可能性。構造式（2D）は表示されます |
| 提示モードが切れない | 右下の「提示モード終了」、または URL に `?present=0` を付けて開く |
| 学生の画面が古いまま | 一度通信のある場所で開き直すと最新版になります（オフライン用の保存は自動で更新） |
