## Git Workflow
**IMPORTANT:**
1. Before making any changes, always create and checkout a feature branch named `feature_some_short_name` (where `some_short_name` describes the change). Make and then commit your changes in this branch.
2. You must write automated tests for all code. Use **Vitest** for unit tests (JS logic, data transformations, coordinate helpers) and **Playwright** for end-to-end tests (map rendering, UI interactions, toggle behavior).
3. You must compile the code and pass ALL tests before committing. Run `npx vitest run` and `npx playwright test` to verify.

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
`build.js` reads shared CSS/JS modules from `src/shared/`, HTML templates from `src/templates/`, and per-map config from `src/maps/{slug}/config.js`. It concatenates everything, replaces `{{PLACEHOLDERS}}`, and outputs standalone `index.html` files to `dist/maps/{slug}/`. All course/trail data is inlined from the config's data files — no runtime `fetch()`.

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
2. Update the map's CSS variables (`--primary`, `--bg`, `--bg-card`, etc.) to match
3. Import any custom fonts (e.g., Google Fonts) used by the organizer
4. Replace ALL hardcoded color values — including in canvas drawing code, SVG markers, and popup HTML
5. The map should look like a natural extension of the organizer's website

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
│   │   ├── coord-helpers.js, map-init.js, map-layers.js, map-toggles.js
│   │   ├── elevation-profile.js, view-switch.js, sim-engine.js, sim-renderers.js
│   │   └── init.js               # Entry point (calls initMap, binds events)
│   ├── templates/
│   │   ├── shell.html            # Outer HTML with {{PLACEHOLDERS}}
│   │   ├── map-view.html         # Map view section template
│   │   └── sim-view.html         # Simulator view section template
│   └── maps/
│       ├── escarpment/config.js + data/
│       ├── sleeping-giant/config.js + data/
│       └── wild-goose/config.js + override.js + override.css + data/
├── maps/                         # Unmigrated maps (GPX data for future builds)
│   ├── rock-the-ridge/data/
│   ├── manitous-revenge/data/
│   └── shawangunk-ridge/data/
├── dist/                         # Build output (gitignored)
│   └── maps/{slug}/index.html
└── CLAUDE.md
```

## Existing Race Maps

| Race | Location | Type | URL Path | Status |
|------|----------|------|----------|--------|
| Wild Goose Trail Festival | Wawayanda State Park, NJ | Multi-loop trail | `/maps/wild-goose/` | Migrated |
| Sleeping Giant Trail Runs 25K | Sleeping Giant State Park, CT | Single-loop trail | `/maps/sleeping-giant/` | Migrated |
| Escarpment Trail Run 30K | Catskill Mountains, NY | Point-to-point trail | `/maps/escarpment/` | Migrated |
| Rock the Ridge 50M | Mohonk Preserve, NY | Point-to-point | `/maps/rock-the-ridge/` | GPX only |
| Manitou's Revenge | Catskill Mountains, NY | Point-to-point | `/maps/manitous-revenge/` | GPX only |
| Shawangunk Ridge Trail Run 70M | Shawangunk Ridge, NY | Point-to-point | `/maps/shawangunk-ridge/` | GPX only |
