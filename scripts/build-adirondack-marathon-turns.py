#!/usr/bin/env python3
"""
build-adirondack-marathon-turns.py

Turn-by-turn generator for the Adirondack Marathon & Half Marathon.

This is a ROAD race whose course is reconstructed by routing OSM waypoints
through OSRM (see adk_marathon_gpx/build_adk_gpx_overpass.py). For that kind
of course, OSRM's own step maneuvers are the authoritative turn source — each
real maneuver comes with the name of the road it turns onto, straight from the
route response, with no Overpass enrichment (flaky / rate-limited) and no false
positives on gentle curves. (The FSS TBT pipeline — scripts/fetch-*-turns.py —
is the default for GPS-tracked trail races; this OSRM-steps path is the
road-race variant noted in the runbook.)

Writes the same schema the cue list consumes (config.loadLoopTurns):
  data/<id>-turns.geojson — Point features with properties
    { id, course_mi, direction, intensity, label, label_type, ... }

course_mi here is the OSRM (measured) distance; config.loadLoopTurns rescales
it to the certified course length at build time.

OSRM's demo host needs a TLS handshake the macOS system Python's LibreSSL
can't complete, so the request goes through curl.

Run from the repo root:
  python3 scripts/build-adirondack-marathon-turns.py
"""

import json
import math
import subprocess
import sys
from pathlib import Path

OSRM_HOST = "https://router.project-osrm.org"
DATA_DIR = Path(__file__).resolve().parents[1] / "src" / "maps" / "adirondack-marathon" / "data"

# Course waypoints (lon, lat), clockwise loop — identical to the route builder
# in adk_marathon_gpx/build_adk_gpx_overpass.py. The half marathon is the back
# half, starting at the Hamlet of Adirondack (index 5).
WAYPOINTS = [
    (-73.76216, 43.83512),  # 0  Start: Main St (US-9), village
    (-73.75472, 43.86274),  # 1  US-9 north
    (-73.71646, 43.85751),  # 2  Crane Pond Rd / top of Adirondack Rd
    (-73.74899, 43.81341),  # 3  Adirondack Rd, mid east shore
    (-73.75795, 43.77337),  # 4  Adirondack Rd -> Red Wing Rd
    (-73.75594, 43.76452),  # 5  Hamlet of Adirondack  <-- half start
    (-73.78722, 43.74129),  # 6  East Shore Dr
    (-73.81000, 43.72429),  # 7  East Shore Dr -> south end
    (-73.81884, 43.73122),  # 8  Glendale Rd
    (-73.81760, 43.73312),  # 9  US-9 at Pottersville
    (-73.79269, 43.74875),  # 10 US-9 N
    (-73.79300, 43.76997),  # 11 US-9 N
    (-73.78740, 43.79320),  # 12 US-9 N (on the US-9 line; avoids a Hayes Rd spur)
    (-73.77457, 43.80857),  # 13 US-9 N
    (-73.76770, 43.83268),  # 14 US-9 approaching village
    (-73.76168, 43.83680),  # 15 Leland Ave
    (-73.75729, 43.83595),  # 16 Finish: Schroon Public Beach
]
HALF_START_IDX = 5

LOOPS = [
    {"id": "marathon",      "waypoints": WAYPOINTS},
    {"id": "half-marathon", "waypoints": WAYPOINTS[HALF_START_IDX:]},
]

# Hand-authored turns for the major navigational maneuvers OSRM doesn't emit
# (they fall on via-waypoints, so OSRM treats them as "continue"). Course
# miles + on-route locations were measured from the rendered geometry
# (scripts measured: Adirondack Rd jct mile 4.1, Pottersville/Route 9 mile
# 17.5 marathon = 5.0 half). Merged with the OSRM turns and sorted by mile.
MANUAL_TURNS = {
    "marathon": [
        {"course_mi": 4.1,  "direction": "right", "intensity": "normal",
         "label": "Adirondack Road", "location": [-73.71646, 43.85751]},
        {"course_mi": 17.5, "direction": "right", "intensity": "normal",
         "label": "Route 9 (Pottersville)", "location": [-73.81760, 43.73312]},
    ],
    "half-marathon": [
        {"course_mi": 5.0,  "direction": "right", "intensity": "normal",
         "label": "Route 9 (Pottersville)", "location": [-73.81760, 43.73312]},
    ],
}

