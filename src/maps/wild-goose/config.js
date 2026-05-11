const path = require('path');
const fs = require('fs');

function loadJSON(file) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
}

const theme = require('../../themes/wild-goose.js');

// Loop geometry + per-loop elevation profile JSON. Loop metadata
// (display name, miles, gain, color, pattern) is driven by the theme so
// there is a single source of truth — the override.js LOOPS object is
// constructed from the theme below.
const pinkGeo       = loadJSON('data/pink.geojson');
const pinkProfile   = loadJSON('data/pink-profile.json');
const blueGeo       = loadJSON('data/blue.geojson');
const blueProfile   = loadJSON('data/blue-profile.json');
const checkeredGeo  = loadJSON('data/checkered.geojson');
const checkeredProfile = loadJSON('data/checkered-profile.json');
const trailsData    = loadJSON('data/trails.geojson');
const weatherData   = fs.existsSync(path.join(__dirname, 'data/weather.json'))
  ? loadJSON('data/weather.json') : null;

// Build the LOOPS object from the theme. The override.js renderer reads
// .geojson + .profile off each entry; pattern is preserved for the
// checkered render path.
const loopGeometry = {
  pink:      { geojson: pinkGeo,      profile: pinkProfile },
  blue:      { geojson: blueGeo,      profile: blueProfile },
  checkered: { geojson: checkeredGeo, profile: checkeredProfile },
};

const themeLoops = theme.raceFormat.loops;
const loopsJsLines = themeLoops.map(l => {
  const g = loopGeometry[l.id];
  const patternField = l.pattern ? `pattern: '${l.pattern}', ` : '';
  return `  ${l.id}: { color: '${l.color}', ${patternField}label: '${l.displayName}', abbr: '${l.displayName.charAt(0)}', miles: ${l.miles}, gain: ${l.elevationGain}, defaultDirection: '${l.defaultDirection}', geojson: null, profile: null, visible: true }`;
}).join(',\n');

// Build RACES from the theme distances — single source of truth. Each
// race's loop sequence is the theme assembly's loopId order; direction
// is captured per step so future override.js can flip CCW renders.
const racesJsLines = theme.raceFormat.distances.map(d => {
  const loops = (d.assembly || []).map(s => `'${s.loopId}'`).join(',');
  const dirs  = (d.assembly || []).map(s => `'${s.direction}'`).join(',');
  return `  '${d.id}': { name: '${d.label}', miles: ${d.runMiles}, gain: ${d.runGainFt}, hours: ${(d.runMiles / 6).toFixed(2)}, cutoff: '${d.cutoff || ''}', color: '${d.color}', loops: [${loops}], directions: [${dirs}] }`;
}).join(',\n');

