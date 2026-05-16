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
function loadSharedCSS(opts) {
  const cssFiles = ['base.css', 'layout.css', 'simulator.css', 'responsive.css', 'weather.css', 'maplibre-overrides.css'];
  // editorial.css must come *after* the legacy chrome CSS so it overrides it.
  if (opts && opts.editorial) cssFiles.push('editorial.css');
  return cssFiles.map(f => readFile(path.join(SRC, 'shared', f))).join('\n');
}

// --- Load embed CSS (shared + embed overrides) ---
function loadEmbedCSS() {
  const cssFiles = ['base.css', 'layout.css', 'simulator.css', 'responsive.css', 'weather.css', 'maplibre-overrides.css', 'embed.css'];
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
    'weather-ui.js',
    'view-switch.js',
    'sim-engine.js',
    'sim-renderers.js',
    'embed-modal.js',
    'pocket-map.js',
    'init.js',
  ];
  return jsFiles.map(f => readFile(path.join(SRC, 'shared', f))).join('\n\n');
}

// --- Load embed JS (shared + embed-params before init) ---
function loadEmbedJS() {
  const jsFiles = [
    'coord-helpers.js',
    'map-init.js',
    'map-layers.js',
    'map-toggles.js',
    'elevation-profile.js',
    'weather-ui.js',
    'view-switch.js',
    'sim-engine.js',
    'sim-renderers.js',
    'embed-params.js',
    'init.js',
  ];
  return jsFiles.map(f => readFile(path.join(SRC, 'shared', f))).join('\n\n');
}

// --- Load templates ---
function loadTemplates() {
  return {
    shell: readFile(path.join(SRC, 'templates', 'shell.html')),
    raceShell: readFile(path.join(SRC, 'templates', 'race-shell.html')),
    embedShell: readFile(path.join(SRC, 'templates', 'embed-shell.html')),
    mapView: readFile(path.join(SRC, 'templates', 'map-view.html')),
    simView: readFile(path.join(SRC, 'templates', 'sim-view.html')),
  };
}

// --- Editorial chrome: render the masthead/strip/notes/acquisition/cross-links HTML ---

const HTML_ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => HTML_ESCAPE[c]);
}
// Allow only <em> and <br/> in the masthead headline. Strip everything else.
function sanitizeNameDisplay(s) {
  if (!s) return '';
  return String(s)
    .replace(/<(?!\/?(?:em|br\s*\/?)\b)[^>]*>/gi, '')
    .replace(/<br\s*\/?>/gi, '<br/>');
}
function buildEditionLine(theme) {
  const parts = [];
  if (theme.identity.establishedYear) parts.push('Est. ' + theme.identity.establishedYear);
  parts.push(theme.geography.region);
  return parts.map(escapeHtml).join(' · ');
}

function buildAidTableRows(theme) {
  const km = theme.displayUnits === 'km';
  return (theme.aidStations || []).map(a => {
    const cutoff = a.cutoff
      ? `<br/><span class="aid-table__cutoff">Cutoff ${escapeHtml(a.cutoff)}</span>`
      : '';
    const distVal = km && a.kilometer != null
      ? a.kilometer.toFixed(1)
      : (a.mile != null ? a.mile.toFixed(1) : '—');
    return `<tr>
      <td class="aid-table__mile">${distVal}</td>
      <td class="aid-table__name">${escapeHtml(a.name)}${cutoff}</td>
      <td class="aid-table__stock">${escapeHtml(a.stocked)}</td>
    </tr>`;
  }).join('\n');
}

function aidTableDistHeader(theme) {
  return theme.displayUnits === 'km' ? 'Km' : 'Mile';
}

