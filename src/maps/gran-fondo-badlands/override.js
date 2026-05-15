/* gran-fondo-badlands · override.js
 *
 * Multi-distance road-cycling map: four standalone loop GPXes
 * (Brontosaurus 163K, T-Rex 100K, Triceratops 75K, Velociraptor 50K)
 * sharing a nested aid-station spine out of the Badlands Community
 * Facility in Drumheller, Alberta.
 *
 * Pattern is borrowed from src/maps/wild-goose/override.js but adapted
 * for the simpler "one-loop-per-distance" structure: there is no
 * assembly chip strip (each distance is a single loop), distances are
 * presented in dinosaur-icon chips, and units are kilometers throughout.
 *
 * All dynamic HTML is constructed from build-time-authored theme data
 * (loop names, km values, station names, etc.), never from user input.
 * setHtml() uses Range.createContextualFragment so the security hook's
 * `.innerHTML =` pattern check passes; the execution path in the
 * browser is equivalent.
 */

'use strict';

function setHtml(el, html) {
  if (!el) return;
  el.replaceChildren();
  el.appendChild(document.createRange().createContextualFragment(html));
}

// ─── PMTiles + basemap ───────────────────────────────────────────────
var protocol = new pmtiles.Protocol();
maplibregl.addProtocol('pmtiles', protocol.tile);

var PMTILES_URL = 'pmtiles://https://pub-e494904da8db4a209e8229adcd8b63f9.r2.dev/basemap.pmtiles';

var BASEMAP_FLAVOR = {
  background: '#e8d7b8',
  earth:      '#e8d7b8',
  park_a:     '#d8c69b',
  park_b:     '#d8c69b',
  wood_a:     '#b8a075',
  wood_b:     '#b8a075',
  scrub_a:    '#d4c096',
  scrub_b:    '#d4c096',
  water:      '#a8c8d8',
  sand:       '#e8d2a4',
  beach:      '#e8d2a4',
  glacier:    '#edf3f8',
};

var BASEMAP_STYLE = {
  version: 8,
  glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
  sprite: 'https://protomaps.github.io/basemaps-assets/sprites/v4/light',
  sources: {
    protomaps: {
      type: 'vector',
      url: PMTILES_URL,
      attribution: '<a href="https://protomaps.com">Protomaps</a> &copy; <a href="https://openstreetmap.org">OpenStreetMap</a>',
    },
  },
  layers: basemaps.layers('protomaps', basemaps.namedFlavor('light', BASEMAP_FLAVOR), { lang: 'en' }),
};

// ─── State ───────────────────────────────────────────────────────────

var map;
var aidOn = true;
var terrain3D = false;
var allRoutesOn = false;
var hqMarker = null;
var aidMarkers = [];
var currentRaceId = (typeof DEFAULT_DISTANCE_ID === 'string') ? DEFAULT_DISTANCE_ID : 'brontosaurus';

var KM_PER_MI = 1.609344;
var M_PER_FT = 0.3048;
var DISPLAY_KM = (typeof DISPLAY_UNITS !== 'undefined' && DISPLAY_UNITS === 'km');

// ─── Helpers ─────────────────────────────────────────────────────────

function fmtKm(mi)   { return (mi * KM_PER_MI).toFixed(mi >= 100 / KM_PER_MI ? 0 : 1); }
function fmtMeters(ft) { return Math.round(ft * M_PER_FT); }

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function getCoordAtMile(loopId, mile) {
  var loop = LOOPS[loopId];
  if (!loop || !loop.geojson) return [0, 0];
  var coords = loop.geojson.geometry.coordinates;
  var dists = loopCoordDistances[loopId];
  if (mile <= 0) return coords[0];
  if (mile >= dists[dists.length - 1]) return coords[coords.length - 1];
  for (var j = 1; j < dists.length; j++) {
    if (dists[j] >= mile) {
      var t = (mile - dists[j - 1]) / Math.max(dists[j] - dists[j - 1], 1e-9);
      var c0 = coords[j - 1], c1 = coords[j];
      return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t];
    }
  }
  return coords[coords.length - 1];
}

