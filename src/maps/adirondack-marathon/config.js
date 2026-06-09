// Adirondack Marathon & Half Marathon — config.js
//
// Plumbs the theme + per-distance geojson data into the runtime CONFIG the
// override.js renderer reads. The marathon is one full clockwise loop of
// Schroon Lake (26.8 mi); the half marathon is its exact back half (14.3
// mi), starting at the Hamlet of Adirondack and finishing with the
// marathon at the Schroon Public Beach. Sunday, September 27, 2026.
//
// Pattern borrowed from src/maps/pocantico-hills/config.js — two-distance
// loop selector, single-loop assembly per distance, US miles. The one ADK
// wrinkle: the half is the marathon's *back* half, so it starts at a
// different point than the marathon. Aid stations are positioned by mile
// on the currently-selected loop, so each station carries a per-loop mile
// (`mileByLoop`) — the half's miles are the marathon miles minus the
// constant offset between the two course lengths.

const path = require('path');
const fs = require('fs');

function loadJSON(file) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
}

const theme = require('../../themes/adirondack-marathon.js');

const marathonGeo     = loadJSON('data/marathon.geojson');
const marathonProfile = loadJSON('data/marathon-profile.json');
const halfGeo         = loadJSON('data/half-marathon.geojson');
const halfProfile     = loadJSON('data/half-marathon-profile.json');

const weatherData = fs.existsSync(path.join(__dirname, 'data/weather.json'))
  ? loadJSON('data/weather.json') : null;

// The course geometry is OSM-routed (faithful road shape, but the road
// centerline runs ~3% long vs the USATF-certified distance). We DISPLAY
// the certified distance, so rescale the elevation-profile x-axis
// (cumulative miles) to the certified course length — the chips, mile
// markers, and aid stations all run on theme.miles, so the profile axis
// has to match. Elevation values are untouched.
function rescaleProfileMiles(profile, targetMi) {
  if (!profile.length || !targetMi) return profile;
  const maxD = profile.reduce((m, p) => Math.max(m, p.d || 0), 0);
  const factor = maxD > 0 ? targetMi / maxD : 1;
  return profile.map(p => ({ d: +(p.d * factor).toFixed(3), e: p.e }));
}
const marathonProfileScaled = rescaleProfileMiles(
  marathonProfile, theme.raceFormat.loops.find(l => l.id === 'marathon').miles);
const halfProfileScaled = rescaleProfileMiles(
  halfProfile, theme.raceFormat.loops.find(l => l.id === 'half-marathon').miles);

// No turn-by-turn pipeline for this road race — the directions panel reads
// the curated cues from the theme. If <id>-turns.geojson files are added
// later, they are picked up here automatically.
function loadLoopTurns(loopId) {
  const file = path.join(__dirname, `data/${loopId}-turns.geojson`);
  if (!fs.existsSync(file)) return [];
  const fc = JSON.parse(fs.readFileSync(file, 'utf8'));
  // The TBT pipeline computes course_mi from the OSM-routed GPX (measured
  // distance, ~3% long vs certified). Rescale turn miles to the certified
  // course length so the cue-list labels line up with the mile markers,
  // profile axis, and distance chips (all driven by theme.miles). Turn
  // *placement* uses each turn's projected location, not this value, so the
  // segment highlight is unaffected.
  const loop = theme.raceFormat.loops.find(l => l.id === loopId);
  const targetMi = loop ? loop.miles : 0;
  const maxMi = fc.features.reduce((m, f) => Math.max(m, f.properties.course_mi || 0), 0);
  const scale = (targetMi && maxMi > 0) ? targetMi / maxMi : 1;
  return fc.features.map((f, i) => ({
    n: i + 1,
    mile: +((f.properties.course_mi || 0) * scale).toFixed(2),
    direction: f.properties.direction,
    intensity: f.properties.intensity,
    label: f.properties.label || '',
    labelType: f.properties.label_type || '',
    location: f.geometry.coordinates,
  }));
}
const marathonTurns = loadLoopTurns('marathon');
const halfTurns     = loadLoopTurns('half-marathon');

