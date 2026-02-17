#!/usr/bin/env node
// build.js - Compiles per-map config + shared code into standalone index.html files
// Zero dependencies (Node.js stdlib only)

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

// --- Helpers ---
function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    mkdirp(dest);
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

// --- Discover maps ---
function getMapDirs() {
  const mapsDir = path.join(SRC, 'maps');
  return fs.readdirSync(mapsDir).filter(d =>
    fs.statSync(path.join(mapsDir, d)).isDirectory() &&
    fs.existsSync(path.join(mapsDir, d, 'config.js'))
  );
}

// --- Load shared CSS ---
function loadSharedCSS() {
  const cssFiles = ['base.css', 'layout.css', 'simulator.css', 'responsive.css', 'maplibre-overrides.css'];
  return cssFiles.map(f => readFile(path.join(SRC, 'shared', f))).join('\n');
}

// --- Load shared JS ---
function loadSharedJS() {
  const jsFiles = [
    'coord-helpers.js',
    'map-init.js',
    'map-layers.js',
    'map-toggles.js',
    'elevation-profile.js',
    'view-switch.js',
    'sim-engine.js',
    'sim-renderers.js',
    'init.js',
  ];
  return jsFiles.map(f => readFile(path.join(SRC, 'shared', f))).join('\n\n');
}

// --- Load templates ---
function loadTemplates() {
  return {
    shell: readFile(path.join(SRC, 'templates', 'shell.html')),
    mapView: readFile(path.join(SRC, 'templates', 'map-view.html')),
    simView: readFile(path.join(SRC, 'templates', 'sim-view.html')),
  };
}

