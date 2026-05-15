// Gran Fondo Badlands — config.js
//
// Plumbs the theme + per-distance geojson data into the runtime CONFIG
// the override.js renderer reads. The race has four standalone loop GPXes
// (Brontosaurus 163K, T-Rex 100K, Triceratops 75K, Velociraptor 50K) that
// share a nested aid spine and start/finish at the Badlands Community
// Facility in Drumheller, Alberta.
//
// Pattern is borrowed from src/maps/wild-goose/config.js — multi-distance
// loop selector, per-loop turn-by-turn, but each distance is a single
// loop here (no assembly composition), so the within-loop directions
// list maps 1:1 to the distance.

const path = require('path');
const fs = require('fs');

function loadJSON(file) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
}

const theme = require('../../themes/gran-fondo-badlands.js');

const brontoGeo     = loadJSON('data/brontosaurus.geojson');
const brontoProfile = loadJSON('data/brontosaurus-profile.json');
const trexGeo       = loadJSON('data/trex.geojson');
const trexProfile   = loadJSON('data/trex-profile.json');
const triGeo        = loadJSON('data/triceratops.geojson');
const triProfile    = loadJSON('data/triceratops-profile.json');
const veloGeo       = loadJSON('data/velociraptor.geojson');
const veloProfile   = loadJSON('data/velociraptor-profile.json');

const weatherData   = fs.existsSync(path.join(__dirname, 'data/weather.json'))
  ? loadJSON('data/weather.json') : null;

// Per-loop turn-by-turn — produced by the FSS TBT pipeline against each
// distance's GPX (scripts/fetch-gran-fondo-badlands-turns.py). Each
// loop's turns sit in data/<id>-turns.geojson. If the file is missing,
// the renderer falls back to the curated cues in the theme.
function loadLoopTurns(loopId) {
  const file = path.join(__dirname, `data/${loopId}-turns.geojson`);
  if (!fs.existsSync(file)) return [];
  const fc = JSON.parse(fs.readFileSync(file, 'utf8'));
  return fc.features.map((f, i) => ({
    n: i + 1,
    mile: f.properties.course_mi,
    direction: f.properties.direction,
    intensity: f.properties.intensity,
    label: f.properties.label || '',
    labelType: f.properties.label_type || '',
    location: f.geometry.coordinates,
  }));
}
const brontoTurns = loadLoopTurns('brontosaurus');
const trexTurns   = loadLoopTurns('trex');
const triTurns    = loadLoopTurns('triceratops');
const veloTurns   = loadLoopTurns('velociraptor');

const loopGeometry = {
  brontosaurus: { geojson: brontoGeo, profile: brontoProfile },
  trex:         { geojson: trexGeo,   profile: trexProfile   },
  triceratops:  { geojson: triGeo,    profile: triProfile    },
  velociraptor: { geojson: veloGeo,   profile: veloProfile   },
};

const themeLoops = theme.raceFormat.loops;
const loopsJsLines = themeLoops.map(l => {
  return `  ${l.id}: { color: '${l.color}', label: '${l.displayName}', abbr: '${l.displayName.charAt(0)}', miles: ${l.miles}, kilometers: ${l.kilometers}, gain: ${l.elevationGain}, gainM: ${l.elevationGainM}, defaultDirection: '${l.defaultDirection}', dinosaur: '${l.id}', geojson: null, profile: null, visible: true }`;
}).join(',\n');

// RACES — one per distance. Each has a single-loop assembly.
const racesJsLines = theme.raceFormat.distances.map(d => {
  const loops = (d.assembly || []).map(s => `'${s.loopId}'`).join(',');
  const dirs  = (d.assembly || []).map(s => `'${s.direction}'`).join(',');
  return `  '${d.id}': { name: '${d.shortLabel}', label: '${d.label}', miles: ${d.runMiles}, kilometers: ${d.kilometers}, gain: ${d.runGainFt}, gainM: ${d.runGainM}, hours: ${(d.runMiles / 14).toFixed(2)}, cutoff: '${d.cutoff || ''}', startTime: '${d.startTime}', startWindow: '${(d.startWindow || d.startTime).replace(/'/g, "\\'")}', color: '${d.color}', dinosaur: '${d.dinosaur}', loops: [${loops}], directions: [${dirs}], aidIdx: ${JSON.stringify(d.aidStations)} }`;
}).join(',\n');

