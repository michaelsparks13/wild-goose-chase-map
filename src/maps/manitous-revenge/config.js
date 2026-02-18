const path = require('path');
const fs = require('fs');

function loadJSON(file) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
}

module.exports = {
  slug: 'manitous-revenge',
  title: "Manitou's Revenge 53-Mile Ultra - Course Map",
  raceName: "Manitou's Revenge",
  themeColor: '#000000',
  googleFontsUrl: '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">',
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
  subtitle: 'June 20, 2026 &bull; <a href="https://www.manitousrevengeultra.com" target="_blank">Manitou\'s Revenge Ultra</a>',

  cssOverrides: `
    .header h1 { font-family: 'Oswald', sans-serif; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
    .stat-card .value { font-family: 'Oswald', sans-serif; font-weight: 600; }
    .toggle-btn { border-color: #333 !important; }
    .toggle-btn.active { background: #e0e0e0 !important; color: #000 !important; border-color: #e0e0e0 !important; }
  `,

  cssVars: {
    '--primary': '#e0e0e0',
    '--primary-dark': '#bdbdbd',
    '--accent': '#ffffff',
    '--bg': '#0a0a0a',
    '--bg-card': '#1a1a1a',
    '--bg-alt': '#111111',
    '--text': '#e0e0e0',
    '--text-secondary': '#aaaaaa',
    '--text-muted': '#777777',
    '--border': '#333333',
    '--course': '#ffffff',
    '--shadow': '0 2px 8px rgba(0,0,0,0.4)',
    '--radius': '8px',
    '--font-family': "'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    '--sim-bg': '#111111',
    '--runner-text': '#e0e0e0',
    '--runner-text-shadow': '0 1px 3px rgba(0,0,0,0.7)',
    '--runner-meta': '#999',
    '--scrub-handle-shadow': '0 2px 6px rgba(255,255,255,0.3)',
    '--popup-bg': '#1a1a1a',
  },

  mapCenter: [-74.16, 42.17],
  mapZoom: 10.5,
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
  totalMiles: 53.2,
  totalGain: 15000,

  startCoords: [-74.14342, 42.29334],
  startLabel: 'Start - Windham, NY',
  finishCoords: [-74.31025, 42.08404],
  finishLabel: 'Finish - Phoenicia, NY',

  courseOutlineColor: '#ffffff',
  courseLineColor: '#e0e0e0',
  mileMarkerFillColor: '#1a1a1a',
  mileMarkerStrokeColor: '#e0e0e0',
  mileMarkerTextColor: '#e0e0e0',
  mileMarkerRadius: 9,

  raceStartHour: 5,
  defaultGoalHours: 20,
  defaultGoalMins: 0,

  profileMaxEle: 4200,
  profileMinEle: 400,
  profileMileStep: 5,

  aidStations: [
    { name: 'Big Hollow Rd', mile: 2.0, services: 'Water only' },
    { name: 'Dutchers Notch', mile: 9.3, services: 'Full service' },
    { name: 'North/South Lake', mile: 16.5, services: 'Full service' },
    { name: 'Palenville', mile: 20.5, services: 'Full service' },
    { name: 'Platte Clove', mile: 30.5, services: 'Full service (drop bags)' },
    { name: 'Mink Hollow', mile: 37.5, services: 'Full service' },
    { name: 'Silver Hollow Notch', mile: 42.5, services: 'Full service' },
    { name: 'Willow', mile: 47.0, services: 'Full service' },
    { name: 'Plank Rd (Rte 40)', mile: 52.0, services: 'Water only' },
  ],

  colors: {
    primary: '#e0e0e0',
    courseMapBg: ['#1a1a1a', '#111111'],
    courseMapShadow: 'rgba(0,0,0,0.4)',
    courseMapRemaining: 'rgba(224,224,224,0.3)',
    runnerGlow: ['rgba(255,255,255,0.4)', 'rgba(255,255,255,0)'],
    mileMarkerFill: 'rgba(26,26,26,0.9)',
    mileMarkerStrokePrimary: 'rgba(255,255,255,0.3)',
    mileMarkerStrokeSecondary: 'rgba(255,255,255,0.15)',
    mileMarkerTextPrimary: '#e0e0e0',
    mileMarkerTextSecondary: '#999',
    terrainFillTop: 'rgba(224,224,224,0.3)',
    terrainFillBottom: 'rgba(224,224,224,0.05)',
    dimBehindRunner: 'rgba(10,10,10,0.4)',
    simMileMarkerLine: 'rgba(255,255,255,0.08)',
    simMileMarkerText: 'rgba(255,255,255,0.3)',
    profileGrid: '#333333',
    profileFillTop: 'rgba(224,224,224,0.35)',
    profileFillBottom: 'rgba(224,224,224,0.05)',
    profileLabel: '#777777',
    trailLabelColor: '#333',
    trailLabelHalo: '#fff',
    sky: {
      night: ['#1a1a2e', '#0d0d1a'],
      dawn: ['#2a1a2e', '#1a1020'],
      day: ['#dce6ed', '#e8ede9'],
      dusk: ['#2e1a1a', '#1a1010'],
    },
  },

  infoBadgeLabel: 'Start / Finish',
  infoBadgeValue: 'Windham &#8594; Phoenicia',

  toggleButtons: [
    { id: 'courseBtn', label: 'Course', active: true },
    { id: 'trailBtn', label: 'Park Trails', active: false },
    { id: 'aidBtn', label: 'Aid Stations', active: false },
    { id: 'terrainBtn', label: '3D', active: false },
  ],

  statsHtml: `<section class="stats-section">
  <div class="stats-grid">
    <div class="stat-card"><div class="value">53.2</div><div class="label">Miles</div></div>
    <div class="stat-card"><div class="value">15,000+</div><div class="label">Elev Gain (ft)</div></div>
    <div class="stat-card"><div class="value">23 hrs</div><div class="label">Time Limit</div></div>
    <div class="stat-card"><div class="value">Point-to-Point</div><div class="label">Course Type</div></div>
  </div>
</section>`,

  profileStats: '<span>Gain: <span class="val">15,000+ ft</span></span>\n      <span>High: <span class="val">3,948 ft</span></span>',

  courseDescriptionHtml: `<section class="course-info">
  <h3>Course Description</h3>
  <div class="course-description">
    <p><strong>Manitou's Revenge</strong> is a 53-mile ultramarathon through the heart of the <strong>Catskill Mountains</strong>, running point-to-point from <strong>Windham to Phoenicia, NY</strong>. The course follows the <strong>Long Path</strong> across the most rugged terrain in the Catskills, traversing peaks including <strong>Blackhead, Indian Head, Twin, Sugarloaf, Plateau,</strong> and <strong>Mt. Tremper</strong>. With over <strong>15,000 feet of climbing</strong>, 9 aid stations, and a 23-hour time limit, it is one of the most demanding ultras in the Northeast.</p>
  </div>
</section>`,

  footerHtml: "Manitou's Revenge Ultra &bull; <a href=\"https://www.manitousrevengeultra.com\" target=\"_blank\">manitousrevengeultra.com</a>\n  <br>Interactive map powered by MapLibre",

  defaultClock: '5:00 AM',
  raceStartLabel: '5:00 AM',
  defaultFinishTime: '1:00 AM',
  defaultPace: '22:33 /mi',
  defaultRunnerMeta: '1,975 ft &middot; Starting',
};
