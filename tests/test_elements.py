"""Offline tests for scripts/build_elements.py (layout and electron shells).

    python tests/test_elements.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from build_elements import group_of, period_of, shells_from_config, shells_rule  # noqa: E402

CASES = [
    (shells_from_config("1s1"), [1]),
    (shells_from_config("[He]2s2 2p4"), [2, 6]),
    (shells_from_config("[Ar]4s2 3d6"), [2, 8, 14, 2]),
    (shells_from_config("[Ar]3d10 4s1"), [2, 8, 18, 1]),
    (shells_from_config("[Xe]6s2 4f14 5d10 6p2"), [2, 8, 18, 32, 18, 4]),
    (shells_from_config("[Rn]7s2 5f14 6d10 7p6 (predicted)"), [2, 8, 18, 32, 32, 18, 8]),
    (shells_rule(11), [2, 8, 1]),
    (shells_rule(20), [2, 8, 8, 2]),
    (shells_rule(18), [2, 8, 8]),
    ([group_of(z)[0] for z in (1, 2, 3, 5, 10, 13, 19, 21, 30, 31, 36, 55, 56, 72, 86, 87, 104, 118)],
     [1, 18, 1, 13, 18, 13, 1, 3, 12, 13, 18, 1, 2, 4, 18, 1, 4, 18]),
    ([group_of(z)[1] for z in (57, 71, 89, 103)], ["lanthanoid"] * 2 + ["actinoid"] * 2),
    ([period_of(z) for z in (1, 2, 3, 18, 19, 36, 37, 54, 55, 86, 87, 118)], [1, 1, 2, 3, 4, 4, 5, 5, 6, 6, 7, 7]),
]

fails = 0
for got, want in CASES:
    ok = got == want
    fails += not ok
    print(("ok  " if ok else "FAIL"), got, "" if ok else f"(want {want})")
# every group 1-18 of periods 4-7 is used exactly once per period (in
# periods 6 and 7 the group-3 cell is the lanthanoid / actinoid series)
from collections import Counter  # noqa: E402
for p, (a, b) in {4: (19, 36), 5: (37, 54), 6: (55, 86), 7: (87, 118)}.items():
    c = Counter(group_of(z)[0] for z in range(a, b + 1) if group_of(z)[0])
    want = [g for g in range(1, 19) if not (p >= 6 and g == 3)]
    ok = sorted(c) == want and set(c.values()) == {1}
    fails += not ok
    print(("ok  " if ok else "FAIL"), f"period {p}: groups 1-18 once each")
print(f"\n{fails} failures")
sys.exit(1 if fails else 0)
