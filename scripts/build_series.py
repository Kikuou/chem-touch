#!/usr/bin/env python3
"""Build data/series.json: homologous series with boiling point, melting
point and water solubility taken from PubChem (spec B-3, section 4-4).

    python scripts/build_series.py            # needs PubChem
    python scripts/build_series.py --offline  # no network: keeps the values
                                              # already in series.json

Every value keeps its source: the PubChem data source (e.g. HSDB, CRC
Handbook) and the original text. A value is left out (null) when no
parsable, sourced value exists -- nothing is estimated. With three or more
entries, values far from their median (more than 10 deg C or 10 %) are
dropped before the most trusted source is chosen. Values listed in
scripts/series_exclude.json (with a reason) are never used. The other
parsable entries are kept as "candidates" so a teacher can review them.

Needs network access to PubChem; on GitHub Actions it runs after
build_compounds.py (see .github/workflows/pubchem.yml).
"""

from __future__ import annotations

import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
PUG_VIEW = "https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/data/compound"

SERIES = [
    {"id": "alkane", "label": "アルカン（直鎖）", "members": [
        ("methane", 1), ("ethane", 2), ("propane", 3), ("butane", 4), ("pentane", 5),
        ("hexane", 6), ("heptane", 7), ("octane", 8), ("nonane", 9)]},
    {"id": "alkanol", "label": "1-アルカノール（直鎖の第一級アルコール）", "members": [
        ("methanol", 1), ("ethanol", 2), ("1-propanol", 3), ("1-butanol", 4), ("1-pentanol", 5),
        ("1-hexanol", 6), ("1-heptanol", 7), ("1-octanol", 8), ("1-nonanol", 9)]},
    {"id": "carboxylic-acid", "label": "カルボン酸（直鎖）", "members": [
        ("formic-acid", 1), ("acetic-acid", 2), ("propionic-acid", 3), ("butyric-acid", 4),
        ("pentanoic-acid", 5), ("hexanoic-acid", 6), ("heptanoic-acid", 7), ("caprylic-acid", 8),
        ("nonanoic-acid", 9)]},
    {"id": "saturated-fatty-acid", "label": "飽和脂肪酸（C2〜C18）", "members": [
        ("acetic-acid", 2), ("propionic-acid", 3), ("butyric-acid", 4), ("pentanoic-acid", 5),
        ("hexanoic-acid", 6), ("heptanoic-acid", 7), ("caprylic-acid", 8), ("nonanoic-acid", 9),
        ("capric-acid", 10), ("lauric-acid", 12), ("myristic-acid", 14), ("palmitic-acid", 16),
        ("stearic-acid", 18)]},
]

HEADINGS = {"bp": "Boiling Point", "mp": "Melting Point", "sol": "Solubility"}

# Preferred data sources, most trusted first. Anything else counts after these.
SOURCE_ORDER = [
    "Hazardous Substances Data Bank (HSDB)",
    "CRC Handbook of Chemistry and Physics",
    "ILO-WHO International Chemical Safety Cards (ICSCs)",
    "Human Metabolome Database (HMDB)",
    "DrugBank",
]

NUM = r"[-−–]?\d+(?:\.\d+)?"


# ------------------------------------------------------------------ parsing

def _norm(s: str) -> str:
    s = re.sub(r"(\d),(\d{3})(?!\d)", r"\1\2", s)  # 22,000 -> 22000
    return (s.replace("−", "-").replace("–", "-").replace("°", "°")
            .replace("deg C", "°C").replace("deg F", "°F").replace("° C", "°C").replace("° F", "°F"))