const configDataJs = `
var LOOPS = {
${loopsJsLines}
};

var RACES = {
${racesJsLines}
};

var DEFAULT_DISTANCE_ID = '${theme.raceFormat.defaultDistanceId}';

var LOOP_CUES = ${JSON.stringify(
  themeLoops.reduce((acc, l) => {
    acc[l.id] = l.cues || [];
    return acc;
  }, {})
)};

var HQ = [-74.4292, 41.1905];

var pinkData      = ${JSON.stringify(Object.assign({}, pinkGeo,      { profile: pinkProfile }))};
var blueData      = ${JSON.stringify(Object.assign({}, blueGeo,      { profile: blueProfile }))};
var checkeredData = ${JSON.stringify(Object.assign({}, checkeredGeo, { profile: checkeredProfile }))};
var courseTrailsData = ${JSON.stringify(trailsData)};
var CONFIG = { mapCenter: [-74.432, 41.183], weather: ${JSON.stringify(weatherData)} };

LOOPS.pink.geojson      = pinkData.features[0];
LOOPS.pink.profile      = pinkData.profile;
LOOPS.blue.geojson      = blueData.features[0];
LOOPS.blue.profile      = blueData.profile;
LOOPS.checkered.geojson = checkeredData.features[0];
LOOPS.checkered.profile = checkeredData.profile;

// Per-loop cumulative-distance lookup keyed by coordinate index. Lets
// override.js map a mile value to a [lng,lat] on the rendered geometry
// during simulator playback.
var loopCoordDistances = {};
(function() {
  var loopIds = ['pink', 'blue', 'checkered'];
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

// Build the directions-section HTML — this is what editorial-runtime.js
// relocates from inside the map column into the .course__cues column
// next to the sticky map.
//
// Structure:
//   1. dir-race-tabs — distance picker (10K / Half / 50K / 50M / 100K / 100M)
//   2. directions-header — "Loop assembly · 50K"
//   3. assembly-strip   — chips per loop, with direction arrow
//   4. directions-list  — current loop's within-loop cues (terrain awareness)
function buildDirectionsHtml() {
  const distances = theme.raceFormat.distances;
  const defaultId = theme.raceFormat.defaultDistanceId;

  const tabsHtml = distances.map(d => {
    const active = d.id === defaultId;
    return `<button type="button" class="dir-race-tab${active ? ' active' : ''}" data-race="${d.id}" role="tab" aria-selected="${active}" onclick="selectRace('${d.id}')">
      <span class="dir-race-dot" style="background:${d.color}"></span>
      <span class="dir-race-name">${d.label}</span>
      <span class="dir-race-mi">${d.runMiles} mi</span>
    </button>`;
  }).join('\n      ');

  return `<section class="directions-section expanded" id="directionsSection">
    <nav class="dir-race-tabs" role="tablist" aria-label="Choose race distance">
      ${tabsHtml}
    </nav>

    <div class="directions-header">
      <div class="directions-titles">
        <h3 class="directions-eyebrow">Loop assembly</h3>
        <span class="directions-race" id="directionsRaceLabel">— mi · — ft</span>
      </div>
      <span class="dir-cutoff-pill" id="dirCutoffPill"></span>
    </div>

    <div class="assembly-strip" id="assemblyStrip" role="list" aria-label="Loops in order"></div>

    <p class="assembly-now" id="assemblyNow">
      <span class="assembly-now__eyebrow">Currently viewing</span>
      <span class="assembly-now__label" id="assemblyNowLabel">—</span>
    </p>

    <ol class="loop-cue-list" id="loopCueList" aria-label="Within-loop terrain notes"></ol>

    <!-- Legacy hidden stubs kept so override.js's old query selectors
         (which still exist in places) don't throw. Display:none keeps
         them out of the layout. -->
    <div class="legacy-controls" hidden aria-hidden="true">
      <div class="loop-toggles">
        <div class="loop-toggle" data-loop="pink"></div>
        <div class="loop-toggle" data-loop="blue"></div>
        <div class="loop-toggle" data-loop="checkered"></div>
      </div>
    </div>
  </section>`;
}

const mapViewHtml = `<div id="mapView" class="view active">
<div class="map-wrap">
  <div id="map"></div>
  <div class="hq-badge"><div class="dot"></div><div class="text">SQUATCH HQ</div></div>
  <div class="map-btns">
    <button class="trail-btn" id="turnsBtn" onclick="toggleTurns()">Turns</button>
    <button class="trail-btn" id="trailBtn" onclick="toggleTrails()">Park Trails</button>
    <button class="trail-btn" id="terrainBtn" onclick="toggle3D()">3D</button>
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
          <input type="number" class="goal-input" id="goalHrs" min="0" max="48" value="6" onchange="updateGoalTime()" onclick="this.select()">
          <span class="goal-colon">:</span>
          <input type="number" class="goal-input" id="goalMins" min="0" max="59" value="30" onchange="updateGoalTime()" onclick="this.select()">
        </div>
        <div class="goal-pace" id="goalPace">Avg pace: <strong>— /mi</strong></div>
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
        <div class="sim-stat"><div class="val" id="statDist">0.0</div><div class="label">Miles</div></div>
        <div class="sim-stat"><div class="val" id="statEle">0</div><div class="label">Elevation</div></div>
        <div class="sim-stat"><div class="val" id="statGain">0</div><div class="label">Gain</div></div>
        <div class="sim-stat"><div class="val" id="statTotalGain">0</div><div class="label">Total Gain</div></div>
        <div class="sim-stat"><div class="val" id="statGrade">0%</div><div class="label">Grade</div></div>
        <div class="sim-stat"><div class="val" id="statPct">0%</div><div class="label">Complete</div></div>
      </div>

      <div class="loop-progress">
        <h4>Loop Progress</h4>
        <div id="loopTracker"></div>
      </div>
    </div>

    <div class="sim-visual">
      <div class="course-map-wrap">
        <canvas id="courseMapCanvas"></canvas>
        <div class="runner-info">
          <div class="runner-ele" id="runnerDist">Mile 0.0</div>
          <div class="runner-meta" id="runnerMeta">— ft · Starting</div>
          <div class="loop-pill" id="loopPill">—</div>
        </div>
      </div>
      <div class="terrain-wrap">
        <canvas id="simTerrain"></canvas>
      </div>
    </div>
  </div>
