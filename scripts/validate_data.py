#!/usr/bin/env python3
"""Validate the data files used by the web app.

    python scripts/validate_data.py

Checks (spec §8, run at the end of every milestone):
  - every compound has the required fields, ids are unique kebab-case
  - every SMILES parses with RDKit
  - every SDF exists, parses, and has the same number of atoms as the
    SMILES with explicit hydrogens (crystals: as recorded in "atoms")
  - hydrogens come after all heavy atoms in each SDF (2D/3D index rule)
  - the stereo of the 3D coordinates reproduces the SMILES, the InChIKey
    matches, and the stereo checks of compound_sources.csv still pass
  - categories and related ids exist; schedule.json has the expected shape
Exit code 0 = OK, 1 = errors found.
"""

from __future__ import annotations

import csv
import json
import re
import sys
from pathlib import Path

from rdkit import Chem, RDLogger

sys.path.insert(0, str(Path(__file__).resolve().parent))
import chemcheck  # noqa: E402

RDLogger.DisableLog("rdApp.*")

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
REQUIRED = ["id", "name_ja", "name_en", "aliases", "categories", "kind", "formula", "sdf",
            "sdf_source", "note_ja", "note_reviewed", "related", "verification"]
REQUIRED_MOLECULE = ["smiles", "inchikey", "mw"]
ID_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")


