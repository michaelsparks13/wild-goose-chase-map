#!/usr/bin/env python3
"""
fetch-gran-fondo-badlands-turns.py

Driver that runs the FSS TBT pipeline once per Gran Fondo Badlands GPX
(brontosaurus / trex / triceratops / velociraptor) and writes per-loop
turns.geojson files into src/maps/gran-fondo-badlands/data/.

Each distance is its own complete loop GPX (downloaded from
granfondobadlands.ca), so we run the pipeline four times — one per
distance. The shared staging dir means the OSM enrichment cache is
re-used across overlapping road segments (every distance shares the
same first ~25 km out from Drumheller along the Red Deer River road),
so loops 2-4 are mostly cache hits.
"""

import importlib.util
import shutil
import sys
from pathlib import Path

REPO_ROOT       = Path(__file__).resolve().parents[1]
PIPELINE_PATH   = REPO_ROOT / "turn-by-turn" / "fss_tbt_pipeline.py"
DATA_DIR        = REPO_ROOT / "src" / "maps" / "gran-fondo-badlands" / "data"
STAGING_DIR     = Path("/tmp/gran-fondo-badlands-tbt-staging")

LOOPS = [
    {
        "id":        "brontosaurus",
        "race_name": "Gran Fondo Badlands · Brontosaurus 163K",
        "race_slug": "gfb_brontosaurus",
        "gpx_path":  DATA_DIR / "brontosaurus.gpx",
    },
    {
        "id":        "trex",
        "race_name": "Gran Fondo Badlands · T-Rex 100K",
        "race_slug": "gfb_trex",
        "gpx_path":  DATA_DIR / "trex.gpx",
    },
    {
        "id":        "triceratops",
        "race_name": "Gran Fondo Badlands · Triceratops 75K",
        "race_slug": "gfb_triceratops",
        "gpx_path":  DATA_DIR / "triceratops.gpx",
    },
    {
        "id":        "velociraptor",
        "race_name": "Gran Fondo Badlands · Velociraptor 50K",
        "race_slug": "gfb_velociraptor",
        "gpx_path":  DATA_DIR / "velociraptor.gpx",
    },
]

# Extras the generic regex misses for Drumheller / the Canadian Badlands.
EXTRA_TRAIL_NAMES = []
EXTRA_ROAD_NAMES = [
    "North Dinosaur Trail",
    "South Dinosaur Trail",
    "Bleriot Ferry Road",
    "Highway 9",
    "Highway 10",
    "Highway 56",
    "Highway 570",
    "Range Road 16-0",
    "Range Road 17-0",
    "Range Road 18-0",
    "Range Road 19-0",
    "Range Road 20-0",
    "Township Road 28-0",
    "Township Road 29-0",
    "Township Road 30-0",
    "Veterans Way",
    "1st Avenue West",
    "2nd Street West",
    "Centre Street",
    "South Railway Avenue",
    "Atlas Coal Mine Road",
    "East Coulee Drive",
    "Rosedale Bridge Road",
]
EXTRA_FEATURE_NAMES = [
    "Red Deer River",
    "Bleriot Ferry",
    "Hoodoo Trail",
    "Last Chance Saloon",
    "East Coulee",
    "Wayne",
    "Rosedale",
    "Dorothy",
    "Atlas Coal Mine",
    "Royal Tyrrell Museum",
    "Badlands Community Facility",
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

    print(f"\n=== Gran Fondo Badlands TBT — {len(LOOPS)} distances ===")
    print(f"Staging:  {STAGING_DIR}")
    print(f"Output:   {DATA_DIR}")

    for loop in LOOPS:
        print(f"\n--- {loop['id'].upper()} ({loop['gpx_path'].name}) ---")
        run_one_loop(pipeline, loop)

    print("\n=== Done. ===")


if __name__ == "__main__":
    main()
