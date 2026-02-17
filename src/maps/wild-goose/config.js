const path = require('path');
const fs = require('fs');

function loadJSON(file) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
}

// Load loop data
const pinkGeo = loadJSON('data/pink.geojson');
const pinkProfile = loadJSON('data/pink-profile.json');
const blueGeo = loadJSON('data/blue.geojson');
const blueProfile = loadJSON('data/blue-profile.json');
const checkeredGeo = loadJSON('data/checkered.geojson');
const checkeredProfile = loadJSON('data/checkered-profile.json');
const trailsData = loadJSON('data/trails.geojson');

// Build the custom config data JS block (replaces standard CONFIG block)
// Wild Goose uses LOOPS, RACES, HQ instead of CONFIG.courseCoords
const configDataJs = `
var LOOPS = {
  pink: { color: '#E834EC', label: 'Pink', abbr: 'P', miles: 7.75, gain: 840, geojson: null, profile: null, visible: true },
  blue: { color: '#0479FF', label: 'Blue', abbr: 'B', miles: 6.0, gain: 600, geojson: null, profile: null, visible: true },
  checkered: { color: '#333', pattern: 'checkered', label: 'Checkered', abbr: 'C', miles: 4.75, gain: 479, geojson: null, profile: null, visible: true }
};

var RACES = {
  all: { name: 'All Loops', miles: 18.5, hours: 3.5, loops: ['pink','blue','checkered'] },
  '10k': { name: '10K', miles: 6, hours: 1, loops: ['blue'] },
  half: { name: 'Half Marathon', miles: 13.75, hours: 2.5, loops: ['blue','pink'] },
  '30k': { name: '30K', miles: 18.5, hours: 3.5, loops: ['pink','checkered','blue'] },
  '50k': { name: '50K', miles: 31, hours: 6.5, loops: ['pink','checkered','blue','pink','checkered'] },
  '50m': { name: '50 Miler', miles: 50.75, hours: 12, loops: ['checkered','blue','pink','checkered','blue','pink','blue','pink'] },
  '100k': { name: '100K', miles: 62, hours: 16, loops: ['pink','checkered','blue','pink','checkered','pink','checkered','blue','pink','checkered'] },
  '100m': { name: '100 Miler', miles: 100.25, hours: 30, loops: ['pink','checkered','blue','pink','checkered','blue','pink','checkered','blue','pink','checkered','blue','pink','checkered','blue','pink'] }
};

var HQ = [-74.4292, 41.1905];

var pinkData = ${JSON.stringify(Object.assign({}, pinkGeo, { profile: pinkProfile }))};
var blueData = ${JSON.stringify(Object.assign({}, blueGeo, { profile: blueProfile }))};
var checkeredData = ${JSON.stringify(Object.assign({}, checkeredGeo, { profile: checkeredProfile }))};
var courseTrailsData = ${JSON.stringify(trailsData)};

LOOPS.pink.geojson = pinkData.features[0];
LOOPS.pink.profile = pinkData.profile;
LOOPS.blue.geojson = blueData.features[0];
LOOPS.blue.profile = blueData.profile;
LOOPS.checkered.geojson = checkeredData.features[0];
LOOPS.checkered.profile = checkeredData.profile;

// Pre-compute cumulative distances for each loop's coordinates
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

module.exports = {
  slug: 'wild-goose',
  title: 'Wild Goose Trail Festival — Course Map',
  raceName: 'WILD GOOSE TRAIL FESTIVAL',
  themeColor: '#ffffff',
  googleFontsUrl: '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">',
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
  subtitle: '<a href="https://www.sassquadtrailrunning.com/wildgoose" target="_blank">sassquadtrailrunning.com</a>',

  cssVars: {
    '--green': '#5CA921',
    '--green-dark': '#4a8a1b',
    '--orange': '#ff8044',
    '--bg': '#ffffff',
    '--bg-alt': '#f7f7f7',
    '--bg-card': '#f7f7f7',
    '--text': '#1a1a1a',
    '--text-secondary': '#555',
    '--text-muted': '#888',
    '--border': '#e5e5e5',
    '--pink': '#E834EC',
    '--blue': '#0479FF',
    '--checkered': 'repeating-conic-gradient(#000 0% 25%, #fff 0% 50%) 50%/8px 8px',
    '--shadow': '0 2px 8px rgba(0,0,0,0.08)',
    '--radius': '10px',
    '--primary': '#5CA921',
    '--primary-dark': '#4a8a1b',
    '--accent': '#4a8a1b',
    '--course': '#111111',
    '--font-family': "'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    '--sim-bg': '#ffffff',
    '--runner-text': '#fff',
    '--runner-text-shadow': '0 2px 8px rgba(0,0,0,0.5)',
    '--runner-meta': 'rgba(255,255,255,0.7)',
    '--scrub-handle-shadow': '0 2px 6px rgba(92,169,33,0.4)',
    '--popup-bg': 'var(--bg)',
  },

  // Use custom config data block (LOOPS/RACES instead of CONFIG.courseCoords)
  configDataJs: configDataJs,
  // Skip shared JS — override.js provides all functionality
  skipSharedJs: true,

  // Override JS and CSS files
  overrideJs: 'override.js',
  overrideCss: 'override.css',

  // Custom HTML sections (replace standard templates)
  mapViewHtml: `<div id="mapView" class="view active">
  <div class="map-wrap">
    <div id="map"></div>
    <div class="hq-badge"><div class="dot"></div><div class="text">SQUATCH HQ</div></div>
    <div class="map-btns">
      <button class="trail-btn" id="turnsBtn" onclick="toggleTurns()">📍 Turns</button>
      <button class="trail-btn" id="trailBtn" onclick="toggleTrails()">🥾 Park Trails</button>
      <button class="trail-btn" id="terrainBtn" onclick="toggle3D()">3D</button>
    </div>
  </div>

  <div class="controls">
    <div>
      <div class="section-label">Course Loops</div>
      <div class="loop-toggles">
        <div class="loop-toggle active" data-loop="pink" style="--loop-color:#E834EC" onclick="toggleLoop('pink')">
          <div class="swatch" style="background:#E834EC"></div>
          <div class="info"><div class="name">Pink</div><div class="stats">7.75 mi · 840'</div></div>
        </div>
        <div class="loop-toggle active" data-loop="blue" style="--loop-color:#0479FF" onclick="toggleLoop('blue')">
          <div class="swatch" style="background:#0479FF"></div>
          <div class="info"><div class="name">Blue</div><div class="stats">6.0 mi · 600'</div></div>
        </div>
        <div class="loop-toggle active" data-loop="checkered" style="--loop-color:#333" onclick="toggleLoop('checkered')">
          <div class="swatch checkered"></div>
          <div class="info"><div class="name">Checkered</div><div class="stats">4.75 mi · 479'</div></div>
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
</div>`,

  simViewHtml: `<div id="simView" class="view">
  <div class="sim-container">
    <div class="sim-panel">
      <div class="sim-races" id="simRaces"></div>

      <div class="goal-time-bar">
        <span class="goal-label">Goal Time</span>
        <div class="goal-inputs">
          <input type="number" class="goal-input" id="goalHrs" min="0" max="48" value="2" onchange="updateGoalTime()" onclick="this.select()">
          <span class="goal-colon">:</span>
          <input type="number" class="goal-input" id="goalMins" min="0" max="59" value="30" onchange="updateGoalTime()" onclick="this.select()">
        </div>
        <div class="goal-pace" id="goalPace">Avg pace: <strong>10:54 /mi</strong></div>
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
        <div class="clock-time" id="clockTime">5:00 AM</div>
        <div class="clock-label">Current Time (Race starts 5:00 AM)</div>
        <div class="clock-finish" id="clockFinish" style="margin-top:8px;font-size:0.8rem;color:var(--text-secondary)">Finish: <strong id="finishTime" style="color:var(--green)">7:30 AM</strong></div>
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
          <div class="runner-meta" id="runnerMeta">1,200 ft · Starting</div>
          <div class="loop-pill" id="loopPill" style="color:#E834EC;border-color:#E834EC">Pink</div>
        </div>
      </div>
      <div class="terrain-wrap">
        <canvas id="simTerrain"></canvas>
      </div>
    </div>
  </div>
</div>`,

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

  // These are not used by Wild Goose (uses LOOPS instead) but needed by buildConfigData fallback
  courseCoords: [],
  elevations: [],
  totalMiles: 18.5,
  totalGain: 1919,
  trailsData: trailsData,

  startCoords: [-74.4292, 41.1905],
  startLabel: 'SQUATCH HQ - Start/Finish',
  finishCoords: null,
  finishLabel: null,

  courseOutlineColor: '#000',
  courseLineColor: '#333',
  mileMarkerFillColor: '#222',
  mileMarkerStrokeColor: '#5CA921',
  mileMarkerTextColor: '#fff',

  raceStartHour: 5,
  defaultGoalHours: 2,
  defaultGoalMins: 30,

  colors: {
    primary: '#5CA921',
  },

  // Not used but must be present
  toggleButtons: [],

  footerHtml: 'Wild Goose Trail Festival · <a href="https://www.sassquadtrailrunning.com/wildgoose" target="_blank">Register Now</a>\n  <br>Race map created by <a href="https://falsesummitstudio.com" target="_blank">False Summit Studio</a>',
};
