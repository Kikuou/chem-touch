"""Structure checks shared by build_compounds.py and validate_data.py.

Every check works on an RDKit molecule that carries explicit hydrogens and a
3D conformer, so it verifies both the SMILES and the generated coordinates.

Check spec syntax (column "checks" in compound_sources.csv, ";"-separated):

  cip=S,R,...          CIP labels of all stereocentres, in the atom order
                       of the SMILES in compound_sources.csv
  ez=Z,E,...           cis/trans of every acyclic C=C with one heavy
                       substituent on each end, in the same order
                       (judged from the 3D dihedral angle)
  fa=18:9Z,12Z         fatty acid: chain length and the delta positions of
                       the C=C bonds counted from the carboxyl carbon (C1)
  sugar=a-D-Glcp(1-4)+a-D-Glcp
                       multiset of sugar rings. Each ring is identified from
                       the 3D coordinates with Haworth up/down rules:
                       anomer (a/b), series (D/L), residue (Glcp, Galp, Manp,
                       Fruf) and, for glycosides, the linkage
                       (anomeric position - position on the partner ring)
  racemic              stereocentres are intentionally left unspecified
"""

from __future__ import annotations

import math

from rdkit import Chem
from rdkit.Chem import rdCIPLabeler


class CheckError(Exception):
    pass


# ---------------------------------------------------------------- helpers

def _vec(conf, idx):
    p = conf.GetAtomPosition(idx)
    return (p.x, p.y, p.z)


def _sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def dihedral(conf, a, b, c, d):
    """Dihedral angle a-b-c-d in degrees (0..180, sign dropped)."""
    p0, p1, p2, p3 = (_vec(conf, i) for i in (a, b, c, d))
    b0, b1, b2 = _sub(p1, p0), _sub(p2, p1), _sub(p3, p2)
    n1, n2 = _cross(b0, b1), _cross(b1, b2)
    cosang = _dot(n1, n2) / (math.sqrt(_dot(n1, n1) * _dot(n2, n2)) or 1.0)
    return math.degrees(math.acos(max(-1.0, min(1.0, cosang))))


def parse_checks(text: str) -> dict:
    out = {}
    for part in (text or "").split(";"):
        part = part.strip()
        if not part:
            continue
        key, _, val = part.partition("=")
        out[key.strip()] = val.strip()
    return out


# ---------------------------------------------------------------- stereo

def cip_labels(mol) -> list[str]:
    m = Chem.Mol(mol)
    rdCIPLabeler.AssignCIPLabels(m)
    return [a.GetProp("_CIPCode") for a in m.GetAtoms() if a.HasProp("_CIPCode")]


def unspecified_stereo(mol) -> list[str]:
    """Potential stereo elements that the structure leaves undefined."""
    out = []
    for info in Chem.FindPotentialStereo(Chem.RemoveHs(mol)):
        if info.specified == Chem.StereoSpecified.Unspecified:
            out.append(f"{info.type} at {info.centeredOn}")
    return out


def acyclic_cc_double_bond_geometry(mol) -> list[str]:
    conf = mol.GetConformer()
    out = []
    for b in mol.GetBonds():
        if b.GetBondType() != Chem.BondType.DOUBLE or b.IsInRing():
            continue
        a1, a2 = b.GetBeginAtom(), b.GetEndAtom()
        if a1.GetSymbol() != "C" or a2.GetSymbol() != "C":
            continue
        h1 = [n.GetIdx() for n in a1.GetNeighbors() if n.GetIdx() != a2.GetIdx() and n.GetAtomicNum() > 1]
        h2 = [n.GetIdx() for n in a2.GetNeighbors() if n.GetIdx() != a1.GetIdx() and n.GetAtomicNum() > 1]
        if len(h1) != 1 or len(h2) != 1:
            continue
        ang = dihedral(conf, h1[0], a1.GetIdx(), a2.GetIdx(), h2[0])
        out.append("Z" if ang < 90 else "E")
    return out


# ---------------------------------------------------------------- fatty acids

def parse_fa(spec: str):
    """'18:9Z,12Z' -> (18, [(9, 'Z'), (12, 'Z')]); '16' -> (16, [])."""
    n, _, rest = spec.partition(":")
    dbs = []
    for tok in filter(None, (t.strip() for t in rest.split(","))):
        dbs.append((int(tok[:-1]), tok[-1].upper()))
    return int(n), dbs