def parse_temperature(text: str, kind: str) -> float | None:
    """Temperature in deg C from a PubChem text such as '78.2 °C',
    '173.1 °F (78.4 °C)', '-114.1 °C', '100.5 °C at 760 mm Hg'.
    Boiling points measured at another pressure are rejected."""
    t = _norm(text)
    low = t.lower()
    if "decomp" in low or "sublim" in low:
        return None
    if kind == "bp":
        m = re.search(r"(\d+(?:\.\d+)?)\s*mm\s*hg", low)
        if m and abs(float(m.group(1)) - 760) > 5:
            return None
        if re.search(r"\d\s*(kpa|torr|mbar)", low) and "101" not in low and "760" not in low:
            return None
    m = re.search(rf"({NUM})(?:\s*(?:to|-)\s*{NUM})?\s*°C", t)
    if m:
        return round(float(m.group(1).replace("−", "-")), 1)
    m = re.search(rf"({NUM})(?:\s*(?:to|-)\s*{NUM})?\s*°F", t)
    if m:
        return round((float(m.group(1)) - 32) * 5 / 9, 1)
    m = re.search(rf"({NUM})\s*K\b", t)
    if m:
        return round(float(m.group(1)) - 273.15, 1)
    return None


def _sci(s: str) -> float:
    # '1.0X10+6' / '2.2x10-3' / '1.5e+3' -> float
    s = s.replace("×", "X").replace("x10", "X10")
    m = re.fullmatch(r"(\d+(?:\.\d+)?)X10\s*([+-]?\d+)", s.strip(), re.I)
    if m:
        return float(m.group(1)) * 10 ** int(m.group(2))
    return float(s)


def parse_solubility(text: str):
    """Water solubility -> {'g_per_100ml': float} or {'miscible': True} or None.
    Only statements about water are used."""
    t = _norm(text)
    low = t.lower()
    if "water" not in low and "h2o" not in low:
        return None
    if re.search(r"\bmiscible\b", low) and not re.search(r"\bimmiscible\b|\bnot miscible\b", low):
        return {"miscible": True}
    num = r"(\d+(?:\.\d+)?(?:\s*[xX×]\s*10\s*[+-]?\d+)?)"
    for pat, factor in ((rf"{num}\s*mg\s*/\s*l\b", 1e-4), (rf"{num}\s*g\s*/\s*l\b", 0.1),
                        (rf"{num}\s*mg\s*/\s*ml\b", 0.1), (rf"{num}\s*g\s*/\s*100\s*ml\b", 1.0),
                        (rf"{num}\s*g\s*/\s*100\s*g\b", 1.0)):
        m = re.search(pat, low)
        if m:
            v = _sci(m.group(1).replace(" ", ""))
            return {"g_per_100ml": float(f"{v * factor:.3g}")}
    return None


def _strings(info) -> list[str]:
    v = info.get("Value", {})
    out = [x.get("String", "") for x in v.get("StringWithMarkup", [])]
    if "Number" in v:
        unit = v.get("Unit", "")
        out += [f"{n} {unit}".strip() for n in v["Number"]]
    return [s for s in out if s]


def _walk(sections, heading):
    for sec in sections or []:
        if sec.get("TOCHeading") == heading:
            yield from sec.get("Information", [])
        yield from _walk(sec.get("Section"), heading)