def main() -> int:
    errors: list[str] = []
    warnings: list[str] = []

    def err(cid, msg):
        errors.append(f"{cid}: {msg}")

    compounds = json.loads((DATA / "compounds.json").read_text(encoding="utf-8"))["compounds"]
    cats = json.loads((DATA / "categories.json").read_text(encoding="utf-8"))["categories"]
    cat_ids = {c["id"] for c in cats} | {s["id"] for c in cats for s in c.get("subs", [])}
    sources = {}
    with (ROOT / "scripts" / "compound_sources.csv").open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            sources[row["id"]] = row

    ids = [c.get("id") for c in compounds]
    dup = {i for i in ids if ids.count(i) > 1}
    for i in sorted(dup):
        err(i, "duplicate id")
    idset = set(ids)

    for c in compounds:
        cid = c.get("id", "?")
        for k in REQUIRED:
            if k not in c:
                err(cid, f"missing field '{k}'")
        if not ID_RE.match(cid):
            err(cid, "id must be lower-case kebab-case")
        if c.get("sdf_source") not in ("pubchem-3d", "generated"):
            err(cid, f"bad sdf_source {c.get('sdf_source')!r}")
        if not isinstance(c.get("note_reviewed"), bool):
            err(cid, "note_reviewed must be true/false")
        for k in c.get("categories", []):
            if k not in cat_ids:
                err(cid, f"unknown category '{k}'")
        for r in c.get("related", []):
            if r not in idset:
                err(cid, f"related id '{r}' does not exist")
        if cid not in sources:
            warnings.append(f"{cid}: not in compound_sources.csv (hand-made entry?)")

        sdf_path = DATA / c.get("sdf", "")
        if not sdf_path.is_file():
            err(cid, f"SDF missing: {c.get('sdf')}")
            continue
        mol3d = Chem.MolFromMolFile(str(sdf_path), removeHs=False, sanitize=c.get("kind") != "crystal")
        if mol3d is None:
            err(cid, "SDF does not parse")
            continue
        conf = mol3d.GetConformer()
        if not conf.Is3D():
            err(cid, "SDF is not flagged as 3D")
        zs = [a.GetAtomicNum() for a in mol3d.GetAtoms()]
        if 1 in zs and any(z > 1 for z in zs[zs.index(1):]):
            err(cid, "hydrogens must come after all heavy atoms in the SDF")

        if c.get("kind") == "crystal":
            if mol3d.GetNumAtoms() != c.get("atoms"):
                err(cid, "atom count differs from 'atoms'")
            continue

        for k in REQUIRED_MOLECULE:
            if not c.get(k):
                err(cid, f"missing value '{k}'")
        ref = Chem.MolFromSmiles(c.get("smiles") or "")
        if ref is None:
            err(cid, "SMILES does not parse")
            continue
        n_smiles = Chem.AddHs(ref).GetNumAtoms()
        if n_smiles != mol3d.GetNumAtoms():
            err(cid, f"atom count: SMILES+H {n_smiles} != SDF {mol3d.GetNumAtoms()}")
        key = Chem.MolToInchiKey(ref)
        if key != c.get("inchikey"):
            err(cid, f"InChIKey {c.get('inchikey')} != {key} (from SMILES)")
        if c.get("stereo_note") not in ("racemic", "undefined"):
            if Chem.MolToInchiKey(mol3d) != key:
                err(cid, "InChIKey of the 3D structure differs from the SMILES")
            if not chemcheck.stereo_matches_3d(mol3d, c["smiles"]):
                err(cid, "stereo of the 3D coordinates differs from the SMILES")
        src = sources.get(cid)
        if src:
            try:
                chemcheck.run_checks(mol3d, chemcheck.parse_checks(src.get("checks", "")), src.get("smiles"))
            except chemcheck.CheckError as e:
                err(cid, f"stereo check failed: {e}")
        status = c.get("verification", {}).get("pubchem")
        if status in ("verified", "structure-only") and not c.get("pubchem_cid"):
            err(cid, f"{status} but no pubchem_cid")
        if c.get("pubchem_cid") and status not in ("verified", "structure-only"):
            err(cid, "pubchem_cid recorded without a PubChem lookup")
        if status == "structure-only":
            warnings.append(f"{cid}: PubChem name query points to another record "
                            f"(CID {c['verification'].get('pubchem_name_cid')}), please check")

    # schedule.json: [] or [{no, date (YYYY-MM-DD), title, links?}]
    for name in ("schedule.json", "schedule.example.json"):
        path = DATA / name
        if not path.exists():
            continue
        sched = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(sched, list):
            errors.append(f"{name}: must be a JSON array (may be empty)")
            continue
        for i, l in enumerate(sched):
            if not isinstance(l, dict) or not {"no", "date", "title"} <= set(l):
                errors.append(f"{name}[{i}]: needs no, date, title")
            elif not re.match(r"^\d{4}-\d{2}-\d{2}$", str(l["date"])):
                errors.append(f"{name}[{i}]: date must be YYYY-MM-DD")

    # series.json (B-3): members exist, every value has a source
    series_path = DATA / "series.json"
    if series_path.exists():
        for s in json.loads(series_path.read_text(encoding="utf-8"))["series"]:
            for m in s["members"]:
                if m["id"] not in idset:
                    errors.append(f"series {s['id']}: unknown compound {m['id']}")
                for key in ("bp", "mp", "sol"):
                    v = m.get(key)
                    if v is not None and not (v.get("source") and v.get("raw")):
                        errors.append(f"series {s['id']}/{m['id']}: {key} has no source")

    # comparisons.json (A-15): items exist
    cmp_path = DATA / "comparisons.json"
    if cmp_path.exists():
        for p in json.loads(cmp_path.read_text(encoding="utf-8"))["presets"]:
            for i in p["items"] + p.get("related", []):
                if i not in idset:
                    errors.append(f"comparison {p['id']}: unknown compound {i}")

    fg = json.loads((DATA / "functional_groups.json").read_text(encoding="utf-8"))["groups"]
    for g in fg:
        if Chem.MolFromSmarts(g["smarts"]) is None:
            errors.append(f"functional group {g['id']}: SMARTS does not parse")

    for w in warnings:
        print("warning:", w)
    for e in errors:
        print("ERROR:", e)
    verified = sum(1 for c in compounds if c.get("verification", {}).get("pubchem") == "verified")
    print(f"\n{len(compounds)} compounds checked, {len(errors)} errors, {len(warnings)} warnings. "
          f"PubChem verified: {verified}/{sum(1 for c in compounds if c.get('kind') != 'crystal')}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