def check_fatty_acid(mol, spec: str):
    n, dbs = parse_fa(spec)
    patt = Chem.MolFromSmarts("[CX3](=O)[OX2H1]")
    matches = mol.GetSubstructMatches(patt)
    if len(matches) != 1:
        raise CheckError("fa: expected exactly one carboxy group")
    chain = [matches[0][0]]
    prev = None
    while True:
        cur = mol.GetAtomWithIdx(chain[-1])
        nxt = [a.GetIdx() for a in cur.GetNeighbors()
               if a.GetSymbol() == "C" and a.GetIdx() != prev and a.GetIdx() not in chain]
        if not nxt:
            break
        if len(nxt) > 1:
            raise CheckError("fa: chain is branched")
        prev = chain[-1]
        chain.append(nxt[0])
    if len(chain) != n:
        raise CheckError(f"fa: chain has {len(chain)} carbons, expected {n}")
    conf = mol.GetConformer()
    found = []
    for i in range(len(chain) - 1):
        b = mol.GetBondBetweenAtoms(chain[i], chain[i + 1])
        if b.GetBondType() == Chem.BondType.DOUBLE:
            pos = i + 1
            if i == 0 or i + 2 >= len(chain):
                raise CheckError("fa: terminal double bond not supported")
            ang = dihedral(conf, chain[i - 1], chain[i], chain[i + 1], chain[i + 2])
            found.append((pos, "Z" if ang < 90 else "E"))
    if found != dbs:
        raise CheckError(f"fa: found {found}, expected {dbs}")
    return {
        "carbons": n,
        "double_bonds": [{"pos_delta": p, "geometry": "cis" if g == "Z" else "trans"} for p, g in dbs],
        "omega": (n - dbs[-1][0]) if dbs else None,
    }


# ---------------------------------------------------------------- sugars

# Haworth pattern of exocyclic oxygens on the ring carbons between the
# anomeric carbon and the ring carbon that carries the reference CH2OH.
# Values are for the D-series, "u" = up, "d" = down.
PYRANOSE_PATTERNS = {"Glcp": "dud", "Galp": "duu", "Manp": "uud"}  # C2, C3, C4
FURANOSE_PATTERNS = {"Fruf": "ud"}  # C3, C4 of a 2-ketose


def _ring_normal(conf, ring):
    """Newell normal; points 'down' when the ring is traversed clockwise
    seen from above (right-hand rule)."""
    nx = ny = nz = 0.0
    pts = [_vec(conf, i) for i in ring]
    for i, p in enumerate(pts):
        q = pts[(i + 1) % len(pts)]
        nx += (p[1] - q[1]) * (p[2] + q[2])
        ny += (p[2] - q[2]) * (p[0] + q[0])
        nz += (p[0] - q[0]) * (p[1] + q[1])
    ln = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
    return (nx / ln, ny / ln, nz / ln)


def _is_up(conf, up, center, subst, other):
    c = _vec(conf, center)
    return _dot(_sub(_vec(conf, subst), c), up) > _dot(_sub(_vec(conf, other), c), up)