function buildDayGridRows(theme) {
  const rd = theme.raceDay || {};
  const rows = [];
  // Sunrise / sunset
  if (rd.sunrise) {
    rows.push(`<div class="day-grid__row">
      <dt>Sunrise</dt><dd>${escapeHtml(rd.sunrise)}</dd>
    </div>`);
  }
  if (rd.sunset) {
    rows.push(`<div class="day-grid__row">
      <dt>Sunset</dt><dd>${escapeHtml(rd.sunset)}</dd>
    </div>`);
  }
  // Per-distance run-start window
  for (const d of (theme.raceFormat && theme.raceFormat.distances) || []) {
    if (!d.runStartWindow) continue;
    rows.push(`<div class="day-grid__row">
      <dt>${escapeHtml(d.label)} run starts</dt>
      <dd>${escapeHtml(d.runStartWindow)}<span class="day-grid__sub">${d.runMiles} mi · ${d.runGainFt} ft gain</span></dd>
    </div>`);
  }
  // Cutoffs — labels in mile or km depending on theme.displayUnits
  const km = theme.displayUnits === 'km';
  for (const c of rd.cutoffs || []) {
    const distLabel = km
      ? `km ${(c.mile * 1.609344).toFixed(0)}`
      : `mile ${c.mile}`;
    rows.push(`<div class="day-grid__row">
      <dt>Cutoff · ${distLabel}</dt>
      <dd>${escapeHtml(c.time)}<span class="day-grid__sub">${escapeHtml(c.label)}</span></dd>
    </div>`);
  }
  return rows.join('\n');
}

function buildLogisticsCells(theme) {
  const l = theme.logistics || {};
  const cells = [];
  if (l.shuttle) {
    cells.push(`<div class="logistics-cell">
      <span class="logistics-cell__kind">Shuttle</span>
      <p>${escapeHtml(l.shuttle)}</p>
    </div>`);
  }
  if (l.spectatorTips) {
    cells.push(`<div class="logistics-cell">
      <span class="logistics-cell__kind">Spectator tips</span>
      <p>${escapeHtml(l.spectatorTips)}</p>
    </div>`);
  }
  return { shuttle: cells[0] || '', spectator: cells[1] || '' };
}

function buildCrossLinksBlock(theme) {
  return (theme.crossLinks || []).map(l =>
    `<li>
      <a href="/maps/${encodeURIComponent(l.slug)}/">
        <span class="cross-grid__name">${escapeHtml(l.name)}</span>
        <span class="cross-grid__region">${escapeHtml(l.region)}</span>
      </a>
    </li>`
  ).join('\n');
}

function buildEditorialCssVars(config) {
  // Theme-derived tokens — race-driven, not studio-driven.
  const t = config.theme;
  const themeVars = {
    '--paper':        t.palette.paper,
    '--ink':          t.palette.raceInk,
    '--race-brand':   t.palette.raceBrand,
    '--surface-warm': t.palette.surfaceWarm,
    '--route-color':  t.palette.routeColor,
    '--aid-color':    t.palette.aidStation,
    '--hazard-color': t.palette.hazard,
    '--font-display': t.type.displayStack,
    '--font-body':    t.type.bodyStack,
    '--font-micro':   t.type.microStack,
  };
  // Merge config.cssVars with theme tokens taking precedence.
  const merged = Object.assign({}, config.cssVars || {}, themeVars);
  const lines = Object.entries(merged).map(([k, v]) => `  ${k}: ${v};`).join('\n');
  return `:root {\n${lines}\n}`;
}

function deriveHostDomain(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch (e) {
    return url;
  }
}

