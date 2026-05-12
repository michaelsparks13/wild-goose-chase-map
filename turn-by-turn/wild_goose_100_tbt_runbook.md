# Wild Goose 100 — TBT Retrofit Runbook
*One-time execution prompt to add turn-by-turn data to the existing
Wild Goose 100 interactive map. Paste into a Claude Code or terminal
session and execute step-by-step.*

---

## Context

The Wild Goose 100 interactive map already exists. This runbook adds a
turn-by-turn (TBT) data layer on top of it without rebuilding anything.
Output is one new `turns.geojson` file plus updated map JS to load it.

## Pre-flight

Before starting, locate these on disk and confirm:

1. **Wild Goose 100 GPX** — the same course file used to build the existing
   interactive map.
   ```
   Expected location: [FILL IN — e.g. /Users/Sparks/Documents/false-summit-studio/wild-goose-100/wild_goose_100.gpx]
   ```

2. **Wild Goose 100 section descriptions** — *if* a prose TBT exists.
   Wild Goose was Michael's own race, so a section-by-section narrative
   may already be drafted somewhere in the project folder. If not, skip
   this — the pipeline runs in geometry+enrichment-only mode.
   ```
   Expected location (if exists): [FILL IN]
   ```

3. **Existing Wild Goose interactive map output folder** — where the current
   GeoJSON/HTML/JS lives.
   ```
   Expected location: [FILL IN]
   ```

4. **The pipeline script** — `fss_tbt_pipeline.py` should be at:
   ```
   /Users/Sparks/Documents/false-summit-studio/scripts/fss_tbt_pipeline.py
   ```

## Step 1. Install dependencies

```bash
pip install gpxpy numpy
```

If you've already run the pipeline for another race, this is a no-op.

## Step 2. Configure the pipeline for Wild Goose 100

Edit `fss_tbt_pipeline.py` and set the CONFIG block at the top to:

```python
CONFIG = {
    # ── Project ────────────────────────────────────────────────────
    "race_name":   "Wild Goose 100",
    "race_slug":   "wild_goose_100",
    "gpx_path":    "[FILL IN: absolute path to Wild Goose GPX]",
    "output_dir":  "[FILL IN: existing Wild Goose interactive map folder]",

    # ── Section descriptions ───────────────────────────────────────
    # Set this to the path to a .txt prose TBT if one exists for Wild Goose.
    # The expected file format is documented in the TBT module.
    # Set to None for geometry+enrichment-only mode.
    "section_descriptions_path": [FILL IN: path or None],

    # ── Project-specific named features ────────────────────────────
    # If Wild Goose has named trails/roads/landmarks the generic regex
    # might miss, list them here. Examples for the Catskills/Hudson Valley
    # area where Wild Goose runs:
    "extra_trail_names":   [],
    "extra_road_names":    [],
    "extra_feature_names": [],

    # ── Live enrichment ────────────────────────────────────────────
    "enable_live_enrichment":   True,

    # Keep all other parameters at their defaults.
}
```

> *Wild Goose runs through state forest, state park, and possibly some
> private easements. Live enrichment will tag each turn with the correct
> jurisdiction (e.g. "NYS DEC", "NYS Parks") via PAD-US, and pull named
> features from USGS GNIS where USFS data doesn't apply.*

## Step 3. Execute the pipeline

```bash
cd /Users/Sparks/Documents/false-summit-studio/scripts
python3 fss_tbt_pipeline.py
```

Expected runtime: 1–3 minutes for a 100-mile course on first run (live
enrichment dominates). Reruns hit the cache and complete in under 5 seconds.

Confirm the run completes with summary output. Sanity checks:

- Course length should match the published distance (~100 mi)
- `Master records` should be roughly 30–80 turns — far fewer than the raw
  candidate-turns count, which is normal
- `Records with named target` should be ≥ 60% if descriptions were used,
  ≥ 30% with live enrichment alone

If any of these are off, check the `[stage*]` log lines for errors before
proceeding.

## Step 4. Inspect the output before publishing

Open `tbt.md` in the output folder. Quickly skim the table of turns —
this is the human-readable QC pass.

Look for:

- Turns at obvious decision points (trail junctions, road crossings)
- No turns clustered at fence-crossing points or in switchback sections
  (those should have been absorbed into `switchback_zones.geojson`)
- The named-target column ("Onto / Near") populated for most rows

