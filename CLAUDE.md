## Git Workflow
**IMPORTANT:**
1. Before making any changes, always create and checkout a feature branch named `feature_some_short_name` (where `some_short_name` describes the change). Make and then commit your changes in this branch.
2. You must write automated tests for all code. Use **Vitest** for unit tests (JS logic, data transformations, coordinate helpers) and **Playwright** for end-to-end tests (map rendering, UI interactions, toggle behavior).
3. You must compile the code before committing — `node build.js` must succeed.
4. **Test cadence:**
   - **On a feature branch (per-commit):** run only the targeted tests for what you changed (e.g. `npx vitest run tests/<area>.test.js`, or the specific Playwright spec covering the touched UI). Do not run the full suite for every intermediate commit.
   - **Before merging into `main`:** run the full suite — `npx vitest run` AND `npx playwright test` — and confirm all green. Do not merge on red.

## Deployment Quality Bar
**IMPORTANT:** Every deploy is reviewed by multiple automated coding agents (OpenAI Code, Claude Code, Gemini) and a human design executive at Airbnb. Deploys that fail this review are rolled back. Ensure every commit meets a very high standard for both code quality and design quality:
- Clean, readable, well-structured code with no dead code, no hacks, no shortcuts
- Consistent naming, formatting, and architecture patterns across the codebase
- Polished visual design: correct spacing, alignment, color contrast, typography, and responsive behavior
- Accessible and performant — no layout shifts, no render-blocking issues, no broken interactions
- All edge cases handled; no console errors or warnings in production builds

# False Summit Studio - Race Map Builder

## Business Overview
**Website:** falsesummitstudio.com
**Service:** Custom interactive maps for endurance events (trail races, road races, ultras)

## Tech Stack
- **MapLibre GL JS** - Map rendering and interactivity (open-source, no API key)
- **PMTiles** - Self-hosted vector tiles via Cloudflare R2 (no third-party tile service)
- **Protomaps Basemaps** - Client-side basemap style generation
- **Vanilla HTML/CSS/JS** - No framework, compiled via `build.js` into standalone `index.html` per map
- **GeoJSON** - Course routes, trails, and point data
- **Canvas API** - Elevation profile rendering
- **Node.js build system** - Zero-dependency build script compiles shared code + per-map config into standalone HTML

## Build System

### Commands
- `node build.js` — Build all maps to `dist/` (~30ms)
- `node dev.js` — Dev server with file watching + SSE live reload on port 3000
- `npx vitest run` — Run unit tests (requires build first)
- `npx playwright test` — Run e2e tests (auto-builds via playwright.config.js)

### How It Works
`build.js` reads shared CSS/JS modules from `src/shared/`, HTML templates from `src/templates/`, and per-map config from `src/maps/{slug}/config.js`. It concatenates everything, replaces `{{PLACEHOLDERS}}`, and outputs standalone `index.html` files to `dist/maps/{slug}/`. It also generates a stripped-down embeddable version at `dist/embed/{slug}/index.html` using `embed-shell.html` (no header/footer, compact layout, URL parameter customization). All course/trail data is inlined from the config's data files — no runtime `fetch()`.

### Adding a New Map
1. Create `src/maps/{slug}/config.js` (CommonJS module exporting config object)
2. Add course data files to `src/maps/{slug}/data/`
3. Config specifies: meta, CSS variables, map center/zoom, course coords, elevations, markers, toggle buttons, colors, etc.
4. For complex maps (multi-loop), use `skipSharedJs: true` + `overrideJs` for standalone JS
5. Run `node build.js` to generate `dist/maps/{slug}/index.html`

### Deployment
Netlify auto-deploys from `main` branch. Config in `netlify.toml`: `command = "node build.js"`, `publish = "dist"`.

## Data Loading Rules
**IMPORTANT:** All course and trail GeoJSON data must be inlined directly into `index.html` as JavaScript variables. The build system handles this automatically — data files in `src/maps/{slug}/data/` are loaded by `config.js` via `require()` and inlined into the built HTML.

## Key Data Structures

### LOOPS Object
```javascript
const LOOPS = {
  blue: {
    name: 'Blue Loop',
    miles: 12.4,
    geojson: { /* GeoJSON Feature */ },
    visible: true,
    color: '#0479FF'
  },
  // ... other loops
};
```

### Trail Blaze Colors
Trails use official park blaze colors. The `blaze` property in GeoJSON maps to display colors:
```javascript
const BLAZE_COLORS = {
  'white': '#ffffff',   // Appalachian Trail
  'blue': '#2196F3',    // Cherry Ridge, Cedar Swamp
  'yellow': '#FFD700',  // Laurel Pond Trail
  'orange': '#FF9800',  // Double Pond Trail, Lake Loop
  'green': '#4CAF50',   // Banker Trail
  'purple': '#9C27B0',  // Boulder Garden Trail
  'red': '#f44336',
  null: '#9E9E9E'       // Roads (no blaze)
};
```

## Design Patterns

### Overlapping Loop Segments
When two loops share a segment, use offset lines to show both colors side-by-side:
```javascript
// Extract shared coordinates
const sharedCoords = blueCoords.slice(startIndex, endIndex);

// Create offset layers (railroad track style)
map.addLayer({
  id: 'shared-pink-offset',
  type: 'line',
  source: 'shared-segment',
  paint: {
    'line-color': '#E834EC',
    'line-width': 2.5,
    'line-offset': -1.5
  }
});
map.addLayer({
  id: 'shared-blue-offset',
  type: 'line',
  source: 'shared-segment',
  paint: {
    'line-color': '#0479FF',
    'line-width': 2.5,
    'line-offset': 1.5
  }
});
```

**Important**: Keep line-width and line-offset equal for visual balance.

### Toggle Visibility with Shared Segments
When toggling loops, update shared segment visibility:
```javascript
if ((id === 'blue' || id === 'pink') && map.getLayer('shared-blue-offset')) {
  const sharedVisible = (LOOPS.blue.visible && LOOPS.pink.visible) ? 'visible' : 'none';
  map.setLayoutProperty('shared-pink-offset', 'visibility', sharedVisible);
  map.setLayoutProperty('shared-blue-offset', 'visibility', sharedVisible);
}
```

### Park Trail Overlay (Required)
Every race map MUST include a toggleable trail overlay showing the actual park/area trails. This gives runners context for which named trail the course follows at each point.

**Implementation pattern:**
1. Create `data/trails.geojson` - segment the course coordinates by which named trail each section follows
2. Each GeoJSON feature needs `name` (trail name) and `blaze` (color string or null for roads)
3. Add a **"Park Trails"** toggle button alongside Course and 3D buttons (always use the label "Park Trails", not "Trails")
4. Inline trail data directly as a JS variable (do NOT use `fetch()` — see Data Loading Rules)
5. Render trail lines colored by blaze using a MapLibre `match` expression
6. Add trail name labels along each line (`symbol-placement: 'line'`)
7. Trail lines render **ON TOP** of the course line as **dashed lines** — this lets the solid course show through while the colored dashes indicate which trail you're on. Do NOT use `beforeId` — trails go above the course.

