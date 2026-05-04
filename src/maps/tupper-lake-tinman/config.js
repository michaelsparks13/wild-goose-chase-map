const path = require('path');
const fs = require('fs');

function loadJSON(file) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
}

const sprintGeo = loadJSON('data/sprint.geojson');
const sprintProfile = loadJSON('data/sprint-profile.json');
const olympicGeo = loadJSON('data/olympic.geojson');
const olympicProfile = loadJSON('data/olympic-profile.json');
const tinmanGeo = loadJSON('data/tinman.geojson');
const tinmanProfile = loadJSON('data/tinman-profile.json');
const sprintSteps = loadJSON('data/sprint-steps.json');
const olympicSteps = loadJSON('data/olympic-steps.json');
const tinmanSteps = loadJSON('data/tinman-steps.json');
const sprintTurns = loadJSON('data/sprint-turnarounds.json');
const olympicTurns = loadJSON('data/olympic-turnarounds.json');
const tinmanTurns = loadJSON('data/tinman-turnarounds.json');
const aidStationsRaw = loadJSON('data/aid-stations.json');
const streetviewTurns = loadJSON('data/streetview.json');
const weatherData = fs.existsSync(path.join(__dirname, 'data/weather.json'))
  ? loadJSON('data/weather.json') : null;

// Flatten aid stations: each entry with multiple miles becomes multiple stops
// (each pass through is a separate marker on the course).
const AID_STATIONS = aidStationsRaw.flatMap(a =>
  a.miles.map((mile, i) => ({
    name: a.miles.length > 1 ? `${a.name} (Pass ${i + 1})` : a.name,
    mile,
    lng: a.lng,
    lat: a.lat,
    services: 'Water, Powerade, Coca-Cola, oranges, pretzels, gels',
  }))
).sort((a, b) => a.mile - b.mile);

const configDataJs = `
var LOOPS = {
  sprint:  { color: '#F5C518', label: 'Sprint',  abbr: 'S', miles: 3.1,  gain: 193, geojson: null, profile: null, visible: false, swim: 0.5,  bike: 12.6, run: 3.1 },
  olympic: { color: '#2E7D32', label: 'Olympic', abbr: 'O', miles: 6.2,  gain: 218, geojson: null, profile: null, visible: false, swim: 0.93, bike: 26,   run: 6.2 },
  tinman:  { color: '#C8102E', label: 'Tinman',  abbr: 'T', miles: 13.1, gain: 407, geojson: null, profile: null, visible: true,  swim: 1.2,  bike: 56,   run: 13.1 }
};

var RACES = {
  sprint:  { name: 'Sprint',  miles: 3.1,  hours: 0.5,  loops: ['sprint']  },
  olympic: { name: 'Olympic', miles: 6.2,  hours: 1.0,  loops: ['olympic'] },
  tinman:  { name: 'Tinman',  miles: 13.1, hours: 2.0,  loops: ['tinman']  }
};

var HQ = [-74.46478, 44.22999];

var sprintData  = ${JSON.stringify(Object.assign({}, sprintGeo,  { profile: sprintProfile  }))};
var olympicData = ${JSON.stringify(Object.assign({}, olympicGeo, { profile: olympicProfile }))};
var tinmanData  = ${JSON.stringify(Object.assign({}, tinmanGeo,  { profile: tinmanProfile  }))};

var CONFIG = { mapCenter: [-74.4485, 44.2335], weather: ${JSON.stringify(weatherData)} };

// The phase-split GeoJSONs ship as multi-feature FeatureCollections (one
// LineString feature per out/back run). The map source needs the full
// collection so all phase segments render with their own offsets/styles. Other
// helpers (getCoordAtDist, mile markers, simulator) walk a single ordered list
// of coordinates, so we also flatten all features back into one Feature for
// LOOPS[id].geojson.
function flattenFeatures(fc) {
  var coords = [];
  for (var i = 0; i < fc.features.length; i++) {
    var c = fc.features[i].geometry.coordinates;
    var startAt = (coords.length && i > 0) ? 1 : 0; // skip duplicated boundary
    for (var j = startAt; j < c.length; j++) coords.push(c[j]);
  }
  return { type: 'Feature', properties: { name: fc.features[0] && fc.features[0].properties.name }, geometry: { type: 'LineString', coordinates: coords } };
}

LOOPS.sprint.geojsonAll  = sprintData;
LOOPS.olympic.geojsonAll = olympicData;
LOOPS.tinman.geojsonAll  = tinmanData;
LOOPS.sprint.geojson  = flattenFeatures(sprintData);
LOOPS.olympic.geojson = flattenFeatures(olympicData);
LOOPS.tinman.geojson  = flattenFeatures(tinmanData);
LOOPS.sprint.profile  = sprintData.profile;
LOOPS.olympic.profile = olympicData.profile;
LOOPS.tinman.profile  = tinmanData.profile;

var AID_STATIONS = ${JSON.stringify(AID_STATIONS)};

var DIRECTIONS = {
  sprint:  ${JSON.stringify(sprintSteps)},
  olympic: ${JSON.stringify(olympicSteps)},
  tinman:  ${JSON.stringify(tinmanSteps)}
};

var TURNAROUNDS = {
  sprint:  ${JSON.stringify(sprintTurns)},
  olympic: ${JSON.stringify(olympicTurns)},
  tinman:  ${JSON.stringify(tinmanTurns)}
};

// Pre-compute cumulative distances for each loop's coordinates
var loopCoordDistances = {};
(function() {
  var loopIds = ['sprint', 'olympic', 'tinman'];
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
    if (raw > 0) {
      for (var i = 0; i < dists.length; i++) dists[i] = (dists[i] / raw) * LOOPS[id].miles;
    }
    loopCoordDistances[id] = dists;
  }
})();

var STREETVIEW_TURNS = ${JSON.stringify(streetviewTurns)};

`;