function deriveGunTime(theme) {
  // The race's first start time (for triathlons, this is the rolling swim
  // gun; for run-only races, the run gun). The theme may set
  // raceDay.gunTime explicitly; otherwise we fall back to 8:00 AM as a
  // sensible US endurance-event default and never show "undefined" in the
  // top bar.
  return (theme.raceDay && theme.raceDay.gunTime) || '8:00 AM';
}
function buildGoogleFontsLink(href) {
  return [
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    `<link href="${href}" rel="stylesheet">`,
  ].join('\n');
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

// --- Build weather panel HTML ---
function buildWeatherHtml(weather) {
  if (!weather) return '';
  return `<aside class="weather-panel" id="weatherPanel">
  <div class="weather-panel-header" id="weatherPanelHeader" onclick="toggleWeatherPanel()">
    <h3>Weather Intelligence</h3>
    <button class="weather-toggle-btn" id="weatherToggleBtn" aria-label="Toggle weather panel">
      <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
    </button>
  </div>
  <div class="weather-panel-body" id="weatherPanelBody">
    <div class="weather-risk-row" id="weatherRiskCards"></div>
    <div id="weatherDaily"></div>
    <div id="weatherCurrent">
      <div class="weather-loading">Loading current conditions\u2026</div>
    </div>
    <div id="weatherRadar">
      <div class="weather-radar-section">
        <div class="weather-radar-title">Radar</div>
        <div class="weather-radar-loading">Loading radar\u2026</div>
      </div>
    </div>
    <div id="weatherExplainer"></div>
  </div>
</aside>`;
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
    cutoffs: config.cutoffs || null,
    loopMiles: config.loopMiles || null,
    loopGain: config.loopGain || null,
    colors: config.colors,
    weather: config.weather || null,
  };

  // Inline trails data separately (can be large)
  const trailsJson = JSON.stringify(config.trailsData);
  const configJson = JSON.stringify(browserConfig);

  let result = `var CONFIG = ${configJson};\nCONFIG.trailsData = ${trailsJson};`;
  if (config.weather) {
    result += `\nCONFIG.weather = ${JSON.stringify(config.weather)};`;
  }
  return result;
}