def sugar_rings(mol) -> list[str]:
    """Describe every pyranose/furanose ring, e.g. 'a-D-Glcp(1-4)'."""
    conf = mol.GetConformer()
    ri = mol.GetRingInfo()
    rings = []
    for ring in ri.AtomRings():
        syms = [mol.GetAtomWithIdx(i).GetSymbol() for i in ring]
        if len(ring) not in (5, 6) or syms.count("O") != 1 or syms.count("C") != len(ring) - 1:
            continue
        rings.append(ring)

    ring_of = {}
    for r_i, ring in enumerate(rings):
        for a in ring:
            ring_of[a] = r_i

    results = []
    positions = {}  # atom idx -> (ring index, sugar position number)
    parsed = []
    for r_i, ring in enumerate(rings):
        ring_set = set(ring)
        o_ring = next(i for i in ring if mol.GetAtomWithIdx(i).GetSymbol() == "O")

        def exo(idx, elem=None, heavy=True, ring_set=ring_set):
            return [n.GetIdx() for n in mol.GetAtomWithIdx(idx).GetNeighbors()
                    if n.GetIdx() not in ring_set
                    and (elem is None or n.GetSymbol() == elem)
                    and (not heavy or n.GetAtomicNum() > 1)]

        o_nbrs = [n.GetIdx() for n in mol.GetAtomWithIdx(o_ring).GetNeighbors() if n.GetIdx() in ring_set]
        anomeric = [c for c in o_nbrs if exo(c, "O")]
        if len(anomeric) != 1:
            raise CheckError("sugar: could not identify the anomeric carbon")
        c_anom = anomeric[0]
        c_ref = next(c for c in o_nbrs if c != c_anom)
        # walk from anomeric carbon away from ring O to c_ref
        path = [c_anom]
        prev = o_ring
        while path[-1] != c_ref:
            nxt = next(n.GetIdx() for n in mol.GetAtomWithIdx(path[-1]).GetNeighbors()
                       if n.GetIdx() in ring_set and n.GetIdx() != prev and n.GetSymbol() == "C")
            prev = path[-1]
            path.append(nxt)
        ketose = bool(exo(c_anom, "C"))
        first_pos = 2 if ketose else 1
        for k, a in enumerate(path):
            positions[a] = (r_i, first_pos + k)
        parsed.append((r_i, ring, o_ring, c_anom, c_ref, path, ketose, exo))

    for r_i, ring, o_ring, c_anom, c_ref, path, ketose, exo in parsed:
        order = path + [o_ring]  # C1 -> C2 ... -> C5 -> O5
        n_rh = _ring_normal(conf, order)
        up = (-n_rh[0], -n_rh[1], -n_rh[2])  # clockwise traversal => up is -normal

        def other_sub(center, subst):
            cands = [n.GetIdx() for n in mol.GetAtomWithIdx(center).GetNeighbors()
                     if n.GetIdx() not in set(ring) and n.GetIdx() != subst]
            if len(cands) != 1:
                raise CheckError("sugar: unexpected substitution pattern")
            return cands[0]

        ref_c = exo(c_ref, "C")
        if len(ref_c) != 1:
            raise CheckError("sugar: reference carbon has no single exocyclic carbon")
        ref_up = _is_up(conf, up, c_ref, ref_c[0], other_sub(c_ref, ref_c[0]))
        series = "D" if ref_up else "L"

        o_anom = exo(c_anom, "O")[0]
        anom_up = _is_up(conf, up, c_anom, o_anom, other_sub(c_anom, o_anom))
        anomer = "b" if anom_up == ref_up else "a"

        pattern = ""
        for c in path[1:-1]:
            o = exo(c, "O")
            if len(o) != 1:
                pattern += "?"
                continue
            is_up = _is_up(conf, up, c, o[0], other_sub(c, o[0]))
            if series == "L":
                is_up = not is_up
            pattern += "u" if is_up else "d"
        table = FURANOSE_PATTERNS if (ketose and len(ring) == 5) else PYRANOSE_PATTERNS
        name = next((k for k, v in table.items() if v == pattern), f"?{pattern}")

        link = ""
        partner = [n.GetIdx() for n in mol.GetAtomWithIdx(o_anom).GetNeighbors() if n.GetIdx() != c_anom]
        if partner and partner[0] in positions and positions[partner[0]][0] != r_i:
            link = f"({positions[c_anom][1]}-{positions[partner[0]][1]})"
        results.append(f"{anomer}-{series}-{name}{link}")
    return sorted(results)


# ---------------------------------------------------------------- entry point

def in_smiles_order(mol, smiles: str):
    """Renumber `mol` (e.g. a PubChem 3D record) so that its heavy atoms
    follow the atom order of `smiles`; hydrogens go last. The cip= and ez=
    specs list labels in SMILES atom order, so this makes them independent
    of how the 3D file numbers its atoms."""
    ref = Chem.MolFromSmiles(smiles)
    match = mol.GetSubstructMatch(ref)
    if len(match) != ref.GetNumAtoms():
        raise CheckError("3D structure does not match the SMILES")
    rest = [i for i in range(mol.GetNumAtoms()) if i not in set(match)]
    return Chem.RenumberAtoms(mol, list(match) + rest)


def run_checks(mol, checks: dict, smiles: str | None = None) -> dict:
    """Run the requested checks. Returns extra metadata (e.g. fatty_acid).

    `smiles` is the curated SMILES of compound_sources.csv; pass it so that
    order-dependent specs (cip=, ez=) are read in its atom order.
    Raises CheckError on the first mismatch.
    """
    extra = {}
    if smiles:
        mol = in_smiles_order(mol, smiles)
    if "racemic" not in checks:
        missing = unspecified_stereo(mol)
        if missing:
            raise CheckError("undefined stereo: " + ", ".join(missing))
    if "cip" in checks:
        want = [t.strip() for t in checks["cip"].split(",")]
        got = cip_labels(mol)
        if got != want:
            raise CheckError(f"cip: got {got}, expected {want}")
    if "ez" in checks:
        want = [t.strip().upper() for t in checks["ez"].split(",")]
        got = acyclic_cc_double_bond_geometry(mol)
        if got != want:
            raise CheckError(f"ez: got {got}, expected {want}")
    if "fa" in checks:
        extra["fatty_acid"] = check_fatty_acid(mol, checks["fa"])
    if "sugar" in checks:
        want = sorted(t.strip() for t in checks["sugar"].split("+"))
        got = sugar_rings(mol)
        if got != want:
            raise CheckError(f"sugar: got {got}, expected {want}")
    return extra


def stereo_matches_3d(mol_with_conf, smiles: str) -> bool:
    """True when the stereo perceived from the 3D coordinates reproduces the
    stereo of the reference SMILES."""
    m = Chem.Mol(mol_with_conf)
    Chem.AssignStereochemistryFrom3D(m)
    got = Chem.MolToSmiles(Chem.RemoveHs(m))
    want = Chem.MolToSmiles(Chem.MolFromSmiles(smiles))
    return got == want
