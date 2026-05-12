#!/usr/bin/env python3
"""
fetch-wild-goose-turns.py

Driver that runs the FSS TBT pipeline once per Wild Goose loop GPX
(pink / blue / checkered) and writes per-loop turns.geojson files
into src/maps/wild-goose/data/.

Why a driver: the pipeline expects a single CONFIG dict and a single
gpx_path. Wild Goose is assembled from three loop GPXes that recombine
into the various race distances (10K → 100M). Generating turns per
loop is the right granularity — turn lists are reusable across every
race distance that includes that loop.

Outputs (written to src/maps/wild-goose/data/):
    pink-turns.geojson
    blue-turns.geojson
    checkered-turns.geojson
    <loop>-tbt.md            (QC, gitignored)

Live-enrichment cache is shared across loops at:
    /tmp/wild-goose-tbt-staging/_enrichment_cache.json

The cache survives reruns; first run takes ~1-2 min per loop, subsequent
runs are seconds.
"""

import importlib.util
import shutil
import sys
from pathlib import Path

REPO_ROOT      = Path(__file__).resolve().parents[1]
PIPELINE_PATH  = REPO_ROOT / "turn-by-turn" / "fss_tbt_pipeline.py"
GPX_DIR        = Path("/Users/Sparks/Documents/false-summit-studio/static-maps/sassquad/wild-goose/gpx")
OUTPUT_DATA_DIR = REPO_ROOT / "src" / "maps" / "wild-goose" / "data"
STAGING_DIR    = Path("/tmp/wild-goose-tbt-staging")

# Wild Goose has three loops. Each gets its own pipeline run. Park-specific
# trail/feature regex extensions help the OSM enrichment match Wawayanda
# State Park names that the generic regex would otherwise miss.
LOOPS = [
    {
        "id":   "pink",
        "race_name": "Wild Goose · Pink Loop",
        "race_slug": "wild_goose_pink",
        "gpx_path":  GPX_DIR / "wild-goose-pink-loop-775m.gpx",
    },
    {
        "id":   "blue",
        "race_name": "Wild Goose · Blue Loop",
        "race_slug": "wild_goose_blue",
        "gpx_path":  GPX_DIR / "wild-goose-blue-6m.gpx",
    },
    {
        "id":   "checkered",
        "race_name": "Wild Goose · Checkered Loop",
        "race_slug": "wild_goose_checkered",
        "gpx_path":  GPX_DIR / "wild-goose-checkered-loop-475m.gpx",
    },
]

EXTRA_TRAIL_NAMES = [
    "Cherokee Trail",
    "Wingdam Trail",
    "Iron Mountain Trail",
    "Banker Trail",
    "Lookout Trail",
    "Double Pond Trail",
    "Old Coal Trail",
    "Red Dot Trail",
    "Laurel Pond Trail",
    "Pumphouse Trail",
]
EXTRA_ROAD_NAMES = ["Warwick Turnpike", "Wawayanda Road", "Campsite Road", "Cherry Ridge Road"]
EXTRA_FEATURE_NAMES = ["Wawayanda Lake", "Iron Furnace", "Hidden Lake", "Lookout Mountain"]


def load_pipeline_module():
    """Import fss_tbt_pipeline.py as a module without running its __main__."""
    spec = importlib.util.spec_from_file_location("fss_tbt_pipeline", PIPELINE_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def run_one_loop(pipeline, loop):
    """Mutate the pipeline's module-level CONFIG and invoke main() for one loop."""
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

    # Move outputs out of staging into the wild-goose data folder, renamed
    # to <loop>-turns.geojson / <loop>-tbt.md. Other pipeline artifacts
    # (course_line.geojson, tbt.csv, switchback_zones.geojson, master JSON,
    # aids.geojson) stay in staging — we already have all of those signals
    # in the map's existing data files.
    out_geojson  = STAGING_DIR / "turns.geojson"
    out_markdown = STAGING_DIR / "tbt.md"
    target_geojson  = OUTPUT_DATA_DIR / f"{loop['id']}-turns.geojson"
    target_markdown = OUTPUT_DATA_DIR / f"{loop['id']}-tbt.md"

    if not out_geojson.exists():
        sys.exit(f"FATAL: pipeline did not produce {out_geojson} for {loop['id']}")
    shutil.copy(out_geojson, target_geojson)
    shutil.copy(out_markdown, target_markdown)
    print(f"  → wrote {target_geojson.name}")
    print(f"  → wrote {target_markdown.name} (QC, gitignored)")


def main():
    STAGING_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DATA_DIR.mkdir(parents=True, exist_ok=True)

    for loop in LOOPS:
        if not loop["gpx_path"].exists():
            sys.exit(f"FATAL: missing GPX for {loop['id']}: {loop['gpx_path']}")

    pipeline = load_pipeline_module()

    print(f"\n=== Wild Goose TBT — generating turns for {len(LOOPS)} loops ===")
    print(f"Staging:  {STAGING_DIR}")
    print(f"Output:   {OUTPUT_DATA_DIR}")

    for loop in LOOPS:
        print(f"\n--- {loop['id'].upper()} ({loop['gpx_path'].name}) ---")
        run_one_loop(pipeline, loop)

    print("\n=== Done. ===")


if __name__ == "__main__":
    main()