// Inline the shared aid-station spine. Each distance's `aidIdx` indexes
// into this list to render only the stations it visits. Mile is given in
// km (the published unit) and converted to miles only when the renderer
// has to position a marker against the per-loop coordinate distances.
const aidStationsJs = JSON.stringify(theme.aidStations);

// Dinosaur silhouette SVG paths — one per distance. These render
// inside the distance picker chips, the active-distance HQ badge, and
// (color-mapped) as a watermark on the elevation profile. Drawn on a
// 64x40 viewBox so a road bike fits below each silhouette. `currentColor`
// lets the renderer color them per loop.
const DINOSAUR_SVGS = {
  brontosaurus: '<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<g fill="currentColor">' +
      // body + tail + back
      '<path d="M6 25 Q9 22 14 22 L40 22 Q44 19 48 19 L52 19 Q56 19 56 23 L56 26 Q56 28 54 28 L50 28 L50 27 Q44 27 40 27 L18 27 Q14 27 12 28 L8 28 Q6 28 6 26 Z"/>' +
      // long neck + small head
      '<path d="M48 19 Q50 14 52 11 Q54 8 57 7 Q60 6.5 61 8 Q61.5 9 60.5 10 Q58 11 57 12.5 Q56 14 55 17 Q54 19 53 19 Z"/>' +
      // legs
      '<rect x="14" y="27" width="2.6" height="6" rx="1"/>' +
      '<rect x="22" y="27" width="2.6" height="6" rx="1"/>' +
      '<rect x="40" y="27" width="2.6" height="6" rx="1"/>' +
      '<rect x="48" y="27" width="2.6" height="6" rx="1"/>' +
    '</g>' +
    // bike wheels (outline)
    '<g fill="none" stroke="currentColor" stroke-width="1.4">' +
      '<circle cx="14" cy="35" r="3.2"/>' +
      '<circle cx="48" cy="35" r="3.2"/>' +
      '<path d="M14 35 L31 32 L48 35" stroke-width="1.2"/>' +
    '</g>' +
  '</svg>',

  trex: '<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<g fill="currentColor">' +
      // big head + jaw
      '<path d="M40 11 Q47 8 54 11 Q58 13 58 17 L58 19 L51 19 L48 21 Q44 21 42 19 L40 18 Z"/>' +
      // teeth (notch)
      '<path d="M51 19 L53 21 L55 19 L57 21 L58 19" fill="#fff" opacity="0.9" transform="translate(0,0)" stroke="#fff" stroke-width="0.4"/>' +
      // body + tail
      '<path d="M14 22 L40 22 Q44 19 48 19 L48 26 Q44 27 40 27 L18 27 Q12 27 9 24 Q6 21 4 22 Q2 23 4 25 L8 26 Q10 27 12 27 L14 27 Z"/>' +
      // tiny arms
      '<rect x="36" y="22" width="3.2" height="1.6" rx="0.6"/>' +
      // legs
      '<path d="M22 27 L20 33 L24 33 L25 27 Z"/>' +
      '<path d="M40 27 L38 33 L42 33 L43 27 Z"/>' +
    '</g>' +
    '<g fill="none" stroke="currentColor" stroke-width="1.4">' +
      '<circle cx="20" cy="35" r="3.2"/>' +
      '<circle cx="44" cy="35" r="3.2"/>' +
      '<path d="M20 35 L32 32 L44 35" stroke-width="1.2"/>' +
    '</g>' +
  '</svg>',

  triceratops: '<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<g fill="currentColor">' +
      // body
      '<path d="M14 22 L42 22 Q46 22 48 24 L52 26 L52 28 L46 28 L42 28 L18 28 Q14 28 12 27 L6 26 Q4 26 4 24 Q4 22 6 22 Z"/>' +
      // big head + frill
      '<path d="M48 14 Q56 12 60 16 L60 22 L58 23 L52 23 L48 22 L46 18 Z"/>' +
      // three horns
      '<path d="M50 13 L50 16 L52 16 Z"/>' +
      '<path d="M55 12 L57 9 L59 12 Z"/>' +
      '<path d="M59 14 L61 17 L57 18 Z"/>' +
      // legs
      '<rect x="16" y="28" width="2.6" height="5" rx="1"/>' +
      '<rect x="24" y="28" width="2.6" height="5" rx="1"/>' +
      '<rect x="40" y="28" width="2.6" height="5" rx="1"/>' +
      '<rect x="46" y="28" width="2.6" height="5" rx="1"/>' +
    '</g>' +
    '<g fill="none" stroke="currentColor" stroke-width="1.4">' +
      '<circle cx="18" cy="35" r="3.2"/>' +
      '<circle cx="44" cy="35" r="3.2"/>' +
      '<path d="M18 35 L31 32 L44 35" stroke-width="1.2"/>' +
    '</g>' +
  '</svg>',

  velociraptor: '<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<g fill="currentColor">' +
      // sleek body + tail (long horizontal)
      '<path d="M6 24 Q10 22 14 22 L42 22 Q46 21 50 22 L52 23 L52 26 L46 27 L40 27 L18 27 Q12 27 9 26 Q5 25 4 26 Q3 27 5 27.5 L8 28 Q6 27 6 25 Z"/>' +
      // raised head (predatory pose)
      '<path d="M48 22 Q52 16 56 13 Q58 11 60 12 Q61 13 60 14 L57 17 Q55 19 54 21 Z"/>' +
      // open jaw notch
      '<path d="M58 14 L61 13 L60.5 15 Z" fill="#fff" opacity="0.85"/>' +
      // sickle claw + arms
      '<path d="M40 22 L40 25 L37 27 L40 27 L42 25 Z"/>' +
      // legs (powerful, bent)
      '<path d="M22 27 L20 31 L23 33 L26 31 L25 27 Z"/>' +
      '<path d="M40 27 L38 31 L41 33 L44 31 L43 27 Z"/>' +
    '</g>' +
    '<g fill="none" stroke="currentColor" stroke-width="1.4">' +
      '<circle cx="22" cy="35" r="3.2"/>' +
      '<circle cx="42" cy="35" r="3.2"/>' +
      '<path d="M22 35 L32 32 L42 35" stroke-width="1.2"/>' +
    '</g>' +
  '</svg>',
};

