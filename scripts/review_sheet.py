#!/usr/bin/env python3
"""Check the draft texts all at once in a spreadsheet (docs/plan.md 提案7).

    python scripts/review_sheet.py export            # -> review/解説文の確認.csv
    python scripts/review_sheet.py import FILE.csv   # write the teacher's answers back

The CSV (UTF-8 with BOM, opens in Excel and Google Sheets) has one row per
text that is still a draft:
    種類 | ID | 項目 | いまの文 | 直した文 | 確認済み | メモ
The teacher writes a new text in 直した文 (or leaves it empty) and puts
○ in 確認済み when the text (as it is, or as corrected) is right.
import: a 直した文 replaces the text; ○ marks it reviewed. Nothing else is
changed. Rows whose いまの文 no longer matches the data are skipped (the
data changed after the export) and reported.

Texts covered: molecule notes (compounds.json), comparison notes
(comparisons.json), questions (questions.json), glossary (glossary.json),
lesson topics (plans/<current>.json), material texts (labs.json) and
element notes (scripts/element_notes.json; elements.json is rebuilt from it
by build_elements.py).
"""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HEAD = ["種類", "ID", "項目", "いまの文", "直した文", "確認済み", "メモ"]
YES = {"○", "〇", "◯", "✓", "✔", "はい", "済", "1", "true", "TRUE", "yes", "ok", "OK"}


