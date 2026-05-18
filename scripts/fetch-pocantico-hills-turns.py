#!/usr/bin/env python3
"""
fetch-pocantico-hills-turns.py

Driver that runs the FSS TBT pipeline once per Pocantico Hills Marathon
distance (marathon, half-marathon) and writes per-loop turns.geojson
files into src/maps/pocantico-hills/data/.

Each distance is its own complete loop GPX (host-provided), so we run
the pipeline twice. The shared staging dir means the OSM enrichment
cache is re-used across the overlapping carriage-road segments that
both distances share (the marathon and half follow the same outbound
trail for the first ~5.5 miles), so the second loop is mostly
cache hits.

Use /usr/bin/python3 (system Python) — 3.9.6 ships with gpxpy +
numpy + requests, which the pipeline depends on. Older framework
Pythons on macOS will be missing modules.
"""

import importlib.util
import shutil
import sys
from pathlib import Path

REPO_ROOT       = Path(__file__).resolve().parents[1]
PIPELINE_PATH   = REPO_ROOT / "turn-by-turn" / "fss_tbt_pipeline.py"
DATA_DIR        = REPO_ROOT / "src" / "maps" / "pocantico-hills" / "data"
STAGING_DIR     = Path("/tmp/pocantico-hills-tbt-staging")

LOOPS = [
    {
        "id":        "marathon",
        "race_name": "Pocantico Hills Marathon",
        "race_slug": "ph_marathon",
        "gpx_path":  DATA_DIR / "marathon.gpx",
    },
    {
        "id":        "half-marathon",
        "race_name": "Pocantico Hills Half Marathon",
        "race_slug": "ph_half_marathon",
        "gpx_path":  DATA_DIR / "half-marathon.gpx",
    },
]

# Extras the generic regex misses for the Rockefeller Preserve / lower
# Hudson Valley. These names appear in OSM tags on the carriage-road
# network inside the Preserve plus the connector roads to Phelps
# Hospital, but the pipeline's default regex only catches a subset.
EXTRA_TRAIL_NAMES = [
    "Rockwood Hall Carriage Road",
    "Thirteen Bridges Trail",
    "Old Croton Aqueduct Trail",
    "Pocantico River Trail",
    "Eagle Hill Trail",
    "Witches Spring Trail",
    "Brothers Path Trail",
    "Big Tree Trail",
    "Sleepy Hollow Trail",
    "Foothills Trail",
    "Brook Trail",
    "Spook Rock Trail",
    "Buttermilk Hill Trail",
    "Nature's Trail",
    "Farm Meadow Trail",
    "Cinder Field Trail",
    "Overlook Trail",
    "Rockefeller Lake Trail",
    "Bedford Road Trail",
    "Old Sleepy Hollow Road Trail",
]
EXTRA_ROAD_NAMES = [
    "Route 117",
    "Route 448",
    "Bedford Road",
    "Old Sleepy Hollow Road",
    "North Broadway",
    "Phelps Way",
    "Route 9",
    "Albany Post Road",
    "Sleepy Hollow Road",
    "Pocantico Lake Road",
    "County House Road",
]
EXTRA_FEATURE_NAMES = [
    "Rockwood Hall",
    "Rockefeller State Park Preserve",
    "Pocantico River",
    "Swan Lake",
    "Pocantico Lake",
    "Hudson River",
    "Phelps Hospital",
    "Sleepy Hollow",
    "Tarrytown",
    "Pocantico Hills",
    "Stone Barns",
    "Kykuit",
]


def load_pipeline_module():
    spec = importlib.util.spec_from_file_location("fss_tbt_pipeline", PIPELINE_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def run_one_loop(pipeline, loop):
    pipeline.CONFIG.update({
        "race_name":  loop["race_name"],
        "race_slug":  loop["race_slug"],
        "gpx_path":   str(loop["gpx_path"]),
        "output_dir": str(STAGING_DIR),
        "section_descriptions_path": None,
        "extra_trail_names":   EXTRA_TRAIL_NAMES,
        "extra_road_names":    EXTRA_ROAD_NAMES,
        "extra_feature_names": EXTRA_FEATURE_NAMES,
        "enable_live_enrichment": True,
    })
    pipeline.main()

    out_geojson  = STAGING_DIR / "turns.geojson"
    out_markdown = STAGING_DIR / "tbt.md"
    target_geojson  = DATA_DIR / f"{loop['id']}-turns.geojson"
    target_markdown = DATA_DIR / f"{loop['id']}-tbt.md"

    if not out_geojson.exists():
        sys.exit(f"FATAL: pipeline did not produce {out_geojson} for {loop['id']}")
    shutil.copy(out_geojson, target_geojson)
    shutil.copy(out_markdown, target_markdown)
    print(f"  -> wrote {target_geojson.name}")
    print(f"  -> wrote {target_markdown.name} (QC, gitignored)")


def main():
    STAGING_DIR.mkdir(parents=True, exist_ok=True)
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    for loop in LOOPS:
        if not loop["gpx_path"].exists():
            sys.exit(f"FATAL: missing GPX for {loop['id']}: {loop['gpx_path']}")

    pipeline = load_pipeline_module()

    print(f"\n=== Pocantico Hills TBT — {len(LOOPS)} distances ===")
    print(f"Staging:  {STAGING_DIR}")
    print(f"Output:   {DATA_DIR}")

    for loop in LOOPS:
        print(f"\n--- {loop['id'].upper()} ({loop['gpx_path'].name}) ---")
        run_one_loop(pipeline, loop)

    print("\n=== Done. ===")


if __name__ == "__main__":
    main()