// --- Build one map ---
function buildMap(slug, templates) {
  const mapDir = path.join(SRC, 'maps', slug);
  // Clear require cache so config reloads on rebuild
  const configPath = path.resolve(path.join(mapDir, 'config.js'));
  delete require.cache[configPath];
  const config = require(configPath);

  const editorial = !!config.theme;
  const cssVars = editorial ? buildEditorialCssVars(config) : buildCssVars(config);
  const sharedCSS = loadSharedCSS({ editorial });
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
  // For skipSharedJs maps, inject shared modules that header buttons and weather need
  const embedModalJS = config.skipSharedJs
    ? readFile(path.join(SRC, 'shared', 'embed-modal.js'))
    : '';
  const pocketMapJS = config.skipSharedJs
    ? readFile(path.join(SRC, 'shared', 'pocket-map.js'))
    : '';
  const weatherUiJS = config.skipSharedJs
    ? readFile(path.join(SRC, 'shared', 'weather-ui.js'))
    : '';
  // Editorial chrome runtime — countdown, embed-mode detection, cue↔map
  // hover sync, top-bar weather widget. Loaded only when a theme is set.
  const editorialRuntimeJS = editorial
    ? readFile(path.join(SRC, 'shared', 'editorial-runtime.js'))
    : '';

  const fullJS = configData + '\n\n' + sharedJS + (weatherUiJS ? '\n\n' + weatherUiJS : '') + (embedModalJS ? '\n\n' + embedModalJS : '') + (pocketMapJS ? '\n\n' + pocketMapJS : '') + (overrideJS ? '\n\n' + overrideJS : '') + (editorialRuntimeJS ? '\n\n' + editorialRuntimeJS : '');

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
      .replace('{{WEATHER_HTML}}', config.weatherHtml || buildWeatherHtml(config.weather))
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

  // Build final HTML — editorial path uses race-shell.html and renders the
  // athlete-first chrome (top bar, sticky-map split, race-day essentials)
  // from the theme.
  let html;
  if (editorial) {
    const t = config.theme;
    const fontsLink = t.type.googleFontsHref
      ? buildGoogleFontsLink(t.type.googleFontsHref)
      : (config.googleFontsUrl || '');
    const headlineDistance = (t.raceFormat.distances || []).find(d => d.id === t.raceFormat.defaultDistanceId)
      || t.raceFormat.distances[0];
    const logCells = buildLogisticsCells(t);
    const hostDomain = deriveHostDomain(t.identity.hostUrl);
    const fillEditorial = (tpl) => tpl
      .replace(/{{THEME_COLOR}}/g, config.themeColor)
      .replace(/{{TITLE}}/g, config.title)
      .replace(/{{GOOGLE_FONTS}}/g, fontsLink)
      .replace(/{{SLUG}}/g, t.slug)
      .replace(/{{HOST_URL}}/g, escapeHtml(t.identity.hostUrl))
      .replace(/{{HOST_DOMAIN}}/g, escapeHtml(hostDomain))
      .replace(/{{HOST_GUIDE_URL}}/g, escapeHtml(t.logistics.hostGuideUrl || t.identity.hostUrl))
      .replace(/{{RACE_NAME_SHORT}}/g, escapeHtml(t.identity.name))
      .replace(/{{EDITION_LINE}}/g, buildEditionLine(t))
      .replace(/{{RACE_DAY_DISPLAY}}/g, escapeHtml(t.raceDay.displayDate))
      .replace(/{{GUN_TIME}}/g, escapeHtml(deriveGunTime(t)))
      .replace(/{{RACE_DATE_ISO}}/g, escapeHtml(t.raceDay.date))
      .replace(/{{RACE_NAME_DISPLAY}}/g, escapeHtml(t.identity.name))
      .replace(/{{RACE_NAME}}/g, escapeHtml(config.raceName))
      .replace(/{{HEADLINE_DISTANCE_LABEL}}/g, escapeHtml(headlineDistance.label))
      .replace(/{{HEADLINE_MILES}}/g, headlineDistance.runMiles + ' mi · ' + headlineDistance.runGainFt + ' ft')
      .replace(/{{DEFAULT_DISTANCE_ID}}/g, headlineDistance.id)
      .replace(/{{DEFAULT_DISTANCE_LABEL}}/g, escapeHtml(headlineDistance.label))
      .replace(/{{MAP_HTML}}/g, config.mapHtml || mapView)
      .replace(/{{CUES_HTML}}/g, config.cueHtml || '')
      .replace(/{{MAP_VIEW}}/g, mapView)
      .replace(/{{SIM_VIEW}}/g, simView)
      .replace(/{{AID_TABLE_ROWS}}/g, buildAidTableRows(t))
      .replace(/{{AID_TABLE_DIST_HEADER}}/g, aidTableDistHeader(t))
      .replace(/{{DAY_GRID_ROWS}}/g, buildDayGridRows(t))
      .replace(/{{LOGISTICS_PARKING}}/g, escapeHtml(t.logistics.parking))
      .replace(/{{LOGISTICS_PACKET}}/g, escapeHtml(t.logistics.packetPickup))
      .replace(/{{LOGISTICS_SHUTTLE_CELL}}/g, logCells.shuttle)
      .replace(/{{LOGISTICS_SPECTATOR_CELL}}/g, logCells.spectator)
      .replace(/{{CARTOGRAPHER_NOTES}}/g, escapeHtml(t.cartographerNotes))
      .replace(/{{CROSS_LINKS_BLOCK}}/g, buildCrossLinksBlock(t))
      .replace(/{{CSS_VARS}}/g, '')
      .replace(/{{CSS}}/g, fullCSS)
      .replace(/{{FOOTER_HTML}}/g, config.footerHtml || '')
      .replace(/{{CONFIG_DATA}}/g, '')
      .replace(/{{JS}}/g, fullJS);
    html = fillEditorial(templates.raceShell);
  } else {
    html = templates.shell
      .replace('{{THEME_COLOR}}', config.themeColor)
      .replace('{{TITLE}}', config.title)
      .replace('{{GOOGLE_FONTS}}', config.googleFontsUrl || '')
      .replace('{{CSS_VARS}}', '')
      .replace('{{CSS}}', fullCSS)
      .replace('{{RACE_NAME}}', config.raceName)
      .replace('{{SUBTITLE}}', config.subtitle)
      .replace('{{MAP_VIEW}}', mapView)
      .replace('{{SIM_VIEW}}', simView)
      .replace('{{FOOTER_HTML}}', config.footerHtml || '')
      .replace('{{CONFIG_DATA}}', '')
      .replace('{{JS}}', fullJS);
  }

  // Write output
  const outDir = path.join(DIST, 'maps', slug);
  mkdirp(outDir);
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
  console.log(`  Built: dist/maps/${slug}/index.html (${(html.length / 1024).toFixed(0)} KB)`);
}