// --- Build CSS vars block ---
function buildCssVars(config) {
  const vars = Object.entries(config.cssVars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
  return `:root {\n${vars}\n}`;
}

// --- Build toggle buttons HTML ---
function buildToggleButtons(config) {
  return config.toggleButtons.map(b =>
    `<button class="toggle-btn${b.active ? ' active' : ''}" id="${b.id}">${b.label}</button>`
  ).join('\n    ');
}

// --- Build distance picker HTML ---
function buildDistancePicker(config) {
  if (!config.distancePicker) return '';
  return config.distancePicker;
}

// --- Build CONFIG data block for JS ---
function buildConfigData(config) {
  // Create a clean config object for the browser (no Node.js-only fields)
  const browserConfig = {
    slug: config.slug,
    raceName: config.raceName,
    fontFamily: config.fontFamily,
    mapCenter: config.mapCenter,
    mapZoom: config.mapZoom,
    basemapFlavor: config.basemapFlavor,
    courseCoords: config.courseCoords,
    elevations: config.elevations,
    totalMiles: config.totalMiles,
    totalGain: config.totalGain,
    startCoords: config.startCoords,
    startLabel: config.startLabel,
    finishCoords: config.finishCoords || null,
    finishLabel: config.finishLabel || null,
    courseOutlineColor: config.courseOutlineColor,
    courseLineColor: config.courseLineColor,
    mileMarkerFillColor: config.mileMarkerFillColor,
    mileMarkerStrokeColor: config.mileMarkerStrokeColor,
    mileMarkerTextColor: config.mileMarkerTextColor || '#fff',
    mileMarkerRadius: config.mileMarkerRadius || 10,
    raceStartHour: config.raceStartHour,
    defaultGoalHours: config.defaultGoalHours,
    defaultGoalMins: config.defaultGoalMins,
    profileMaxEle: config.profileMaxEle,
    profileMinEle: config.profileMinEle,
    profileMaxDist: config.profileMaxDist || config.totalMiles,
    profileMileStep: config.profileMileStep || 3,
    aidStations: config.aidStations || null,
    loopMiles: config.loopMiles || null,
    loopGain: config.loopGain || null,
    colors: config.colors,
  };

  // Inline trails data separately (can be large)
  const trailsJson = JSON.stringify(config.trailsData);
  const configJson = JSON.stringify(browserConfig);

  return `var CONFIG = ${configJson};\nCONFIG.trailsData = ${trailsJson};`;
}

// --- Build one map ---
function buildMap(slug, templates) {
  const mapDir = path.join(SRC, 'maps', slug);
  // Clear require cache so config reloads on rebuild
  const configPath = path.resolve(path.join(mapDir, 'config.js'));
  delete require.cache[configPath];
  const config = require(configPath);

  const cssVars = buildCssVars(config);
  const sharedCSS = loadSharedCSS();
  // Support both inline cssOverrides string and external overrideCss file
  let overrideCSS = config.cssOverrides || '';
  if (config.overrideCss) {
    overrideCSS += '\n' + readFile(path.join(mapDir, config.overrideCss));
  }

  const fullCSS = cssVars + '\n' + sharedCSS + (overrideCSS ? '\n' + overrideCSS : '');

  // Config can provide custom JS data block via configDataJs (for multi-loop maps)
  const configData = config.configDataJs || buildConfigData(config);
  const sharedJS = config.skipSharedJs
    ? ''
    : loadSharedJS();
  const overrideJS = config.overrideJs
    ? readFile(path.join(mapDir, config.overrideJs))
    : '';

  const fullJS = configData + '\n\n' + sharedJS + (overrideJS ? '\n\n' + overrideJS : '');

  // Build map view HTML (config can override entirely via mapViewHtml)
  let mapView;
  if (config.mapViewHtml) {
    mapView = config.mapViewHtml;
  } else {
    mapView = templates.mapView
      .replace('{{INFO_BADGE_LABEL}}', config.infoBadgeLabel || '')
      .replace('{{INFO_BADGE_VALUE}}', config.infoBadgeValue || '')
      .replace('{{TOGGLE_BUTTONS}}', buildToggleButtons(config))
      .replace('{{STATS_HTML}}', config.statsHtml || '')
      .replace('{{PROFILE_STATS}}', config.profileStats || '')
      .replace('{{COURSE_DESCRIPTION_HTML}}', config.courseDescriptionHtml || '');
  }

  // Build sim view HTML (config can override entirely via simViewHtml)
  let simView;
  if (config.simViewHtml) {
    simView = config.simViewHtml;
  } else {
    simView = templates.simView
      .replace('{{DISTANCE_PICKER}}', buildDistancePicker(config))
      .replace('{{DEFAULT_GOAL_HOURS}}', String(config.defaultGoalHours))
      .replace('{{DEFAULT_GOAL_MINS}}', String(config.defaultGoalMins))
      .replace('{{DEFAULT_PACE}}', config.defaultPace || '')
      .replace('{{DEFAULT_CLOCK}}', config.defaultClock || '')
      .replace('{{RACE_START_LABEL}}', config.raceStartLabel || '')
      .replace('{{DEFAULT_FINISH_TIME}}', config.defaultFinishTime || '')
      .replace('{{DEFAULT_RUNNER_META}}', config.defaultRunnerMeta || '');
  }

  // Build final HTML
  let html = templates.shell
    .replace('{{THEME_COLOR}}', config.themeColor)
    .replace('{{TITLE}}', config.title)
    .replace('{{GOOGLE_FONTS}}', config.googleFontsUrl || '')
    .replace('{{CSS_VARS}}', '')  // Already included in fullCSS
    .replace('{{CSS}}', fullCSS)
    .replace('{{RACE_NAME}}', config.raceName)
    .replace('{{SUBTITLE}}', config.subtitle)
    .replace('{{MAP_VIEW}}', mapView)
    .replace('{{SIM_VIEW}}', simView)
    .replace('{{FOOTER_HTML}}', config.footerHtml || '')
    .replace('{{CONFIG_DATA}}', '')  // Already included in fullJS
    .replace('{{JS}}', fullJS);

  // Write output
  const outDir = path.join(DIST, 'maps', slug);
  mkdirp(outDir);
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
  console.log(`  Built: dist/maps/${slug}/index.html (${(html.length / 1024).toFixed(0)} KB)`);
}

// --- Main ---
function build() {
  const start = Date.now();
  console.log('Building maps...');

  // Clean dist
  if (fs.existsSync(DIST)) {
    fs.rmSync(DIST, { recursive: true });
  }
  mkdirp(DIST);

  // Copy landing page and assets
  if (fs.existsSync(path.join(ROOT, 'index.html'))) {
    fs.copyFileSync(path.join(ROOT, 'index.html'), path.join(DIST, 'index.html'));
  }
  if (fs.existsSync(path.join(ROOT, 'assets'))) {
    copyRecursive(path.join(ROOT, 'assets'), path.join(DIST, 'assets'));
  }

  // Load templates once
  const templates = loadTemplates();

  // Build each map
  const maps = getMapDirs();
  for (const slug of maps) {
    buildMap(slug, templates);
  }

  const elapsed = Date.now() - start;
  console.log(`Done! Built ${maps.length} map(s) in ${elapsed}ms`);
}

build();
