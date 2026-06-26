#!/usr/bin/env python3
"""
fetch-wild-goose-ringwood-turns.py

Driver that runs the FSS TBT pipeline once per 2026 Wild Goose @ Ringwood
loop GPX (pink / blue / checkered) and writes per-loop turns.geojson files
into src/maps/wild-goose-ringwood/data/.

Mirrors scripts/fetch-wild-goose-turns.py (the original Wawayanda driver),
repointed at the Ringwood State Park GPX + output dir, with Ringwood trail/
road/feature name hints for OSM enrichment.

Outputs (src/maps/wild-goose-ringwood/data/):
    pink-turns.geojson / blue-turns.geojson / checkered-turns.geojson
    <loop>-tbt.md            (QC, gitignored)
"""

import importlib.util
import shutil
import sys
from pathlib import Path

REPO_ROOT       = Path(__file__).resolve().parents[1]
PIPELINE_PATH   = REPO_ROOT / "turn-by-turn" / "fss_tbt_pipeline.py"
GPX_DIR         = Path("/Users/Sparks/Documents/false-summit-studio/ringwood_gpx")
OUTPUT_DATA_DIR = REPO_ROOT / "src" / "maps" / "wild-goose-ringwood" / "data"
STAGING_DIR     = Path("/tmp/wild-goose-ringwood-tbt-staging")

LOOPS = [
    {
        "id": "pink",
        "race_name": "Wild Goose Ringwood · Pink Loop",
        "race_slug": "wild_goose_ringwood_pink",
        "gpx_path":  GPX_DIR / "ringwood-wild-goose-7.75m pink.gpx",
    },
    {
        "id": "blue",
        "race_name": "Wild Goose Ringwood · Blue Loop",
        "race_slug": "wild_goose_ringwood_blue",
        "gpx_path":  GPX_DIR / "ringwood-wild-goose-5.5m blue.gpx",
    },
    {
        "id": "checkered",
        "race_name": "Wild Goose Ringwood · Checkered Loop",
        "race_slug": "wild_goose_ringwood_checkered",
        "gpx_path":  GPX_DIR / "ringwood-wild-goose-4.75m checkered_1.gpx",
    },
]

# Ringwood State Park named trails / roads / features to help OSM enrichment
# label maneuvers. Best-effort: turn geometry comes from the GPX regardless.
EXTRA_TRAIL_NAMES = [
    "Cooper Union Trail", "Crossover Trail", "Hewitt-Butler Trail",
    "Ringwood-Ramapo Trail", "Halifax Trail", "Todd Trail", "Manhattan Trail",
    "Cupsaw Brook Trail", "Shepherd Lake Loop", "Five Ponds Trail",
    "Bear Swamp Trail", "Skylands Loop", "Pierson Ridge Trail",
]
EXTRA_ROAD_NAMES = [
    "Sloatsburg Road", "Shepherd Lake Road", "Morris Road",
    "Ringwood Avenue", "Margaret King Avenue",
]
EXTRA_FEATURE_NAMES = [
    "Shepherd Lake", "Ringwood Manor", "Skylands Manor",
    "New Jersey Botanical Garden", "Cupsaw Brook", "Sally's Pond", "Swan Pond",
]


def load_pipeline_module():
    spec = importlib.util.spec_from_file_location("fss_tbt_pipeline", PIPELINE_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def run_one_loop(pipeline, loop, enrich):
    pipeline.CONFIG.update({
        "race_name":  loop["race_name"],
        "race_slug":  loop["race_slug"],
        "gpx_path":   str(loop["gpx_path"]),
        "output_dir": str(STAGING_DIR),
        "section_descriptions_path": None,
        "extra_trail_names":   EXTRA_TRAIL_NAMES,
        "extra_road_names":    EXTRA_ROAD_NAMES,
        "extra_feature_names": EXTRA_FEATURE_NAMES,
        "enable_live_enrichment": enrich,
    })
    pipeline.main()

    out_geojson  = STAGING_DIR / "turns.geojson"
    out_markdown = STAGING_DIR / "tbt.md"
    target_geojson  = OUTPUT_DATA_DIR / f"{loop['id']}-turns.geojson"
    target_markdown = OUTPUT_DATA_DIR / f"{loop['id']}-tbt.md"

    if not out_geojson.exists():
        sys.exit(f"FATAL: pipeline did not produce {out_geojson} for {loop['id']}")
    shutil.copy(out_geojson, target_geojson)
    if out_markdown.exists():
        shutil.copy(out_markdown, target_markdown)
    print(f"  -> wrote {target_geojson.name}")


def main():
    enrich = "--no-enrich" not in sys.argv
    STAGING_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DATA_DIR.mkdir(parents=True, exist_ok=True)

    for loop in LOOPS:
        if not loop["gpx_path"].exists():
            sys.exit(f"FATAL: missing GPX for {loop['id']}: {loop['gpx_path']}")

    pipeline = load_pipeline_module()
    print(f"\n=== Wild Goose Ringwood TBT — {len(LOOPS)} loops (enrich={enrich}) ===")
    for loop in LOOPS:
        print(f"\n--- {loop['id'].upper()} ({loop['gpx_path'].name}) ---")
        run_one_loop(pipeline, loop, enrich)
    print("\n=== Done. ===")


if __name__ == "__main__":
    main()