const dinoSvgsJs = JSON.stringify(DINOSAUR_SVGS);

const configDataJs = `
var LOOPS = {
${loopsJsLines}
};

var RACES = {
${racesJsLines}
};

var DEFAULT_DISTANCE_ID = '${theme.raceFormat.defaultDistanceId}';
var DISPLAY_UNITS = '${theme.displayUnits || 'mi'}';

var LOOP_CUES = ${JSON.stringify(
  themeLoops.reduce((acc, l) => {
    acc[l.id] = l.cues || [];
    return acc;
  }, {})
)};

var LOOP_TURNS = {
  brontosaurus: ${JSON.stringify(brontoTurns)},
  trex:         ${JSON.stringify(trexTurns)},
  triceratops:  ${JSON.stringify(triTurns)},
  velociraptor: ${JSON.stringify(veloTurns)}
};

var DINO_SVGS = ${dinoSvgsJs};

var AID_STATIONS_ALL = ${aidStationsJs};

var HQ = [-112.7050, 51.4665];

var brontoData = ${JSON.stringify(Object.assign({}, brontoGeo, { profile: brontoProfile }))};
var trexData   = ${JSON.stringify(Object.assign({}, trexGeo,   { profile: trexProfile   }))};
var triData    = ${JSON.stringify(Object.assign({}, triGeo,    { profile: triProfile    }))};
var veloData   = ${JSON.stringify(Object.assign({}, veloGeo,   { profile: veloProfile   }))};

var CONFIG = { mapCenter: [-112.7050, 51.4665], weather: ${JSON.stringify(weatherData)} };

LOOPS.brontosaurus.geojson = brontoData.features[0];
LOOPS.brontosaurus.profile = brontoData.profile;
LOOPS.trex.geojson         = trexData.features[0];
LOOPS.trex.profile         = trexData.profile;
LOOPS.triceratops.geojson  = triData.features[0];
LOOPS.triceratops.profile  = triData.profile;
LOOPS.velociraptor.geojson = veloData.features[0];
LOOPS.velociraptor.profile = veloData.profile;

// Per-loop cumulative-distance lookup keyed by coordinate index. Lets
// override.js map a mile value to a [lng,lat] on the rendered geometry.
var loopCoordDistances = {};
(function() {
  var loopIds = ['brontosaurus', 'trex', 'triceratops', 'velociraptor'];
  for (var li = 0; li < loopIds.length; li++) {
    var id = loopIds[li];
    var coords = LOOPS[id].geojson.geometry.coordinates;
    var dists = [0];
    for (var i = 1; i < coords.length; i++) {
      var x1 = coords[i - 1][0], y1 = coords[i - 1][1], x2 = coords[i][0], y2 = coords[i][1];
      var dLng = (x2 - x1) * Math.cos((y1 + y2) / 2 * Math.PI / 180) * 69.172;
      var dLat = (y2 - y1) * 69.172;
      dists.push(dists[i - 1] + Math.sqrt(dLng * dLng + dLat * dLat));
    }
    var raw = dists[dists.length - 1];
    for (var i = 0; i < dists.length; i++) dists[i] = (dists[i] / raw) * LOOPS[id].miles;
    loopCoordDistances[id] = dists;
  }
})();
`;

