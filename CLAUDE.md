# Wild Goose Maps - Race Map Builder

## Project Overview
Interactive web maps for trail races, featuring course loops, elevation profiles, trail overlays, and aid station markers. Built with Mapbox GL JS.

## Tech Stack
- **Mapbox GL JS** - Map rendering and interactivity
- **Vanilla HTML/CSS/JS** - No framework, single `index.html` file
- **GeoJSON** - Course loops, trails, and point data
- **Canvas API** - Elevation profile rendering

## Project Structure
```
/
├── index.html              # Main application (all HTML, CSS, JS)
├── data/
│   ├── blue-loop.geojson   # Course loop geometries
│   ├── pink-loop.geojson
│   ├── course-trails.geojson  # Trail segments with blaze colors
│   └── aid-stations.geojson   # Point features for aid stations
└── CLAUDE.md
```

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

### Layer Ordering
Add layers in correct z-order. Use `beforeId` parameter to insert below existing layers:
```javascript
map.addLayer(trailLayer, 'pink-outline'); // Add trails below loop outlines
```

## Styling Guidelines

### Trail Colors
- Always match official park blaze colors when available
- Use the park's published legend as reference
- Roads without blazes render as gray (#9E9E9E)

### Loop Colors
- Use distinct, vibrant colors for each loop
- Current palette: Blue (#0479FF), Pink (#E834EC)
- Loops have both fill (outline) and line layers

### Line Widths
- Trail lines: 1.5-3px (zoom interpolated)
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