</div>`;

// Build a single-aid-station card + a no-aid-on-course safety strip.
// This block is rendered into `cueHtml` so the editorial template
// renders it after the directions section relocates next to the map.
const aidCardHtml = `<aside class="hq-aid-card" aria-labelledby="hqAidTitle">
  <div class="hq-aid-card__head">
    <h2 class="hq-aid-card__title" id="hqAidTitle">Squatch HQ</h2>
    <p class="hq-aid-card__sub">The festival's only aid station · open 36 hours continuously</p>
  </div>
  <dl class="hq-aid-card__grid">
    <div><dt>Hours</dt><dd>Sat 7:00 AM → Sun 7:00 PM</dd></div>
    <div><dt>Stocked</dt><dd>Water · Skratch · hot food (vegan + GF) · snacks</dd></div>
    <div><dt>Medical</dt><dd>EMT 7am–7pm · ambulance overnight · AED · first-aid kit (incl. menstrual products + wipes)</dd></div>
    <div><dt>Crew</dt><dd>Yes · Squatch HQ only</dd></div>
    <div><dt>Pacers</dt><dd>Allowed after sunset · pre-registration required</dd></div>
    <div><dt>The Jackalope Tent</dt><dd>Quiet / sensory decompression · breastfeeding-friendly</dd></div>
  </dl>
</aside>
<p class="no-aid-strip" role="alert">
  <span class="no-aid-strip__icon" aria-hidden="true">▲</span>
  <strong>No aid on course.</strong> Carry water and nutrition between loops. Plan your refills at Squatch HQ before starting each loop.
</p>`;

// Weather Intelligence panel. weather-ui.js (shared) populates these
// IDs from CONFIG.weather at runtime; the editorial layout doesn't
// reserve a built-in weather slot, so we render the panel into the
// course__cues column below the aid card. Wrapped in .map-weather-layout
// + .map-main only to satisfy the shared weather.css selectors that
// expect those parent classes for sizing/breakpoint logic.
const weatherPanelHtml = weatherData ? `<div class="map-weather-layout">
  <div class="map-main"></div>
  <aside class="weather-panel" id="weatherPanel" aria-labelledby="weatherPanelTitle">
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
  </aside>