```javascript
// Trail layer rendered ON TOP of course (no beforeId)
map.addLayer({
  id: 'park-trails-line',
  type: 'line',
  source: 'park-trails',
  paint: {
    'line-color': ['match', ['get', 'blaze'],
      'white', '#ffffff',
      'blue', '#2196F3',
      'yellow', '#FFD700',
      'orange', '#FF9800',
      'green', '#4CAF50',
      'red', '#f44336',
      'violet', '#9C27B0',
      '#9E9E9E'  // default for roads/null blaze
    ],
    'line-width': ['interpolate', ['linear'], ['zoom'], 12, 3, 15, 5],
    'line-dasharray': [2, 3],
    'line-opacity': 0.9
  },
  layout: { 'line-cap': 'butt', 'line-join': 'round' }
}); // no beforeId — renders on top of course
```

### Basemap Cleanup (Required)
The Protomaps basemap renders hiking trails, paths, and footways from OSM data that conflict with our custom course and park trail overlays. **Every map must hide these layers** at the start of `map.on('load')`:

```javascript
// Hide basemap trail/path layers that conflict with our custom overlays
['roads_other','roads_bridges_other','roads_bridges_other_casing',
 'roads_tunnels_other','roads_tunnels_other_casing','roads_labels_minor'
].forEach(id => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none'); });
```

These Protomaps layer IDs correspond to:
- `roads_other` — Main path/trail lines (highway=path, highway=footway)
- `roads_bridges_other` / `_casing` — Paths on bridges
- `roads_tunnels_other` / `_casing` — Paths in tunnels
- `roads_labels_minor` — Labels for paths and minor roads

### No Course Click Popup
Do NOT add click interaction on the course line. The course info is already displayed in the stats section and header — a click popup is redundant and clutters the map.

### Mobile Scroll Behavior (Required)
A customer report (Aug 2026) showed the Wild Goose page was nearly unscrollable in iPhone Safari. Two rules prevent this class of bug, both enforced by tests:

1. **Every `new maplibregl.Map(...)` constructor — main maps, the weather radar mini-map, any future embedded map — MUST pass:**
   ```javascript
   cooperativeGestures: window.matchMedia('(pointer: coarse)').matches
   ```
   Without it, MapLibre captures every one-finger drag on touch devices, so the page cannot scroll wherever the canvas is. Gating on `(pointer: coarse)` keeps desktop scroll-wheel zoom unchanged (unconditional `cooperativeGestures` would force Ctrl+scroll on desktop). `tests/mobile-scroll-guardrails.test.js` asserts every built page has exactly as many `cooperativeGestures:` options as constructors — a new constructor without it fails the build.

2. **`.course__map` must never stop being a containing block.** It is the containing block for four `position: absolute; inset: 0` layers (`.map-wrap`, `#mapView`, `.view`, `#map`) plus MapLibre's canvas. Give it `position: static` or `height: auto` — in *any* media query, in the shared sheet or a per-race `override.css` — and those boxes resolve against the initial containing block instead: the canvas lands at the document origin at full viewport size and paints straight over the cue sheet. A `prefers-reduced-motion: reduce` rule did exactly that on every editorial race for three months (customer report, Aug 2026) and no test could see it, because nothing exercised that media query. **Accessibility media queries are layout surface too — any new `prefers-reduced-motion` / `prefers-contrast` / `forced-colors` block must be rendered-tested, not just written.** `tests/mobile-scroll-guardrails.test.js` scans the shared sheet *and* every per-race override for un-positioning rules; `tests/mobile-map-flow.e2e.js` renders each map with `reducedMotion: 'reduce'`.