// Build the directions panel HTML — distance picker chips with
// dinosaur silhouettes, then the within-loop interleaved cue list.
function buildDirectionsHtml() {
  const distances = theme.raceFormat.distances;
  const defaultId = theme.raceFormat.defaultDistanceId;

  const tabsHtml = distances.map(d => {
    const active = d.id === defaultId;
    const dino = DINOSAUR_SVGS[d.dinosaur] || '';
    return `<button type="button" class="dir-race-tab dir-dino-tab${active ? ' active' : ''}" data-race="${d.id}" role="tab" aria-selected="${active}" onclick="selectRace('${d.id}')">
      <span class="dir-dino-icon" style="color:${d.color}">${dino}</span>
      <span class="dir-dino-meta">
        <span class="dir-dino-name">${d.shortLabel}</span>
        <span class="dir-dino-km">${d.kilometers} km</span>
      </span>
    </button>`;
  }).join('\n      ');

  return `<section class="directions-section expanded" id="directionsSection">
    <nav class="dir-race-tabs dir-race-tabs--dino" role="tablist" aria-label="Choose race distance">
      ${tabsHtml}
    </nav>

    <div class="directions-header">
      <div class="directions-titles">
        <h3 class="directions-eyebrow">Course directions</h3>
        <span class="directions-race" id="directionsRaceLabel">— km · — m gain</span>
      </div>
      <label class="dir-zoom-toggle">
        <input type="checkbox" id="zoomToStepCheckbox" checked onchange="setZoomToStep(this.checked)">
        <span>Zoom to step</span>
      </label>
      <span class="dir-cutoff-pill" id="dirCutoffPill"></span>
    </div>

    <p class="assembly-now" id="assemblyNow">
      <span class="assembly-now__eyebrow">Currently viewing</span>
      <span class="assembly-now__label" id="assemblyNowLabel">—</span>
    </p>

    <ol class="loop-cue-list" id="loopCueList" aria-label="Within-loop cues"></ol>

    <!-- Legacy hidden stubs kept so override.js's old query selectors
         (which still exist in places) don't throw. -->
    <div class="legacy-controls" hidden aria-hidden="true">
      <div class="loop-toggles">
        <div class="loop-toggle" data-loop="brontosaurus"></div>
        <div class="loop-toggle" data-loop="trex"></div>
        <div class="loop-toggle" data-loop="triceratops"></div>
        <div class="loop-toggle" data-loop="velociraptor"></div>
      </div>
    </div>
  </section>`;
}