const themeLoops = theme.raceFormat.loops;
const loopsJsLines = themeLoops.map(l => {
  return `  '${l.id}': { color: '${l.color}', label: '${l.displayName}', abbr: '${l.displayName.charAt(0)}', miles: ${l.miles}, kilometers: ${l.kilometers}, gain: ${l.elevationGain}, gainM: ${l.elevationGainM}, defaultDirection: '${l.defaultDirection}', geojson: null, profile: null, visible: true }`;
}).join(',\n');

// RACES — one per distance. Each has a single-loop assembly.
const racesJsLines = theme.raceFormat.distances.map(d => {
  const loops = (d.assembly || []).map(s => `'${s.loopId}'`).join(',');
  const dirs  = (d.assembly || []).map(s => `'${s.direction}'`).join(',');
  // Simulator hour estimate ~10:00/mi (6 mph); overridden by the user's
  // goal-time input on first load.
  return `  '${d.id}': { name: '${d.shortLabel}', label: '${d.label}', miles: ${d.runMiles}, kilometers: ${d.kilometers}, gain: ${d.runGainFt}, gainFt: ${d.runGainFt}, gainM: ${d.runGainM}, hours: ${(d.runMiles / 6).toFixed(2)}, cutoff: ${d.cutoff ? `'${d.cutoff}'` : 'null'}, startTime: '${d.startTime}', startWindow: '${(d.startWindow || d.startTime).replace(/'/g, "\\'")}', color: '${d.color}', loops: [${loops}], directions: [${dirs}], aidIdx: ${JSON.stringify(d.aidStations)} }`;
}).join(',\n');

// The half marathon is the marathon's back half, so a station at marathon
// mile M sits at half mile (M − offset), where offset is the difference in
// the two course lengths. Stations before the half's start get a null half
// mile (not on the half). renderAidMarkers / updateAidTable read
// `mileByLoop[currentRaceId]` so each station lands at the right place and
// reads the right mile on whichever distance is selected.
const HALF_OFFSET = +(themeLoops[0].miles - themeLoops[1].miles).toFixed(2);
// Actual half-marathon start = the half course's first coordinate (the
// Hamlet of Adirondack). The certified mile-13.1 point on the marathon
// geometry lands ~0.7 mi south of it (measured-vs-certified rescaling), so
// pin Relay Exchange 2 here instead.
const halfStartCoord = halfGeo.features[0].geometry.coordinates[0]; // first point [lng,lat,ele]
const aidStationsWithLoopMiles = theme.aidStations.map(s => {
  const halfMi = +(s.mile - HALF_OFFSET).toFixed(2);
  const entry = Object.assign({}, s, {
    mileByLoop: {
      'marathon': s.mile,
      'half-marathon': halfMi >= 0 ? halfMi : null,
    },
  });
  // The half-marathon start (Relay Exchange 2, mile 13.1) is pinned to the
  // hamlet so the marathon marker lands on the real half start.
  if (s.mile === 13.1) entry.coord = [halfStartCoord[0], halfStartCoord[1]];
  return entry;
});
const aidStationsJs = JSON.stringify(aidStationsWithLoopMiles);

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
  'marathon':      ${JSON.stringify(marathonTurns)},
  'half-marathon': ${JSON.stringify(halfTurns)}
};

// Road race — no dinosaur/animal chip icons. The chip-strip icon slot
// renders a distance numeral via override.js; DINO_SVGS is left empty so
// any legacy reference no-ops cleanly.
var DINO_SVGS = {};

var AID_STATIONS_ALL = ${aidStationsJs};

var HQ = [${theme.geography.startLng}, ${theme.geography.startLat}];

var marathonData = ${JSON.stringify(Object.assign({}, marathonGeo, { profile: marathonProfileScaled }))};
var halfData     = ${JSON.stringify(Object.assign({}, halfGeo,     { profile: halfProfileScaled     }))};

