const path = require('path');
const fs = require('fs');

function loadJSON(file) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
}

// Load loop data — 3 segments:
// loop1: the shared portion of Loop 1 (same trail as standard, orange)
// escondido: the Escondido Trail extension on Loop 1 only (blue)
// standard: Loops 2-5 (orange)
const loop1Geo = loadJSON('data/loop1-main.geojson');
const loop1Profile = loadJSON('data/loop1-main-profile.json');
const escondidoGeo = loadJSON('data/escondido.geojson');
const escondidoProfile = loadJSON('data/escondido-profile.json');
const standardGeo = loadJSON('data/standard.geojson');
const standardProfile = loadJSON('data/standard-profile.json');
const trailsData = loadJSON('data/trails.geojson');

const configDataJs = `
var LOOPS = {
  loop1: { color: '#FF8C00', label: 'Loop 1', abbr: 'L1', miles: 15.71, gain: 1188, geojson: null, profile: null, visible: true },
  escondido: { color: '#00AEEF', label: 'Escondido', abbr: 'E', miles: 6.16, gain: 453, geojson: null, profile: null, visible: true },
  standard: { color: '#FF8C00', label: 'Standard Loop', abbr: 'SL', miles: 19.45, gain: 1506, geojson: null, profile: null, visible: true }
};

var RACES = {
  all: { name: 'All Loops', miles: 100, hours: 30, loops: ['loop1','escondido','standard','standard','standard','standard'] },
  '100m': { name: '100 Mile', miles: 100, hours: 30, loops: ['loop1','escondido','standard','standard','standard','standard'] },
  '100k': { name: '100 KM', miles: 61.2, hours: 29, loops: ['loop1','escondido','standard','standard'] },
  '31k': { name: '31K (Jackass)', miles: 19.45, hours: 8.5, loops: ['standard'] }
};

var HQ = [-111.70167, 33.67288];

var loop1Data = ${JSON.stringify(Object.assign({}, loop1Geo, { profile: loop1Profile }))};
var escondidoData = ${JSON.stringify(Object.assign({}, escondidoGeo, { profile: escondidoProfile }))};
var standardData = ${JSON.stringify(Object.assign({}, standardGeo, { profile: standardProfile }))};
var courseTrailsData = ${JSON.stringify(trailsData)};

LOOPS.loop1.geojson = loop1Data.features[0];
LOOPS.loop1.profile = loop1Data.profile;
LOOPS.escondido.geojson = escondidoData.features[0];
LOOPS.escondido.profile = escondidoData.profile;
LOOPS.standard.geojson = standardData.features[0];
LOOPS.standard.profile = standardData.profile;

// Pre-compute cumulative distances for each loop's coordinates
var loopCoordDistances = {};
(function() {
  var loopIds = ['loop1', 'escondido', 'standard'];
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

var AID_STATIONS = [
  { name: 'Coyote Camp', mile: 4, services: 'Water, GU Roctane, Gatorade, fruit, snacks' },
  { name: 'Jackass Junction', mile: 10.5, services: 'Water, GU Roctane, Gatorade, fruit, snacks, soup \\u00b7 Drop bags' },
  { name: 'Rattlesnake Ranch', mile: 15.7, services: 'Water, GU Roctane, Gatorade, fruit, snacks' }
];

var COURSE_PHOTOS = [
  { name: 'Desert Trail', coords: [-111.729, 33.678], url: 'https://i0.wp.com/www.aravaiparunning.com/avr/wp-content/uploads/JE_JJ24-2906.jpg?w=600', caption: 'Sonoran Desert singletrack through McDowell Mountain Regional Park' },
  { name: 'Pemberton Trail', coords: [-111.763, 33.671], url: 'https://i0.wp.com/www.aravaiparunning.com/avr/wp-content/uploads/HS-24JJ-3671.jpg?w=600', caption: 'Rocky trail section with saguaro cacti and desert vistas' },
  { name: 'Trail Running', coords: [-111.783, 33.701], url: 'https://i0.wp.com/www.aravaiparunning.com/avr/wp-content/uploads/ScottRokis_Javelina24_SRR30053-2.jpg?w=600', caption: 'Runner on the Pemberton Trail near Jackass Junction' },
  { name: 'Desert Landscape', coords: [-111.768, 33.720], url: 'https://i0.wp.com/www.aravaiparunning.com/avr/wp-content/uploads/JE_JJ24-3881.jpg?w=600', caption: 'Winding desert trail with McDowell Mountains in the background' },
  { name: 'Night Running', coords: [-111.706, 33.682], url: 'https://i0.wp.com/www.aravaiparunning.com/avr/wp-content/uploads/HStern_JJ100-0601-2.jpg?w=600', caption: 'Night running through the desert with headlamps' },
  { name: 'Jackass Junction Party', coords: [-111.787, 33.716], url: 'https://i0.wp.com/www.aravaiparunning.com/avr/wp-content/uploads/JE-JavelinaJundred_2023-5329.jpg?w=600', caption: 'The legendary Jackass Junction aid station party' }
];

var CUTOFFS = [
  { mile: 80.5, time: '24h', label: 'Must start Loop 5 (6:00 AM Sunday)' }
];
`;

