#!/usr/bin/env python3
"""Build data/elements.json for the periodic table and the electron
configuration builder (spec F, E, section 4-5).

    python scripts/build_elements.py            # needs PubChem
    python scripts/build_elements.py --offline  # no network: keeps the PubChem
                                                # values already in elements.json

Sources
  - PubChem periodic table (PUG REST, public domain): English name, atomic
    mass, electron configuration, Pauling electronegativity, atomic radius
    (van der Waals, pm), first ionization energy (eV), melting point (K),
    standard state, group block (metal / nonmetal / metalloid)
  - scripts/element_names_ja.csv: symbols and Japanese names (checked
    against the PubChem symbols)
  - scripts/element_notes.json: draft texts (uses, minerals), note_reviewed
Computed here: period, group, block, family (alkali metal ...) and the
K/L/M/N shell counts (from the PubChem configuration; for Z <= 20 also
from the filling rule K2 L8 M8 N2, and both must agree).
Values PubChem does not give stay null -- nothing is estimated.
"""

from __future__ import annotations

import csv
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
URL = "https://pubchem.ncbi.nlm.nih.gov/rest/pug/periodictable/JSON"
PAGE = "https://pubchem.ncbi.nlm.nih.gov/periodic-table/"

PUBCHEM_FIELDS = {  # our key: PubChem column
    "name_en": "Name",
    "mass": "AtomicMass",
    "config": "ElectronConfiguration",
    "en": "Electronegativity",
    "radius": "AtomicRadius",
    "ie": "IonizationEnergy",
    "mp": "MeltingPoint",
    "state": "StandardState",
    "pubchem_block": "GroupBlock",
}
NUMERIC = {"mass", "en", "radius", "ie", "mp"}

CORES = {
    "He": "1s2",
    "Ne": "[He] 2s2 2p6",
    "Ar": "[Ne] 3s2 3p6",
    "Kr": "[Ar] 3d10 4s2 4p6",
    "Xe": "[Kr] 4d10 5s2 5p6",
    "Rn": "[Xe] 4f14 5d10 6s2 6p6",
}
METALLIC = {
    "Nonmetal": "nonmetal", "Noble gas": "nonmetal", "Halogen": "nonmetal",
    "Metalloid": "metalloid",
    "Alkali metal": "metal", "Alkaline earth metal": "metal", "Transition metal": "metal",
    "Post-transition metal": "metal", "Lanthanide": "metal", "Actinide": "metal",
}


# ------------------------------------------------------------ layout

def period_of(z: int) -> int:
    for p, last in enumerate([2, 10, 18, 36, 54, 86, 118], start=1):
        if z <= last:
            return p
    raise ValueError(z)


def group_of(z: int) -> tuple[int | None, str | None]:
    """(group, series); lanthanoids 57-71 and actinoids 89-103 have no
    group here (shown below the table, as in Japanese textbooks)."""
    if z == 1:
        return 1, None
    if z == 2:
        return 18, None
    if 57 <= z <= 71:
        return None, "lanthanoid"
    if 89 <= z <= 103:
        return None, "actinoid"
    p = period_of(z)
    first = [0, 1, 3, 11, 19, 37, 55, 87][p]
    i = z - first
    if p in (2, 3):
        return (i + 1 if i < 2 else i + 11), None
    if p in (4, 5):
        return i + 1, None
    # periods 6, 7: two s-block, then 15 f-block in the series, then groups 4-18
    if i < 2:
        return i + 1, None
    return i - 14 + 1, None  # z = first + 17 -> group 4


def block_of(group: int | None, series: str | None, z: int) -> str:
    if series:
        return "f"
    if z == 2 or group in (1, 2):
        return "s"
    if 3 <= group <= 12:
        return "d"
    return "p"


def family_of(z: int, group: int | None) -> str | None:
    if group == 1 and z != 1:
        return "alkali"
    if group == 2:
        return "alkaline-earth"
    if group == 17:
        return "halogen"
    if group == 18:
        return "noble-gas"
    return None


# ------------------------------------------------------------ electrons

def expand_config(conf: str) -> str:
    conf = re.sub(r"\(.*?\)", " ", conf)
    for _ in range(6):
        m = re.search(r"\[(\w+)\]", conf)
        if not m:
            break
        conf = conf.replace(m.group(0), " " + CORES[m.group(1)] + " ", 1)
    return conf


def shells_from_config(conf: str) -> list[int] | None:
    counts: dict[int, int] = {}
    for n, _l, k in re.findall(r"(\d)([spdfg])(\d{1,2})", expand_config(conf)):
        counts[int(n)] = counts.get(int(n), 0) + int(k)
    if not counts:
        return None
    return [counts.get(n, 0) for n in range(1, max(counts) + 1)]