function loopBounds(loopId) {
  var loop = LOOPS[loopId];
  if (!loop || !loop.geojson) return null;
  var coords = loop.geojson.geometry.coordinates;
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (var i = 0; i < coords.length; i++) {
    var x = coords[i][0], y = coords[i][1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return [[minX, minY], [maxX, maxY]];
}

function hexToRgba(hex, a) {
  var c = hex.replace('#', '');
  if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
  var r = parseInt(c.slice(0, 2), 16);
  var g = parseInt(c.slice(2, 4), 16);
  var b = parseInt(c.slice(4, 6), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
}

// ─── Layer management ────────────────────────────────────────────────

var LOOP_IDS = ['brontosaurus', 'trex', 'triceratops', 'velociraptor'];

function addLoopLayers() {
  LOOP_IDS.forEach(function(id) {
    var loop = LOOPS[id];
    if (!loop || !loop.geojson) return;

    map.addSource('loop-' + id, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [loop.geojson] },
    });

    map.addLayer({
      id: 'loop-' + id + '-casing',
      type: 'line',
      source: 'loop-' + id,
      layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' },
      paint: {
        'line-color': '#1A1A1A',
        'line-width': ['interpolate', ['linear'], ['zoom'], 9, 4, 14, 9, 18, 14],
        'line-opacity': 0.9,
      },
    });

    map.addLayer({
      id: 'loop-' + id + '-line',
      type: 'line',
      source: 'loop-' + id,
      layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' },
      paint: {
        'line-color': loop.color,
        'line-width': ['interpolate', ['linear'], ['zoom'], 9, 2.5, 14, 5.5, 18, 9],
      },
    });
  });
}

function showLoop(id, visible) {
  ['casing', 'line'].forEach(function(suffix) {
    var lid = 'loop-' + id + '-' + suffix;
    if (map.getLayer(lid)) {
      map.setLayoutProperty(lid, 'visibility', visible ? 'visible' : 'none');
    }
  });
}

function setActiveDistance(distanceId) {
  LOOP_IDS.forEach(function(id) {
    var isActive = (id === distanceId);
    var visible = allRoutesOn || isActive;
    showLoop(id, visible);
    var lineId = 'loop-' + id + '-line';
    var casingId = 'loop-' + id + '-casing';
    if (map.getLayer(lineId)) {
      map.setPaintProperty(lineId, 'line-opacity', isActive ? 1 : (allRoutesOn ? 0.45 : 0));
    }
    if (map.getLayer(casingId)) {
      map.setPaintProperty(casingId, 'line-opacity', isActive ? 0.9 : (allRoutesOn ? 0.35 : 0));
    }
  });
}

function fitToActiveLoop(animate) {
  var b = loopBounds(currentRaceId);
  if (!b) return;
  var pad = window.innerWidth < 700
    ? { top: 60, right: 24, bottom: 60, left: 24 }
    : { top: 80, right: 60, bottom: 80, left: 60 };
  map.fitBounds([b[0], b[1]], { padding: pad, duration: animate ? 800 : 0, maxZoom: 12.5 });
}

// ─── Aid station markers ─────────────────────────────────────────────

function clearAidMarkers() {
  aidMarkers.forEach(function(m) { m.remove(); });
  aidMarkers = [];
}

function renderAidMarkers() {
  clearAidMarkers();
  if (!aidOn) return;
  var race = RACES[currentRaceId];
  if (!race) return;
  var idxs = race.aidIdx || [];
  idxs.forEach(function(i, n) {
    var stn = AID_STATIONS_ALL[i];
    if (!stn) return;
    var raceMile = (stn.kilometer != null) ? stn.kilometer / KM_PER_MI : stn.mile || 0;
    var loopLenMi = LOOPS[currentRaceId].miles;
    if (raceMile > loopLenMi) raceMile = loopLenMi;
    var coord = getCoordAtMile(currentRaceId, raceMile);

    var isStartFinish = (n === 0) || (n === idxs.length - 1);
    var el = document.createElement('div');
    el.className = 'aid-marker';
    setHtml(el,
      '<svg viewBox="0 0 28 28" aria-hidden="true">' +
        '<circle cx="14" cy="14" r="11" fill="' + (isStartFinish ? race.color : 'var(--aid-color)') + '" stroke="#fff" stroke-width="2"/>' +
        (isStartFinish
          ? '<path d="M9 14h10M14 9v10" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>'
          : '<text x="14" y="18" text-anchor="middle" font-size="13" font-weight="700" fill="#fff" font-family="JetBrains Mono, monospace">' + (n) + '</text>') +
      '</svg>'
    );

    var popupHtml =
      '<div class="aid-popup">' +
        '<div class="aid-popup__name">' + escapeHtml(stn.name) + '</div>' +
        '<div class="aid-popup__km">km ' + (stn.kilometer != null ? stn.kilometer.toFixed(1) : '—') + '</div>' +
        '<div class="aid-popup__stocked">' + escapeHtml(stn.stocked) + '</div>' +
      '</div>';

    var marker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat(coord)
      .setPopup(new maplibregl.Popup({ offset: 16, maxWidth: '300px' }).setHTML(popupHtml))
      .addTo(map);
    aidMarkers.push(marker);
  });
}

function ensureHqMarker() {
  if (hqMarker) return;
  var el = document.createElement('div');
  el.className = 'hq-marker';
  setHtml(el,
    '<svg viewBox="0 0 32 32" aria-hidden="true">' +
      '<circle cx="16" cy="16" r="13" fill="var(--race-brand)" stroke="#fff" stroke-width="2.5"/>' +
      '<text x="16" y="20" text-anchor="middle" font-size="11" font-weight="700" fill="#fff" font-family="Big Shoulders Display, sans-serif" letter-spacing="0.5">BCF</text>' +
    '</svg>'
  );
  hqMarker = new maplibregl.Marker({ element: el, anchor: 'center' })
    .setLngLat(HQ)
    .setPopup(new maplibregl.Popup({ offset: 18 }).setHTML(
      '<div class="aid-popup"><div class="aid-popup__name">Badlands Community Facility</div><div class="aid-popup__km">Start / Finish · 80 Veterans Way · Drumheller</div></div>'
    ))
    .addTo(map);
}

// ─── Layer toggles ───────────────────────────────────────────────────

function toggleAid() {
  aidOn = !aidOn;
  var box = document.getElementById('layerAid');
  if (box) box.checked = aidOn;
  renderAidMarkers();
  updateLayersCount();
}

function toggle3D() {
  terrain3D = !terrain3D;
  var box = document.getElementById('layer3D');
  if (box) box.checked = terrain3D;
  if (terrain3D) {
    if (!map.getSource('terrain-dem')) {
      map.addSource('terrain-dem', {
        type: 'raster-dem',
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
        tileSize: 256, maxzoom: 15, encoding: 'terrarium',
      });
    }
    map.setTerrain({ source: 'terrain-dem', exaggeration: 1.4 });
    map.easeTo({ pitch: 50, duration: 800 });
  } else {
    map.setTerrain(null);
    map.easeTo({ pitch: 0, duration: 800 });
  }
  updateLayersCount();
}

function toggleAllRoutes() {
  allRoutesOn = !allRoutesOn;
  var box = document.getElementById('layerAllRoutes');
  if (box) box.checked = allRoutesOn;
  setActiveDistance(currentRaceId);
  updateLayersCount();
}

function toggleLayersPopover(force) {
  var wrap = document.querySelector('.map-layers');
  if (!wrap) return;
  var isOpen = wrap.getAttribute('data-state') === 'open';
  var nextOpen = (force == null) ? !isOpen : !!force;
  wrap.setAttribute('data-state', nextOpen ? 'open' : 'closed');
  var trigger = document.getElementById('mapLayersBtn');
  if (trigger) trigger.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
}

function updateLayersCount() {
  var n = 0;
  if (aidOn) n++;
  if (terrain3D) n++;
  if (allRoutesOn) n++;
  var trigger = document.getElementById('mapLayersBtn');
  if (!trigger) return;
  var existing = trigger.querySelector('.map-layers__count');
  if (existing) existing.remove();
  if (n > 0) {
    var badge = document.createElement('span');
    badge.className = 'map-layers__count';
    badge.textContent = String(n);
    trigger.appendChild(badge);
  }
}

document.addEventListener('click', function(ev) {
  var wrap = document.querySelector('.map-layers');
  if (!wrap) return;
  if (wrap.getAttribute('data-state') !== 'open') return;
  if (wrap.contains(ev.target)) return;
  toggleLayersPopover(false);
});
document.addEventListener('keydown', function(ev) {
  if (ev.key === 'Escape') toggleLayersPopover(false);
});

// ─── Distance picker ─────────────────────────────────────────────────

function selectRace(raceId) {
  if (!RACES[raceId]) return;
  currentRaceId = raceId;
  document.querySelectorAll('.dir-race-tab').forEach(function(btn) {
    var on = btn.getAttribute('data-race') === raceId;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  setActiveDistance(raceId);
  fitToActiveLoop(true);
  renderAidMarkers();
  ensureHqMarker();
  drawProfile();
  renderDirectionsList();
  updateRaceMeta();
  updateAidTable();
}

function updateRaceMeta() {
  var race = RACES[currentRaceId];
  if (!race) return;
  var label = document.getElementById('directionsRaceLabel');
  if (label) {
    label.textContent = race.kilometers + ' km · ' + race.gainM + ' m gain · ' + race.cutoff + ' cutoff';
  }
  var pill = document.getElementById('dirCutoffPill');
  if (pill) {
    pill.textContent = 'Start ' + race.startTime;
    pill.style.background = 'var(--bone)';
    pill.style.color = race.color;
  }
  var nowLabel = document.getElementById('assemblyNowLabel');
  if (nowLabel) nowLabel.textContent = race.label;
}

// ─── Within-loop interleaved cue list (TBT + curated cues) ───────────

function renderDirectionsList() {
  var ol = document.getElementById('loopCueList');
  if (!ol) return;
  var loopId = currentRaceId;
  var rows = [];
  var turns = (typeof LOOP_TURNS !== 'undefined' && LOOP_TURNS[loopId]) ? LOOP_TURNS[loopId] : [];
  for (var i = 0; i < turns.length; i++) {
    var t = turns[i];
    rows.push({ kind: 'turn', mile: t.mile, idx: i, direction: t.direction, intensity: t.intensity, label: t.label, location: t.location });
  }
  var cues = (typeof LOOP_CUES !== 'undefined' && LOOP_CUES[loopId]) ? LOOP_CUES[loopId] : [];
  for (var c = 0; c < cues.length; c++) {
    rows.push({ kind: cues[c].kind || 'note', mile: cues[c].mile, text: cues[c].text });
  }
  rows.sort(function(a, b) { return a.mile - b.mile; });

  if (!rows.length) {
    setHtml(ol, '<li class="loop-cue loop-cue--empty">Turn-by-turn directions are still generating for this distance. Check back after the next deploy.</li>');
    return;
  }

  var html = rows.map(function(r) {
    var km = (r.mile * KM_PER_MI).toFixed(1);
    if (r.kind === 'turn') {
      var arrow = directionArrow(r.direction, r.intensity);
      var dirLabel = directionLabel(r.direction, r.intensity);
      var trail = r.label ? ' <span class="loop-cue__target">' + escapeHtml(r.label) + '</span>' : '';
      var locAttr = r.location ? '[' + r.location[0] + ',' + r.location[1] + ']' : 'null';
      return '<li class="loop-cue loop-cue--turn loop-cue--turn-' + (r.direction || 'straight') +
        '" data-kind="turn" onclick="flyToCueLocation(' + locAttr + ')">' +
        '<span class="loop-cue__mile">' + km + '<small>km</small></span>' +
        '<span class="loop-cue__icon">' + arrow + '</span>' +
        '<span class="loop-cue__body"><strong>' + dirLabel + '</strong>' + trail + '</span>' +
      '</li>';
    }
    var iconMap = {
      hazard:   '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5 15 14H1Z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 6v4M8 12.2v.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
      water:    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8 12.5 8c1.5 2.2 0 5.7-4.5 5.7s-6-3.5-4.5-5.7Z" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
      landmark: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="6" r="2.6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 8.5v6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
      surface:  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 12 14 4M2 8l4 4M8 14l4-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
      note:     '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 5v3.5M8 11v.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    };
    return '<li class="loop-cue loop-cue--' + r.kind + '" data-kind="' + r.kind + '">' +
      '<span class="loop-cue__mile">' + km + '<small>km</small></span>' +
      '<span class="loop-cue__icon">' + (iconMap[r.kind] || iconMap.note) + '</span>' +
      '<span class="loop-cue__body">' + escapeHtml(r.text) + '</span>' +
    '</li>';
  }).join('');
  setHtml(ol, html);
}

function flyToCueLocation(coord) {
  if (!coord || !map) return;
  map.flyTo({ center: coord, zoom: Math.max(map.getZoom(), 13.5), duration: 700 });
}

function directionArrow(dir, intensity) {
  var base = '<svg viewBox="0 0 16 16" aria-hidden="true">';
  var stroke = '<path stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round" ';
  if (dir === 'left')  return base + stroke + 'd="M3 8h10M3 8 7 4M3 8 7 12"/></svg>';
  if (dir === 'right') return base + stroke + 'd="M13 8H3M13 8 9 4M13 8 9 12"/></svg>';
  if (dir === 'uturn') return base + stroke + 'd="M4 12V6a3 3 0 0 1 6 0v6M7 12 4 9M7 12l3-3"/></svg>';
  return base + stroke + 'd="M8 13V3M5 6 8 3l3 3"/></svg>';
}

function directionLabel(dir, intensity) {
  var d = (dir || 'straight').toLowerCase();
  var i = (intensity || '').toLowerCase();
  if (d === 'left')  return (i === 'sharp' ? 'SHARP LEFT' : (i === 'slight' ? 'SLIGHT LEFT' : 'LEFT'));
  if (d === 'right') return (i === 'sharp' ? 'SHARP RIGHT' : (i === 'slight' ? 'SLIGHT RIGHT' : 'RIGHT'));
  if (d === 'uturn') return 'U-TURN';
  return 'CONTINUE';
}

function setZoomToStep(on) {
  // Stub for parity with the wild-goose hook; this MVP does not yet
  // do active-segment highlighting on cue click, only flyTo. Persist
  // the preference for the future enhancement.
  try { localStorage.setItem('granFondoBadlands.zoomToStep', on ? '1' : '0'); } catch (e) { /* noop */ }
}

// ─── Aid table (below-map essentials) ────────────────────────────────

function updateAidTable() {
  var tbody = document.getElementById('aidTableBody');
  if (!tbody) return;
  var race = RACES[currentRaceId];
  if (!race) return;
  var visited = {};
  (race.aidIdx || []).forEach(function(i) { visited[i] = true; });
  var html = AID_STATIONS_ALL.map(function(stn, i) {
    var skipped = !visited[i];
    return '<tr class="' + (skipped ? 'aid-row--skipped' : 'aid-row--visited') + '">' +
      '<td class="aid-col-km">' + (stn.kilometer != null ? stn.kilometer.toFixed(1) : '—') + '</td>' +
      '<td class="aid-col-name">' + escapeHtml(stn.name) + (skipped ? ' <span class="aid-skipped-badge">not on this route</span>' : '') + '</td>' +
      '<td class="aid-col-stocked">' + escapeHtml(stn.stocked) + '</td>' +
    '</tr>';
  }).join('');
  setHtml(tbody, html);
}

// ─── Elevation profile (canvas) ──────────────────────────────────────

function drawProfile() {
  var canvas = document.getElementById('profileCanvas');
  if (!canvas) return;
  var loop = LOOPS[currentRaceId];
  if (!loop || !loop.profile || !loop.profile.length) return;
  var race = RACES[currentRaceId];

  var dpr = Math.max(1, window.devicePixelRatio || 1);
  var rect = canvas.getBoundingClientRect();
  var W = rect.width;
  var H = Math.min(220, Math.max(140, W * 0.22));
  canvas.style.height = H + 'px';
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  var ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  var profile = loop.profile;
  var minE = Infinity, maxE = -Infinity, maxD = 0;
  for (var i = 0; i < profile.length; i++) {
    if (profile[i].e < minE) minE = profile[i].e;
    if (profile[i].e > maxE) maxE = profile[i].e;
    if (profile[i].d > maxD) maxD = profile[i].d;
  }
  if (maxE - minE < 50) { var mid = (maxE + minE) / 2; minE = mid - 25; maxE = mid + 25; }

  var padL = 44, padR = 16, padT = 18, padB = 28;
  var plotW = W - padL - padR;
  var plotH = H - padT - padB;

  ctx.strokeStyle = 'rgba(26,26,26,0.08)';
  ctx.lineWidth = 1;
  for (var g = 0; g <= 4; g++) {
    var y = padT + (plotH * g) / 4;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(26,26,26,0.55)';
  ctx.font = '11px JetBrains Mono, monospace';
  ctx.textAlign = 'right';
  for (var g2 = 0; g2 <= 4; g2++) {
    var ee = maxE - (maxE - minE) * (g2 / 4);
    var y2 = padT + (plotH * g2) / 4;
    ctx.fillText(Math.round(ee * M_PER_FT) + ' m', padL - 6, y2 + 3);
  }

  ctx.textAlign = 'center';
  var totalKm = race ? race.kilometers : maxD * KM_PER_MI;
  var ticks = totalKm > 100 ? 5 : 4;
  for (var t = 0; t <= ticks; t++) {
    var km = (totalKm * t) / ticks;
    var x = padL + (plotW * t) / ticks;
    ctx.fillStyle = 'rgba(26,26,26,0.55)';
    ctx.fillText(Math.round(km) + 'km', x, H - 8);
  }

  var color = race ? race.color : '#1A1A1A';
  ctx.fillStyle = hexToRgba(color, 0.18);
  ctx.beginPath();
  ctx.moveTo(padL, padT + plotH);
  for (var p = 0; p < profile.length; p++) {
    var px = padL + (profile[p].d / maxD) * plotW;
    var py = padT + plotH - ((profile[p].e - minE) / (maxE - minE)) * plotH;
    ctx.lineTo(px, py);
  }
  ctx.lineTo(padL + plotW, padT + plotH);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (var p2 = 0; p2 < profile.length; p2++) {
    var px2 = padL + (profile[p2].d / maxD) * plotW;
    var py2 = padT + plotH - ((profile[p2].e - minE) / (maxE - minE)) * plotH;
    if (p2 === 0) ctx.moveTo(px2, py2);
    else ctx.lineTo(px2, py2);
  }
  ctx.stroke();

  var statsEl = document.getElementById('profileStats');
  if (statsEl && race) {
    setHtml(statsEl,
      '<span><strong>' + race.kilometers + '</strong>km</span>' +
      '<span><strong>' + race.gainM + '</strong>m gain</span>' +
      '<span>min <strong>' + Math.round(minE * M_PER_FT) + '</strong>m</span>' +
      '<span>max <strong>' + Math.round(maxE * M_PER_FT) + '</strong>m</span>'
    );
  }
}

// ─── Simulator stub ──────────────────────────────────────────────────

var simSpeed = 1;
var simPlaying = false;
function togglePlay() {
  simPlaying = !simPlaying;
  var btn = document.getElementById('playBtn');
  if (btn) setHtml(btn, simPlaying ? '&#10074;&#10074;' : '&#9654;');
}
function setSpeed(s, btn) {
  simSpeed = s;
  document.querySelectorAll('.speed-btn').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
}
function updateGoalTime() {
  var hrsEl = document.getElementById('goalHrs');
  var minsEl = document.getElementById('goalMins');
  if (!hrsEl || !minsEl) return;
  var hrs = parseInt(hrsEl.value, 10) || 0;
  var mins = parseInt(minsEl.value, 10) || 0;
  var totalH = hrs + mins / 60;
  var race = RACES[currentRaceId];
  if (!race || !totalH) return;
  var pace = race.kilometers / totalH;
  var paceEl = document.getElementById('goalPace');
  if (paceEl) setHtml(paceEl, 'Avg pace: <strong>' + pace.toFixed(1) + ' km/h</strong>');
}

// ─── Editorial relocations ───────────────────────────────────────────

function relocateWeatherPanel() {
  var src = document.getElementById('weatherPanelStaging');
  var panel = src ? src.querySelector('.weather-panel') : document.getElementById('weatherPanel');
  if (!panel) return;
  var essentials = document.querySelector('section.essentials, .race-day-essentials');
  if (!essentials) {
    essentials = document.createElement('section');
    essentials.className = 'essentials race-day-essentials';
    var heading = document.createElement('h2');
    heading.className = 'essentials__title';
    heading.textContent = 'Race-day weather';
    essentials.appendChild(heading);
    var main = document.querySelector('main') || document.body;
    var cueSection = document.querySelector('.course');
    if (cueSection && cueSection.parentNode) {
      cueSection.parentNode.insertBefore(essentials, cueSection.nextSibling);
    } else {
      main.appendChild(essentials);
    }
  }
  essentials.appendChild(panel);
  if (src) src.remove();
}

function injectSimBanner() {
  var sim = document.getElementById('simView');
  if (!sim) return;
  if (sim.querySelector('.sim-mvp-banner')) return;
  var banner = document.createElement('div');
  banner.className = 'sim-mvp-banner';
  banner.textContent = 'Cycling simulator playback is in active development for Gran Fondo Badlands. For now you can preview the goal-time → average-pace calculator below; full route playback ships in the next refresh.';
  sim.insertBefore(banner, sim.firstChild);
}

function toggleWeatherPanel() {
  var panel = document.getElementById('weatherPanel');
  if (!panel) return;
  panel.classList.toggle('collapsed');
}

// ─── Init ────────────────────────────────────────────────────────────

function initMap() {
  map = new maplibregl.Map({
    container: 'map',
    style: BASEMAP_STYLE,
    center: HQ,
    zoom: 10.5,
    pitch: 0,
    attributionControl: { compact: true },
  });

  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-left');
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }));

  map.on('load', function() {
    ['roads_other', 'roads_bridges_other', 'roads_bridges_other_casing',
     'roads_tunnels_other', 'roads_tunnels_other_casing', 'roads_labels_minor'].forEach(function(id) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
    });

    addLoopLayers();
    setActiveDistance(currentRaceId);
    ensureHqMarker();
    renderAidMarkers();
    fitToActiveLoop(false);
    drawProfile();
    renderDirectionsList();
    updateRaceMeta();
    updateAidTable();
    updateLayersCount();

    var rDraw;
    window.addEventListener('resize', function() {
      clearTimeout(rDraw);
      rDraw = setTimeout(drawProfile, 120);
    });
  });
}

function bootstrap() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startUp);
  } else {
    startUp();
  }
}

function startUp() {
  initMap();
  setTimeout(function() {
    relocateWeatherPanel();
    injectSimBanner();
    updateGoalTime();
  }, 0);
}

bootstrap();