const mapViewHtml = `<div id="mapView" class="view active">
<div class="map-wrap">
  <div id="map"></div>
  <div class="hq-badge"><div class="dot"></div><div class="text">BCF · START / FINISH</div></div>
  <!-- Layers popover. The toggles are scarce-tap operations, so they
       collapse behind a single trigger to preserve map y-pixels on
       mobile (per [[race-map-mobile-chrome-shrink]]). The hidden
       inline buttons preserve compatibility with legacy e2e
       selectors that toggle the same state. -->
  <div class="map-layers" data-state="closed">
    <button type="button" class="map-layers__trigger" id="mapLayersBtn"
            aria-expanded="false" aria-controls="mapLayersPanel"
            onclick="toggleLayersPopover()">
      <svg class="map-layers__icon" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 1.5 1.5 5 8 8.5 14.5 5 8 1.5Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
        <path d="M1.5 8 8 11.5 14.5 8" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
        <path d="M1.5 11 8 14.5 14.5 11" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
      </svg>
      <span class="map-layers__label">Layers</span>
      <svg class="map-layers__chev" viewBox="0 0 12 12" aria-hidden="true">
        <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
    <div class="map-layers__panel" id="mapLayersPanel" role="group" aria-label="Map layers">
      <label class="map-layers__row">
        <input type="checkbox" id="layerAid" onchange="toggleAid()" checked>
        <span class="map-layers__row-text">Aid Stations</span>
      </label>
      <label class="map-layers__row">
        <input type="checkbox" id="layer3D" onchange="toggle3D()">
        <span class="map-layers__row-text">3D terrain</span>
      </label>
      <label class="map-layers__row">
        <input type="checkbox" id="layerAllRoutes" onchange="toggleAllRoutes()">
        <span class="map-layers__row-text">Show all 4 routes</span>
      </label>
    </div>
  </div>
  <div class="map-btns" hidden aria-hidden="true">
    <button class="trail-btn" id="aidBtnInline" onclick="toggleAid()">Aid Stations</button>
    <button class="trail-btn" id="terrainBtnInline" onclick="toggle3D()">3D</button>
  </div>
</div>

${buildDirectionsHtml()}

<section class="profile-section">
  <div class="profile-header">
    <h3 id="profileTitle">Elevation Profile</h3>
    <div class="profile-stats" id="profileStats"></div>
  </div>
  <canvas id="profileCanvas"></canvas>
</section>
</div>`;

const simViewHtml = `<div id="simView" class="view">
  <div class="sim-container">
    <div class="sim-panel">
      <div class="sim-races" id="simRaces"></div>

      <div class="goal-time-bar">
        <span class="goal-label">Goal Time</span>
        <div class="goal-inputs">
          <input type="number" class="goal-input" id="goalHrs" min="0" max="12" value="6" onchange="updateGoalTime()" onclick="this.select()">
          <span class="goal-colon">:</span>
          <input type="number" class="goal-input" id="goalMins" min="0" max="59" value="0" onchange="updateGoalTime()" onclick="this.select()">
        </div>
        <div class="goal-pace" id="goalPace">Avg pace: <strong>— km/h</strong></div>
      </div>

      <div class="scrubber">
        <div class="scrub-row">
          <button class="play-btn" id="playBtn" onclick="togglePlay()">&#9654;</button>
          <div class="scrub-track" id="scrubTrack">
            <div class="scrub-bg">
              <div class="scrub-segs" id="scrubSegs"></div>
              <div class="scrub-fill" id="scrubFill"></div>
            </div>
            <div class="scrub-hq" id="scrubHQ"></div>
            <div class="scrub-handle" id="scrubHandle"></div>
          </div>
          <div class="speed-btns">
            <button class="speed-btn active" onclick="setSpeed(1,this)">1x</button>
            <button class="speed-btn" onclick="setSpeed(2,this)">2x</button>
            <button class="speed-btn" onclick="setSpeed(4,this)">4x</button>
          </div>
        </div>
      </div>

      <div class="sim-clock">
        <div class="clock-time" id="clockTime">7:00 AM</div>
        <div class="clock-label">Current time · race starts <span id="clockStart">7:00 AM</span></div>
        <div class="clock-finish" id="clockFinish">Finish: <strong id="finishTime">—</strong></div>
      </div>

      <div class="sim-stats">
        <div class="sim-stat"><div class="val" id="statDist">0.0</div><div class="label">km</div></div>
        <div class="sim-stat"><div class="val" id="statEle">0</div><div class="label">Elev (m)</div></div>
        <div class="sim-stat"><div class="val" id="statGain">0</div><div class="label">Gain (m)</div></div>
        <div class="sim-stat"><div class="val" id="statTotalGain">0</div><div class="label">Total Gain (m)</div></div>
        <div class="sim-stat"><div class="val" id="statGrade">0%</div><div class="label">Grade</div></div>
        <div class="sim-stat"><div class="val" id="statPct">0%</div><div class="label">Complete</div></div>
      </div>
    </div>

    <div class="sim-visual">
      <div class="course-map-wrap">
        <canvas id="courseMapCanvas"></canvas>
        <div class="runner-info">
          <div class="runner-ele" id="runnerDist">km 0.0</div>
          <div class="runner-meta" id="runnerMeta">— m · Starting</div>
          <div class="loop-pill" id="loopPill">—</div>
        </div>
      </div>
      <div class="terrain-wrap">
        <canvas id="simTerrain"></canvas>
      </div>
    </div>
  </div>
</div>`;