def shells_rule(z: int) -> list[int]:
    """K2 L8 M8 N2 filling used in high-school chemistry (valid for Z <= 20)."""
    out = []
    left = z
    for cap in (2, 8, 8, 2):
        k = min(cap, left)
        if k:
            out.append(k)
        left -= k
    return out


# ------------------------------------------------------------ PubChem

def fetch_pubchem() -> dict[int, dict]:
    req = urllib.request.Request(URL, headers={"User-Agent": "chem-touch-build/1.0"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                doc = json.loads(r.read())
            break
        except Exception:  # noqa: BLE001
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)
    cols = doc["Table"]["Columns"]["Column"]
    missing = [c for c in ["AtomicNumber", "Symbol", *PUBCHEM_FIELDS.values()] if c not in cols]
    if missing:
        raise RuntimeError(f"PubChem periodic table lacks columns: {missing}")
    out = {}
    for row in doc["Table"]["Row"]:
        cell = dict(zip(cols, row["Cell"]))
        out[int(cell["AtomicNumber"])] = cell
    return out


def number(s: str):
    s = (s or "").strip()
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def main(argv=None) -> int:
    offline = "--offline" in (argv if argv is not None else sys.argv[1:])
    with (ROOT / "scripts" / "element_names_ja.csv").open(encoding="utf-8") as f:
        names = {int(r["z"]): r for r in csv.DictReader(f)}
    notes = json.loads((ROOT / "scripts" / "element_notes.json").read_text(encoding="utf-8"))

    old = {}
    old_status = "not-fetched"
    if (DATA / "elements.json").exists():
        prev = json.loads((DATA / "elements.json").read_text(encoding="utf-8"))
        old = {e["z"]: e for e in prev["elements"]}
        old_status = prev.get("source", {}).get("status", "not-fetched")

    pub = {}
    status = old_status
    if not offline:
        pub = fetch_pubchem()
        status = "fetched"

    errors = []
    elements = []
    body = notes["body_order"]
    for z in range(1, 119):
        sym = names[z]["symbol"]
        group, series = group_of(z)
        e = {
            "z": z, "symbol": sym, "name_ja": names[z]["name_ja"], "name_en": None,
            "period": period_of(z), "group": group, "series": series,
            "block": block_of(group, series, z), "family": family_of(z, group),
            "kind": "transition" if series or (group and 3 <= group <= 12) else "main",
        }
        for k in PUBCHEM_FIELDS:
            e[k] = None
        if pub:
            cell = pub[z]
            if cell["Symbol"] != sym:
                errors.append(f"Z={z}: symbol {sym} != PubChem {cell['Symbol']}")
            for k, col in PUBCHEM_FIELDS.items():
                v = cell.get(col, "")
                e[k] = number(v) if k in NUMERIC else (v.strip() or None)
        elif z in old:  # keep the values fetched earlier
            for k in PUBCHEM_FIELDS:
                e[k] = old[z].get(k)
        e["metallic"] = METALLIC.get(e["pubchem_block"] or "")
        e["shells"] = shells_from_config(e["config"]) if e["config"] else None
        if e["shells"] and sum(e["shells"]) != z:
            errors.append(f"{sym}: shells {e['shells']} from '{e['config']}' do not add up to {z}")
            e["shells"] = None
        if z <= 20:
            rule = shells_rule(z)
            if e["shells"] and e["shells"] != rule:
                errors.append(f"{sym}: PubChem shells {e['shells']} != K2 L8 M8 N2 rule {rule}")
            e["shells"] = rule
        if sym in notes["notes"]:
            e["note_ja"] = notes["notes"][sym]
            e["note_reviewed"] = bool(notes.get("reviewed"))
        if sym in notes["minerals"]:
            e["mineral"] = {**notes["minerals"][sym], "reviewed": bool(notes.get("reviewed"))}
        if sym in body:
            e["body_rank"] = body.index(sym) + 1
        if sym in notes["anions"]:
            e["anion_ja"] = notes["anions"][sym]
        elements.append(e)

    if errors:
        print("\n".join("ERROR: " + x for x in errors), file=sys.stderr)
        return 1

    doc = {
        "note": "Generated by scripts/build_elements.py. Do not edit by hand: change "
                "scripts/element_names_ja.csv or scripts/element_notes.json and run the script.",
        "source": {
            "name": "PubChem Periodic Table (public domain)", "url": URL, "page": PAGE, "status": status,
            "fields": {k: f"PubChem {v}" for k, v in PUBCHEM_FIELDS.items()},
        },
        "units": {"mass": "u (standard atomic weight)", "en": "Pauling", "radius": "pm (van der Waals)",
                  "ie": "eV (first ionization energy)", "mp": "K"},
        "body_note": notes["body_note"],
        "mineral_source": notes["mineral_source"],
        "elements": elements,
    }
    (DATA / "elements.json").write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    n_mass = sum(1 for e in elements if e["mass"] is not None)
    print(f"elements.json written: 118 elements, PubChem {status}, atomic mass for {n_mass}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