module.exports = {
  slug: 'javelina-jundred',
  title: 'Javelina Jundred \u2014 Course Map',
  raceName: 'JAVELINA JUNDRED',
  themeColor: '#1a3a4a',
  googleFontsUrl: '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Lato:wght@400;500;700;900&display=swap" rel="stylesheet">',
  fontFamily: "'Lato', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
  subtitle: '<a href="https://www.aravaiparunning.com/javelina/" target="_blank">aravaiparunning.com</a>',

  cssVars: {
    '--orange': '#FF8C00',
    '--orange-dark': '#E67A00',
    '--cyan': '#00CED1',
    '--cyan-dark': '#00B3B5',
    '--blue': '#00AEEF',
    '--yellow': '#FDCF00',
    '--navy': '#1a3a4a',
    '--bg': '#0d1b2a',
    '--bg-alt': '#132536',
    '--bg-card': '#162b3d',
    '--text': '#e8e8e8',
    '--text-secondary': '#a0b4c0',
    '--text-muted': '#6b8899',
    '--border': '#1e3a4e',
    '--shadow': '0 2px 8px rgba(0,0,0,0.3)',
    '--radius': '10px',
    '--primary': '#FF8C00',
    '--primary-dark': '#E67A00',
    '--accent': '#00AEEF',
    '--course': '#FF8C00',
    '--font-family': "'Lato', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    '--sim-bg': '#0d1b2a',
    '--runner-text': '#fff',
    '--runner-text-shadow': '0 2px 8px rgba(0,0,0,0.5)',
    '--runner-meta': 'rgba(255,255,255,0.7)',
    '--scrub-handle-shadow': '0 2px 6px rgba(255,140,0,0.4)',
    '--popup-bg': '#132536',
  },

  configDataJs: configDataJs,
  skipSharedJs: true,
  overrideJs: 'override.js',
  overrideCss: 'override.css',

  mapViewHtml: `<div id="mapView" class="view active">
  <div class="map-wrap">
    <div id="map"></div>
    <div class="hq-badge"><div class="dot"></div><div class="text">JAVELINA JEADQUARTERS</div></div>
    <div class="park-label">McDowell Mountain Regional Park</div>
    <div class="map-btns">
      <button class="trail-btn" id="aidBtn" onclick="toggleAidStations()">Aid Stations</button>
      <button class="trail-btn" id="trailBtn" onclick="toggleTrails()">Park Trails</button>
      <button class="trail-btn" id="photosBtn" onclick="togglePhotos()">Photos</button>
      <button class="trail-btn" id="terrainBtn" onclick="toggle3D()">3D</button>
    </div>
  </div>

  <div class="controls">
    <div>
      <div class="section-label">Course Loops</div>
      <div class="loop-toggles">
        <div class="loop-toggle active" data-loop="loop1" style="--loop-color:#FF8C00" onclick="toggleLoop('loop1')">
          <div class="swatch" style="background:#FF8C00"></div>
          <div class="info"><div class="name">Loop 1 (Shared)</div><div class="stats">15.71 mi \u00b7 1,188'</div></div>
        </div>
        <div class="loop-toggle active" data-loop="escondido" style="--loop-color:#00AEEF" onclick="toggleLoop('escondido')">
          <div class="swatch" style="background:#00AEEF"></div>
          <div class="info"><div class="name">Escondido Extension</div><div class="stats">5.95 mi \u00b7 433'</div></div>
        </div>
        <div class="loop-toggle active" data-loop="standard" style="--loop-color:#FF8C00" onclick="toggleLoop('standard')">
          <div class="swatch" style="background:#FF8C00"></div>
          <div class="info"><div class="name">Standard Loop (2\u20135)</div><div class="stats">19.45 mi \u00b7 1,506'</div></div>
        </div>
      </div>
    </div>
  </div>

  <div class="course-description">
    <div class="desc-content">
      <p><strong>The 100-Mile Party Run.</strong> Five clockwise loops through McDowell Mountain Regional Park in the Sonoran Desert. Loop 1 includes the <span style="color:#00AEEF;font-weight:700">Escondido Trail</span> extension (22.3 mi total), while Loops 2\u20135 follow the standard 19.45-mile circuit via the Pemberton, Shallmo Wash, and Cinch Trails.</p>
      <p>Aid stations at Coyote Camp (mi 4), Jackass Junction (mi 10.5), and Rattlesnake Ranch (mi 15.7). <strong>Cutoff: 6:00 AM Sunday</strong> \u2014 must start Loop 5 by 24 hours.</p>
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
          <input type="number" class="goal-input" id="goalHrs" min="0" max="48" value="30" onchange="updateGoalTime()" onclick="this.select()">
          <span class="goal-colon">:</span>
          <input type="number" class="goal-input" id="goalMins" min="0" max="59" value="0" onchange="updateGoalTime()" onclick="this.select()">
        </div>
        <div class="goal-pace" id="goalPace">Avg pace: <strong>18:00 /mi</strong></div>
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
        <div class="clock-time" id="clockTime">6:00 AM</div>
        <div class="clock-label">Current Time (Wave 1 starts 6:00 AM Sat)</div>
        <div class="clock-finish" id="clockFinish" style="margin-top:8px;font-size:0.8rem;color:var(--text-secondary)">Finish: <strong id="finishTime" style="color:var(--orange)">12:00 PM Sun</strong></div>
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
          <div class="runner-meta" id="runnerMeta">1,660 ft \u00b7 Starting</div>
          <div class="loop-pill" id="loopPill" style="color:#FF8C00;border-color:#FF8C00">Loop 1</div>
        </div>
      </div>
      <div class="terrain-wrap">
        <canvas id="simTerrain"></canvas>
      </div>
    </div>
  </div>
</div>`,

  mapCenter: [-111.74, 33.695],
  mapZoom: 12.2,
  basemapFlavor: {
    background: '#e8dcc8',
    earth: '#e8dcc8',
    park_a: '#d9ccb0',
    park_b: '#d9ccb0',
    wood_a: '#c8bb9a',
    wood_b: '#c8bb9a',
    scrub_a: '#d4c7a8',
    scrub_b: '#d4c7a8',
    water: '#80c4d6',
    sand: '#e0d4b0',
    beach: '#e0d4b0',
    glacier: '#edf3f8',
  },

  courseCoords: [],
  elevations: [],
  totalMiles: 100,
  totalGain: 6296,
  trailsData: trailsData,

  startCoords: [-111.70167, 33.67288],
  startLabel: 'Javelina Jeadquarters - Start/Finish',
  finishCoords: null,
  finishLabel: null,

  courseOutlineColor: '#000',
  courseLineColor: '#FF8C00',
  mileMarkerFillColor: '#1a3a4a',
  mileMarkerStrokeColor: '#FF8C00',
  mileMarkerTextColor: '#fff',

  raceStartHour: 6,
  defaultGoalHours: 30,
  defaultGoalMins: 0,

  colors: {
    primary: '#FF8C00',
    accent: '#00AEEF',
  },

  toggleButtons: [],

  footerHtml: 'Javelina Jundred \u00b7 <a href="https://www.aravaiparunning.com/javelina/" target="_blank">aravaiparunning.com</a>\n  <br>Race map by <a href="https://falsesummitstudio.com" target="_blank">False Summit Studio</a>',
};
