# ケミタッチ（ChemTouch）作業の約束事

旭川市立大学 共通教養科目「化学」向けの学習 Web アプリ。静的サイト（GitHub Pages）。
公開: https://kikuou.github.io/chem-touch/

## 最初に読むもの
- **企画（確定版）: [docs/plan.md](docs/plan.md)** — 目指す姿、15回のシラバス案、提案1〜11、進め方、決定事項。実装はこの順に進める。
- 構成: [docs/architecture.md](docs/architecture.md)、機能の一覧とテスト方法: [README.md](README.md)
- `docs/dev_rules.md` はサーバー版フェーズ用で、この静的サイトには適用しない。

## やり取り
- 利用者（教員）とのやり取りは日本語。UI の文言も日本語。コード内のコメントとコミットメッセージは英語。
- 利用者は Python 初心者で、プログラマーではない。専門用語は言い換え、操作手順は具体的に書く。
- 大きな変更は、実装の前に案（必要なら画面イメージ）を示して確認を取る。「まだ始めないで」と言われたら実装しない。

## 化学データ
- 化学データを作らない・推測しない。CID・InChIKey・立体化学は PubChem で照合する。
- 化合物の追加は `scripts/compound_sources.csv` に行を足し、`python scripts/build_compounds.py` で生成する。PubChem に届かない環境では RDKit だけで生成し、push 後に GitHub Actions（`pubchem.yml`）が照合して結果をコミットする。そのコミットを取り込んでから次の push をする。
- 濃度・pH・原子量などの数値や「身近な例」は、出典を確かめ、教員に確認してから載せる。
- 新しい解説文は下書き（`note_reviewed: false`）として入れ、下書きであることを報告する。

## Git
- 作業ブランチで作業し、PR を作る。`main` に直接 push しない。**マージは利用者が行う**（こちらではマージしない）。
- マージ済みの PR には積まない。次の作業は最新の `main` からブランチを作り直す。
- コミットや PR にモデル名を書かない。

## 確認
- push の前に実行する:
  ```sh
  python scripts/validate_data.py
  node tests/test_notation.mjs && node tests/test_assemble.mjs && node tests/test_labs.mjs
  python3 -m http.server 8000 &   # 別ターミナルでも可
  npm run e2e
  ```
- 画面を変えたら `npm run screenshots` で `docs/screenshots/` を更新し、変更した画面の画像を目で確かめる（意図しない差分の画像はコミットしない）。
- スマホ幅（375px）を基準に作る。指の操作は e2e でタッチイベントを再現して確かめる。
- この開発環境には iPhone・Android の実機がない。実機で未確認のことは、そう報告する。

## 設計上の注意
- CSS のクラス名は画面ごとに接頭辞をつける（例: `sks-`, `nt-`, `pr-`）。短い共通名の衝突でホームの表示が崩れたことがある（`.pt`）。
- アプリのファイルを変えたら `sw.js` の `VERSION` を上げる（古い版がオフライン用に残るため）。
- 難しい機能は消さずに「くわしい表示」やオプションの奥に置く。表の画面は、化学を専門としない学生が説明なしで使えることを優先する。
- サーバー・ログイン・個人情報・アクセス解析は使わない。
