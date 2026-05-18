// Pocantico Hills Marathon & Half Marathon — config.js
//
// Plumbs the theme + per-distance geojson data into the runtime
// CONFIG the override.js renderer reads. The race has two standalone
// loop GPXes (Marathon 26.2 mi, Half Marathon 13.1 mi) that share a
// nested aid spine and start/finish at Rockwood Hall in Rockefeller
// State Park Preserve, Sleepy Hollow, NY. November 7, 2026.
//
// Pattern is borrowed from src/maps/gran-fondo-badlands/config.js —
// multi-distance loop selector, per-loop turn-by-turn, single-loop
// assembly per distance — but adapted for US miles + a foot-race
// audience. No dinosaurs; the chip strip carries the distance numeral
// in a small editorial SVG.

const path = require('path');
const fs = require('fs');

function loadJSON(file) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
}

const theme = require('../../themes/pocantico-hills.js');

const marathonGeo     = loadJSON('data/marathon.geojson');
const marathonProfile = loadJSON('data/marathon-profile.json');
const halfGeo         = loadJSON('data/half-marathon.geojson');
const halfProfile     = loadJSON('data/half-marathon-profile.json');

const weatherData = fs.existsSync(path.join(__dirname, 'data/weather.json'))
  ? loadJSON('data/weather.json') : null;

// Street View POIs are optional and currently empty for this race.
// When added, schema matches Gran Fondo Badlands' streetview.json:
// [{ name, mile, coords, pano, yaw, pitch }, ...]
const streetviewTurns = fs.existsSync(path.join(__dirname, 'data/streetview.json'))
  ? loadJSON('data/streetview.json') : [];

// Per-loop turn-by-turn — produced by the FSS TBT pipeline against each
// distance's GPX (scripts/fetch-pocantico-hills-turns.py). Each loop's
// turns sit in data/<id>-turns.geojson. If the file is missing, the
// renderer falls back to the curated cues in the theme.
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
  // Tempo divisor — gran-fondo used 14 mph for cycling. For a footrace
  // we use ~10:00/mi (6 mph) as the simulator's hour estimate; the
  // simulator overrides with the user's goal-time input on first load.
  return `  '${d.id}': { name: '${d.shortLabel}', label: '${d.label}', miles: ${d.runMiles}, kilometers: ${d.kilometers}, gain: ${d.runGainFt}, gainFt: ${d.runGainFt}, gainM: ${d.runGainM}, hours: ${(d.runMiles / 6).toFixed(2)}, cutoff: ${d.cutoff ? `'${d.cutoff}'` : 'null'}, startTime: '${d.startTime}', startWindow: '${(d.startWindow || d.startTime).replace(/'/g, "\\'")}', color: '${d.color}', loops: [${loops}], directions: [${dirs}], aidIdx: ${JSON.stringify(d.aidStations)} }`;
}).join(',\n');

// Inline the shared aid-station spine. Each distance's `aidIdx`
// indexes into this list to render only the stations it visits.
// Both `mile` and `kilometer` fields are carried so the runtime
// can prefer mile (per theme.displayUnits === 'mi').
const aidStationsJs = JSON.stringify(theme.aidStations);

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

// No dinosaur icons on this race — the chip-strip icon slot renders
// a simple distance numeral via override.js. DINO_SVGS is left empty
// so the legacy reference in override.js's sim chip code (if any)
// no-ops cleanly.
var DINO_SVGS = {};

var AID_STATIONS_ALL = ${aidStationsJs};

var STREETVIEW_TURNS = ${JSON.stringify(streetviewTurns)};

var HQ = [${theme.geography.startLng}, ${theme.geography.startLat}];

var marathonData = ${JSON.stringify(Object.assign({}, marathonGeo, { profile: marathonProfile }))};
var halfData     = ${JSON.stringify(Object.assign({}, halfGeo,     { profile: halfProfile     }))};

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