// Aid-station card removed from cueHtml — the editorial race-shell
// template renders a canonical `#essentialsAid` section from
// theme.aidStations via build.js's buildAidTableRows(), so a second
// rendering in the cue column is a duplicate. Per-route filtering
// (which stations the active distance visits) lives in the directions
// list and the on-map markers; the essentials table lists the full
// shared spine the way the host race describes it.
const aidTableHtml = '';

// Weather panel staging — relocated by override.js into race-day
// essentials at runtime. Empty string when weather.json is absent.
const weatherPanelHtml = weatherData ? `<aside class="weather-panel" id="weatherPanel" aria-labelledby="weatherPanelTitle" data-relocate="essentials-weather">
  <div class="weather-panel-header" id="weatherPanelHeader" onclick="toggleWeatherPanel()">
    <h3 id="weatherPanelTitle">Weather Intelligence</h3>
    <button class="weather-toggle-btn" id="weatherToggleBtn" aria-label="Toggle weather panel">
      <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
    </button>
  </div>
  <div class="weather-panel-body" id="weatherPanelBody">
    <div class="weather-risk-row" id="weatherRiskCards"></div>
    <div id="weatherDaily"></div>
    <div id="weatherCurrent">
      <div class="weather-loading">Loading current conditions&hellip;</div>
    </div>
    <div id="weatherRadar">
      <div class="weather-radar-section">
        <div class="weather-radar-title">Radar</div>
        <div class="weather-radar-loading">Loading radar&hellip;</div>
      </div>
    </div>
    <div id="weatherExplainer"></div>
  </div>
</aside>` : '';

