# FSS Turn-by-Turn Pipeline — v1

Three files in this folder:

1. **`fss_tbt_pipeline.py`** — the script itself. Single-file, no QGIS,
   needs only `gpxpy` and `numpy`. Drop into your scripts folder once,
   reuse for every project. Edit the CONFIG block at the top per-race.

2. **`tbt_module_for_interactive_map_prompt.md`** — paste-able section to
   add into your master interactive map prompt. Contains: when to run,
   how to configure, expected outputs, and Mapbox GL JS integration code
   (sources/layers/popups/filter toggle).

3. **`wild_goose_100_tbt_runbook.md`** — one-shot retrofit prompt for
   adding TBT to the existing Wild Goose 100 interactive map. Step-by-step
   pre-flight → configure → run → verify.

Tested against the Cocodona 250 GPX and Aravaipa section descriptions:
22 sections, 76 prose turns, 8% mile-anchored to within 0.1 mi accuracy.
Geometry-only mode also tested — produces 477 actionable turns labeled
by bracketing aid stations (live enrichment fills target names).

Recommended install location:
    /Users/Sparks/Documents/false-summit-studio/scripts/fss_tbt_pipeline.py