3. **Never make a map container `position: sticky` at mobile widths.** A pinned ~50vh map keeps half the phone screen occupied while content scrolls behind it; the map must scroll out of frame with the page. (Desktop's sticky map-beside-cues split is fine — the cue column scrolls independently there.) Related: per-race `min-height` on `.map-wrap` must not exceed the mobile container height, or the canvas overhangs onto the content below — editorial.css zeroes it inside `.course__map`. `tests/mobile-map-flow.e2e.js` checks every built map at 375×812 for both non-sticky containers and zero canvas overhang.

**Trail data sources (in priority order):**

1. **OpenStreetMap via Overpass API** (best for named/blazed trails with geometry)
   - Query trails within the park bounding box:
     ```
     [out:json][timeout:30];
     way["highway"="path"]({{bbox}});
     out geom;
     ```
   - Use https://overpass-turbo.eu/ to test queries interactively first
   - Look for `name`, `colour`, and `osm:symbol` tags for trail names and blaze colors
   - **Caveat**: Coverage varies widely — many parks have incomplete or unnamed trails in OSM
   - Use ASCII minus signs in coordinates (not em-dashes) to avoid encoding errors

2. **State/federal GIS data portals** (authoritative trail geometries)
   - CT DEEP GIS: https://ct-deep-gis-open-data-website-ctdeep.hub.arcgis.com/
   - NJ DEP GIS: https://gisdata-njdep.opendata.arcgis.com/
   - NY Parks GIS: search "[state] parks trails GIS shapefile"
   - National Park Service: https://public-nps.opendata.arcgis.com/
   - Download shapefiles or GeoJSON directly; convert with `ogr2ogr` if needed

3. **Park association / friends-of websites** (trail names and blaze colors)
   - Search "[Park Name] trail map" or "[Park Name] friends association"
   - These often have PDF trail maps with blaze color legends
   - Examples: sgpa.org (Sleeping Giant), nynjtc.org (NY-NJ Trail Conference)
   - Use these primarily for **blaze color reference** — cross-reference with geometry from other sources

4. **AllTrails / Trailforks** (visual reference for trail layout)
   - Search "[Park Name]" on AllTrails or Trailforks
   - Useful for understanding which trails the course follows
   - **Cannot scrape directly** (403 errors) — use as visual reference only
   - Trailforks sometimes has downloadable GPX for individual trails

5. **Race organizer materials** (course-specific trail sequence)
   - Race websites often list the trail sequence: "Start on Tower Trail, turn onto Blue Trail..."
   - Course descriptions name the trails in order — use this to map indices to trail names
   - Some organizers provide detailed turn-by-turn with trail names and blaze colors

6. **Manual segmentation of course GPX** (fallback when other sources are insufficient)
   - When OSM/GIS coverage is poor, segment the course coordinates by known trail names
   - Use park trail maps to identify approximate transition points
   - Write a script to split coordinates into named segments:
     ```javascript
     const segments = [
       { name: 'Tower Trail', blaze: 'red', startIdx: 20, endIdx: 45 },
       { name: 'Blue Trail', blaze: 'blue', startIdx: 45, endIdx: 95 },
       // ...
     ];
     ```
   - Ensure 1-coordinate overlap at segment boundaries for visual continuity
   - This approach was used for Sleeping Giant (OSM had only 2 named trails in the area)

**Search queries to find trail data:**
```
"[Park Name]" trail map blaze colors
"[Park Name]" GIS shapefile trails
"[Park Name]" site:arcgis.com
"[Park Name]" friends association trail guide
"[State] state parks trails GIS data download
"[Park Name]" overpass-turbo
```

### Toggle Button Ordering
Map toggle buttons should follow this standard order (left to right):
1. **Aid Stations** — hidden by default
2. **Park Trails** — hidden by default
3. **Photos** — hidden by default (if applicable)
4. **3D** — terrain toggle

Photos should always appear **after** Aid Stations and Park Trails, not before them.

### Layer Ordering
Add layers in correct z-order. Use `beforeId` parameter to insert below existing layers:
```javascript
map.addLayer(trailLayer, 'course-outline'); // Add trails below course outlines
```

## Styling Guidelines

### Race Organizer Branding (Required)
Every race map MUST match the visual identity of the race organizer's website. Before building or styling a map:
1. Visit the race organizer's website and extract their branding:
   - Primary and accent colors
   - Fonts/typography (heading font, body font)
   - Overall aesthetic (dark/light, modern/rustic, etc.)
2. Update the map's CSS variables (`--primary`, `--bg`, `--bg-card`, `--bg-alt`, etc.) to match
3. Import any custom fonts (e.g., Google Fonts) used by the organizer
4. Replace ALL hardcoded color values — including in canvas drawing code, SVG markers, and popup HTML
5. The map should look like a natural extension of the organizer's website
6. **IMPORTANT:** `--bg`, `--bg-card`, and `--bg-alt` must be three distinct colors for proper visual layering:
   - `--bg` — page/panel chrome background (white `#ffffff` for light themes)
   - `--bg-card` — card surfaces, map container, stats, profile sections (white `#ffffff` for light, slightly lighter than bg for dark)
   - `--bg-alt` — recessed/page background, weather panel body, `.page-shell` (light grey `#f2f2f2` for light themes)
   - If `--bg-card` and `--bg-alt` are the same value, the unified white container will be invisible against the page background

**Example:** Steep Endurance uses green `#7ed321`, Teko headings, dark `#111111` backgrounds. Their Sleeping Giant map reflects this.

### Trail Colors
- Always match official park blaze colors when available
- Use the park's published legend as reference
- Roads without blazes render as gray (#9E9E9E)

### Loop Colors
- Use distinct, vibrant colors for each loop
- Current palette: Blue (#0479FF), Pink (#E834EC)
- Loops have both fill (outline) and line layers

### Course Line Contrast
The course line MUST have high contrast against the basemap. If the organizer's primary color blends into the terrain (e.g., green on a green park), use a dark/black course line with the primary color as an outline glow:
```javascript
// Outer glow in brand color
{ 'line-color': '#7ed321', 'line-width': 7, 'line-opacity': 0.45 }
// Inner line in dark color
{ 'line-color': '#111111', 'line-width': 4 }
```

### Trail Labels at All Zoom Levels
Trail name labels must remain visible at the highest zoom levels. Extend text-size and line-width interpolation to zoom 20:
```javascript
'text-size': ['interpolate', ['linear'], ['zoom'], 13, 9, 16, 13, 20, 16]
'line-width': ['interpolate', ['linear'], ['zoom'], 12, 3, 15, 5, 20, 8]
```
Do NOT set a `maxzoom` on trail label or trail line layers.

### Line Widths
- Trail lines: 3-8px (zoom interpolated, must scale to zoom 20)
- Loop lines: ~3px base
- Shared segment offsets: 2.5px width, 1.5px offset

## Common Tasks

### Adding a New Loop
1. Create GeoJSON file in `/data/`
2. Add entry to `LOOPS` object with name, miles, geojson, color
3. Add toggle button in HTML
4. Register layers in `map.on('load')` callback

### Updating Trail Colors
1. Edit `course-trails.geojson` - update `blaze` property for each feature
2. If adding new color, update both:
   - `BLAZE_COLORS` object
   - MapLibre layer paint expression `['match', ['get', 'blaze'], ...]`

### Finding Shared Segment Indices
Use coordinate comparison to find where loops overlap:
```javascript
// Compare coordinates to find overlap start/end indices
blueCoords.forEach((coord, i) => {
  if (coord[0] === targetCoord[0] && coord[1] === targetCoord[1]) {
    console.log('Match at index:', i);
  }
});
```

### Adding Mile Markers
Every race map should include mile markers on the interactive map (not needed on the simulator). Use MapLibre-native circle + symbol layers for performance and zoom-based visibility control. No toggle button — mile markers follow the Course toggle.

**Implementation pattern:**
1. Generate a GeoJSON FeatureCollection using `getCoordAtDist(m)` for miles 1 through N
2. Assign `priority: 1` to every-5-mile markers, `priority: 2` to the rest
3. Add a `circle` layer (dark fill, brand-color stroke) and `symbol` layer (white number text)
4. Use `['step', ['zoom'], ...]` expressions so only priority-1 markers show at default zoom; all show when zoomed in past 13.5
5. Tie visibility to the course toggle function

```javascript
// Generate mile marker GeoJSON
const MILE_MARKER_GEOJSON = { type: 'FeatureCollection', features: [] };
for (let m = 1; m <= totalMiles; m++) {
  MILE_MARKER_GEOJSON.features.push({
    type: 'Feature',
    properties: { mile: m, label: String(m), priority: (m % 5 === 0) ? 1 : 2 },
    geometry: { type: 'Point', coordinates: getCoordAtDist(m) }
  });
}
```

### Adding Aid Stations
Many race websites list aid station locations with mile markers. **Always check the race website for an aid station table or list before asking the user.** Look for pages labeled "Course", "The Trail", "Race Info", or similar.

**Data to extract from the race website:**
- Station name/location
- Approximate mile marker distance
- Services available (water, electrolyte, snacks, medical, etc.)

**Implementation pattern:**
1. Define an `AID_STATIONS` array with `name`, `mile`, and optional `services`
2. Use `getCoordAtDist(mile)` to compute coordinates from the course line
3. Render as MapLibre markers with a distinct icon (e.g., "+" or water drop)
4. Add a toggle button labeled "Aid Stations" alongside Course/Park Trails/3D
5. Show popup on click with station name, mile, and services
6. Aid stations are hidden by default (toggle starts inactive)

```javascript
const AID_STATIONS = [
  { name: 'Station Name', mile: 3.5, services: 'Water, Tailwind, snacks' },
  // ... more stations
];

// Generate markers from course coordinates
const aidMarkers = [];
AID_STATIONS.forEach((station, i) => {
  const coords = getCoordAtDist(station.mile);
  const el = document.createElement('div');
  el.className = 'aid-marker';
  el.innerHTML = '<svg viewBox="0 0 28 28"><circle cx="14" cy="14" r="11" fill="var(--primary)" stroke="#fff" stroke-width="2"/><text x="14" y="18" text-anchor="middle" font-size="14" font-weight="bold" fill="#fff">+</text></svg>';
  const marker = new maplibregl.Marker({ element: el })
    .setLngLat(coords)
    .setPopup(new maplibregl.Popup({ offset: 15 }).setHTML(
      '<strong>' + station.name + '</strong><br>' +
      '<span style="color:var(--text-muted)">Mile ' + station.mile + '</span>' +
      (station.services ? '<br><span style="font-size:0.8rem">' + station.services + '</span>' : '')
    ));
  aidMarkers.push(marker);
});

// Toggle function
function toggleAidStations() {
  aidVisible = !aidVisible;
  document.getElementById('aidBtn').classList.toggle('active', aidVisible);
  aidMarkers.forEach(m => { if (aidVisible) m.addTo(map); else m.remove(); });
}
```

### Adding Cutoff Times
Many trail races have time cutoffs at specific mile markers. **Check the race website for cutoff info** — look in "Course", "Rules", or "Race Info" sections.

**Two places cutoffs appear:**
1. **Aid station popups** — Include cutoff time in the `services` string (e.g., `'Water, Skratch · Cutoff: 1h 10m'`)
2. **Simulator** — Rendered as flag markers on the course map canvas and dashed lines with pill labels on the profile canvas

**Implementation pattern:**
1. Add cutoff info to relevant `aidStations` entries in `services` field
2. Add a standalone cutoff point as an aid station if there's no hydration there (e.g., `{ name: 'Tiehack Road Cutoff', mile: 11, services: 'Cutoff: 3h 10m' }`)
3. Add a `cutoffs` array to config for the simulator rendering
4. Add `accent` color to the `colors` object for cutoff marker styling

```javascript
// In config.js
aidStations: [
  { name: 'Aid Station 1', mile: 4, services: 'Water, Skratch · Cutoff: 1h 10m' },
  { name: 'Cutoff Point', mile: 11, services: 'Cutoff: 3h 10m' },
],

cutoffs: [
  { mile: 4, time: '1h 10m' },
  { mile: 11, time: '3h 10m' },
],

colors: {
  accent: '#C1440E',  // Used for cutoff markers in simulator
  // ... other colors
},
```

**IMPORTANT:** The `cutoffs` property must be listed in `build.js`'s `buildConfigData()` allowlist to be inlined into the browser CONFIG object. It is already included — just add the array to your config.

The shared `sim-renderers.js` automatically renders cutoff markers when `CONFIG.cutoffs` is defined:
- **Course map canvas**: Flag markers with pill labels above each cutoff point
- **Profile canvas**: Dashed vertical lines with "Cutoff [time]" pill labels

Also mention cutoffs in the `courseDescriptionHtml` for the map view.

### Adding Turn Markers with Street View
Turn markers show key navigation points with embedded Google Street View images.

**IMPORTANT: For new maps, always ask the user for a list of locations where they want Street View markers.** Request:
1. Location name/description
2. Coordinates (lat, lng)
3. Google Street View URL for each location (to extract panorama ID and heading)

The Street View URL contains the panorama ID (e.g., `Nr-Rvka4ohEaY8AjwC0gsQ`) and heading/pitch values needed to display the correct view.

```javascript
// Turn marker data structure
const TURNS = [
  {
    name: 'Turn onto Warwick Turnpike',
    coords: [-74.392108, 41.196365],  // [lng, lat] for MapLibre
    pano: 'Nr-Rvka4ohEaY8AjwC0gsQ',   // Google panorama ID
    heading: 317,                      // Camera heading (degrees)
    pitch: 17                          // Camera pitch (degrees)
  },
  // ... more turns
];

// Street View thumbnail URL format
const streetViewUrl = 'https://streetviewpixels-pa.googleapis.com/v1/thumbnail?panoid=' +
  turn.pano + '&cb_client=maps_sv.tactile&w=640&h=360&yaw=' + turn.heading + '&pitch=' + turn.pitch;

// Link to open full Street View
const mapsUrl = 'https://www.google.com/maps/@?api=1&map_action=pano&pano=' +
  turn.pano + '&heading=' + turn.heading + '&pitch=' + turn.pitch;
```

Turn markers are toggled via a button (like trails). Markers are hidden by default and stored in `turnMarkers` array for visibility control.

### Embeddable Widget
Every map page includes an **"Embed"** button in the header (next to the Map/Simulator view tabs). Clicking it opens a modal with a copyable `<iframe>` snippet that race directors can paste into their websites (WordPress, Squarespace, Wix, raw HTML).

**How it works:**
- `build.js` generates a second HTML file per map at `dist/embed/{slug}/index.html` using `embed-shell.html` — a stripped-down template with no `.page-shell`, no sticky header, no footer
- The embed version includes `embed-params.js` which parses URL parameters and `embed.css` for compact layout
- The main map pages include `embed-modal.js` which powers the Embed button and modal UI
- `shell.html` contains the embed button and modal HTML in the `.header-right` section

**Embed URL parameters:**
| Param | Example | Effect |
|-------|---------|--------|
| `theme` | `dark` | Dark color scheme |
| `accent` | `FF6B35` | Override brand color |
| `zoom` | `14` | Override default zoom |
| `height` | `compact` | Map only, no stats/profile |
| `hide` | `simulator,stats` | Hide specific sections |
| `show` | `map,elevation` | Show only listed sections |
| `view` | `sim` | Open to simulator tab |

**postMessage API** (for parent page control):
- `fss:switchView` — switch between map and simulator
- `fss:flyTo` — fly to coordinates
- `fss:toggleLayer` — toggle map layers
- Embed sends `fss:ready` to parent when loaded

**Embed code example:**
```html
<iframe
  src="https://falsesummitstudio.com/embed/escarpment/"
  width="100%" height="600"
  style="border: none; border-radius: 8px;"
  loading="lazy" allow="geolocation"
></iframe>
```

**Important:** The embed button and modal are automatically included for all maps via `shell.html`. For `skipSharedJs` maps (e.g., wild-goose), `build.js` injects `embed-modal.js` separately into the override JS block.

### Weather Intelligence Panel

Every race map should include a Weather Intelligence panel that shows historical climate data, live conditions, and radar. The feature is opt-in: maps without weather data render normally with no weather panel.

**How to add weather to a map:**

1. **Add the race date** to `RACE_DATES` in `scripts/fetch-weather.js`:
   ```javascript
   const RACE_DATES = {
     'wild-goose': { month: 9, day: 19 },
     'escarpment': { month: 7, day: 26 },
     // add new race here
   };
   ```

2. **Ensure the config exports `mapCenter`** as `[lng, lat]` — the script reads this for API queries.

3. **Run the fetch script:**
   ```bash
   node scripts/fetch-weather.js <map-slug>
   ```
   This fetches 15 years of historical data from NASA POWER and Open-Meteo (no API keys needed) and writes `src/maps/<slug>/data/weather.json`.

4. **Load weather data in config.js:**
   ```javascript
   const weatherData = fs.existsSync(path.join(__dirname, 'data/weather.json'))
     ? loadJSON('data/weather.json') : null;
   
   module.exports = {
     // ... other config
     weather: weatherData,
   };
   ```

5. **Build** — `node build.js` inlines `CONFIG.weather` into the HTML. The `{{WEATHER_HTML}}` placeholder in `map-view.html` renders the panel automatically via `buildWeatherHtml()`.

**Architecture:**

| Component | File | Purpose |
|-----------|------|---------|
| Fetch script | `scripts/fetch-weather.js` | Build-time: fetches NASA POWER + Open-Meteo historical data, computes heat stress, writes `weather.json` |
| Weather data | `src/maps/{slug}/data/weather.json` | Build-time JSON inlined into CONFIG |
| Weather UI | `src/shared/weather-ui.js` | Runtime: renders risk cards, daily strip, fetches live conditions + radar |
| Weather CSS | `src/shared/weather.css` | Panel layout, responsive breakpoints, all weather component styles |
| HTML template | `src/templates/map-view.html` | Contains `{{WEATHER_HTML}}` placeholder inside `.map-weather-layout` |
| Build integration | `build.js` | `buildWeatherHtml()` generates panel HTML; `buildConfigData()` inlines weather into CONFIG |
| Tests | `tests/weather.test.js` | Vitest: heat stress calc, JSON schema, built HTML assertions, backward compat |

**Data sources (all free, no API keys):**

| API | URL | Data |
|-----|-----|------|
| NASA POWER | `https://power.larc.nasa.gov/api/temporal/daily/point` | Historical temp, humidity, wind, solar radiation (15 years) |
| Open-Meteo Archive | `https://archive-api.open-meteo.com/v1/archive` | Historical daily precipitation |
| Open-Meteo Air Quality | `https://air-quality-api.open-meteo.com/v1/air-quality` | Historical hourly US AQI (last 2 years) |
| Open-Meteo Forecast | `https://api.open-meteo.com/v1/forecast` | Live current conditions (runtime fetch) |
| RainViewer | `https://api.rainviewer.com/public/weather-maps.json` | Live radar tile timestamps (runtime fetch) |

**weather.json schema:**
```json
{
  "fetchedAt": "2026-03-31T22:59:25.841Z",
  "raceDate": "2026-09-19",
  "dataYears": 15,
  "location": { "lat": 41.183, "lng": -74.432 },
  "riskSummary": {
    "heat": { "level": "moderate", "label": "Moderate", "color": "#F9A825", "detail": "71.5°F heat stress" },
    "storm": { "level": "low", "label": "Low", "color": "#4CAF50", "detail": "20% rain chance" },
    "air": { "level": "low", "label": "Good", "color": "#4CAF50", "detail": "Avg AQI 46" },
    "wind": { "level": "low", "label": "Light", "color": "#4CAF50", "detail": "0.7 mph avg" }
  },
  "heatStress": { "estimated": 71.5, "risk": "moderate", "riskColor": "#F9A825", "riskLabel": "Moderate" },
  "dailyAverages": [
    {
      "date": "2026-09-16",
      "dayLabel": "Wed",
      "isRaceDay": false,
      "temperature": { "avgHighF": 76, "avgLowF": 54 },
      "humidity": { "avgPct": 72 },
      "wind": { "avgMph": 0.6 },
      "precipProbPct": 13,
      "aqi": { "avgAQI": 46 },
      "heatStress": { "estimated": 72.8, "risk": "moderate", "riskColor": "#F9A825", "riskLabel": "Moderate" }
    }
  ]
}
```

**Risk level thresholds and colors:**

| Metric | Low | Moderate | High | Extreme |
|--------|-----|----------|------|---------|
| Heat Stress (°F) | < 65 | 65–73 | 73–82 | > 82 |
| Color | `#4CAF50` | `#F9A825` | `#FF9800` | `#f44336` |
| Storm (precip %) | ≤ 20% | 21–40% | > 40% | — |
| Wind (mph) | ≤ 12 | 12–20 | > 20 | — |
| AQI | ≤ 50 | 51–100 | > 100 | — |

**Heat Stress Index calculation** (Stull 2011 wet bulb approximation):
```javascript
function estimateHeatStress(tempF, rhPct, solarRadWm2, windMph) {
  var tempC = (tempF - 32) * 5 / 9;
  var windMs = windMph * 0.44704;
  var Tw = tempC * Math.atan(0.151977 * Math.sqrt(rhPct + 8.313659))
    + Math.atan(tempC + rhPct) - Math.atan(rhPct - 1.676331)
    + 0.00391838 * Math.pow(rhPct, 1.5) * Math.atan(0.023101 * rhPct) - 4.686035;
  var Tg = 1.01 * tempC + 2.17 * (solarRadWm2 / 1000) - 0.28 * windMs + 3.2;
  var wbgtC = 0.7 * Tw + 0.2 * Tg + 0.1 * tempC;
  return Math.round((wbgtC * 9 / 5 + 32) * 10) / 10;
}
```

**UI components rendered by `weather-ui.js`:**

1. **Risk Summary Cards** — 4-card grid (heat, storm, air quality, wind). Each card has a colored `border-top` accent, a 28x28 tinted icon badge with category-specific SVG (thermometer, lightning, sun, wind), risk level label in the risk color, and detail text. Header splits "Expected Conditions" (muted) from "Race Day [date]" (primary). Cards use `box-shadow` instead of borders for depth, with hover lift effect.
2. **Daily Averages Strip** — Horizontal scrollable strip of 7 gap-separated rounded cards (race day ±3 days). Each card shows date, high/low temp (slash-separated), weather icon (40px SVG based on precip %), condition label, and precipitation probability. Race day card is highlighted with a 2px primary-colored ring and badge.
3. **Current Conditions** — Live-fetched from Open-Meteo every 10 minutes. Hero card with gradient background (`linear-gradient(135deg, bg-card, bg-alt)`), 2.4rem temperature with separate unit styling, pulsing green "live" dot in section title, 52px WMO weather icon, feels-like, humidity, wind. Fade-in animation on load.
4. **Radar Mini-Map** — Embedded MapLibre GL map (200px height, 12px radius) with desaturated OSM raster base (saturation -0.6, brightness 0.65), RainViewer radar tile overlay (0.7 opacity), course location red dot, zoom controls, and color legend (100px wide, 8px height). Shadow-bounded instead of bordered.
5. **Heat Stress Explainer** — Static text with primary-colored accent bar (`::before` pseudo-element) on the title.

**Weather icon thresholds (precipitation %):**
- 0–9%: Sunny (sun SVG)
- 10–24%: Partly Cloudy (sun + cloud SVG)
- 25–39%: Cloudy (cloud SVG)
- 40–59%: Showers (cloud + 2 rain drops SVG)
- 60%+: Rain Likely (cloud + 5 rain drops SVG)

**Responsive layout:**
- **Mobile (< 1024px):** Panel stacks above map (`order: -1`), collapsed by default on page load. Tap header to expand/collapse. Risk cards go 4-col, then 2-col below 600px. Hero temp drops to 2rem on small mobile.
- **Desktop (≥ 1024px):** Side-by-side with map via `flex-direction: row` with `gap: 8px`. Layout container uses `background: var(--bg-alt)` so the gap reads as a subtle channel. Weather panel is 340px (380px on ≥1440px) with `background: var(--bg-alt)` and soft left edge shadow (`box-shadow: -1px 0 0 var(--border), -6px 0 20px rgba(0,0,0,0.08)`). `.map-main` uses `background: var(--bg-card)` so the map, stats, profile, and course description sit on a unified white surface distinct from the grey page/panel background.

**Design principles (weather panel):**
- **Shadows over borders** — Components use `box-shadow` for depth instead of `border: 1px solid`. Borders are reserved for intentional dividers only.
- **Section title variety** — Each section has a distinct title treatment (gradient fade lines, pulsing live dot, accent bars) instead of uniform uppercase muted text.
- **Animations** — `weather-fade-in` (opacity + translateY) on dynamically loaded content (current conditions, radar). `weather-pulse` for the live indicator dot.
- **Typography minimum** — Nothing below 0.6rem. Risk labels 0.65rem, detail text 0.7rem, body 0.75rem.

**Guard / backward compatibility:**
- `weather-ui.js` wraps everything in an IIFE that checks `if (typeof CONFIG === 'undefined' || !CONFIG || !CONFIG.weather) return;` — no-op for maps without weather data.
- `buildWeatherHtml()` returns empty string when `config.weather` is null, so the `{{WEATHER_HTML}}` placeholder resolves to nothing.
- `weather.css` is always included (shared CSS) but styles are scoped to `.weather-*` classes, so they're harmless when the panel doesn't exist.

**For skipSharedJs maps** (e.g., wild-goose): `build.js` separately injects `weather-ui.js` into the override JS block so the weather panel still works even though shared JS modules aren't concatenated.

**Embed builds** also include `weather-ui.js` and render the weather panel via the same `buildWeatherHtml()` / `{{WEATHER_HTML}}` mechanism.

### AR Course Preview (`dist/ar/{slug}/`)

Opt-in tabletop AR/3D preview: runners open `/ar/{slug}/` on a phone, see a
satellite-textured 3D terrain model of the course with aid-station pins and
an animated "lead pack" marker, and can place it on their floor/table in AR.

**How to add AR to a race** (needs `courseCoords` + `aidStations` in config):
```bash
node scripts/build-ar-model.js <slug>   # fetches DEM + imagery → data/ar/course.glb + ar-meta.json
node scripts/export-usdz.js <slug>      # headless three.js → data/ar/course.usdz (iOS Quick Look)
node build.js                           # emits dist/ar/<slug>/ automatically
```
Like weather, AR assets are generated at authoring time and **committed** —
the Netlify build never touches the network. `build.js` builds an AR page for
any map whose `data/ar/course.glb` exists; maps without it are unaffected.
Multi-loop maps (`configDataJs`, no `courseCoords`) are not yet supported —
the pipeline needs a flattened headline-race coordinate list.

**Architecture:**

| Component | File | Purpose |
|-----------|------|---------|
| Tile/geo math | `scripts/ar/geo.js` | Slippy-tile + local-meter projection, mile interpolation |
| DEM | `scripts/ar/dem.js` | Terrarium tile fetch/decode, bilinear height raster |
| Imagery | `scripts/ar/imagery.js` | Esri World Imagery stitch → cropped diffuse JPEG |
| Meshes | `scripts/ar/mesh.js` | Terrain grid + plinth, course tube, aid pins, keyframes |
| GLB | `scripts/ar/glb.js` | gltf-transform assembly, quantization, unlit course material |
| CLI | `scripts/build-ar-model.js` | Progressive quality tiers against a size budget (5 MB, 15 MB for >120 mi) |
| USDZ | `scripts/export-usdz.js` | three.js USDZExporter in headless Chromium (static — no animation) |
| Viewer | `src/ar/ar-shell.html` + `ar-viewer.css` + `ar-viewer.js` | Standalone page: model-viewer stage, timing-strip scrubber, hotspot cards |
| Capability gating | `src/ar/ar-capabilities.js` | `chooseArMode()`: WebXR > Scene Viewer/Quick Look > plain 3D |
| Build | `build.js` `buildArPage()`/`copyArLibs()` | Page + asset copy; self-hosted libs in `dist/ar/lib/` |
| Tests | `tests/ar-pipeline.test.js`, `tests/ar-viewer.test.js`, `tests/ar-viewer.e2e.js` | Pipeline math, built-page assertions + budgets, viewer e2e |

**Key decisions:**
- **Fallback-first**: the model-viewer page is the baseline for everyone;
  WebXR (custom three.js immersive-ar session with hit-test placement,
  raycast aid taps, dom-overlay console) is layered on only when
  `navigator.xr.isSessionSupported('immersive-ar')` resolves true.
- **Self-hosted libs** (`dist/ar/lib/`): model-viewer + three are copied from
  node_modules at build time — no CDN scripts on the AR pages.
- Model space: 1 glTF unit = 1 m at tabletop scale (~0.42 m long side);
  `ar-meta.json` carries `scaleDenominator`, hotspot anchors, and the
  animation duration. Vertical exaggeration default 1.6.
- The lead-pack animation is a glTF translation channel — model-viewer scrubs
  it via `currentTime`, the XR session via `AnimationMixer`; the scrubber UI
  drives both through a swappable `timeline` object.
- `netlify.toml` pins `Content-Type: model/vnd.usdz+zip` on `/ar/*/course.usdz`
  (iOS Quick Look requires it).
- Per-race options via `config.ar = { targetSizeM, exaggeration, budgetMB, animationSeconds, padRatio }`.

**Verifying the WebXR path** (headless Chromium can't run immersive-ar):
```bash
npm i -D iwer @iwer/sem                 # emulator deps, not in the suite
node build.js && node scripts/verify-ar-webxr.js escarpment
```
`scripts/verify-ar-webxr.js` drives the real session via IWER + its Synthetic
Environment Module (hit-test) and checks entry, dom-overlay scrubbing while
immersed, and clean exit with scrub position preserved. The automated suite
(`tests/ar-viewer.e2e.js`) covers everything a real phone doesn't need — the
model-viewer fallback, scrubber, hotspots, and capability gating (with a
mocked `navigator.xr`) — because emulating a full AR session is too slow and
environment-sensitive to belong in CI.

Currently built for: `escarpment` (2.17 MB GLB), `golden-leaf` (0.87 MB GLB).

## Race Map Business Context
This project serves as a template for building custom race maps. Key selling points:
- Interactive loop selection with elevation profiles
- Official trail colors matching park signage
- Aid station markers with distance info
- Mobile-responsive design
- Offline-capable with proper caching

See `/Users/Sparks/.claude/plans/fuzzy-petting-panda.md` for the full business template.

---

## Repeatable Workflow: Building a New Race Map

### Step 1: Information Gathering
When given a race website URL, extract the following information:

1. **Race Details**
   - Race name and date
   - Distance(s) offered
   - Start/finish location
   - Time limit (if any)
   - Organizer/producer name and website

2. **Organizer Branding** (visit their website and extract)
   - Color scheme (primary, accent, background colors)
   - Fonts/typography (heading and body fonts, weights)
   - Visual style (dark/light theme, design aesthetic)
   - The map UI must look like a natural extension of the organizer's website

3. **Course Data** (search in this order)
   - GPX file (best - provides exact coordinates with elevation)
   - Strava route or segment
   - MapMyRun / RideWithGPS route
   - Course map PDF (can extract landmarks)
   - Written course description (manual tracing required)

3. **Key Locations**
   - Start/finish coordinates
   - Aid station locations and services
   - Mile marker positions
   - Major landmarks and turns
   - Parking areas

**Search queries to use:**
```
"[Race Name]" GPX download route
"[Race Name]" site:strava.com route
"[Race Name]" MapMyRun course
"[Race Name]" site:ridewithgps.com
"[Race Name]" course map PDF
"[Location Name]" coordinates GPS latitude longitude
```

### Step 2: Route Data Acquisition

**If GPX is available:**
1. Download the GPX file
2. Convert to GeoJSON using: `ogr2ogr -f GeoJSON output.geojson input.gpx tracks`
3. Or use online converter: https://mygeodata.cloud/converter/gpx-to-geojson

**If no GPX available:**
1. Identify key waypoints from course description
2. Look up coordinates for each landmark
3. Create simplified route connecting waypoints
4. Ask user if they can provide more detailed route data

**Coordinate lookup sources:**
- latlong.net - search by place name
- Google Maps - right-click for coordinates
- Wikipedia - many landmarks have coordinates in infobox

### Step 3: Project Setup

Create a new map in the build system:
```
src/maps/[race-name]/
├── config.js           # CommonJS config module (see escarpment/config.js for template)
├── data/
│   ├── course.json     # Route coordinates array [[lng, lat], ...]
│   ├── trails.geojson  # Park trail segments with blaze colors (required)
│   └── course.gpx      # Original GPX source (for reference)
├── override.js         # Optional: standalone JS for complex maps (multi-loop)
└── override.css        # Optional: extra CSS for complex maps
```

Run `node build.js` to generate `dist/maps/[race-name]/index.html`.

### Step 4: Map Creation

**For single-course races (half marathon, marathon, point-to-point):**
- Create `config.js` based on `src/maps/escarpment/config.js` (simplest template)
- Config provides: course coords, elevations, CSS vars, toggle buttons, stats HTML
- Shared modules handle: map init, course layers, mile markers, elevation profile, simulator

**For multi-loop trail races:**
- Create `config.js` based on `src/maps/wild-goose/config.js`
- Use `skipSharedJs: true` + `overrideJs` for standalone JS with LOOPS/RACES objects
- Use `mapViewHtml` / `simViewHtml` overrides for custom HTML structure
- Each loop gets: color, label, miles, elevation gain, geojson
- Handle overlapping segments with offset lines

### Step 5: Essential Features

1. **Map Layer**
   - Course line with outline shadow
   - Park trail overlay with blaze colors (toggleable, rendered below course line)
   - Start/finish marker
   - Interactive click for course info

2. **Elevation Profile**
   - Canvas-based chart
   - Shows distance on X-axis, elevation on Y-axis
   - Color-matched to course line

3. **Landmarks**
   - Clickable cards that fly to location
   - Toggle to show/hide on map
   - Include icon, name, description

4. **Stats Section**
   - Distance, elevation gain, trail miles, time limit
   - Grid layout, mobile responsive

### Step 5b: Weather Intelligence

After the map config is created with `mapCenter` defined:

1. Add the race date to `RACE_DATES` in `scripts/fetch-weather.js`
2. Run `node scripts/fetch-weather.js <slug>` to generate `src/maps/<slug>/data/weather.json`
3. Load weather data in `config.js`:
   ```javascript
   const weatherData = fs.existsSync(path.join(__dirname, 'data/weather.json'))
     ? loadJSON('data/weather.json') : null;
   module.exports = { /* ... */ weather: weatherData };
   ```
4. Rebuild — the weather panel automatically appears beside the map on desktop and above it (collapsed) on mobile
5. Verify: risk cards render, daily strip shows 7 days, current conditions load, radar mini-map displays

See "Weather Intelligence Panel" in Common Tasks for full architecture and data schema.

### Step 6: Information to Request from User

Always ask the user for:

1. **Route Data** (if not found online)
   - GPX file of the course
   - Or detailed turn-by-turn description

2. **Aid Station Details**
   - Locations (coordinates or landmarks)
   - What's available at each (water, nutrition, medical)
   - Mile markers

3. **Street View Markers** (optional)
   - Key turn locations
   - Google Street View URLs for each

4. **Branding** (auto-extracted from organizer website — only ask user if site is unavailable)
   - Race logo (if available)
   - Any specific styling overrides

### Step 7: Testing & Delivery

1. Open map in browser to verify:
   - Course displays correctly
   - Zoom/pan works smoothly
   - 3D terrain toggle functions
   - Elevation profile renders
   - Landmarks are clickable
   - Weather panel renders (risk cards, daily strip, current conditions, radar)
   - Weather panel collapses on mobile, side-by-side on desktop
   - Mobile responsive

2. Provide to user:
   - Link to preview (if hosted)
   - Or zip file of project folder
   - Instructions for hosting (Netlify, Vercel, GitHub Pages)

---

## Race Types and Templates

### Road Race (Half Marathon, Marathon, 5K/10K)
- Single course line
- Mile markers important
- Aid stations every 2-3 miles typically
- Simple out-and-back or loop
- Example: road half marathon or 10K

### Trail Ultra (Multi-Loop)
- Multiple colored loops
- Loop toggles for each distance
- Complex elevation profiles
- Trail blaze colors if applicable
- Aid stations at loop junctions
- Example: Wild Goose Trail Festival

### Point-to-Point
- Linear course with start ≠ finish
- Transportation info important
- Elevation profile shows net loss/gain
- Shuttles and parking locations

---

## MapLibre + PMTiles Configuration

**Libraries (CDN):**
```html
<script src="https://unpkg.com/maplibre-gl@5.18.0/dist/maplibre-gl.js"></script>
<link href="https://unpkg.com/maplibre-gl@5.18.0/dist/maplibre-gl.css" rel="stylesheet">
<script src="https://unpkg.com/pmtiles@4.4.0/dist/pmtiles.js"></script>
<script src="https://unpkg.com/@protomaps/basemaps@5.7.0/dist/basemaps.js" crossorigin="anonymous"></script>
```

**PMTiles Protocol + Basemap Style:**
```javascript
const protocol = new pmtiles.Protocol();
maplibregl.addProtocol('pmtiles', protocol.tile);

const PMTILES_URL = 'pmtiles://https://pub-e494904da8db4a209e8229adcd8b63f9.r2.dev/basemap.pmtiles';

const BASEMAP_STYLE = {
  version: 8,
  glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
  sprite: 'https://protomaps.github.io/basemaps-assets/sprites/v4/light',
  sources: {
    protomaps: {
      type: 'vector',
      url: PMTILES_URL,
      attribution: '<a href="https://protomaps.com">Protomaps</a> &copy; <a href="https://openstreetmap.org">OpenStreetMap</a>'
    }
  },
  layers: basemaps.layers('protomaps', basemaps.namedFlavor('light'), { lang: 'en' })
};
```

**No access token required.** Tiles are self-hosted on Cloudflare R2.

**3D Terrain (AWS Terrain Tiles — free, public):**
```javascript
map.addSource('terrain-dem', {
  type: 'raster-dem',
  tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
  tileSize: 256, maxzoom: 15, encoding: 'terrarium'
});
map.setTerrain({ source: 'terrain-dem', exaggeration: 1.5 });
```
**Important:** AWS tiles use `tileSize: 256` (not 512) and `encoding: 'terrarium'` (not mapbox).

**Hillshade (compensates for no contour lines in Protomaps theme):**
```javascript
map.addSource('hillshade-dem', {
  type: 'raster-dem',
  tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
  tileSize: 256, maxzoom: 15, encoding: 'terrarium'
});
map.addLayer({
  id: 'hillshade', type: 'hillshade', source: 'hillshade-dem',
  paint: {
    'hillshade-exaggeration': 0.3,
    'hillshade-shadow-color': '#5a5a5a',
    'hillshade-highlight-color': '#ffffff',
    'hillshade-accent-color': '#4a8f29'
  }
});
```

**Font Stacks:**
Use `['Noto Sans Medium']` for all text layers. Glyphs are hosted by Protomaps.

---

## Project Structure (falsesummitstudio.com)

```
/falsesummitstudio/
├── build.js                      # Build script (zero deps, ~250 lines)
├── dev.js                        # Dev server with watch + SSE live reload
├── index.html                    # Landing page (copied to dist/)
├── assets/                       # Shared assets (copied to dist/)
├── src/
│   ├── shared/                   # Shared CSS + JS modules
│   │   ├── base.css, layout.css, simulator.css, responsive.css, maplibre-overrides.css
│   │   ├── weather.css           # Weather panel layout + responsive styles
│   │   ├── embed.css             # Embed-specific CSS (compact layout, URL param overrides)
│   │   ├── coord-helpers.js, map-init.js, map-layers.js, map-toggles.js
│   │   ├── elevation-profile.js, view-switch.js, sim-engine.js, sim-renderers.js
│   │   ├── weather-ui.js         # Weather panel runtime (risk cards, live conditions, radar)
│   │   ├── embed-modal.js        # Embed code modal (copy iframe snippet)
│   │   ├── embed-params.js       # URL param parsing + postMessage API for embeds
│   │   └── init.js               # Entry point (calls initMap, binds events)
│   ├── templates/
│   │   ├── shell.html            # Outer HTML with {{PLACEHOLDERS}} + embed modal
│   │   ├── embed-shell.html      # Stripped-down embed template (no header/footer)
│   │   ├── map-view.html         # Map view section template
│   │   └── sim-view.html         # Simulator view section template
│   └── maps/
│       ├── escarpment/config.js + data/
│       ├── sleeping-giant/config.js + data/
│       └── wild-goose/config.js + override.js + override.css + data/
├── scripts/
│   └── fetch-weather.js          # Fetches historical weather data → weather.json
├── tests/
│   └── weather.test.js           # Vitest: heat stress calc, JSON schema, HTML assertions
├── maps/                         # Unmigrated maps (GPX data for future builds)
│   ├── rock-the-ridge/data/
│   ├── manitous-revenge/data/
│   └── shawangunk-ridge/data/
├── dist/                         # Build output (gitignored)
│   ├── maps/{slug}/index.html    # Full map pages
│   └── embed/{slug}/index.html   # Embeddable widget versions
└── CLAUDE.md
```

## Existing Race Maps

| Race | Location | Type | URL Path | Status |
|------|----------|------|----------|--------|
| Wild Goose Trail Festival | Wawayanda State Park, NJ | Multi-loop trail | `/maps/wild-goose/` | Migrated |
| Sleeping Giant Trail Runs 25K | Sleeping Giant State Park, CT | Single-loop trail | `/maps/sleeping-giant/` | Migrated |
| Escarpment Trail Run 30K | Catskill Mountains, NY | Point-to-point trail | `/maps/escarpment/` | Migrated |
| Rock the Ridge 50M | Mohonk Preserve, NY | Point-to-point | `/maps/rock-the-ridge/` | GPX only |
| Golden Leaf Half Marathon | Aspen, CO | Point-to-point trail | `/maps/golden-leaf/` | Migrated |
| Manitou's Revenge | Catskill Mountains, NY | Point-to-point | `/maps/manitous-revenge/` | Migrated |
| Shawangunk Ridge Trail Run 70M | Shawangunk Ridge, NY | Point-to-point | `/maps/shawangunk-ridge/` | GPX only |
| Tupper Lake Tinman Triathlon | Tupper Lake, NY | Triathlon (run leg) | `/maps/tupper-lake-tinman/` | Migrated |
| Javelina Jundred | McDowell Mountain Park, AZ | Multi-loop ultra | `/maps/javelina-jundred/` | Migrated |
| TransRockies Gran Fondo Badlands | Drumheller, AB · Canada | Multi-distance road cycling | `/maps/gran-fondo-badlands/` | Migrated · km units |

## Per-race display units

Every race map renders distances in miles by default — internal data is
stored in miles, profile sample points use mi/ft, build.js's
`buildAidTableRows` and `buildDayGridRows` emit "Mile" headers and
"Cutoff · mile X" labels. To opt into native km display:

1. Set `displayUnits: 'km'` at the top level of the race theme
   (`src/themes/<slug>.js`).
2. Populate `kilometer` on every `aidStations[]` entry — the editorial
   table and on-map markers use this value when the flag is on.
3. The renderer (`override.js`) reads the same flag via the inlined
   `DISPLAY_UNITS` global and labels stats / pace / scrubber labels in km.

Currently set on: `gran-fondo-badlands` only. The build.js change is
back-compatible — when `displayUnits` is unset, all existing races keep
their mile labels and `Mile` column header.

## Multi-distance vs multi-loop-assembly formats

Two patterns exist in the catalog. Pick the closest match for new builds:

- **Multi-loop-assembly** (`wild-goose`): a small set of named loops
  (Pink, Blue, Checkered) compose into many race distances — the 100M
  is `[pink, checkered, blue, pink, checkered, ...]`. Theme declares
  `loops[]` once with cues + colors; each `distances[]` carries an
  `assembly[]` of `{ loopId, direction }` steps. Within-loop cue list
  is reusable across every distance that includes that loop.
- **Multi-distance, single-loop-per-distance** (`gran-fondo-badlands`):
  each distance has its own complete loop GPX (Brontosaurus 163K
  ≠ T-Rex 100K geometry; they share an aid spine but the courses
  diverge at separate turnaround points). Theme declares `loops[]`
  with one entry per distance; `distances[]` assembly is length-1.
  The override.js renderer suppresses the assembly chip strip when
  `assembly.length <= 1` so the directions panel reads as a single
  per-distance cue list.
