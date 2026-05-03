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

`;

module.exports = {
  slug: 'tinman',
  title: 'Tupper Lake Tinman — Run Course Map',
  raceName: 'TUPPER LAKE TINMAN',
  themeColor: '#1a1a1a',
  googleFontsUrl: '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">',
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
  subtitle: 'June 27, 2026 · 44th Anniversary · <a href="https://www.tupperlaketinman.com/" target="_blank">tupperlaketinman.com</a>',

  cssVars: {
    '--primary': '#F5C518',
    '--primary-dark': '#D4A810',
    '--accent': '#1a1a1a',
    '--bg': '#ffffff',
    '--bg-card': '#ffffff',
    '--bg-alt': '#f2f2f2',
    '--text': '#1a1a1a',
    '--text-secondary': '#444',
    '--text-muted': '#7a7a7a',
    '--border': '#e1e1e1',
    '--course': '#111111',
    '--shadow': '0 2px 8px rgba(0,0,0,0.08)',
    '--radius': '10px',
    '--font-family': "'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    '--heading-family': "'Oswald', 'Inter', system-ui, sans-serif",
    '--sprint-color': '#F5C518',
    '--olympic-color': '#2E7D32',
    '--tinman-color': '#C8102E',
    '--sim-bg': '#1a1a1a',
    '--runner-text': '#fff',
    '--runner-text-shadow': '0 2px 8px rgba(0,0,0,0.5)',
    '--runner-meta': 'rgba(255,255,255,0.7)',
    '--scrub-handle-shadow': '0 2px 6px rgba(245,197,24,0.4)',
    '--popup-bg': '#fff',
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
    <div class="hq-badge"><div class="dot"></div><div class="text">BIKE FINISH / RUN START</div></div>
    <div class="map-btns">
      <button class="trail-btn" id="aidBtn" onclick="toggleAid()">Aid Stations</button>
      <button class="trail-btn" id="terrainBtn" onclick="toggle3D()">3D</button>
    </div>
    <div class="course-legend" aria-label="Course direction legend">
      <div class="legend-row"><span class="legend-line legend-line-out"></span><span class="legend-label">Outbound</span></div>
      <div class="legend-row"><span class="legend-line legend-line-back"></span><span class="legend-label">Return</span></div>
      <div class="legend-row"><span class="legend-icon legend-icon-turn"><svg viewBox="0 0 16 16" width="12" height="12"><circle cx="8" cy="8" r="6.5" fill="currentColor"/><path d="M5.5 9.5V6a2.5 2.5 0 0 1 5 0v4M4 8l1.5 1.5 1.5-1.5" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span class="legend-label">Turnaround</span></div>
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
        <span class="directions-count" id="directionsCount"></span>
        <svg class="directions-chevron" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 5l4 4 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <div class="dir-mode-toggle" role="tablist" aria-label="Directions interaction mode">
        <button type="button" class="dir-mode-btn active" data-mode="click" role="tab" aria-selected="true" onclick="setDirMode('click')">
          <svg viewBox="0 0 14 14" width="11" height="11" aria-hidden="true"><path d="M5 2v6l2-2 2 4 1.5-.6L8.5 6H11L5 2z" fill="currentColor"/></svg>
          <span>Click</span>
        </button>
        <button type="button" class="dir-mode-btn" data-mode="scrub" role="tab" aria-selected="false" onclick="setDirMode('scrub')">
          <svg viewBox="0 0 14 14" width="11" height="11" aria-hidden="true"><path d="M2 7h10M2 7l3-3M2 7l3 3M12 7l-3-3M12 7l-3 3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span>Scrub</span>
        </button>
      </div>
    </div>
    <ol class="directions-list" id="directionsList"></ol>
  </section>

  <div class="controls">
    <div>
      <div class="section-label">Run Courses</div>
      <div class="loop-toggles">
        <div class="loop-toggle" data-loop="sprint" style="--loop-color:#F5C518" onclick="toggleLoop('sprint')">
          <div class="swatch" style="background:#F5C518"></div>
          <div class="info"><div class="name">Sprint Run</div><div class="stats">3.1 mi &middot; 193'</div></div>
        </div>
        <div class="loop-toggle" data-loop="olympic" style="--loop-color:#2E7D32" onclick="toggleLoop('olympic')">
          <div class="swatch" style="background:#2E7D32"></div>
          <div class="info"><div class="name">Olympic Run</div><div class="stats">6.2 mi &middot; 218'</div></div>
        </div>
        <div class="loop-toggle active" data-loop="tinman" style="--loop-color:#C8102E" onclick="toggleLoop('tinman')">
          <div class="swatch" style="background:#C8102E"></div>
          <div class="info"><div class="name">Tinman Run</div><div class="stats">13.1 mi &middot; 407'</div></div>
        </div>
      </div>
    </div>
  </div>

  <section class="profile-section">
    <div class="profile-header">
      <h3 id="profileTitle">Elevation Profile</h3>
      <div class="profile-stats" id="profileStats"></div>
    </div>
    <canvas id="profileCanvas"></canvas>
  </section>

  <section class="cards-section">
    <h3>Select Race Distance</h3>
    <div class="race-cards" id="raceCards"></div>
  </section>

  <section class="course-info">
    <h3>About the Run Course</h3>
    <div class="course-description">
      <p>The <strong>Tupper Lake Tinman</strong> is a beloved Adirondack triathlon now in its <strong>44th year</strong>. The flat, scenic run course winds through the village of Tupper Lake, NY, passing the History Museum, Civic Center, and the historic Train Station before turning around at Little Wolf Pond. Distances mirror the swim/bike: <strong>Sprint</strong> (0.5/12.6/3.1), <strong>Olympic</strong> (0.93/26/6.2), and the full <strong>Tinman</strong> (1.2/56/13.1). Rolling swim start at 8:00 AM with self-seeding by predicted swim time.</p>
      <p>This map shows the <strong>run portions only</strong>. Eight aid stations along the Tinman course offer water, Powerade, Coca-Cola, oranges, pretzels, and gels.</p>
    </div>
  </section>
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
  startLabel: 'Bike Finish / Run Start (T2) - Tinman Beach',
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
