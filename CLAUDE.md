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
- **Mapbox GL JS** - Map rendering and interactivity
- **Vanilla HTML/CSS/JS** - No framework, single `index.html` per map
- **GeoJSON** - Course routes, trails, and point data
- **Canvas API** - Elevation profile rendering

## Data Loading Rules
**IMPORTANT:** All course and trail GeoJSON data must be inlined directly into `index.html` as JavaScript variables whenever possible. Do NOT use `fetch()` to load local data files at runtime. Opening maps via `file://` protocol causes `fetch()` to silently fail due to browser CORS restrictions. Inlining the data ensures maps work without a local server.

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
5. Render trail lines colored by blaze using a Mapbox `match` expression
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
On map load, **always** hide the following basemap elements to avoid visual clutter:

1. **POI icons** — Hide all `poi-*` symbol layers (info markers, trailheads, etc.)
2. **Basemap trail/path lines** — Hide all built-in trail rendering from `outdoors-v12`

```javascript
map.on('load', () => {
  // Hide basemap POI icons
  map.getStyle().layers.forEach(layer => {
    if (layer.type === 'symbol' && layer.id.startsWith('poi-')) {
      map.setLayoutProperty(layer.id, 'visibility', 'none');
    }
  });

  // Hide basemap trail/path layers permanently
  const BASEMAP_TRAIL_LAYERS = [
    'road-path-bg', 'road-path-trail', 'road-path-cycleway-piste', 'road-path',
    'road-steps-bg', 'road-steps', 'road-pedestrian',
    'tunnel-path-trail', 'tunnel-path-cycleway-piste', 'tunnel-path',
    'tunnel-steps', 'tunnel-pedestrian',
    'bridge-path-bg', 'bridge-path-trail', 'bridge-path-cycleway-piste', 'bridge-path',
    'bridge-steps-bg', 'bridge-steps', 'bridge-pedestrian',
    'path-pedestrian-label'
  ];
  BASEMAP_TRAIL_LAYERS.forEach(id => {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
  });

  // ... add course layers, etc.
});
```

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
   - Mapbox layer paint expression `['match', ['get', 'blaze'], ...]`

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
Every race map should include mile markers on the interactive map (not needed on the simulator). Use Mapbox-native circle + symbol layers for performance and zoom-based visibility control. No toggle button — mile markers follow the Course toggle.

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
    coords: [-74.392108, 41.196365],  // [lng, lat] for Mapbox
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

Create folder structure:
```
/[race-name]/
├── index.html          # Main map application
├── data/
│   ├── course.geojson  # Route geometry
│   ├── trails.geojson  # Park trail segments with blaze colors (required)
│   └── landmarks.geojson # POI data (optional)
```

### Step 4: Map Creation

**For single-course races (half marathon, marathon):**
- Use simplified template with one course line
- Include: course toggle, landmarks toggle, 3D terrain toggle
- Add elevation profile canvas
- List key landmarks in clickable grid

**For multi-loop trail races:**
- Use Wild Goose template with LOOPS object
- Each loop gets: color, label, miles, elevation gain, geojson
- Handle overlapping segments with offset lines
- Include race distance picker

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
- Example: Sleepy Hollow Half Marathon

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

## Mapbox Configuration

**Access Token:** Use the project token or request user's token for production.

**Recommended Styles:**
- `mapbox://styles/mapbox/outdoors-v12` - Best for trail/road races
- `mapbox://styles/mapbox/satellite-streets-v12` - Good for aerial view
- `mapbox://styles/mapbox/dark-v11` - Dark theme option

**3D Terrain:**
```javascript
map.addSource('mapbox-dem', {
  type: 'raster-dem',
  url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
  tileSize: 512,
  maxzoom: 14
});
map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });
```

---

## Project Structure (falsesummitstudio.com)

```
/falsesummitstudio/
├── index.html                    # Landing page
├── assets/                       # Shared assets (logo, etc.)
├── maps/
│   ├── wild-goose/
│   │   ├── index.html           # → falsesummitstudio.com/maps/wild-goose/
│   │   └── data/
│   ├── sleepy-hollow/
│   │   ├── index.html           # → falsesummitstudio.com/maps/sleepy-hollow/
│   │   └── data/
│   └── [new-race]/              # Future maps go here
└── CLAUDE.md
```

## Existing Race Maps

| Race | Location | Type | URL Path |
|------|----------|------|----------|
| Wild Goose Trail Festival | Wawayanda State Park, NJ | Multi-loop trail | `/maps/wild-goose/` |
| Sleepy Hollow Half Marathon | Sleepy Hollow, NY | Road/trail hybrid | `/maps/sleepy-hollow/` |
| Sleeping Giant Trail Runs 25K | Sleeping Giant State Park, CT | Single-loop trail | `/maps/sleeping-giant/` |
