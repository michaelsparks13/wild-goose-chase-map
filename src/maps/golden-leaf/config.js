const path = require('path');
const fs = require('fs');

function loadJSON(file) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
}

module.exports = {
  slug: 'golden-leaf',
  title: 'Golden Leaf Half Marathon - Course Map',
  raceName: 'Golden Leaf Half Marathon',
  themeColor: '#1a1a1a',
  googleFontsUrl: '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link href="https://fonts.googleapis.com/css2?family=Arvo:wght@400;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">',
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
  subtitle: 'September 27, 2025 &bull; <a href="https://www.utemountaineer.com/golden-leaf-half-marathon" target="_blank">Ute Mountaineer</a>',

  cssVars: {
    '--primary': '#D4A017',
    '--primary-dark': '#B8860B',
    '--accent': '#C1440E',
    '--bg': '#1a1a1a',
    '--bg-card': '#222222',
    '--bg-alt': '#151515',
    '--text': '#f0f0f0',
    '--text-secondary': '#b0b0b0',
    '--text-muted': '#777777',
    '--border': '#333333',
    '--course': '#D4A017',
    '--shadow': '0 4px 20px rgba(0,0,0,0.4)',
    '--radius': '12px',
    '--font-family': "'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    '--sim-bg': '#1a1a1a',
    '--runner-text': '#fff',
    '--runner-text-shadow': '0 1px 3px rgba(0,0,0,0.5)',
    '--runner-meta': 'rgba(255,255,255,0.7)',
    '--scrub-handle-shadow': '0 2px 6px rgba(212,160,23,0.4)',
    '--popup-bg': 'var(--bg-card)',
  },

  cssOverrides: `
.header-left h1 { font-family: 'Arvo', serif; font-size: 1.3rem; letter-spacing: 0.5px; }
.race-badge { font-family: 'Arvo', serif; color: #1a1a1a; border-radius: 18px; padding: 6px 14px; font-size: 0.85rem; }
.info-badge { padding: 6px 10px; }
.info-badge .label { font-size: 0.5rem; }
.info-badge .value { font-family: 'Arvo', serif; font-size: 0.85rem; font-weight: 700; }
.stat-card .value { font-family: 'Arvo', serif; font-size: 1.6rem; }
.speed-btn.active { background: var(--text); color: var(--bg); border-color: var(--text); }
`,

  mapCenter: [-106.8975, 39.1946],
  mapZoom: 12,
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

  courseCoords: loadJSON('data/coords.json'),
  elevations: loadJSON('data/elevations.json'),
  trailsData: loadJSON('data/trails.geojson'),
  totalMiles: 13.3,
  totalGain: 1768,

  startCoords: [-106.952581, 39.205271],
  startLabel: 'Start - Snowmass Village',
  finishCoords: [-106.824427, 39.1885],
  finishLabel: 'Finish - Koch Lumber Park, Aspen',

  courseOutlineColor: '#D4A017',
  courseLineColor: '#111111',
  mileMarkerFillColor: '#1a1a1a',
  mileMarkerStrokeColor: '#D4A017',
  mileMarkerTextColor: '#fff',

  raceStartHour: 8,
  defaultGoalHours: 2,
  defaultGoalMins: 30,

  profileMaxEle: 2990,
  profileMinEle: 2350,
  profileMileStep: 2,

  aidStations: [
    { name: 'Elk Camp Road Junction', mile: 4, services: 'Water, Skratch \u00b7 Cutoff: 1h 10m' },
    { name: 'West Buttermilk', mile: 8, services: 'Water, Skratch' },
    { name: 'Tiehack Road Cutoff', mile: 11, services: 'Cutoff: 3h 10m' },
  ],

  cutoffs: [
    { mile: 4, time: '1h 10m' },
    { mile: 11, time: '3h 10m' },
  ],

  colors: {
    primary: '#D4A017',
    accent: '#C1440E',
    courseMapBg: ['#1a1a1a', '#222222'],
    courseMapShadow: 'rgba(255,255,255,0.3)',
    courseMapRemaining: 'rgba(212,160,23,0.5)',
    runnerGlow: ['rgba(212,160,23,0.4)', 'rgba(212,160,23,0)'],
    mileMarkerFill: 'rgba(30,30,30,0.85)',
    mileMarkerStrokePrimary: 'rgba(255,255,255,0.3)',
    mileMarkerStrokeSecondary: 'rgba(255,255,255,0.15)',
    mileMarkerTextPrimary: '#fff',
    mileMarkerTextSecondary: 'rgba(255,255,255,0.8)',
    terrainFillTop: 'rgba(212,160,23,0.3)',
    terrainFillBottom: 'rgba(212,160,23,0.05)',
    dimBehindRunner: 'rgba(26,26,26,0.4)',
    simMileMarkerLine: 'rgba(255,255,255,0.06)',
    simMileMarkerText: 'rgba(255,255,255,0.3)',
    profileGrid: '#333333',
    profileFillTop: 'rgba(212, 160, 23, 0.4)',
    profileFillBottom: 'rgba(212, 160, 23, 0.05)',
    profileLabel: '#777777',
    trailLabelColor: '#333',
    trailLabelHalo: '#fff',
    sky: {
      night: ['#1a1a1a', '#222222'],
      dawn: ['#3a2a10', '#5a4020'],
      day: ['#5a6580', '#8a9ab0'],
      dusk: ['#4a3520', '#3a2a15'],
    },
  },

  infoBadgeLabel: 'Start / Finish',
  infoBadgeValue: 'Snowmass &#8594; Aspen',

  toggleButtons: [
    { id: 'courseBtn', label: 'Course', active: true },
    { id: 'trailBtn', label: 'Park Trails', active: false },
    { id: 'aidBtn', label: 'Aid Stations', active: false },
    { id: 'terrainBtn', label: '3D', active: false },
  ],

  statsHtml: `<section class="stats-section">
  <div class="stats-grid">
    <div class="stat-card"><div class="value">13.3</div><div class="label">Miles</div></div>
    <div class="stat-card"><div class="value">1,768</div><div class="label">Elev Gain (ft)</div></div>
    <div class="stat-card"><div class="value">~5 hrs</div><div class="label">Cutoff</div></div>
    <div class="stat-card"><div class="value">Point-to-Point</div><div class="label">Course Type</div></div>
  </div>
</section>`,

  profileStats: '<span>Gain: <span class="val">1,768 ft</span></span>\n      <span>High: <span class="val">9,504 ft</span></span>',

  courseDescriptionHtml: `<section class="course-info">
  <h3>Course Description</h3>
  <div class="course-description">
    <p>The <strong>Golden Leaf Half Marathon</strong> is a stunning 13.3-mile point-to-point trail race from <strong>Snowmass Village to Aspen</strong>, Colorado. Starting at <strong>Fanny Hill</strong> (8,650 ft), runners climb Snowmass Ski Area roads to join the <strong>Government Trail</strong>, a rolling singletrack through golden aspen groves at 9,000+ feet with views of the Elk Mountains. After the high point at <strong>9,504 feet</strong>, the course descends past the <strong>Alpine Springs Road</strong> junction, through <strong>Buttermilk Ski Area</strong>, and down <strong>Tiehack Road</strong> to the <strong>Rio Grande Trail</strong> into downtown Aspen, finishing at <strong>Koch Lumber Park</strong>.</p>
    <p style="margin-top:8px;font-size:0.85rem;color:var(--text-muted)"><strong>Cutoffs:</strong> Mile 4 (Elk Camp Rd) &mdash; 1h 10m &bull; Mile 11 (Tiehack Rd) &mdash; 3h 10m</p>
  </div>
</section>`,

  footerHtml: 'Golden Leaf Half Marathon &bull; <a href="https://www.utemountaineer.com/golden-leaf-half-marathon" target="_blank">Ute Mountaineer</a>\n  <br>Race map created by <a href="https://falsesummitstudio.com" target="_blank">False Summit Studio</a>',

  defaultClock: '8:00 AM',
  raceStartLabel: '8:00 AM',
  defaultFinishTime: '10:30 AM',
  defaultPace: '11:17 /mi',
  defaultRunnerMeta: '8,650 ft &middot; Starting',
};