var CONFIG = { mapCenter: HQ, weather: ${JSON.stringify(weatherData)} };

LOOPS['marathon'].geojson      = marathonData.features[0];
LOOPS['marathon'].profile      = marathonData.profile;
LOOPS['half-marathon'].geojson = halfData.features[0];
LOOPS['half-marathon'].profile = halfData.profile;

// Per-loop cumulative-distance lookup keyed by coordinate index. Lets
// override.js map a mile value to a [lng,lat] on the rendered geometry.
var loopCoordDistances = {};
(function() {
  var loopIds = ['marathon', 'half-marathon'];
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

// Distance picker chips with the distance numeral in an editorial numeral
// SVG. Reuses the `.dir-dino-tab` / `.dir-dino-icon` classnames so the CSS
// in override.css (scoped to .race-adirondack-marathon) works unchanged.
function distanceNumeralSvg(miles) {
  const label = miles.toFixed(1);
  return (
    '<svg viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<text x="50" y="42" text-anchor="middle" ' +
            'font-family="League Gothic, Oswald, sans-serif" font-size="40" ' +
            'font-weight="400" fill="currentColor">' + label + '</text>' +
      '<text x="50" y="56" text-anchor="middle" ' +
            'font-family="JetBrains Mono, monospace" font-size="9" ' +
            'letter-spacing="0.18em" font-weight="500" ' +
            'fill="currentColor" opacity="0.7">MILES</text>' +
    '</svg>'
  );
}

function buildDirectionsHtml() {
  const distances = theme.raceFormat.distances;
  const defaultId = theme.raceFormat.defaultDistanceId;

  const tabsHtml = distances.map(d => {
    const active = d.id === defaultId;
    const icon = distanceNumeralSvg(d.runMiles);
    return `<button type="button" class="dir-race-tab dir-dino-tab${active ? ' active' : ''}" data-race="${d.id}" role="tab" aria-selected="${active}" onclick="selectRace('${d.id}')" style="color:${d.color}">
      <span class="dir-dino-icon">${icon}</span>
      <span class="dir-dino-meta">
        <span class="dir-dino-name">${d.shortLabel}</span>
        <span class="dir-dino-km">${d.runMiles.toFixed(1)} mi · ${d.runGainFt} ft</span>
      </span>
    </button>`;
  }).join('\n      ');

  return `<section class="directions-section expanded" id="directionsSection">
    <nav class="dir-race-tabs dir-race-tabs--dino" role="tablist" aria-label="Choose race distance">
      ${tabsHtml}
    </nav>

    <div class="directions-header">
      <div class="directions-titles">
        <p class="directions-eyebrow">Course directions</p>
        <span class="directions-race" id="directionsRaceLabel">— mi · — ft gain</span>
      </div>
      <label class="dir-zoom-toggle">
        <input type="checkbox" id="zoomToStepCheckbox" onchange="setZoomToStep(this.checked)">
        <span>Zoom to step</span>
      </label>
      <span class="dir-cutoff-pill" id="dirCutoffPill"></span>
    </div>

    <p class="assembly-now" id="assemblyNow">
      <span class="assembly-now__eyebrow">Currently viewing</span>
      <span class="assembly-now__label" id="assemblyNowLabel">—</span>
    </p>

    <ol class="loop-cue-list" id="loopCueList" aria-label="Within-loop cues"></ol>

    <!-- Legacy hidden stubs so override.js's older selectors don't throw -->
    <div class="legacy-controls" hidden aria-hidden="true">
      <div class="loop-toggles">
        <div class="loop-toggle" data-loop="marathon"></div>
        <div class="loop-toggle" data-loop="half-marathon"></div>
      </div>
    </div>
  </section>`;
}

const mapViewHtml = `<div id="mapView" class="view active">
<div class="map-wrap">
  <div id="map"></div>
  <div class="hq-badge"><div class="dot"></div><div class="text">SCHROON LAKE VILLAGE · START / FINISH</div></div>
  <!-- Layers popover (single trigger so toggles don't eat permanent map
       y-pixels on mobile, per [[race-map-mobile-chrome-shrink]]). The
       hidden inline buttons preserve compatibility with legacy e2e
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
    </div>
  </div>
  <div class="map-btns" hidden aria-hidden="true">
    <button class="trail-btn" id="aidBtnInline" onclick="toggleAid()">Aid Stations</button>
    <button class="trail-btn" id="terrainBtnInline" onclick="toggle3D()">3D</button>
  </div>
  <div class="map-legend" aria-label="Map legend">
    <div class="map-legend__row">
      <span class="map-legend__swatch map-legend__swatch--aid">
        <svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="11" fill="currentColor" stroke="#fff" stroke-width="2"/><path d="M14 7 C 10.5 11.5, 9 13.5, 9 15.8 a5 5 0 0 0 10 0 C 19 13.5, 17.5 11.5, 14 7 Z" fill="#fff"/></svg>
      </span>
      <span>Aid station</span>
    </div>
    <div class="map-legend__row">
      <span class="map-legend__swatch map-legend__swatch--relay">
        <svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="11" fill="currentColor" stroke="#fff" stroke-width="2"/><g fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M8 11 H17 M14.2 8.6 L17 11 L14.2 13.4"/><path d="M20 17 H11 M13.8 14.6 L11 17 L13.8 19.4"/></g></svg>
      </span>
      <span>Relay exchange</span>
    </div>
    <div class="map-legend__row">
      <span class="map-legend__swatch map-legend__swatch--mile">5</span>
      <span>Mile marker</span>
    </div>
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
          <input type="number" class="goal-input" id="goalHrs" min="0" max="12" value="4" onchange="updateGoalTime()" onclick="this.select()" aria-label="Goal time hours">
          <span class="goal-colon">:</span>
          <input type="number" class="goal-input" id="goalMins" min="0" max="59" value="30" onchange="updateGoalTime()" onclick="this.select()" aria-label="Goal time minutes">
        </div>
        <div class="goal-pace" id="goalPace">Avg pace: <strong>—:— /mi</strong></div>
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
        <div class="clock-time" id="clockTime">8:00 AM</div>
        <div class="clock-label">Current time · race starts <span id="clockStart">8:00 AM</span></div>
        <div class="clock-finish" id="clockFinish">Finish: <strong id="finishTime">—</strong></div>
      </div>

      <div class="sim-stats">
        <div class="sim-stat"><div class="val" id="statDist">0.0</div><div class="label">mi</div></div>
        <div class="sim-stat"><div class="val" id="statEle">0</div><div class="label">Elev (ft)</div></div>
        <div class="sim-stat"><div class="val" id="statGain">0</div><div class="label">Gain (ft)</div></div>
        <div class="sim-stat"><div class="val" id="statTotalGain">0</div><div class="label">Total Gain (ft)</div></div>
        <div class="sim-stat"><div class="val" id="statGrade">0%</div><div class="label">Grade</div></div>
        <div class="sim-stat"><div class="val" id="statPct">0%</div><div class="label">Complete</div></div>
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

// Aid-station card is rendered in the editorial race-shell by build.js's
// buildAidTableRows(). Empty here so we don't double-render.
const aidTableHtml = '';

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
  slug: 'adirondack-marathon',
  theme,
  title: 'Adirondack Marathon & Half Marathon — Course Map · False Summit Studio',
  raceName: 'ADIRONDACK MARATHON',
  themeColor: theme.palette.paper,
  fontFamily: theme.type.bodyStack,
  subtitle: 'Sunday, September 27, 2026 · Schroon Lake, NY · <a href="' + theme.identity.hostUrl + '" target="_blank">adirondackmarathon.org</a>',

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
    '--header-accent': theme.palette.headerAccent,

    '--font-display':  theme.type.displayStack,
    '--font-script':   theme.type.scriptStack,
    '--font-body':     theme.type.bodyStack,
    '--font-micro':    theme.type.microStack,

    // Legacy aliases consumed by shared CSS modules (weather.css, etc.).
    '--bg':            theme.palette.paper,
    '--bg-alt':        theme.palette.surfaceWarm,
    '--bg-card':       theme.palette.paperCard,
    '--text':          theme.palette.raceInk,
    '--text-secondary': '#33414d',
    '--text-muted':    theme.palette.sageQuiet,
    '--border':        '#cdd6d9',
    '--shadow':        '0 2px 6px rgba(14,36,56,0.10)',
    '--radius':        '4px',
    '--primary':       theme.palette.raceBrand,
    '--primary-dark':  '#13364A',
    '--course':        theme.palette.raceInk,
    '--font-family':   theme.type.bodyStack,
    '--heading-family': theme.type.displayStack,

    // Loop colors as CSS vars (chip strips, popups, profile fill).
    '--loop-marathon':      theme.palette.loopMarathon,
    '--loop-half-marathon': theme.palette.loopHalfMarathon,

    // Simulator (cool navy inkwash under the lake-blue route).
    '--sim-bg':            '#0c1a28',
    '--runner-text':       '#f4f7f8',
    '--runner-text-shadow': '0 2px 8px rgba(0,0,0,0.55)',
    '--runner-meta':       'rgba(244,247,248,0.78)',
    '--scrub-handle-shadow': '0 2px 6px rgba(29,122,161,0.5)',
    '--popup-bg':          theme.palette.paperCard,
  },

  configDataJs: configDataJs,
  skipSharedJs: true,

  overrideJs: 'override.js',
  overrideCss: 'override.css',

  mapViewHtml,
  simViewHtml,

  cueHtml: aidTableHtml + (weatherPanelHtml ? '\n<div hidden id="weatherPanelStaging">' + weatherPanelHtml + '</div>' : ''),

  // Map settings — centered on Schroon Lake. Zoom 11 frames the whole
  // ~9-mile loop; override.js fits bounds to the active route on load.
  mapCenter: [-73.768, 43.792],
  mapZoom: 11,
  // Cool wooded basemap flavor — Adirondack forest + lake blue, tuned to
  // sit under the cool navy chrome.
  basemapFlavor: {
    background: '#eef1f2',
    earth:      '#eef1f2',
    park_a:     '#d6e2cf',
    park_b:     '#d6e2cf',
    wood_a:     '#c4d4b9',
    wood_b:     '#c4d4b9',
    scrub_a:    '#dde3d3',
    scrub_b:    '#dde3d3',
    water:      '#b6d2e0',
    sand:       '#e6e1cf',
    beach:      '#e6e1cf',
    glacier:    '#eef4f8',
  },

  // Fallback fields read by build.js when configDataJs is absent. We ship
  // configDataJs so these are not inlined; harmless placeholders.
  courseCoords: [],
  elevations: [],
  totalMiles: 26.2,
  totalGain: 1544,

  startCoords: [theme.geography.startLng, theme.geography.startLat],
  startLabel: 'Schroon Lake — Start / Finish',
  finishCoords: null,
  finishLabel: null,

  courseOutlineColor: '#fff',
  courseLineColor: theme.palette.routeColor,
  mileMarkerFillColor: '#0E2438',
  mileMarkerStrokeColor: theme.palette.raceBrand,
  mileMarkerTextColor: '#ffffff',

  raceStartHour: 8,
  defaultGoalHours: 4,
  defaultGoalMins: 30,

  colors: {
    primary: theme.palette.raceBrand,
  },

  toggleButtons: [],

  weather: weatherData,

  footerHtml: 'Adirondack Marathon & Half Marathon · <a href="' + theme.identity.hostUrl + '" target="_blank">Register on adirondackmarathon.org</a>\n  <br>Race map created by <a href="https://falsesummitstudio.com" target="_blank">False Summit Studio</a>',
};