</div>` : '';

module.exports = {
  slug: 'wild-goose',
  theme,
  title: 'Wild Goose Trail Festival — Course Map · False Summit Studio',
  raceName: 'WILD GOOSE TRAIL FESTIVAL',
  themeColor: theme.palette.paper,
  fontFamily: theme.type.bodyStack,
  subtitle: 'September 18–20, 2026 · <a href="' + theme.identity.hostUrl + '" target="_blank">sassquadtrailrunning.com</a>',

  // Editorial chrome consumes --paper / --ink / --race-brand / --font-*
  // from the theme directly (build.js merges them in). The variables
  // below are scoped to the *interactive map view* and simulator, which
  // still consume the legacy variable names — we shadow them with theme
  // tokens so the map column reads as paper, not stock white.
  cssVars: {
    '--paper':         theme.palette.paper,
    '--ink':           theme.palette.raceInk,
    '--race-brand':    theme.palette.raceBrand,
    '--surface-warm':  theme.palette.surfaceWarm,
    '--route-color':   theme.palette.routeColor,
    '--aid-color':     theme.palette.aidStation,
    '--hazard-color':  theme.palette.hazard,
    '--font-display':  theme.type.displayStack,
    '--font-body':     theme.type.bodyStack,
    '--font-micro':    theme.type.microStack,

    // Legacy aliases used by shared CSS modules. Mapped onto theme.
    '--bg':            theme.palette.paper,
    '--bg-alt':        theme.palette.surfaceWarm,
    '--bg-card':       theme.palette.paper,
    '--text':          theme.palette.raceInk,
    '--text-secondary': '#52503f',
    '--text-muted':    '#807d6b',
    '--border':        '#d8cfb8',
    '--shadow':        '0 2px 6px rgba(31,29,24,0.08)',
    '--radius':        '4px',
    '--primary':       theme.palette.raceBrand,
    '--primary-dark':  '#23501f',
    '--accent':        theme.palette.aidStation,
    '--course':        theme.palette.raceInk,
    '--font-family':   theme.type.bodyStack,
    '--heading-family': theme.type.displayStack,

    // Loop colors as CSS vars for chip strip + assembly dots.
    '--loop-pink':      '#E7338C',
    '--loop-blue':      '#1E66D0',
    '--loop-checkered': '#1f1d18',

    // Simulator (dark canvas reskin from generic Inter dark → editorial register)
    '--sim-bg':        '#1c1a14',
    '--runner-text':   theme.palette.paper,
    '--runner-text-shadow': '0 2px 8px rgba(0,0,0,0.5)',
    '--runner-meta':   'rgba(244,238,224,0.7)',
    '--scrub-handle-shadow': '0 2px 6px rgba(47,107,42,0.45)',
    '--popup-bg':      theme.palette.paper,
  },

  configDataJs: configDataJs,
  skipSharedJs: true,

  overrideJs: 'override.js',
  overrideCss: 'override.css',

  mapViewHtml,
  simViewHtml,

  // The cueHtml slot in race-shell.html sits inside `.course__cues`. The
  // editorial-runtime.js further relocates the `.directions-section`
  // built inside mapViewHtml into the same column, AFTER this aid card
  // block — so the column reads: Squatch HQ aid → no-aid strip → race
  // tabs → assembly strip → within-loop cues → weather panel.
  cueHtml: aidCardHtml + '\n' + weatherPanelHtml,

  // Map settings
  mapCenter: [-74.432, 41.183],
  mapZoom: 12.5,
  basemapFlavor: {
    background: '#c5dcb4',
    earth: '#c5dcb4',
    park_a: '#a5cc8e',
    park_b: '#a5cc8e',
    wood_a: '#8ecc7a',
    wood_b: '#8ecc7a',
    scrub_a: '#a3d487',
    scrub_b: '#a3d487',
    water: '#80deea',
    sand: '#d6e28d',
    beach: '#d6e28d',
    glacier: '#edf3f8',
  },

  // Multi-loop maps build their own LOOPS object; these fallback fields
  // exist because buildConfigData() reads them when configDataJs is absent.
  // Wild Goose ships configDataJs so they are never inlined — but the
  // build pipeline still spreads them, so we keep harmless placeholders.
  courseCoords: [],
  elevations: [],
  totalMiles: 100.25,
  totalGain: 11239,
  trailsData,

  startCoords: [-74.4292, 41.1905],
  startLabel: 'Squatch HQ — Start / Finish · Festival aid station',
  finishCoords: null,
  finishLabel: null,

  courseOutlineColor: '#000',
  courseLineColor: theme.palette.raceInk,
  mileMarkerFillColor: '#1f1d18',
  mileMarkerStrokeColor: theme.palette.raceBrand,
  mileMarkerTextColor: theme.palette.paper,

  raceStartHour: 7,
  defaultGoalHours: 6,
  defaultGoalMins: 30,

  colors: {
    primary: theme.palette.raceBrand,
  },

  toggleButtons: [],

  weather: weatherData,

  footerHtml: 'Wild Goose Trail Festival · <a href="' + theme.identity.hostUrl + '" target="_blank">Register on Sassquad</a>\n  <br>Race map created by <a href="https://falsesummitstudio.com" target="_blank">False Summit Studio</a>',
};
