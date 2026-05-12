# FSS Interactive Map — Turn-by-Turn Module
*Drop this section into your interactive map prompt. Numbering should follow
whatever step comes before it in your existing prompt.*

---

## STEP N. GENERATE TURN-BY-TURN DATA

Generate a structured turn-by-turn (TBT) dataset and add it to the interactive
map as a clickable layer. This step requires no QGIS — it is pure Python and
runs as a single script.

### N.1 Prerequisites

```bash
pip install gpxpy numpy
```

The script `fss_tbt_pipeline.py` must be present (one shared copy for all
projects — keep it under `~/false-summit-studio/scripts/fss_tbt_pipeline.py`
or similar).

### N.2 Inputs Required

| Input | Source | Required |
|---|---|---|
| Course GPX | RD-supplied or the same file used for the static map | **Yes** |
| Section descriptions text | RD-supplied prose TBT (any race; see format below) | Optional but recommended |
| Aid station waypoints | Embedded in GPX as `<wpt>` entries | Optional |

**Section descriptions format.** If the RD has provided a section-by-section
narrative (very common for ultras), save it as a plain `.txt` file with each
section beginning with this header:

```
SECTION: <from_aid_name> (<from_mile>) to <to_aid_name> (<to_mile>)

<free-form prose describing the section>

================================================================================

SECTION: <next_from_aid> (<from_mile>) to <next_to_aid> (<to_mile>)

...
```

Section dividers (a row of `=` or `-`) are optional. Anything between section
headers is treated as the body. The pipeline parses turn verbs ("turn left",
"hard right", "stay left", "fork", etc.), mile marks, named trails/roads, and
hazards (gates, water crossings, gear checks) out of that body automatically.

If no descriptions are available, set `section_descriptions_path` to `None`
in the CONFIG block — the pipeline will run in geometry-only mode, producing
turn locations from GPX geometry alone with names filled in by the live-API
enrichment (USFS / OSM / GNIS).

### N.3 Configure the Pipeline

Open `fss_tbt_pipeline.py`, find the `CONFIG` block at the top, and fill in:

```python
CONFIG = {
    # ── Project ────────────────────────────────────────────────────
    "race_name":   "[RACE NAME, e.g. Wild Goose 100]",
    "race_slug":   "[snake_case_slug]",
    "gpx_path":    "[ABSOLUTE PATH TO COURSE GPX]",
    "output_dir":  "[ABSOLUTE PATH TO OUTPUT FOLDER]",

    # ── Section descriptions (optional) ────────────────────────────
    "section_descriptions_path": "[PATH or None]",

    # ── Project-specific named features (optional) ─────────────────
    # Add anything the generic regexes won't catch.
    "extra_trail_names":   [],   # e.g. ["BCT", "AZT"]
    "extra_road_names":    [],   # e.g. ["Senator Highway"]
    "extra_feature_names": [],   # e.g. ["Whiskey Row"]

    # ── Live enrichment (turn this off for offline runs) ───────────
    "enable_live_enrichment":   True,

    # All other parameters keep their defaults unless you have a
    # specific reason to change them.
}
```

> *The CONFIG block has additional tuning knobs (turn thresholds, switchback
> detection parameters). Keep the defaults unless a specific course shows
> issues — the defaults were tuned across Cocodona 250's 253 miles of
> very rugged terrain.*

### N.4 Run the Pipeline

```bash
python3 /path/to/fss_tbt_pipeline.py
```

Live enrichment makes one HTTPS round-trip per turn × ~4 endpoints. Expect
~0.4s per turn on first run. Reruns hit the local `_enrichment_cache.json`
and complete in seconds.

Confirm the run completes with summary output similar to:

```
=== Summary ===
Course length:        100.20 mi
Aid stations:         12
Candidate turns:      218
Switchback zones:     14
Actionable turns:     67
Master records:       43
  mile_anchored                   8
  sequential                      30
  approximate_or_midpoint         3
  no_geom_match                   2
Records with named target: 38 / 43 (88%)
```

If `Records with named target` is below ~70%, either the descriptions are
sparse or the live enrichment had connectivity issues. Check the log lines
prefixed `[stage5]`.

### N.5 Output Files

The pipeline writes the following to `output_dir`:

| File | Purpose |
|---|---|
| `turns.geojson`        | Drop-in Mapbox GL JS / Leaflet turn layer (one Point per turn) |
| `aids.geojson`         | Aid station markers from GPX waypoints |
| `course_line.geojson`  | Downsampled course route (~4000 vertices) |
| `switchback_zones.geojson` | LineString features for switchback corridors |
| `tbt.csv`              | Flat tabular master (Excel / Sheets) |
| `tbt.md`               | Human-readable TBT for QC review |
| `tbt_master.json`      | Full structured master (everything) |
| `_enrichment_cache.json` | Live-API cache (do not commit; do not delete unless you want to re-fetch) |