module.exports = {
  slug: 'gran-fondo-badlands',
  theme,
  title: 'Gran Fondo Badlands — Course Map · False Summit Studio',
  raceName: 'GRAN FONDO BADLANDS',
  themeColor: theme.palette.paper,
  fontFamily: theme.type.bodyStack,
  subtitle: 'Saturday, July 4, 2026 · Drumheller, Alberta · <a href="' + theme.identity.hostUrl + '" target="_blank">granfondobadlands.ca</a>',

  cssVars: {
    '--paper':         theme.palette.paper,
    '--ink':           theme.palette.raceInk,
    '--race-brand':    theme.palette.raceBrand,
    '--surface-warm':  theme.palette.surfaceWarm,
    '--route-color':   theme.palette.routeColor,
    '--aid-color':     theme.palette.aidStation,
    '--hazard-color':  theme.palette.hazard,
    '--accent':        theme.palette.accent,
    '--sage-quiet':    theme.palette.sageQuiet,
    '--bone':          theme.palette.bone,
    '--paper-card':    theme.palette.paperCard,

    '--font-display':  theme.type.displayStack,
    '--font-script':   theme.type.scriptStack,
    '--font-body':     theme.type.bodyStack,
    '--font-micro':    theme.type.microStack,

    // Legacy aliases consumed by shared CSS modules (weather.css, etc.).
    '--bg':            theme.palette.paper,
    '--bg-alt':        theme.palette.surfaceWarm,
    '--bg-card':       theme.palette.paperCard,
    '--text':          theme.palette.raceInk,
    '--text-secondary': '#3a3a3a',
    '--text-muted':    theme.palette.sageQuiet,
    '--border':        '#dad1bf',
    '--shadow':        '0 2px 6px rgba(26,26,26,0.08)',
    '--radius':        '4px',
    '--primary':       theme.palette.raceBrand,
    '--primary-dark':  '#7A3818',
    '--course':        theme.palette.raceInk,
    '--font-family':   theme.type.bodyStack,
    '--heading-family': theme.type.displayStack,

    // Loop colors as CSS vars (for chip strips, popups, profile fill)
    '--loop-brontosaurus': theme.palette.loopBrontosaurus,
    '--loop-trex':         theme.palette.loopTrex,
    '--loop-triceratops':  theme.palette.loopTriceratops,
    '--loop-velociraptor': theme.palette.loopVelociraptor,

    // Simulator (warm earth tone reskin)
    '--sim-bg':            '#1c1310',
    '--runner-text':       theme.palette.paper,
    '--runner-text-shadow': '0 2px 8px rgba(0,0,0,0.55)',
    '--runner-meta':       'rgba(248,242,234,0.75)',
    '--scrub-handle-shadow': '0 2px 6px rgba(168,77,36,0.45)',
    '--popup-bg':          theme.palette.paperCard,
  },

  configDataJs: configDataJs,
  skipSharedJs: true,

  overrideJs: 'override.js',
  overrideCss: 'override.css',

  mapViewHtml,
  simViewHtml,

  cueHtml: aidTableHtml + (weatherPanelHtml ? '\n<div hidden id="weatherPanelStaging">' + weatherPanelHtml + '</div>' : ''),

  // Map settings — centered on Drumheller. The zoom is loose so first
  // load shows the whole valley before override.js fitBounds()s the
  // active distance's loop.
  mapCenter: [-112.7050, 51.4665],
  mapZoom: 11,
  basemapFlavor: {
    background: '#e8d7b8',
    earth:      '#e8d7b8',
    park_a:     '#d8c69b',
    park_b:     '#d8c69b',
    wood_a:     '#b8a075',
    wood_b:     '#b8a075',
    scrub_a:    '#d4c096',
    scrub_b:    '#d4c096',
    water:      '#a8c8d8',
    sand:       '#e8d2a4',
    beach:      '#e8d2a4',
    glacier:    '#edf3f8',
  },

  // Fallback fields read by build.js when configDataJs is absent. We
  // ship configDataJs so these are not inlined; harmless placeholders.
  courseCoords: [],
  elevations: [],
  totalMiles: 101.4,
  totalGain: 2935,

  startCoords: [-112.7050, 51.4665],
  startLabel: 'Badlands Community Facility — Start / Finish',
  finishCoords: null,
  finishLabel: null,

  courseOutlineColor: '#000',
  courseLineColor: theme.palette.raceInk,
  mileMarkerFillColor: '#1f1d18',
  mileMarkerStrokeColor: theme.palette.raceBrand,
  mileMarkerTextColor: theme.palette.paper,

  raceStartHour: 7,
  defaultGoalHours: 6,
  defaultGoalMins: 0,

  colors: {
    primary: theme.palette.raceBrand,
  },

  toggleButtons: [],

  weather: weatherData,

  footerHtml: 'TransRockies Gran Fondo Badlands · <a href="' + theme.identity.hostUrl + '" target="_blank">Register on granfondobadlands.ca</a>\n  <br>Race map created by <a href="https://falsesummitstudio.com" target="_blank">False Summit Studio</a>',
};