If the output looks reasonable, proceed. If a particular section has
nonsensical turns (e.g. turn-every-100m through what's actually a smooth
section), adjust CONFIG and re-run:

- Too many noise turns → raise `actionable_threshold_deg` from 60.0 to 75.0
- Real turns being missed → lower `actionable_threshold_deg` to 45.0
- Switchbacks not being absorbed → lower `switchback_cluster_radius_mi`
  from 0.16 to 0.12, or lower `switchback_min_turns` from 3 to 2

## Step 5. Add the turn layer to the existing interactive map

The existing Wild Goose interactive map presumably has a JS file (or
inline `<script>`) that loads `course_line.geojson` and `aids.geojson`.
Add the equivalent for `turns.geojson`. Three pieces are needed:

### 5a. Add the source

```javascript
map.addSource('tbt-turns', {
  type: 'geojson',
  data: 'turns.geojson'  // adjust path to match your existing structure
});
```

### 5b. Add the layer

```javascript
map.addLayer({
  id: 'tbt-turns-circles',
  type: 'circle',
  source: 'tbt-turns',
  // Show only sharp turns by default — runners' actual decision points.
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
      'right',    '#8c5a3f',
      'left',     '#5a6788',
      'straight', '#7a8466',
      '#888'
    ],
    'circle-stroke-color': '#ffffff',
    'circle-stroke-width': 2
  }
}, 'aids-circles');  // ← insert BELOW aid stations so aids draw on top.
                      //    Replace with your actual aid layer id.
```

### 5c. Add the click → popup handler

```javascript
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
  new mapboxgl.Popup({ offset: 12 })
    .setLngLat(f.geometry.coordinates)
    .setHTML(html).addTo(map);
});
map.on('mouseenter', 'tbt-turns-circles', () => map.getCanvas().style.cursor = 'pointer');
map.on('mouseleave', 'tbt-turns-circles', () => map.getCanvas().style.cursor = '');
```

### 5d. (Optional) Add a "show all turns" toggle

```html
<label><input type="checkbox" id="show-all-turns"> Show all turns</label>
```

```javascript
document.getElementById('show-all-turns').addEventListener('change', (e) => {
  if (e.target.checked) {
    map.setFilter('tbt-turns-circles', null);
  } else {
    map.setFilter('tbt-turns-circles', ['==', ['get', 'intensity'], 'sharp']);
  }
});
```

## Step 6. Verify on the deployed map

Open the live Wild Goose 100 interactive map in a browser. Confirm:

- [ ] Course line still renders correctly (no regression)
- [ ] Aid station markers are still present and on top of turn markers
- [ ] Turn markers appear along the route, color-coded
- [ ] Clicking a turn opens a popup with the expected fields
- [ ] Spot-check 3–5 turns against your race-day knowledge of the course —
      the marker should be within ~10 m of the actual trail bend
- [ ] Mobile responsive check — popup is readable on iPhone width

## Step 7. Update the FSS interactive map prompt

If this is the first race using the TBT module, paste the contents of
`tbt_module_for_interactive_map_prompt.md` into your master interactive map
prompt at the appropriate step. From now on, every new interactive map
project gets TBT for free as part of the standard build.

---

## Troubleshooting

**"No track points found"**
The GPX uses `<rte>/<rtept>` instead of `<trk>/<trkpt>`. The pipeline tries
both — if it fails, open the GPX in a text editor and verify the structure.

**"All turns clustered at the start"**
Likely waypoints (`<wpt>`) are interleaved with track points. The pipeline
uses only `<trk>` and `<rte>` for the line. Check that your GPX exports
correctly.

**"Live enrichment all failing"**
Network issue, or PAD-US / USFS / Overpass having an outage. Set
`"enable_live_enrichment": False` in CONFIG and re-run — you'll lose
jurisdiction tagging and OSM/USFS-derived names but the geometry-driven
turns are still produced. You can re-enable enrichment later and rerun
to fill those fields in (the cache makes the second run free for any
points already enriched).

**"Markdown TBT shows wrong section labels"**
The `section` property in geometry-only mode comes from bracketing aid
station waypoints. If your GPX doesn't include named waypoints for the
aid stations, every turn will show "Start → Finish". Either add `<wpt>`
entries to the GPX or supply section descriptions to override.

---

*End of Wild Goose 100 retrofit runbook. Last updated: 2026-05.*