def pick_value(record: dict, key: str, exclude=()):
    """Best sourced value of one property from a PUG View record.
    `exclude`: original texts that must not be used (series_exclude.json).
    The other parsable entries are returned as 'candidates' for review."""
    rec = record.get("Record", {})
    refs = {r.get("ReferenceNumber"): r for r in rec.get("Reference", [])}
    cid = rec.get("RecordNumber")
    candidates = []
    for info in _walk(rec.get("Section"), HEADINGS[key]):
        ref = refs.get(info.get("ReferenceNumber"), {})
        source = ref.get("SourceName", "PubChem")
        for text in _strings(info):
            if text in exclude:
                continue
            value = parse_solubility(text) if key == "sol" else parse_temperature(text, key)
            if value is None:
                continue
            rank = SOURCE_ORDER.index(source) if source in SOURCE_ORDER else len(SOURCE_ORDER)
            candidates.append((rank, len(candidates), {
                "value": value if key != "sol" else None,
                **({"solubility": value} if key == "sol" else {}),
                "raw": text[:200],
                "source": source,
                "url": ref.get("URL") or f"https://pubchem.ncbi.nlm.nih.gov/compound/{cid}#section={HEADINGS[key].replace(' ', '-')}",
            }))
    if not candidates:
        return None
    if key != "sol" and len(candidates) >= 3:
        # drop outliers (e.g. a boiling point quoted without its reduced
        # pressure) before choosing by source: keep values near the median
        vals = sorted(c[2]["value"] for c in candidates)
        med = vals[len(vals) // 2]
        tol = max(10.0, abs(med) * 0.1)
        kept = [c for c in candidates if abs(c[2]["value"] - med) <= tol]
        candidates = kept or candidates
    best = dict(min(candidates, key=lambda c: (c[0], c[1]))[2])
    best["candidates"] = [
        {"v": c[2]["value"] if key != "sol" else c[2]["solubility"], "source": c[2]["source"]}
        for c in sorted(candidates, key=lambda c: (c[0], c[1]))[:8]
    ]
    if key != "sol":
        best.pop("solubility", None)
        best["unit"] = "°C"
    else:
        best.pop("value", None)
    return best


# ------------------------------------------------------------------ network

def fetch(cid: int, heading: str) -> dict | None:
    url = f"{PUG_VIEW}/{cid}/JSON?heading={urllib.parse.quote(heading)}"
    req = urllib.request.Request(url, headers={"User-Agent": "chem-touch-build/1.0"})
    for attempt in range(3):
        try:
            time.sleep(0.25)
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)
    return None


def main(argv=None) -> int:
    offline = "--offline" in (argv if argv is not None else sys.argv[1:])
    compounds = {c["id"]: c for c in json.loads((DATA / "compounds.json").read_text(encoding="utf-8"))["compounds"]}
    old = {}
    if (DATA / "series.json").exists():
        for s0 in json.loads((DATA / "series.json").read_text(encoding="utf-8"))["series"]:
            for m in s0["members"]:
                old[(s0["id"], m["id"])] = m
    excl = json.loads((ROOT / "scripts" / "series_exclude.json").read_text(encoding="utf-8"))["exclude"]
    cache: dict[tuple[int, str], dict | None] = {}
    out = []
    missing = []
    for s in SERIES:
        members = []
        for cid_, n in s["members"]:
            c = compounds[cid_]
            entry = {"id": cid_, "carbons": n, "bp": None, "mp": None, "sol": None}
            if offline and (s["id"], cid_) in old:  # keep values fetched earlier
                prev = old[(s["id"], cid_)]
                entry.update({k: prev.get(k) for k in HEADINGS})
            if c.get("pubchem_cid") and not offline:
                for key, heading in HEADINGS.items():
                    k = (c["pubchem_cid"], heading)
                    if k not in cache:
                        try:
                            cache[k] = fetch(*k)
                        except Exception as e:  # noqa: BLE001
                            print(f"! {cid_} {heading}: {e}", file=sys.stderr)
                            cache[k] = None
                    skip = [e["raw"] for e in excl if e["id"] == cid_ and e["key"] == key]
                    entry[key] = pick_value(cache[k], key, skip) if cache[k] else None
            for key in HEADINGS:
                if entry[key] is None:
                    missing.append(f"{cid_}:{key}")
            members.append(entry)
            print(f"  {s['id']:<22} {cid_:<16} bp={entry['bp'] and entry['bp']['value']} "
                  f"mp={entry['mp'] and entry['mp']['value']} sol={entry['sol'] and entry['sol']['solubility']}")
        out.append({"id": s["id"], "label": s["label"], "members": members})
    doc = {
        "note": "Generated by scripts/build_series.py from PubChem experimental properties (PUG View). "
                "Each value keeps its data source and the original text; null = no sourced value found.",
        "units": {"bp": "°C", "mp": "°C", "sol": "g/100 mL water"},
        "series": out,
    }
    (DATA / "series.json").write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"\nseries.json written; {len(missing)} values without a source: {', '.join(missing) or '-'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
