#!/usr/bin/env python3
"""Round trip of the review sheet (scripts/review_sheet.py) on a copy of
the data: export, fill in a few rows like the teacher would, import.

    python tests/test_review.py
"""

import csv
import json
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import review_sheet as rs  # noqa: E402

FILES = ["data/compounds.json", "data/comparisons.json", "data/questions.json", "data/glossary.json",
         "data/labs.json", "data/plans/index.json", "data/plans/2027.json", "scripts/element_notes.json"]


def main() -> int:
    n = 0
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        for f in FILES:
            (root / f).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(ROOT / f, root / f)
        sheet = root / "review.csv"
        total = rs.export(sheet, root)
        with sheet.open(encoding="utf-8-sig", newline="") as f:
            rows = list(csv.DictReader(f))
        assert len(rows) == total and total > 0
        def find(kind, id_, field=None):
            return next(r for r in rows if r["種類"] == kind and r["ID"] == id_ and (field is None or r["項目"] == field))
        # 1. a corrected molecule note, marked as checked
        r = find("分子の解説", "water")
        r["直した文"] = "テスト用に直した文。"
        r["確認済み"] = "○"
        # 2. a question checked on its 説明 row only (marks the whole question)
        find("問題", "q7-1", "説明")["確認済み"] = "✓"
        # 3. a glossary term corrected but not yet checked
        find("用語集", "分子")["直した文"] = "原子が結びついた粒（テスト）。"
        # 4. a row whose いまの文 no longer matches: skipped
        bad = find("分子の解説", "ammonia")
        bad["いまの文"] = "ちがう文"
        bad["確認済み"] = "○"
        # 5. a mineral text checked
        find("ミネラルの説明", "Na", "はたらき")["確認済み"] = "はい"
        with sheet.open("w", encoding="utf-8-sig", newline="") as f:
            w = csv.DictWriter(f, fieldnames=rs.HEAD)
            w.writeheader()
            w.writerows(rows)
        stats = rs.import_(sheet, root)
        assert stats["changed"] == 2, stats
        assert stats["reviewed"] == 3, stats
        assert len(stats["skipped"]) == 1, stats
        comp = {c["id"]: c for c in json.loads((root / "data/compounds.json").read_text())["compounds"]}
        assert comp["water"]["note_ja"] == "テスト用に直した文。" and comp["water"]["note_reviewed"] is True
        assert comp["ammonia"]["note_reviewed"] is False
        q = {x["id"]: x for x in json.loads((root / "data/questions.json").read_text())["questions"]}
        assert q["q7-1"]["reviewed"] is True and q["q7-2"]["reviewed"] is False
        g = {t["term"]: t for t in json.loads((root / "data/glossary.json").read_text())["terms"]}
        assert g["分子"]["text"] == "原子が結びついた粒（テスト）。" and not g["分子"].get("reviewed")
        el = json.loads((root / "scripts/element_notes.json").read_text())
        assert el["reviewed_minerals"] == ["Na"] and "reviewed_notes" not in el
        n += 9
        # a second export leaves out what was checked
        again = rs.export(root / "again.csv", root)
        assert again == total - 1 - 6 - 4, (total, again)  # water, q7-1 (6 rows), Na mineral (4 rows)
        n += 1
    print(f"{n} checks, 0 failures")
    return 0


if __name__ == "__main__":
    sys.exit(main())
