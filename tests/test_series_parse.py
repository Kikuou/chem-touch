"""Offline tests for the PubChem text parsers in scripts/build_series.py.

    python tests/test_series_parse.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from build_series import parse_temperature, parse_solubility, pick_value  # noqa: E402

T = [
    ("78.2 °C", "bp", 78.2),
    ("173.1 °F (78.4 °C)", "bp", 78.4),
    ("-114.1 °C", "mp", -114.1),
    ("−161.5 °C", "bp", -161.5),
    ("100.5 °C at 760 mm Hg", "bp", 100.5),
    ("117 °C at 20 mm Hg", "bp", None),
    ("Decomposes at 200 °C", "mp", None),
    ("16.6 deg C", "mp", 16.6),
    ("62-64 °C", "mp", 62.0),
    ("351.4 K", "bp", 78.2),
    ("212 °F", "bp", 100.0),
]
S = [
    ("In water, 1.0X10+6 mg/L at 25 °C (miscible)", {"miscible": True}),
    ("Miscible with water", {"miscible": True}),
    ("In water, 2.2X10+3 mg/L at 25 °C", {"g_per_100ml": 0.22}),
    ("Solubility in water, g/100ml at 20 °C: 0.68", None),  # number after the unit: not parsed
    ("In water, 7.3 g/L at 25 °C", {"g_per_100ml": 0.73}),
    ("Soluble in ethanol", None),
    ("Immiscible with water; 0.0057 g/100 mL", {"g_per_100ml": 0.0057}),
]

fails = 0
for text, kind, want in T:
    got = parse_temperature(text, kind)
    ok = got == want
    fails += not ok
    print(("ok  " if ok else "FAIL"), repr(text), kind, got)
for text, want in S:
    got = parse_solubility(text)
    ok = got == want
    fails += not ok
    print(("ok  " if ok else "FAIL"), repr(text), got)

record = {"Record": {
    "RecordNumber": 702,
    "Reference": [
        {"ReferenceNumber": 1, "SourceName": "Some Vendor", "URL": "https://example.org/a"},
        {"ReferenceNumber": 2, "SourceName": "Hazardous Substances Data Bank (HSDB)", "URL": "https://example.org/hsdb"},
    ],
    "Section": [{"TOCHeading": "Chemical and Physical Properties", "Section": [
        {"TOCHeading": "Experimental Properties", "Section": [
            {"TOCHeading": "Boiling Point", "Information": [
                {"ReferenceNumber": 1, "Value": {"StringWithMarkup": [{"String": "79 °C"}]}},
                {"ReferenceNumber": 2, "Value": {"StringWithMarkup": [{"String": "173.1 °F (78.4 °C)"}]}},
            ]}]}]}]}}
best = pick_value(record, "bp")
ok = best and best["value"] == 78.4 and best["source"].startswith("Hazardous")
fails += not ok
print(("ok  " if ok else "FAIL"), "pick_value prefers HSDB:", best)

print(f"\n{fails} failures")
sys.exit(1 if fails else 0)