// Distance picker chips with the distance numeral in an editorial
// numeral SVG. We reuse the `.dir-dino-tab` / `.dir-dino-icon`
// classnames from gran-fondo-badlands so the existing CSS rules in
// override.css (now scoped to .race-pocantico-hills) work unchanged.
function distanceNumeralSvg(miles) {
  // Big numeral on a transparent ground, currentColor inherits from
  // the active chip's color. 100x60 viewBox matches the gran-fondo
  // dinosaur slot so chip sizing is consistent.
  const label = miles.toFixed(1);
  return (
    '<svg viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<text x="50" y="42" text-anchor="middle" ' +
            'font-family="Noticia Text, Georgia, serif" font-size="34" ' +
            'font-weight="700" fill="currentColor">' + label + '</text>' +
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
    // The inline color is set on the BUTTON, not the icon span — so
    // currentColor on the chip and all its descendants resolves to
    // the loop color, and active-state CSS can override the visible
    // text/icon color when the chip flips to a filled treatment.
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
  <div class="hq-badge"><div class="dot"></div><div class="text">ROCKWOOD HALL · START / FINISH</div></div>
  <!-- Layers popover. Single trigger so toggles don't eat permanent
       map y-pixels on mobile (per [[race-map-mobile-chrome-shrink]]).
       The hidden inline buttons preserve compatibility with legacy
       e2e selectors that toggle the same state. -->
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
        <input type="checkbox" id="layerStreetview" onchange="toggleStreetview()">
        <span class="map-layers__row-text">Street Views</span>
      </label>
      <label class="map-layers__row">
        <input type="checkbox" id="layer3D" onchange="toggle3D()">
        <span class="map-layers__row-text">3D terrain</span>
      </label>
    </div>
  </div>
  <div class="map-btns" hidden aria-hidden="true">
    <button class="trail-btn" id="aidBtnInline" onclick="toggleAid()">Aid Stations</button>
    <button class="trail-btn" id="streetviewBtnInline" onclick="toggleStreetview()">Street Views</button>
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
          <input type="number" class="goal-input" id="goalHrs" min="0" max="12" value="4" onchange="updateGoalTime()" onclick="this.select()" aria-label="Goal time hours">
          <span class="goal-colon">:</span>
          <input type="number" class="goal-input" id="goalMins" min="0" max="59" value="48" onchange="updateGoalTime()" onclick="this.select()" aria-label="Goal time minutes">
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

// Aid-station card is rendered in the editorial race-shell by
// build.js's buildAidTableRows(). Empty here so we don't double-render.
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
  slug: 'pocantico-hills',
  theme,
  title: 'Pocantico Hills Marathon & Half Marathon — Course Map · False Summit Studio',
  raceName: 'POCANTICO HILLS',
  themeColor: theme.palette.paper,
  fontFamily: theme.type.bodyStack,
  subtitle: 'Saturday, November 7, 2026 · Sleepy Hollow, NY · <a href="' + theme.identity.hostUrl + '" target="_blank">pocanticohillsmarathon.com</a>',

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
    '--text-secondary': '#3a3a3a',
    '--text-muted':    theme.palette.sageQuiet,
    '--border':        '#d9d4c5',
    '--shadow':        '0 2px 6px rgba(52,66,30,0.08)',
    '--radius':        '4px',
    '--primary':       theme.palette.raceBrand,
    '--primary-dark':  '#8d6920',
    '--course':        theme.palette.raceInk,
    '--font-family':   theme.type.bodyStack,
    '--heading-family': theme.type.displayStack,

    // Loop colors as CSS vars (for chip strips, popups, profile fill).
    // Marathon carries deep olive ink; Half carries the brand ochre.
    '--loop-marathon':      theme.palette.loopMarathon,
    '--loop-half-marathon': theme.palette.loopHalfMarathon,

    // Simulator (warm earth tone reskin — olive/cream over a dark inkwash)
    '--sim-bg':            '#1f2418',
    '--runner-text':       theme.palette.paper,
    '--runner-text-shadow': '0 2px 8px rgba(0,0,0,0.55)',
    '--runner-meta':       'rgba(247,247,247,0.78)',
    '--scrub-handle-shadow': '0 2px 6px rgba(193,148,52,0.45)',
    '--popup-bg':          theme.palette.paperCard,
  },

  configDataJs: configDataJs,
  skipSharedJs: true,

  overrideJs: 'override.js',
  overrideCss: 'override.css',

  mapViewHtml,
  simViewHtml,

  cueHtml: aidTableHtml + (weatherPanelHtml ? '\n<div hidden id="weatherPanelStaging">' + weatherPanelHtml + '</div>' : ''),

  // Map settings — centered on Rockwood Hall start. Zoom 13 frames
  // the whole preserve plus the Hudson + Sleepy Hollow village.
  mapCenter: [theme.geography.startLng, theme.geography.startLat],
  mapZoom: 13,
  // Cream-tone basemap flavor — matches the page substrate. Less warm
  // than the Drumheller hoodoo palette; more wooded than the prairie.
  basemapFlavor: {
    background: '#f0eddf',
    earth:      '#f0eddf',
    park_a:     '#dde6c4',
    park_b:     '#dde6c4',
    wood_a:     '#c3d29a',
    wood_b:     '#c3d29a',
    scrub_a:    '#e2dcc3',
    scrub_b:    '#e2dcc3',
    water:      '#bdd6e0',
    sand:       '#ece3c8',
    beach:      '#ece3c8',
    glacier:    '#edf3f8',
  },

  // Fallback fields read by build.js when configDataJs is absent. We
  // ship configDataJs so these are not inlined; harmless placeholders.
  courseCoords: [],
  elevations: [],
  totalMiles: 26.81,
  totalGain: 2969,

  startCoords: [theme.geography.startLng, theme.geography.startLat],
  startLabel: 'Rockwood Hall — Start / Finish',
  finishCoords: null,
  finishLabel: null,

  courseOutlineColor: '#fff',
  courseLineColor: theme.palette.raceInk,
  mileMarkerFillColor: '#34421e',
  mileMarkerStrokeColor: theme.palette.raceBrand,
  mileMarkerTextColor: theme.palette.paper,

  raceStartHour: 8,
  defaultGoalHours: 4,
  defaultGoalMins: 48,

  colors: {
    primary: theme.palette.raceBrand,
  },

  toggleButtons: [],

  weather: weatherData,

  footerHtml: 'Pocantico Hills Marathon & Half Marathon · <a href="' + theme.identity.hostUrl + '" target="_blank">Register on pocanticohillsmarathon.com</a>\n  <br>Race map created by <a href="https://falsesummitstudio.com" target="_blank">False Summit Studio</a>',
};
