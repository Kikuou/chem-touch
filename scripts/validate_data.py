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
  - categories and related ids exist; the 身近なもの groups use existing categories
  - the lesson plans (data/plans/) use known catalog parts and existing
    molecules / comparisons / questions; questions have 4 choices and an answer
  - practice.json lists existing molecules with at most 6 carbons
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

    # practice.json (notation practice): ids exist, molecules with at most 6 carbons
    practice = json.loads((DATA / "practice.json").read_text(encoding="utf-8"))
    by_id = {c.get("id"): c for c in compounds}
    seen = set()
    for g in practice.get("groups", []):
        for pid in g.get("items", []):
            if pid in seen:
                err(f"practice.json/{g.get('id')}", f"'{pid}' is listed twice")
            seen.add(pid)
            c = by_id.get(pid)
            if c is None:
                err(f"practice.json/{g.get('id')}", f"id '{pid}' does not exist")
                continue
            m = Chem.MolFromSmiles(c.get("smiles") or "")
            if m is None or sum(a.GetAtomicNum() == 6 for a in m.GetAtoms()) > 6:
                err(f"practice.json/{g.get('id')}", f"'{pid}' has more than 6 carbons")

    # 身近なもの groups (categories.json "life")
    for g in json.loads((DATA / "categories.json").read_text(encoding="utf-8")).get("life", []):
        for k in g.get("cats", []):
            if k not in cat_ids:
                errors.append(f"categories.json life/{g.get('id')}: unknown category '{k}'")
    life_ids = {g["id"] for g in json.loads((DATA / "categories.json").read_text(encoding="utf-8")).get("life", [])}

    # questions.json: 4 choices, answer 0-3, unique ids
    qdoc = json.loads((DATA / "questions.json").read_text(encoding="utf-8"))["questions"]
    qids = [q.get("id") for q in qdoc]
    for i in sorted({i for i in qids if qids.count(i) > 1}):
        errors.append(f"questions.json: duplicate id '{i}'")
    for q in qdoc:
        where = f"questions.json/{q.get('id')}"
        if not q.get("q"):
            errors.append(f"{where}: no question text")
        ch = q.get("choices") or []
        if len(ch) != 4 or not all(isinstance(c, str) and c for c in ch) or len(set(ch)) != 4:
            errors.append(f"{where}: needs 4 different choices")
        if q.get("answer") not in (0, 1, 2, 3):
            errors.append(f"{where}: answer must be 0-3 (A-D)")
        if not isinstance(q.get("reviewed"), bool):
            errors.append(f"{where}: reviewed must be true or false")
    qset = set(qids)

    # lesson plans (data/plans/): the parts are catalog ids (js/lesson/catalog.js)
    presets = {p["id"] for p in json.loads((DATA / "comparisons.json").read_text(encoding="utf-8"))["presets"]}
    series_ids = {x["id"] for x in json.loads((DATA / "series.json").read_text(encoding="utf-8"))["series"]}
    plain_kinds = {"notation", "draw", "practice", "quiz", "series", "periodic", "electron", "bond", "soon"}
    arg_check = {
        "compound": lambda a: a in idset,
        "notation": lambda a: a is None or a in idset,
        "quiz": lambda a: a is None or a in idset,
        "compare": lambda a: a in presets,
        "library": lambda a: a in cat_ids,
        "life": lambda a: a in life_ids,
        "series": lambda a: a is None or a in series_ids,
        "periodic": lambda a: a in (None, "mineral", "body", "radius", "en", "ie"),
        "bond": lambda a: a in (None, "ionic", "covalent"),
        "practice": lambda a: a in (None, "choose", "blocks", "draw"),
        "soon": lambda a: bool(a),
    }
    index = json.loads((DATA / "plans" / "index.json").read_text(encoding="utf-8"))
    plan_ids = [p["id"] for p in index.get("plans", [])]
    if index.get("current") not in plan_ids:
        errors.append("plans/index.json: 'current' is not in 'plans'")
    for pid in plan_ids:
        path = DATA / "plans" / f"{pid}.json"
        if not path.exists():
            errors.append(f"plans/index.json: {path.name} does not exist")
            continue
        plan = json.loads(path.read_text(encoding="utf-8"))
        nos = [l.get("no") for l in plan.get("lessons", [])]
        for n in sorted({n for n in nos if nos.count(n) > 1}):
            errors.append(f"plans/{pid}.json: lesson {n} appears twice")
        for l in plan.get("lessons", []):
            where = f"plans/{pid}.json/第{l.get('no')}回"
            if not isinstance(l.get("no"), int) or not l.get("title"):
                errors.append(f"{where}: needs no (number) and title")
            for part in l.get("parts", []):
                if isinstance(part, dict) and part.get("card"):
                    continue
                pidn = part.get("use") if isinstance(part, dict) else part
                kind, _, arg = str(pidn).partition(":")
                arg = arg or None
                if kind not in plain_kinds | set(arg_check):
                    errors.append(f"{where}: unknown part '{pidn}'")
                elif kind in arg_check and not arg_check[kind](arg):
                    errors.append(f"{where}: part '{pidn}' refers to something that does not exist")
            for key in ("colorcards", "end3"):
                for qid in l.get(key, []):
                    if qid not in qset:
                        errors.append(f"{where}: {key} question '{qid}' is not in questions.json")

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

        # boiling points of a straight-chain homologous series rise with the
        # carbon number; a drop usually means a wrongly picked value
        for s in json.loads(series_path.read_text(encoding="utf-8"))["series"]:
            pts = [(m["carbons"], m["bp"]["value"], m["id"]) for m in s["members"] if m.get("bp")]
            for (n1, v1, a), (n2, v2, b) in zip(pts, pts[1:]):
                if v2 < v1:
                    warnings.append(f"series {s['id']}: boiling point drops from {a} ({v1}) to {b} ({v2}); check the value")

    # comparisons.json (A-15): items exist
    cmp_path = DATA / "comparisons.json"
    if cmp_path.exists():
        for p in json.loads(cmp_path.read_text(encoding="utf-8"))["presets"]:
            for i in p["items"] + p.get("related", []):
                if i not in idset:
                    errors.append(f"comparison {p['id']}: unknown compound {i}")

    # elements.json (M4): 1-118 in order, shells add up, sourced values present
    el_path = DATA / "elements.json"
    if el_path.exists():
        doc = json.loads(el_path.read_text(encoding="utf-8"))
        els = doc["elements"]
        if [e["z"] for e in els] != list(range(1, 119)):
            errors.append("elements.json: must list Z = 1..118 in order")
        if len({e["symbol"] for e in els}) != len(els):
            errors.append("elements.json: duplicate symbols")
        fetched = doc.get("source", {}).get("status") == "fetched"
        if not fetched:
            warnings.append("elements.json: PubChem values not fetched yet (run build_elements.py with network)")
        for e in els:
            if e["shells"] is not None and sum(e["shells"]) != e["z"]:
                errors.append(f"elements.json {e['symbol']}: shells do not add up to Z")
            if e["z"] <= 20 and not e["shells"]:
                errors.append(f"elements.json {e['symbol']}: Z <= 20 needs shells")
            if fetched and (not e["name_en"] or (e["z"] <= 92 and e["mass"] is None)):
                errors.append(f"elements.json {e['symbol']}: missing PubChem name or atomic mass")
            if "note_ja" in e and not isinstance(e.get("note_reviewed"), bool):
                errors.append(f"elements.json {e['symbol']}: note_reviewed must be true/false")

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