### N.6 Add the Turn Layer to the Interactive Map

The `turns.geojson` file is a standard FeatureCollection with this property
schema per feature:

```json
{
  "id": "turn_003",
  "course_mi": 6.88,
  "ele_m": 628.0,
  "direction": "right",          // "left" | "right" | "straight"
  "intensity": "sharp",          // "sharp" | "normal" | "slight" | "fork"
  "label": "Wagoner Trail",      // best-resolved target name
  "label_type": "trail",         // "trail" | "road" | "feature"
  "section": "Cottonwood Creek → Lane Mountain",
  "snap_method": "mile_anchored",
  "context": "...",              // prose excerpt if descriptions were used
  "jurisdiction": "U.S. Forest Service",
  "jurisdiction_unit": "Prescott National Forest"
}
```

**Mapbox GL JS integration:**

```javascript
// Add the source
map.addSource('tbt-turns', {
  type: 'geojson',
  data: 'turns.geojson'  // or the absolute URL
});

// Layer: filled circles, color by direction, size by intensity
map.addLayer({
  id: 'tbt-turns-circles',
  type: 'circle',
  source: 'tbt-turns',
  // Default: only show "sharp" turns. Toggle this filter to show all.
  filter: ['==', ['get', 'intensity'], 'sharp'],
  paint: {
    'circle-radius': [
      'match', ['get', 'intensity'],
      'sharp',  6,
      'normal', 5,
      4
    ],
    'circle-color': [
      'match', ['get', 'direction'],
      'right',    '#8c5a3f',   // FSS rust
      'left',     '#5a6788',   // FSS slate-blue
      'straight', '#7a8466',   // FSS olive
      '#888'
    ],
    'circle-stroke-color': '#ffffff',
    'circle-stroke-width': 2
  }
});

// Click → popup
map.on('click', 'tbt-turns-circles', (e) => {
  const f = e.features[0];
  const p = f.properties;
  const arrow = p.direction === 'right' ? '→' : p.direction === 'left' ? '←' : '↑';
  const html = `
    <div class="tbt-popup">
      <div class="mi">Mi ${parseFloat(p.course_mi).toFixed(2)}</div>
      <div class="action">${arrow} ${p.intensity === 'sharp' ? 'SHARP ' : ''}${p.direction.toUpperCase()}</div>
      <div class="label">${p.label || ''}</div>
      <div class="section">${p.section}</div>
      ${p.context ? `<div class="ctx">"${p.context}"</div>` : ''}
    </div>
  `;
  new mapboxgl.Popup({ offset: 12, closeButton: true })
    .setLngLat(f.geometry.coordinates)
    .setHTML(html).addTo(map);
});

// Pointer cursor on hover
map.on('mouseenter', 'tbt-turns-circles', () => map.getCanvas().style.cursor = 'pointer');
map.on('mouseleave', 'tbt-turns-circles', () => map.getCanvas().style.cursor = '');
```

> *Default filter is `intensity = "sharp"` — that produces ~0.3 turns/mile,
> which matches what runners actually treat as navigation decisions. Add a
> UI toggle to lift the filter (`map.setFilter('tbt-turns-circles', null)`)
> for "show all turns" mode.*

### N.7 Verify

Open the deployed interactive map and confirm:

- [ ] Turn markers appear along the course
- [ ] Markers are color-coded by direction (right/left/straight)
- [ ] Sharp turns are visually larger than normal turns
- [ ] Clicking a marker opens a popup with mile, action, label, and section
- [ ] Aid station markers are still present (separate layer; should be drawn on top)
- [ ] Spot-check 3–5 turns against the source GPX in CalTopo or Gaia: the turn marker should sit within ~10 m of the actual trail bend
- [ ] If descriptions were used, spot-check 3 mile-anchored turns (`snap_method = "mile_anchored"`) — those should match the prose mile mark within ~0.1 mi

### N.8 Edge Cases

- **Course is mostly road / very few sharp turns**: the geometry detector will produce sparse output. Consider lowering `actionable_threshold_deg` from 60° to 45° in CONFIG.
- **Course has many hairpin switchbacks** (Mt Elden, Hangover Trail): the switchback-zone detector should absorb these into corridors. Verify on the map — if switchback-flagged segments still have individual turn markers, raise `switchback_min_turns` from 3 to 4.
- **Tracks not Routes**: COROS / Garmin export courses as either `<trk>` or `<rte>`. The pipeline tries `<trk>` first, falls back to `<rte>`. If a GPX produces "0 track points", check for `<trkpt>` vs `<rtept>` tags.
- **Descriptions in PDF, not text**: extract the text first (`pdftotext file.pdf out.txt`) and clean up the section headers to match the expected format before running.

---

*End of TBT module. Continue with the next step of your interactive map prompt.*
