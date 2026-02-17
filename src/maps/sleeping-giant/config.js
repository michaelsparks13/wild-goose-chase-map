const path = require('path');
const fs = require('fs');

function loadJSON(file) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
}

module.exports = {
  slug: 'sleeping-giant',
  title: 'Sleeping Giant Trail Runs - Course Map',
  raceName: 'Sleeping Giant Trail Runs',
  themeColor: '#111111',
  googleFontsUrl: '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Teko:wght@400;500;600;700&display=swap" rel="stylesheet">',
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
  subtitle: 'March 29, 2026 &bull; <a href="https://steependurance.com" target="_blank">Steep Endurance</a>',

  cssVars: {
    '--primary': '#7ed321',
    '--primary-dark': '#6bbf1a',
    '--accent': '#5aa215',
    '--bg': '#111111',
    '--bg-card': '#1a1a1a',
    '--bg-alt': '#0d0d0d',
    '--text': '#ffffff',
    '--text-secondary': '#a0a0a0',
    '--text-muted': '#636363',
    '--border': '#2a2a2a',
    '--course': '#7ed321',
    '--shadow': '0 4px 20px rgba(0,0,0,0.4)',
    '--radius': '12px',
    '--font-family': "'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    '--sim-bg': '#111111',
    '--runner-text': '#fff',
    '--runner-text-shadow': '0 1px 3px rgba(0,0,0,0.5)',
    '--runner-meta': 'rgba(255,255,255,0.7)',
    '--scrub-handle-shadow': '0 2px 6px rgba(255,107,53,0.4)',
    '--popup-bg': 'var(--bg-card)',
  },

  // CSS overrides for Sleeping Giant (Teko font, dark theme tweaks)
  cssOverrides: `
.header-left h1 { font-family: 'Teko', sans-serif; font-size: 1.5rem; text-transform: uppercase; letter-spacing: 1px; }
.race-badge { font-family: 'Teko', sans-serif; color: #111; border-radius: 18px; padding: 6px 14px; font-size: 0.85rem; }
.info-badge { padding: 6px 10px; }
.info-badge .label { font-size: 0.5rem; }
.info-badge .value { font-family: 'Teko', sans-serif; font-size: 0.85rem; font-weight: 600; }
.stat-card .value { font-family: 'Teko', sans-serif; font-size: 1.6rem; }
.speed-btn.active { background: var(--text); color: var(--bg); border-color: var(--text); }
.distance-picker { display: flex; gap: 4px; }
.dist-btn {
  padding: 6px 14px; border-radius: 6px; background: var(--bg-alt);
  border: 1px solid var(--border); color: var(--text-muted);
  font-family: inherit; font-size: 0.75rem; font-weight: 700;
  cursor: pointer; transition: all 0.15s;
}
.dist-btn.active { background: var(--primary); color: #fff; border-color: var(--primary); }
`,

  mapCenter: [-72.885, 41.432],
  mapZoom: 13,
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
  totalMiles: 15.5,
  totalGain: 4314,

  // Loop course support
  loopMiles: 15.5,
  loopGain: 4314,

  startCoords: [-72.90161, 41.4217],
  startLabel: 'Start/Finish - Sleeping Giant State Park',
  finishCoords: null, // Loop course — start equals finish
  finishLabel: null,

  courseOutlineColor: '#7ed321',
  courseLineColor: '#111111',
  mileMarkerFillColor: '#1a1a1a',
  mileMarkerStrokeColor: '#7ed321',
  mileMarkerTextColor: '#fff',

  raceStartHour: 7,
  defaultGoalHours: 2,
  defaultGoalMins: 30,

  profileMaxEle: 250,
  profileMinEle: 20,
  profileMaxDist: 15.5,
  profileMileStep: 3,

  aidStations: null,

  colors: {
    primary: '#7ed321',
    courseMapBg: ['#111111', '#1a1a1a'],
    courseMapShadow: 'rgba(255,255,255,0.4)',
    courseMapRemaining: 'rgba(255,107,53,0.6)',
    runnerGlow: ['rgba(255,107,53,0.4)', 'rgba(255,107,53,0)'],
    mileMarkerFill: 'rgba(37,37,64,0.85)',
    mileMarkerStrokePrimary: 'rgba(255,255,255,0.3)',
    mileMarkerStrokeSecondary: 'rgba(255,255,255,0.15)',
    mileMarkerTextPrimary: '#fff',
    mileMarkerTextSecondary: 'rgba(255,255,255,0.8)',
    terrainFillTop: 'rgba(255,107,53,0.3)',
    terrainFillBottom: 'rgba(255,107,53,0.05)',
    dimBehindRunner: 'rgba(26,32,48,0.4)',
    simMileMarkerLine: 'rgba(255,255,255,0.06)',
    simMileMarkerText: 'rgba(255,255,255,0.3)',
    profileGrid: '#2a2a2a',
    profileFillTop: 'rgba(126, 211, 33, 0.4)',
    profileFillBottom: 'rgba(126, 211, 33, 0.05)',
    profileLabel: '#636363',
    trailLabelColor: '#333',
    trailLabelHalo: '#fff',
    sky: {
      night: ['#111111', '#1a1a1a'],
      dawn: ['#2a3050', '#4a4070'],
      day: ['#3a4560', '#5a6580'],
      dusk: ['#3a3055', '#4a4070'],
    },
  },

  infoBadgeLabel: 'Start / Finish',
  infoBadgeValue: 'Sleeping Giant State Park',

  toggleButtons: [
    { id: 'courseBtn', label: 'Course', active: true },
    { id: 'trailBtn', label: 'Park Trails', active: false },
    { id: 'terrainBtn', label: '3D', active: false },
  ],

  statsHtml: `<section class="stats-section">
  <div class="stats-grid">
    <div class="stat-card"><div class="value">15.5</div><div class="label">Miles</div></div>
    <div class="stat-card"><div class="value">4,314</div><div class="label">Elev Gain (ft)</div></div>
    <div class="stat-card"><div class="value">25K</div><div class="label">Distance</div></div>
    <div class="stat-card"><div class="value">Loop</div><div class="label">Course Type</div></div>
  </div>
</section>`,

  profileStats: '<span>Gain: <span class="val">4,314 ft</span></span>\n      <span>High: <span class="val">722 ft</span></span>',

  courseDescriptionHtml: '',

  footerHtml: 'Sleeping Giant Trail Runs &bull; Produced by <a href="https://steependurance.com" target="_blank">Steep Endurance</a>\n  <br>Race map created by <a href="https://falsesummitstudio.com" target="_blank">False Summit Studio</a>',

  // Distance picker HTML (25K / 50K)
  distancePicker: '<div class="distance-picker">\n          <button class="dist-btn active" onclick="setDistance(\'25k\',this)">25K</button>\n          <button class="dist-btn" onclick="setDistance(\'50k\',this)">50K</button>\n        </div>',

  defaultClock: '7:00 AM',
  raceStartLabel: '7:00 AM',
  defaultFinishTime: '9:30 AM',
  defaultPace: '9:41 /mi',
  defaultRunnerMeta: '164 ft &middot; Starting',
};