const tinmanTheme = require('../../themes/tupper-lake-tinman.js');

module.exports = {
  slug: 'tupper-lake-tinman',
  theme: tinmanTheme,
  title: 'Tupper Lake Tinman — Run Course Map · False Summit Studio',
  raceName: 'TUPPER LAKE TINMAN',
  themeColor: tinmanTheme.palette.paper,
  // build.js wires Google Fonts from theme.type.googleFontsHref when a theme is set.
  fontFamily: tinmanTheme.type.bodyStack,
  subtitle: tinmanTheme.identity.raceDay + ' · <a href="https://www.tupperlaketinman.com/" target="_blank">tupperlaketinman.com</a>',

  // Editorial chrome owns the page background, ink, accent, and type stack.
  // The remaining tokens below are scoped to the *interactive map view* and
  // simulator components, which still consume the legacy variable names.
  cssVars: {
    '--paper':         tinmanTheme.palette.paper,
    '--ink':           tinmanTheme.palette.ink,
    '--accent':        tinmanTheme.palette.accent,
    '--warm':          tinmanTheme.palette.warm,
    '--cool':          tinmanTheme.palette.cool,
    '--font-display':  tinmanTheme.type.displayStack,
    '--font-body':     tinmanTheme.type.bodyStack,
    '--font-micro':    tinmanTheme.type.microStack,

    '--primary':       tinmanTheme.palette.accent,
    '--primary-dark':  '#7a2a1f',
    '--course':        '#111111',
    '--radius':        '4px',
    '--font-family':   tinmanTheme.type.bodyStack,
    '--heading-family':tinmanTheme.type.displayStack,
    '--sprint-color':  '#caa238',
    '--olympic-color': '#2c4a3a',
    '--tinman-color':  tinmanTheme.palette.accent,
    '--sim-bg':        '#171817',
    '--runner-text':   '#fff',
    '--runner-text-shadow': '0 2px 8px rgba(0,0,0,0.5)',
    '--runner-meta':   'rgba(255,255,255,0.7)',
    '--scrub-handle-shadow': '0 2px 6px rgba(155,58,46,0.45)',
    '--popup-bg':      tinmanTheme.palette.paper,
  },

  configDataJs: configDataJs,
  skipSharedJs: true,

  overrideJs: 'override.js',
  overrideCss: 'override.css',

  mapViewHtml: `<div id="mapView" class="view active">
<div class="map-weather-layout">
  <div class="map-main">
  <div class="map-wrap">
    <div id="map"></div>
    <div class="hq-badge"><div class="dot"></div><div class="text">RUN START</div></div>
    <div class="map-btns">
      <button class="trail-btn" id="aidBtn" onclick="toggleAid()">Aid Stations</button>
      <button class="trail-btn" id="streetviewBtn" onclick="toggleStreetview()">Street View</button>
      <button class="trail-btn" id="terrainBtn" onclick="toggle3D()">3D</button>
    </div>
  </div>

  <section class="directions-section expanded" id="directionsSection">
    <nav class="dir-race-tabs" role="tablist" aria-label="Choose race distance">
      <button type="button" class="dir-race-tab" data-race="sprint" role="tab" aria-selected="false" onclick="selectRace('sprint')">
        <span class="dir-race-dot" style="background:#F5C518"></span>
        <span class="dir-race-name">Sprint</span>
        <span class="dir-race-mi">3.1 mi</span>
      </button>
      <button type="button" class="dir-race-tab" data-race="olympic" role="tab" aria-selected="false" onclick="selectRace('olympic')">
        <span class="dir-race-dot" style="background:#2E7D32"></span>
        <span class="dir-race-name">Olympic</span>
        <span class="dir-race-mi">6.2 mi</span>
      </button>
      <button type="button" class="dir-race-tab active" data-race="tinman" role="tab" aria-selected="true" onclick="selectRace('tinman')">
        <span class="dir-race-dot" style="background:#C8102E"></span>
        <span class="dir-race-name">Tinman</span>
        <span class="dir-race-mi">13.1 mi</span>
      </button>
    </nav>
    <div class="directions-header">
      <button class="directions-toggle" type="button" onclick="toggleDirections()" aria-controls="directionsList" aria-expanded="true">
        <div class="directions-titles">
          <h3 class="directions-eyebrow">Turn-by-Turn</h3>
          <span class="directions-race" id="directionsRaceLabel">Tinman Run · 13.1 mi</span>
        </div>
      </button>
      <label class="dir-zoom-toggle">
        <input type="checkbox" id="zoomToStepCheckbox" checked onchange="setZoomToStep(this.checked)">
        <span>Zoom to step</span>
      </label>
    </div>
    <ol class="directions-list" id="directionsList"></ol>
  </section>

  <!-- Profile-section is moved into the essentials block at runtime by
       editorial-runtime.js. The legacy controls + race-cards are kept as
       hidden DOM stubs because override.js's selectRace() queries
       [data-loop=...] and .race-card to update their .active state — a
       missing element would throw and halt the race switch. -->
  <section class="profile-section">
    <div class="profile-header">
      <h3 id="profileTitle">Elevation profile</h3>
      <div class="profile-stats" id="profileStats"></div>
    </div>
    <canvas id="profileCanvas"></canvas>
  </section>
  <div class="legacy-controls" hidden aria-hidden="true">
    <div class="loop-toggles">
      <div class="loop-toggle" data-loop="sprint"></div>
      <div class="loop-toggle" data-loop="olympic"></div>
      <div class="loop-toggle active" data-loop="tinman"></div>
    </div>
  </div>
  <div class="race-cards" id="raceCards" hidden></div>
  </div>

  ${weatherData ? `<aside class="weather-panel" id="weatherPanel">
    <div class="weather-panel-header" id="weatherPanelHeader" onclick="toggleWeatherPanel()">
      <h3>Weather Intelligence</h3>
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
  </aside>` : ''}
</div>
</div>`,

  simViewHtml: `<div id="simView" class="view">
  <div class="sim-container">
    <div class="sim-panel">
      <div class="sim-races" id="simRaces"></div>

      <div class="goal-time-bar">
        <span class="goal-label">Run Goal Time</span>
        <div class="goal-inputs">
          <input type="number" class="goal-input" id="goalHrs" min="0" max="12" value="2" onchange="updateGoalTime()" onclick="this.select()">
          <span class="goal-colon">:</span>
          <input type="number" class="goal-input" id="goalMins" min="0" max="59" value="0" onchange="updateGoalTime()" onclick="this.select()">
        </div>
        <div class="goal-pace" id="goalPace">Avg pace: <strong>9:09 /mi</strong></div>
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
        <div class="clock-time" id="clockTime">Run Mile 0.0</div>
        <div class="clock-label">Run-segment progress (swim + bike not modeled)</div>
        <div class="clock-finish" id="clockFinish" style="margin-top:8px;font-size:0.8rem;color:var(--text-secondary)">Run finish: <strong id="finishTime" style="color:var(--primary)">+2h 0m</strong></div>
      </div>

      <div class="sim-stats">
        <div class="sim-stat"><div class="val" id="statDist">0.0</div><div class="label">Miles</div></div>
        <div class="sim-stat"><div class="val" id="statEle">0</div><div class="label">Elevation</div></div>
        <div class="sim-stat"><div class="val" id="statGain">0</div><div class="label">Gain</div></div>
        <div class="sim-stat"><div class="val" id="statTotalGain">0</div><div class="label">Total Gain</div></div>
        <div class="sim-stat"><div class="val" id="statGrade">0%</div><div class="label">Grade</div></div>
        <div class="sim-stat"><div class="val" id="statPct">0%</div><div class="label">Complete</div></div>
      </div>
    </div>

    <div class="sim-visual">
      <div class="course-map-wrap">
        <canvas id="courseMapCanvas"></canvas>
        <div class="runner-info">
          <div class="runner-ele" id="runnerDist">Mile 0.0</div>
          <div class="runner-meta" id="runnerMeta">1,545 ft &middot; Starting</div>
          <div class="loop-pill" id="loopPill" style="color:#C8102E;border-color:#C8102E">Tinman</div>
        </div>
      </div>
      <div class="terrain-wrap">
        <canvas id="simTerrain"></canvas>
      </div>
    </div>
  </div>
</div>`,

  // Map settings
  mapCenter: [-74.4485, 44.2335],
  mapZoom: 13,
  basemapFlavor: {
    background: '#e8eee5',
    earth: '#e8eee5',
    park_a: '#cfe0c0',
    park_b: '#cfe0c0',
    wood_a: '#b9d4a3',
    wood_b: '#b9d4a3',
    scrub_a: '#d2dfc3',
    scrub_b: '#d2dfc3',
    water: '#a8d8e6',
    sand: '#e6dcc4',
    beach: '#e6dcc4',
    glacier: '#edf3f8',
  },

  // These are not used by Tinman (uses LOOPS instead) but needed by buildConfigData fallback
  courseCoords: [],
  elevations: [],
  totalMiles: 13.1,
  totalGain: 407,
  trailsData: { type: 'FeatureCollection', features: [] },

  startCoords: [-74.46478, 44.22999],
  startLabel: 'Run Start — Tinman Beach (T2 in real life; this map is run-only)',
  finishCoords: null,
  finishLabel: null,

  courseOutlineColor: '#000',
  courseLineColor: '#111111',
  mileMarkerFillColor: '#1a1a1a',
  mileMarkerStrokeColor: '#F5C518',
  mileMarkerTextColor: '#fff',

  raceStartHour: 8,
  defaultGoalHours: 2,
  defaultGoalMins: 0,

  colors: {
    primary: '#F5C518',
  },

  toggleButtons: [],

  weather: weatherData,

  footerHtml: 'Tupper Lake Tinman · <a href="https://www.tupperlaketinman.com/" target="_blank">Register</a>\n  <br>Race map by <a href="https://falsesummitstudio.com" target="_blank">False Summit Studio</a>',
};