// --- Build one embed ---
function buildEmbed(slug, templates) {
  const mapDir = path.join(SRC, 'maps', slug);
  const configPath = path.resolve(path.join(mapDir, 'config.js'));
  delete require.cache[configPath];
  const config = require(configPath);

  // Allow maps to opt out of embed generation
  if (config.noEmbed) return;

  const cssVars = buildCssVars(config);
  const sharedCSS = loadEmbedCSS();
  let overrideCSS = config.cssOverrides || '';
  if (config.overrideCss) {
    overrideCSS += '\n' + readFile(path.join(mapDir, config.overrideCss));
  }
  const fullCSS = cssVars + '\n' + sharedCSS + (overrideCSS ? '\n' + overrideCSS : '');

  const configData = config.configDataJs || buildConfigData(config);
  // For skipSharedJs maps, inject embed-params.js and weather-ui.js alongside the override JS
  const embedParamsJS = readFile(path.join(SRC, 'shared', 'embed-params.js'));
  const embedWeatherUiJS = readFile(path.join(SRC, 'shared', 'weather-ui.js'));
  let sharedJS, fullJS;
  if (config.skipSharedJs) {
    const overrideJS = config.overrideJs
      ? readFile(path.join(mapDir, config.overrideJs))
      : '';
    fullJS = configData + '\n\n' + embedWeatherUiJS + '\n\n' + embedParamsJS + '\n\n' + overrideJS;
  } else {
    sharedJS = loadEmbedJS();
    const overrideJS = config.overrideJs
      ? readFile(path.join(mapDir, config.overrideJs))
      : '';
    fullJS = configData + '\n\n' + sharedJS + (overrideJS ? '\n\n' + overrideJS : '');
  }

  // Build map view HTML (same logic as buildMap)
  let mapView;
  if (config.mapViewHtml) {
    mapView = config.mapViewHtml;
  } else {
    mapView = templates.mapView
      .replace('{{INFO_BADGE_LABEL}}', config.infoBadgeLabel || '')
      .replace('{{INFO_BADGE_VALUE}}', config.infoBadgeValue || '')
      .replace('{{TOGGLE_BUTTONS}}', buildToggleButtons(config))
      .replace('{{STATS_HTML}}', config.statsHtml || '')
      .replace('{{WEATHER_HTML}}', config.weatherHtml || buildWeatherHtml(config.weather))
      .replace('{{PROFILE_STATS}}', config.profileStats || '')
      .replace('{{COURSE_DESCRIPTION_HTML}}', config.courseDescriptionHtml || '');
  }

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

  // Build final HTML from embed template
  let html = templates.embedShell
    .replace('{{THEME_COLOR}}', config.themeColor)
    .replace('{{TITLE}}', config.title)
    .replace('{{GOOGLE_FONTS}}', config.googleFontsUrl || '')
    .replace('{{CSS}}', fullCSS)
    .replace('{{RACE_NAME}}', config.raceName)
    .replace('{{MAP_VIEW}}', mapView)
    .replace('{{SIM_VIEW}}', simView)
    .replace('{{JS}}', fullJS);

  // Write output
  const outDir = path.join(DIST, 'embed', slug);
  mkdirp(outDir);
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
  console.log(`  Built: dist/embed/${slug}/index.html (${(html.length / 1024).toFixed(0)} KB)`);
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

  // Build each map + embed
  const maps = getMapDirs();
  for (const slug of maps) {
    buildMap(slug, templates);
    buildEmbed(slug, templates);
  }

  const elapsed = Date.now() - start;
  console.log(`Done! Built ${maps.length} map(s) + embeds in ${elapsed}ms`);
}

build();
