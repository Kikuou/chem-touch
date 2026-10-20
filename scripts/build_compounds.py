#!/usr/bin/env python3
"""Build data/compounds.json and data/sdf/*.sdf from scripts/compound_sources.csv.

Usage (from the repository root):

    pip install -r scripts/requirements.txt
    python scripts/build_compounds.py            # use PubChem when reachable
    python scripts/build_compounds.py --offline  # RDKit only, no network
    python scripts/build_compounds.py --only alpha-d-glucose,sucrose

What it does for every row of the CSV:

1. Parse the curated SMILES (this is the intended structure, including
   stereochemistry) and run the structure checks in the "checks" column
   (see chemcheck.py).
2. Online: look the structure up on PubChem PUG REST by its InChIKey and
   cross-check with the name query of the CSV (name or "cid:NNN"); take the
   CID, formula and molecular weight from PubChem. The outcome is
   recorded in "verification.pubchem" (see lookup_pubchem for the statuses).
   The PubChem 3D conformer is used when it exists.
3. Otherwise generate a 3D conformer with RDKit (ETKDG + MMFF) and mark it
   "sdf_source": "generated".
4. Re-run the checks on the final 3D structure and write the SDF with all
   heavy atoms first and hydrogens last (the web viewer relies on this to
   map 2D atoms to 3D atoms).

Hand-edited fields in data/compounds.json (note_ja, note_reviewed) are kept
when the script is run again. note_ja in the CSV is only used for new
compounds.

A summary is written to data/build_report.md.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from rdkit import Chem, RDLogger
from rdkit.Chem import AllChem, Descriptors, rdMolDescriptors
from rdkit.Geometry import Point3D

sys.path.insert(0, str(Path(__file__).resolve().parent))
import chemcheck  # noqa: E402

RDLogger.DisableLog("rdApp.warning")

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ROOT / "scripts" / "compound_sources.csv"
DATA = ROOT / "data"
SDF_DIR = DATA / "sdf"
OUT_JSON = DATA / "compounds.json"
REPORT = DATA / "build_report.md"

PUG = "https://pubchem.ncbi.nlm.nih.gov/rest/pug"
SEED = 20270401


# ------------------------------------------------------------------ PubChem

class PubChem:
    def __init__(self):
        self.last = 0.0

    def _get(self, url: str) -> bytes | None:
        # PubChem asks for at most 5 requests per second.
        wait = 0.25 - (time.time() - self.last)
        if wait > 0:
            time.sleep(wait)
        self.last = time.time()
        req = urllib.request.Request(url, headers={"User-Agent": "chem-touch-build/1.0"})
        for attempt in range(3):
            try:
                with urllib.request.urlopen(req, timeout=30) as r:
                    return r.read()
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    return None
                if e.code in (429, 503) and attempt < 2:
                    time.sleep(2 ** attempt)
                    continue
                raise
        return None

    def reachable(self) -> bool:
        try:
            return self._get(f"{PUG}/compound/cid/962/property/InChIKey/JSON") is not None
        except Exception as e:  # noqa: BLE001
            print(f"PubChem not reachable: {e}", file=sys.stderr)
            return False

    def cid(self, query: str) -> int | None:
        if query.lower().startswith("cid:"):
            return int(query[4:])
        body = self._get(f"{PUG}/compound/name/{urllib.parse.quote(query)}/cids/JSON")
        if not body:
            return None
        cids = json.loads(body).get("IdentifierList", {}).get("CID", [])
        return cids[0] if cids else None

    def cid_by_inchikey(self, key: str) -> int | None:
        body = self._get(f"{PUG}/compound/inchikey/{key}/cids/JSON")
        if not body:
            return None
        cids = json.loads(body).get("IdentifierList", {}).get("CID", [])
        return cids[0] if cids else None

    def properties(self, cid: int) -> dict:
        props = "Title,SMILES,InChIKey,MolecularFormula,MolecularWeight,IUPACName"
        body = self._get(f"{PUG}/compound/cid/{cid}/property/{props}/JSON")
        return json.loads(body)["PropertyTable"]["Properties"][0]

    def sdf3d(self, cid: int) -> str | None:
        body = self._get(f"{PUG}/compound/cid/{cid}/SDF?record_type=3d")
        return body.decode() if body else None


# statuses that carry a PubChem CID of exactly this structure
VERIFIED = ("verified", "structure-only")


def lookup_pubchem(pubchem: "PubChem", key: str, query: str) -> dict:
    """Find the PubChem record of exactly this structure (by InChIKey) and
    cross-check it with the name query from the CSV.

    verified        InChIKey found, and the name query gives the same CID
    structure-only  InChIKey found, but the name query gives another record
                    (or no name query) -> a person should look at it
    not-found       no PubChem record with this InChIKey (e.g. a fragment)
    """
    cid = pubchem.cid_by_inchikey(key)
    name_cid = None
    if query:
        try:
            name_cid = pubchem.cid(query)
        except Exception:  # noqa: BLE001
            name_cid = None
    if cid is None:
        return {"status": "not-found", "name_cid": name_cid}
    props = pubchem.properties(cid)
    if props.get("InChIKey") != key:
        return {"status": "not-found", "name_cid": name_cid}
    status = "verified" if name_cid == cid else "structure-only"
    return {"status": status, "cid": cid, "name_cid": name_cid, "props": props, "title": props.get("Title")}


# ------------------------------------------------------------------ RDKit

def heavy_first(mol):
    """Renumber atoms so that all hydrogens come after the heavy atoms."""
    heavy = [a.GetIdx() for a in mol.GetAtoms() if a.GetAtomicNum() > 1]
    hyd = [a.GetIdx() for a in mol.GetAtoms() if a.GetAtomicNum() == 1]
    return Chem.RenumberAtoms(mol, heavy + hyd)


def generate_3d(smiles: str, extended: bool = False):
    """ETKDG + MMFF94. Normally the lowest-energy conformer is kept; with
    extended=True (fatty acids) the most stretched one is kept so that the
    shape of the chain (straight / bent at a cis double bond) is visible."""
    mol = Chem.AddHs(Chem.MolFromSmiles(smiles))
    params = AllChem.ETKDGv3()
    params.randomSeed = SEED
    n = 30 if extended else 10
    cids = list(AllChem.EmbedMultipleConfs(mol, numConfs=n, params=params))
    if not cids:
        params.useRandomCoords = True
        cids = list(AllChem.EmbedMultipleConfs(mol, numConfs=n, params=params))
    if not cids:
        raise RuntimeError("embedding failed")
    res = AllChem.MMFFOptimizeMoleculeConfs(mol, maxIters=2000)
    if extended:
        heavy = [a.GetIdx() for a in mol.GetAtoms() if a.GetAtomicNum() > 1]

        def span(k):
            conf = mol.GetConformer(cids[k])
            pts = [conf.GetAtomPosition(i) for i in heavy]
            return max((p - q).Length() for p in pts for q in pts)
        score = [span(k) if res[k][0] == 0 else -1 for k in range(len(cids))]
        best = max(range(len(cids)), key=score.__getitem__)
    else:
        energies = [e if conv == 0 else e + 1e6 for conv, e in res]
        best = min(range(len(energies)), key=energies.__getitem__)
    out = Chem.Mol(mol)
    out.RemoveAllConformers()
    out.AddConformer(Chem.Conformer(mol.GetConformer(cids[best])), assignId=True)
    return out


def inchikey(mol) -> str:
    return Chem.MolToInchiKey(mol)


# ------------------------------------------------------------------ crystals

def crystal_mol(kind: str):
    """Small fragment models of crystals (no implicit hydrogens)."""
    rw = Chem.RWMol()
    coords = []

    def add(sym, xyz, charge=0):
        a = Chem.Atom(sym)
        a.SetNoImplicit(True)
        a.SetFormalCharge(charge)
        coords.append(xyz)
        return rw.AddAtom(a)

    if kind == "nacl":
        # 3x3x3 ions = one face-centred cubic unit cell of NaCl.
        d = 2.82  # Na-Cl distance in Angstrom (a = 5.64 A)
        for i in range(3):
            for j in range(3):
                for k in range(3):
                    if (i + j + k) % 2 == 0:
                        add("Na", (i * d, j * d, k * d), +1)
                    else:
                        add("Cl", (i * d, j * d, k * d), -1)
    elif kind == "diamond":
        a = 3.567  # lattice constant
        basis = [(0, 0, 0), (0, .5, .5), (.5, 0, .5), (.5, .5, 0),
                 (.25, .25, .25), (.25, .75, .75), (.75, .25, .75), (.75, .75, .25)]
        pts = set()
        for i in range(-1, 2):
            for j in range(-1, 2):
                for k in range(-1, 2):
                    for b in basis:
                        p = ((i + b[0]) * a, (j + b[1]) * a, (k + b[2]) * a)
                        pts.add(tuple(round(x, 4) for x in p))
        center = (a * .25, a * .25, a * .25)
        # keep atoms within ~2.3 bond lengths of a central atom
        sel = sorted(p for p in pts if math.dist(p, center) < 3.9)
        idx = [add("C", p) for p in sel]
        for x in range(len(sel)):
            for y in range(x + 1, len(sel)):
                if math.dist(sel[x], sel[y]) < 1.7:
                    rw.AddBond(idx[x], idx[y], Chem.BondType.SINGLE)
    elif kind == "graphite":
        cc = 1.42
        layer_gap = 3.35
        h = cc * math.sqrt(3) / 2
        a1, a2 = (1.5 * cc, h), (1.5 * cc, -h)  # honeycomb lattice vectors
        pts = []
        # two hexagonal sheets, AB (Bernal) stacking: the upper sheet is
        # shifted by one C-C bond length
        for layer in range(2):
            shift = cc if layer else 0.0
            for i in range(-4, 5):
                for j in range(-4, 5):
                    for bx in (0.0, cc):
                        x = i * a1[0] + j * a2[0] + bx + shift - cc / 2
                        y = i * a1[1] + j * a2[1]
                        if x * x + y * y < 3.9 ** 2:
                            pts.append((round(x, 4), round(y, 4), layer * layer_gap))
        pts = sorted(set(pts), key=lambda p: (p[2], p[0], p[1]))
        idx = [add("C", p) for p in pts]
        for x in range(len(pts)):
            for y in range(x + 1, len(pts)):
                if pts[x][2] == pts[y][2] and math.dist(pts[x], pts[y]) < 1.5:
                    rw.AddBond(idx[x], idx[y], Chem.BondType.SINGLE)
    else:
        raise ValueError(kind)

    mol = rw.GetMol()
    mol.UpdatePropertyCache(strict=False)
    conf = Chem.Conformer(mol.GetNumAtoms())
    for i, p in enumerate(coords):
        conf.SetAtomPosition(i, Point3D(*p))
    conf.Set3D(True)
    mol.AddConformer(conf, assignId=True)
    return mol


# ------------------------------------------------------------------ main

def split(text: str) -> list[str]:
    return [t.strip() for t in (text or "").split("|") if t.strip()]


def load_existing() -> dict:
    if OUT_JSON.exists():
        data = json.loads(OUT_JSON.read_text(encoding="utf-8"))
        return {c["id"]: c for c in data.get("compounds", [])}
    return {}


def write_sdf(path: Path, mol, name: str, source: str):
    m = Chem.Mol(mol)
    m.SetProp("_Name", name)
    lines = Chem.MolToMolBlock(m).split("\n")
    # line 3 of a molfile is a free comment; line 2 keeps the "3D" flag
    lines[2] = "chem-touch: " + {
        "pubchem-3d": "PubChem 3D conformer",
        "crystal": "crystal lattice fragment (ideal geometry)",
    }.get(source, "generated with RDKit (ETKDG + MMFF94)")
    block = "\n".join(lines)
    path.write_text(block + "$$$$\n", encoding="utf-8")


def build_row(row, pubchem, existing, report):
    cid_ = row["id"]
    kind = row.get("kind") or "molecule"
    checks = chemcheck.parse_checks(row.get("checks", ""))
    old = existing.get(cid_, {})
    entry = {
        "id": cid_,
        "name_ja": row["name_ja"],
        "name_en": row["name_en"],
        "reading": row.get("reading", ""),
        "aliases": split(row.get("aliases")),
        "categories": split(row.get("categories")),
        "kind": kind,
    }

    if kind == "crystal":
        mol = crystal_mol(checks["crystal"])
        entry.update({
            "formula": row.get("formula") or "",
            "mw": None,
            "smiles": None,
            "pubchem_cid": None,
            "inchikey": None,
            "sdf": f"sdf/{cid_}.sdf",
            "sdf_source": "generated",
            "atoms": mol.GetNumAtoms(),
            "crystal": checks["crystal"],
            "verification": {"pubchem": "n/a", "stereo": "n/a"},
        })
        write_sdf(SDF_DIR / f"{cid_}.sdf", mol, row["name_en"], "crystal")
        report["generated"].append(cid_)
    else:
        smiles = row["smiles"]
        ref = Chem.MolFromSmiles(smiles)
        if ref is None:
            raise chemcheck.CheckError(f"SMILES does not parse: {smiles}")
        key = inchikey(ref)
        pc = {"status": "unverified"}
        mol3d = None
        source = "generated"
        old_ok = old.get("inchikey") == key and old.get("pubchem_cid") \
            and old.get("verification", {}).get("pubchem") in VERIFIED
        if pubchem is not None:
            try:
                pc = lookup_pubchem(pubchem, key, row.get("pubchem_query", ""))
                if pc.get("cid"):
                    sdf = pubchem.sdf3d(pc["cid"])
                    if sdf:
                        m = Chem.MolFromMolBlock(sdf, removeHs=False)
                        if m is not None and inchikey(m) == key:
                            mol3d = m
                            source = "pubchem-3d"
            except Exception as e:  # noqa: BLE001
                pc = {"status": "error", "error": str(e)}
        elif old_ok:
            # offline rebuild: keep the earlier PubChem result (and its 3D file)
            pc = {"status": old["verification"]["pubchem"], "cid": old["pubchem_cid"],
                  "title": old["verification"].get("pubchem_title"),
                  "name_cid": old["verification"].get("pubchem_name_cid"),
                  "props": {"MolecularFormula": old.get("pubchem_formula"), "MolecularWeight": old.get("mw")}}
            old_sdf = DATA / old.get("sdf", "")
            if old.get("sdf_source") == "pubchem-3d" and old_sdf.is_file():
                mol3d = Chem.MolFromMolFile(str(old_sdf), removeHs=False)
                source = "pubchem-3d"
        if mol3d is None:
            mol3d = generate_3d(smiles, extended="fa" in checks)
            source = "generated"
        mol3d = heavy_first(mol3d)

        # Checks on the final 3D structure
        extra = chemcheck.run_checks(mol3d, checks)
        if "racemic" not in checks and not chemcheck.stereo_matches_3d(mol3d, smiles):
            raise chemcheck.CheckError("3D coordinates do not reproduce the SMILES stereo")

        has_cid = pc["status"] in VERIFIED
        props = pc.get("props", {}) if has_cid else {}
        mw = props.get("MolecularWeight")
        entry.update({
            # the CSV may override the Hill formula for display (e.g. NH3 instead of H3N)
            "formula": row.get("formula") or props.get("MolecularFormula") or rdMolDescriptors.CalcMolFormula(ref),
            "mw": round(float(mw), 2) if mw else round(Descriptors.MolWt(ref), 2),
            "smiles": Chem.MolToSmiles(ref),
            "pubchem_cid": pc.get("cid") if has_cid else None,
            "inchikey": key,
            "sdf": f"sdf/{cid_}.sdf",
            "sdf_source": source,
            "atoms": mol3d.GetNumAtoms(),
            "verification": {
                "pubchem": pc["status"],
                "stereo": "checked" if (set(checks) & {"cip", "ez", "fa", "sugar"}) else
                          ("racemic" if "racemic" in checks else "no-stereocentre"),
            },
        })
        if has_cid:
            entry["pubchem_formula"] = props.get("MolecularFormula")
            if pc.get("title"):
                entry["verification"]["pubchem_title"] = pc["title"]
        if pc.get("name_cid") and pc.get("name_cid") != pc.get("cid"):
            entry["verification"]["pubchem_name_cid"] = pc["name_cid"]
        if "racemic" in checks:
            entry["stereo_note"] = "racemic"
        entry.update(extra)
        write_sdf(SDF_DIR / f"{cid_}.sdf", mol3d, row["name_en"], entry["sdf_source"])
        report[pc["status"]].append(cid_)
        report[entry["sdf_source"]].append(cid_)

    if "fatty_acid" in entry:
        fa = entry["fatty_acid"]
        nd = len(fa["double_bonds"])
        fa["notation"] = f"C{fa['carbons']}:{nd}" + (f" n-{fa['omega']}" if fa["omega"] else "")

    entry["note_ja"] = old.get("note_ja", row.get("note_ja", ""))
    entry["note_reviewed"] = old.get("note_reviewed", False)
    entry["related"] = split(row.get("related"))
    return entry


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--offline", action="store_true", help="do not contact PubChem")
    ap.add_argument("--only", help="comma-separated ids to rebuild (others are kept as is)")
    ap.add_argument("--strict", action="store_true",
                    help="exit with an error when a compound is not verified on PubChem")
    args = ap.parse_args(argv)

    SDF_DIR.mkdir(parents=True, exist_ok=True)
    with SOURCES.open(encoding="utf-8") as f:
        rows = [r for r in csv.DictReader(f) if r["id"].strip() and not r["id"].startswith("#")]

    pubchem = None
    if not args.offline:
        pubchem = PubChem()
        if not pubchem.reachable():
            print("Falling back to RDKit-only mode.", file=sys.stderr)
            pubchem = None
    online = pubchem is not None

    existing = load_existing()
    only = set(args.only.split(",")) if args.only else None
    report = {k: [] for k in ("verified", "structure-only", "unverified", "not-found", "error",
                              "pubchem-3d", "generated")}
    errors = []
    out = []
    for row in rows:
        if only and row["id"] not in only and row["id"] in existing:
            out.append(existing[row["id"]])
            continue
        try:
            entry = build_row(row, pubchem, existing, report)
            out.append(entry)
            v = entry["verification"]["pubchem"]
            print(f"  {row['id']:<28} {entry['sdf_source']:<11} pubchem={v}")
        except Exception as e:  # noqa: BLE001
            errors.append((row["id"], str(e)))
            print(f"! {row['id']}: {e}", file=sys.stderr)

    ids = [r["id"] for r in rows]
    for path in SDF_DIR.glob("*.sdf"):
        if path.stem not in ids:
            path.unlink()

    doc = {
        "version": 1,
        "pubchem": "online" if online else "offline",
        "credit": "Structures checked against PubChem (https://pubchem.ncbi.nlm.nih.gov/) where marked verified. "
                  "3D coordinates generated with RDKit (ETKDG + MMFF94) unless sdf_source is pubchem-3d.",
        "compounds": out,
    }
    OUT_JSON.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    lines = ["# compounds build report", "",
             f"- generated_at: {datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}",
             f"- PubChem: {'online' if online else 'offline (not reachable or --offline)'}",
             f"- compounds: {len(out)}", ""]
    for key, label in (("verified", "PubChem verified (structure and name agree)"),
                       ("structure-only", "PubChem structure found, name query gives another record - please check"),
                       ("not-found", "no PubChem record with this InChIKey"), ("error", "PubChem error"),
                       ("unverified", "not checked against PubChem"),
                       ("pubchem-3d", "3D from PubChem"), ("generated", "3D generated with RDKit")):
        lines.append(f"## {label} ({len(report[key])})")
        lines.append(", ".join(report[key]) or "-")
        lines.append("")
    if errors:
        lines.append(f"## build errors ({len(errors)})")
        lines += [f"- {i}: {e}" for i, e in errors]
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"\n{len(out)} compounds written, {len(errors)} errors. PubChem: {'online' if online else 'offline'}")
    if errors:
        return 1
    if args.strict and (report["structure-only"] or report["not-found"] or report["error"] or report["unverified"]):
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