# OSRM maneuver types that are real, actionable turns (skip depart/arrive/
# continue/new name/notification/etc.).
TURN_TYPES = {"turn", "fork", "end of road", "roundabout", "rotary",
              "roundabout turn", "merge", "on ramp", "off ramp"}
DEDUP_GAP_MI = 0.05


def osrm_steps(waypoints):
    coords = ";".join(f"{lon},{lat}" for lon, lat in waypoints)
    url = (f"{OSRM_HOST}/route/v1/driving/{coords}"
           "?overview=false&steps=true&continue_straight=false")
    proc = subprocess.run(
        ["curl", "-sS", "-A", "FalseSummitStudio/1.0 (race-map TBT)", url],
        capture_output=True, text=True, timeout=120)
    if proc.returncode != 0:
        sys.exit(f"OSRM request failed (curl exit {proc.returncode}): {proc.stderr.strip()}")
    data = json.loads(proc.stdout)
    if data.get("code") != "Ok":
        sys.exit(f"OSRM returned '{data.get('code')}': {json.dumps(data)[:300]}")
    return data["routes"][0]


def classify(modifier):
    m = modifier or ""
    direction = "left" if "left" in m else ("right" if "right" in m else "straight")
    intensity = "sharp" if "sharp" in m else ("slight" if "slight" in m else "normal")
    return direction, intensity


def extract_turns(route):
    turns = []
    cum_m = 0.0
    for leg in route.get("legs", []):
        for step in leg.get("steps", []):
            man = step.get("maneuver", {})
            mtype = man.get("type", "")
            modifier = man.get("modifier", "")
            direction, intensity = classify(modifier)
            # A real turn: an actionable maneuver type with a left/right modifier.
            if mtype in TURN_TYPES and direction in ("left", "right"):
                turns.append({
                    "course_mi": round(cum_m / 1609.344, 2),
                    "direction": direction,
                    "intensity": intensity,
                    "label": step.get("name", "") or "",
                    "location": man.get("location"),
                })
            cum_m += step.get("distance", 0.0)
    # Dedup turns that land within DEDUP_GAP_MI of the previous kept turn
    # (via-waypoint boundaries can split one maneuver in two).
    deduped = []
    for t in turns:
        if deduped and abs(t["course_mi"] - deduped[-1]["course_mi"]) <= DEDUP_GAP_MI \
                and t["direction"] == deduped[-1]["direction"]:
            # keep the one that has a road name
            if t["label"] and not deduped[-1]["label"]:
                deduped[-1] = t
            continue
        deduped.append(t)
    return deduped


def to_feature_collection(turns):
    feats = []
    for i, t in enumerate(turns):
        feats.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": t["location"]},
            "properties": {
                "id": f"turn_{i:03d}",
                "course_mi": t["course_mi"],
                "ele_m": None,
                "direction": t["direction"],
                "intensity": t["intensity"],
                "label": t["label"],
                "label_type": "road" if t["label"] else "",
                "section": "Start → Finish",
                "snap_method": "osrm_steps",
                "context": "",
                "jurisdiction": "",
                "jurisdiction_unit": "",
            },
        })
    return {"type": "FeatureCollection", "features": feats}


def main():
    for loop in LOOPS:
        route = osrm_steps(loop["waypoints"])
        turns = extract_turns(route)
        turns.extend(MANUAL_TURNS.get(loop["id"], []))
        turns.sort(key=lambda t: t["course_mi"])
        fc = to_feature_collection(turns)
        out = DATA_DIR / f"{loop['id']}-turns.geojson"
        out.write_text(json.dumps(fc))
        named = sum(1 for f in fc["features"] if f["properties"]["label"])
        print(f"[{loop['id']}] {len(fc['features'])} turns, {named} named  -> {out.name}")


if __name__ == "__main__":
    main()
