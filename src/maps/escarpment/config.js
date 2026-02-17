const path = require('path');
const fs = require('fs');

function loadJSON(file) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
}

module.exports = {
  slug: 'escarpment',
  title: 'Escarpment Trail Run 30K - Course Map',
  raceName: 'Escarpment Trail Run 30K',
  themeColor: '#ffffff',
  googleFontsUrl: '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">',
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
  subtitle: 'July 26, 2026 &bull; <a href="https://escarpmenttrail.com" target="_blank">Escarpment Trail Run</a>',

  cssVars: {
    '--primary': '#2E7D32',
    '--primary-dark': '#1B5E20',
    '--accent': '#1B5E20',
    '--bg': '#ffffff',
    '--bg-card': '#f7f7f7',
    '--bg-alt': '#f2f2f2',
    '--text': '#222222',
    '--text-secondary': '#555555',
    '--text-muted': '#888888',
    '--border': '#dddddd',
    '--course': '#111111',
    '--shadow': '0 2px 8px rgba(0,0,0,0.08)',
    '--radius': '12px',
    '--font-family': "'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    '--sim-bg': '#e8ede9',
    '--runner-text': '#222',
    '--runner-text-shadow': '0 1px 3px rgba(255,255,255,0.7)',
    '--runner-meta': '#555',
    '--scrub-handle-shadow': '0 2px 6px rgba(46,125,50,0.4)',
    '--popup-bg': '#fff',
  },

  mapCenter: [-74.1096, 42.2495],
  mapZoom: 11,
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
  totalMiles: 18.6,
  totalGain: 4800,

  startCoords: [-74.18962, 42.31287],
  startLabel: 'Start - Windham, NY',
  finishCoords: [-74.03642, 42.19621],
  finishLabel: 'Finish - Haines Falls, NY',

  courseOutlineColor: '#2E7D32',
  courseLineColor: '#111111',
  mileMarkerFillColor: '#222',
  mileMarkerStrokeColor: '#2E7D32',
  mileMarkerTextColor: '#fff',

  raceStartHour: 9,
  defaultGoalHours: 4,
  defaultGoalMins: 0,

  profileMaxEle: 1250,
  profileMinEle: 500,
  profileMileStep: 3,

  aidStations: [
    { name: 'Windham Peak', mile: 3.5, services: 'Water, Tailwind, snacks' },
    { name: 'Acra', mile: 6.2, services: 'Water, Tailwind, snacks' },
    { name: 'Base of Blackhead', mile: 8.7, services: 'Water, Tailwind, snacks' },
    { name: 'Top of Blackhead', mile: 9.6, services: 'Water, Tailwind, snacks' },
    { name: "Dutcher's Notch", mile: 12.2, services: 'Water, Tailwind, snacks' },
    { name: 'Stoppel Point', mile: 14.4, services: 'Water, Tailwind, snacks' },
    { name: 'North Point', mile: 16.2, services: 'Water, Tailwind, snacks' },
  ],

  colors: {
    primary: '#2E7D32',
    courseMapBg: ['#e8ede9', '#dde3de'],
    courseMapShadow: 'rgba(0,0,0,0.08)',
    courseMapRemaining: 'rgba(46,125,50,0.4)',
    runnerGlow: ['rgba(46,125,50,0.4)', 'rgba(46,125,50,0)'],
    mileMarkerFill: 'rgba(255,255,255,0.9)',
    mileMarkerStrokePrimary: 'rgba(0,0,0,0.3)',
    mileMarkerStrokeSecondary: 'rgba(0,0,0,0.15)',
    mileMarkerTextPrimary: '#333',
    mileMarkerTextSecondary: '#555',
    terrainFillTop: 'rgba(46,125,50,0.3)',
    terrainFillBottom: 'rgba(46,125,50,0.05)',
    dimBehindRunner: 'rgba(200,210,200,0.35)',
    simMileMarkerLine: 'rgba(0,0,0,0.06)',
    simMileMarkerText: 'rgba(0,0,0,0.3)',
    profileGrid: '#dddddd',
    profileFillTop: 'rgba(46, 125, 50, 0.4)',
    profileFillBottom: 'rgba(46, 125, 50, 0.05)',
    profileLabel: '#888888',
    trailLabelColor: '#333',
    trailLabelHalo: '#fff',
    sky: {
      night: ['#c5cfd8', '#d8dfe6'],
      dawn: ['#d0dae4', '#dde5ec'],
      day: ['#dce6ed', '#e8ede9'],
      dusk: ['#d5dce4', '#dde3de'],
    },
  },

  infoBadgeLabel: 'Start / Finish',
  infoBadgeValue: 'Windham &#8594; Haines Falls',

  toggleButtons: [
    { id: 'courseBtn', label: 'Course', active: true },
    { id: 'trailBtn', label: 'Park Trails', active: false },
    { id: 'aidBtn', label: 'Aid Stations', active: false },
    { id: 'terrainBtn', label: '3D', active: false },
  ],

  statsHtml: `<section class="stats-section">
  <div class="stats-grid">
    <div class="stat-card"><div class="value">18.6</div><div class="label">Miles</div></div>
    <div class="stat-card"><div class="value">~4,800</div><div class="label">Elev Gain (ft)</div></div>
    <div class="stat-card"><div class="value">6 hrs</div><div class="label">Cutoff</div></div>
    <div class="stat-card"><div class="value">Point-to-Point</div><div class="label">Course Type</div></div>
  </div>
</section>`,

  profileStats: '<span>Gain: <span class="val">~4,800 ft</span></span>\n      <span>High: <span class="val">3,930 ft</span></span>',

  courseDescriptionHtml: `<section class="course-info">
  <h3>Course Description</h3>
  <div class="course-description">
    <p>The <strong>Escarpment Trail Run</strong> is a legendary 30K point-to-point race through the heart of the <strong>Catskill Mountains</strong>. The course follows the rugged Escarpment Trail from <strong>Windham to Haines Falls</strong>, traversing multiple peaks above 3,500 feet with breathtaking views of the Hudson Valley. Known as one of the toughest trail races in the Northeast, runners face relentless climbs, technical rocky descents, and over <strong>4,800 feet of elevation gain</strong> across 18.6 miles.</p>
  </div>
</section>`,

  footerHtml: 'Escarpment Trail Run &bull; <a href="https://escarpmenttrail.com" target="_blank">escarpmenttrail.com</a>\n  <br>Interactive map powered by MapLibre',

  defaultClock: '9:00 AM',
  raceStartLabel: '9:00 AM',
  defaultFinishTime: '1:00 PM',
  defaultPace: '12:54 /mi',
  defaultRunnerMeta: '1,772 ft &middot; Starting',
};