def jload(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


def jsave(p: Path, doc, *, compact=False):
    text = json.dumps(doc, ensure_ascii=False, separators=(",", ":")) if compact else json.dumps(doc, ensure_ascii=False, indent=1)
    p.write_text(text + "\n", encoding="utf-8")


class Book:
    """The texts, where they live, and how to change / mark them."""

    def __init__(self, root: Path = ROOT):
        self.root = root
        d = root / "data"
        self.files = {
            "compounds": d / "compounds.json", "comparisons": d / "comparisons.json",
            "questions": d / "questions.json", "glossary": d / "glossary.json",
            "labs": d / "labs.json", "plans": d / "plans" / "index.json",
            "elements": root / "scripts" / "element_notes.json",
        }
        self.docs = {k: jload(p) for k, p in self.files.items()}
        cur = self.docs["plans"]["current"]
        self.files["plan"] = d / "plans" / f"{cur}.json"
        self.docs["plan"] = jload(self.files["plan"])
        self.changed: set[str] = set()

    # each entry: (kind, id, field, text, reviewed, set_text(new), mark())
    def entries(self):
        out = []
        D = self.docs
        for c in D["compounds"]["compounds"]:
            if c.get("note_ja"):
                out.append(("分子の解説", c["id"], c["name_ja"], c["note_ja"], c.get("note_reviewed", False),
                            self._setter("compounds", c, "note_ja"), self._marker("compounds", c, "note_reviewed")))
        for p in D["comparisons"]["presets"]:
            if p.get("note_ja"):
                out.append(("くらべるの解説", p["id"], p["title"], p["note_ja"], p.get("note_reviewed", False),
                            self._setter("comparisons", p, "note_ja"), self._marker("comparisons", p, "note_reviewed")))
        for q in D["questions"]["questions"]:
            mark = self._marker("questions", q, "reviewed")
            out.append(("問題", q["id"], f"第{q['lesson']}回 問題文", q["q"], q.get("reviewed", False), self._setter("questions", q, "q"), mark))
            for k, ch in enumerate(q["choices"]):
                label = "ABCD"[k] + ("（正解）" if k == q["answer"] else "")
                out.append(("問題", q["id"], f"選択肢 {label}", ch, q.get("reviewed", False), self._list_setter("questions", q["choices"], k), mark))
            out.append(("問題", q["id"], "説明", q.get("explain", ""), q.get("reviewed", False), self._setter("questions", q, "explain"), mark))
        g = D["glossary"]
        for t in g["terms"]:
            out.append(("用語集", t["term"], t["reading"], t["text"], t.get("reviewed", g.get("reviewed", False)),
                        self._setter("glossary", t, "text"), self._marker("glossary", t, "reviewed")))
        for l in D["plan"]["lessons"]:
            if l.get("topic"):
                out.append(("身近な話題", f"第{l['no']}回", l["title"], l["topic"], l.get("topic_reviewed", D["plan"].get("reviewed", False)),
                            self._setter("plan", l, "topic"), self._marker("plan", l, "topic_reviewed")))
        labs = D["labs"]
        for sid, st in labs["sorts"].items():
            for it in st["items"]:
                out.append(("なかまわけ", f"{sid}:{it['name']}", f"{st['title']} → {st['boxes'][it['box']]}", it.get("why", ""),
                            it.get("reviewed", st.get("reviewed", False)), self._setter("labs", it, "why"), self._marker("labs", it, "reviewed")))
        for x in labs["ph"]["examples"]:
            src = " / ".join(s["label"] for s in x["sources"])
            out.append(("pH の身近な例", x["name"], f"範囲 {x['low']}〜{x['high']}（出典: {src}）", x.get("note", ""),
                        x.get("reviewed", labs["ph"].get("reviewed", False)), self._setter("labs", x, "note"), self._marker("labs", x, "reviewed")))
        for k, gl in enumerate(labs["formula"]["goals"]):
            out.append(("組成式パズルのおだい", f"おだい{k + 1}", f"{gl['cation']} と {gl['anion']}", gl["text"],
                        gl.get("reviewed", labs["formula"].get("reviewed", False)), self._setter("labs", gl, "text"), self._marker("labs", gl, "reviewed")))
        el = D["elements"]
        for sym, text in el.get("notes", {}).items():
            out.append(("元素の説明", sym, "用途・体内での役割", text, el.get("reviewed") is True or sym in el.get("reviewed_notes", []),
                        self._dict_setter("elements", el["notes"], sym), self._sym_marker(sym, "reviewed_notes")))
        MF = {"role": "はたらき", "deficiency": "不足すると", "excess": "とりすぎると", "foods": "多く含む食品"}
        for sym, m in el.get("minerals", {}).items():
            mark = self._sym_marker(sym, "reviewed_minerals")
            for k, label in MF.items():
                if m.get(k):
                    out.append(("ミネラルの説明", sym, label, m[k], el.get("reviewed") is True or sym in el.get("reviewed_minerals", []),
                                self._dict_setter("elements", m, k), mark))
        return out

    def _setter(self, f, obj, key):
        def run(v):
            obj[key] = v
            self.changed.add(f)
        return run

    def _list_setter(self, f, lst, k):
        def run(v):
            lst[k] = v
            self.changed.add(f)
        return run

    def _dict_setter(self, f, d, key):
        def run(v):
            d[key] = v
            self.changed.add(f)
        return run

    def _marker(self, f, obj, key):
        def run():
            obj[key] = True
            self.changed.add(f)
        return run

    def _sym_marker(self, sym, key):
        def run():
            el = self.docs["elements"]
            el.setdefault(key, [])
            if sym not in el[key]:
                el[key].append(sym)
            self.changed.add("elements")
        return run

    def save(self):
        for f in sorted(self.changed):
            jsave(self.files[f], self.docs[f])


def export(path: Path, root: Path = ROOT) -> int:
    b = Book(root)
    rows = [e for e in b.entries() if not e[4]]
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(HEAD)
        for kind, id_, field, text, *_ in rows:
            w.writerow([kind, id_, field, text, "", "", ""])
    print(f"{path}: {len(rows)} rows to check")
    return len(rows)


def import_(path: Path, root: Path = ROOT) -> dict:
    b = Book(root)
    index = {(k, i, f): e for e in b.entries() for k, i, f in [(e[0], e[1], e[2])]}
    stats = {"changed": 0, "reviewed": 0, "skipped": []}
    marked = set()
    with path.open(encoding="utf-8-sig", newline="") as f:
        for n, r in enumerate(csv.DictReader(f), start=2):
            key = (r.get("種類", "").strip(), r.get("ID", "").strip(), r.get("項目", "").strip())
            new = (r.get("直した文") or "").strip()
            ok = (r.get("確認済み") or "").strip() in YES
            if not new and not ok:
                continue
            e = index.get(key)
            if e is None or e[3] != (r.get("いまの文") or ""):
                stats["skipped"].append(f"{n}行目 {'/'.join(key)}: データが書き出しのあとで変わったか、見つからない")
                continue
            if new and new != e[3]:
                e[5](new)
                stats["changed"] += 1
            if ok and id(e[6]) not in marked:
                e[6]()
                marked.add(id(e[6]))
                stats["reviewed"] += 1
    b.save()
    print(f"直した文: {stats['changed']}  確認済みにした項目: {stats['reviewed']}  とばした行: {len(stats['skipped'])}")
    for s in stats["skipped"]:
        print("  " + s)
    return stats


def main(argv=None) -> int:
    a = argv if argv is not None else sys.argv[1:]
    if a[:1] == ["export"]:
        export(ROOT / "review" / "解説文の確認.csv")
        return 0
    if a[:1] == ["import"] and len(a) == 2:
        import_(Path(a[1]))
        return 0
    print(__doc__)
    return 1


if __name__ == "__main__":
    sys.exit(main())
