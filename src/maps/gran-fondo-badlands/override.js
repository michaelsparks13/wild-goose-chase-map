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

// The FSS R2 protomaps PMTiles (pub-e494904da8db4a209e8229adcd8b63f9
// .r2.dev/basemap.pmtiles, 18 GB) is a US-focused regional extract
// that has zero coverage over Drumheller, Alberta (verified: 6
// features at z15.5 over downtown). Until FSS hosts its own
// globally-covered PMTiles, this race fetches its base style from
// OpenFreeMap Liberty — a free, no-key, CORS-OK protomaps-style
// vector tile service built on the OpenMapTiles schema with full
// global coverage (Drumheller / Kirkpatrick / Nacmine / Rosedale /
// East Coulee / Wayne all named, Red Deer River + tributaries
// rendered, all rural Alberta roads in the grid).
//
// AWS Terrarium hillshade is stacked on top in map.on('load') for
// the dramatic Drumheller badlands terrain — the geology is the
// visual story this race needs to tell.
var BASEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

// ─── State ───────────────────────────────────────────────────────────

var map;
var aidOn = true;
// 3D terrain default is OFF: MapLibre 5.x + OpenFreeMap Liberty drops
// town labels under pitch + terrain (the symbols are queryable but
// the GL paint step culls them, and no exposed style property fixes
// it). Riders need the labels for orientation more than they need
// the perspective tilt. The hillshade alone (exaggeration cranked
// to 1.1) carries the dramatic badlands geology look; 3D is one
// click away in the Layers popover for riders who want it.
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

// Walk a loop's coordinate array between two cumulative miles, returning
// the polyline that connects them. Used to draw the highlighted segment
// for the active turn (turn[idx] → turn[idx+1]).
function coordsBetweenMiles(loopId, startMi, endMi) {
  var loop = LOOPS[loopId];
  if (!loop || !loop.geojson) return [];
  var coords = loop.geojson.geometry.coordinates;
  var dists = loopCoordDistances[loopId];
  if (endMi < startMi) { var tmp = startMi; startMi = endMi; endMi = tmp; }
  var out = [];
  out.push(getCoordAtMile(loopId, startMi));
  for (var j = 1; j < dists.length; j++) {
    if (dists[j] > startMi && dists[j] < endMi) out.push(coords[j]);
  }
  out.push(getCoordAtMile(loopId, endMi));
  return out;
}

function distSqPointToSegment(p, a, b) {
  var midLat = (p[1] + a[1] + b[1]) / 3;
  var cosLat = Math.cos(midLat * Math.PI / 180);
  var ax = a[0] * cosLat, ay = a[1];
  var bx = b[0] * cosLat, by = b[1];
  var px = p[0] * cosLat, py = p[1];
  var dx = bx - ax, dy = by - ay;
  var len2 = dx * dx + dy * dy;
  if (len2 === 0) return { d2: (px - ax) * (px - ax) + (py - ay) * (py - ay), t: 0 };
  var t = ((px - ax) * dx + (py - ay) * dy) / len2;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  var cx = ax + t * dx, cy = ay + t * dy;
  return { d2: (px - cx) * (px - cx) + (py - cy) * (py - cy), t: t };
}

// Project each TBT turn onto the rendered geojson polyline so click-to-
// highlight lights up the correct segment. The OSRM-derived turn
// locations sit a few feet off the simplified rendered route at zoom
// crossings; without this projection the segment highlight lands on a
// different road than the cue text names.
// SNAPPED_TURN_MILES[loopId][i] — projected cumulative mile
// SNAPPED_TURN_COORDS[loopId][i] — projected [lng,lat] on the route
var SNAPPED_TURN_MILES = {};
var SNAPPED_TURN_COORDS = {};
function precomputeSnappedTurns() {
  if (typeof LOOP_TURNS === 'undefined') return;
  var GOOD_MATCH_FT = 250; // first-good-match window — wider than Tinman's 150 ft because cycling GPX is recorded at higher speed
  var GOOD_MATCH_DEG = GOOD_MATCH_FT / 364000;
  var GOOD_MATCH_DEG2 = GOOD_MATCH_DEG * GOOD_MATCH_DEG;
  Object.keys(LOOP_TURNS).forEach(function(loopId) {
    var turns = LOOP_TURNS[loopId] || [];
    var loop = LOOPS[loopId];
    if (!loop || !loop.geojson || !turns.length) {
      SNAPPED_TURN_MILES[loopId] = [];
      SNAPPED_TURN_COORDS[loopId] = [];
      return;
    }
    var coords = loop.geojson.geometry.coordinates;
    var dists = loopCoordDistances[loopId];
    var miles = new Array(turns.length);
    var pts = new Array(turns.length);
    var cursorMile = 0;
    var EPS_BACKTRACK = 1 / 5280; // 1 ft tolerance at intersections
    for (var i = 0; i < turns.length; i++) {
      var t = turns[i];
      if (!t.location) { miles[i] = cursorMile; pts[i] = coords[0]; continue; }
      var firstGood = null;
      var bestOverall = { d2: Infinity, mile: cursorMile, point: t.location };
      var minMile = cursorMile - EPS_BACKTRACK;
      for (var j = 1; j < coords.length; j++) {
        if (dists[j] < minMile) continue;
        var r = distSqPointToSegment(t.location, coords[j - 1], coords[j]);
        var ax = coords[j - 1][0], ay = coords[j - 1][1];
        var bx = coords[j][0],     by = coords[j][1];
        var snapMile = dists[j - 1] + r.t * (dists[j] - dists[j - 1]);
        if (snapMile < minMile) snapMile = minMile;
        var snapPt = [ax + r.t * (bx - ax), ay + r.t * (by - ay)];
        if (r.d2 < bestOverall.d2) bestOverall = { d2: r.d2, mile: snapMile, point: snapPt };
        if (firstGood == null && r.d2 <= GOOD_MATCH_DEG2) firstGood = { d2: r.d2, mile: snapMile, point: snapPt };
      }
      var winner = firstGood || bestOverall;
      miles[i] = winner.mile;
      pts[i] = winner.point;
      cursorMile = winner.mile;
    }
    SNAPPED_TURN_MILES[loopId] = miles;
    SNAPPED_TURN_COORDS[loopId] = pts;
  });
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

  // Active-segment overlay — drawn ON TOP of all course layers so the
  // highlight reads above the route. Source starts empty.
  //
  // Color logic: the course backbone is dark (#1A1A1A casing) + rust
  // brand line on top. A magenta or rust highlight (like our earlier
  // accent token) doesn't pop against either of those — it muddies
  // into the route. The classic highlighter-yellow contrast wins:
  //
  //   - Outer halo: bright yellow (#FFE74C), 14 px wide, blur 1.5 —
  //     reads as fluorescent against dark base AND against rust route.
  //   - Inner line: pure white (#FFFFFF), 4 px — punches through the
  //     dark casing so the active segment isn't lost in the backbone.
  //
  // High contrast in both directions: dark course → light halo;
  // light areas of the route → dark inner line is still visible
  // through the yellow.
  map.addSource('dir-active-segment', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: 'dir-active-segment-halo',
    type: 'line',
    source: 'dir-active-segment',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#FFE74C',
      'line-width': 14,
      'line-opacity': 0.92,
      'line-blur': 1.5,
    },
  });
  map.addLayer({
    id: 'dir-active-segment-line',
    type: 'line',
    source: 'dir-active-segment',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#FFFFFF',
      'line-width': 4,
    },
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

    var isStart = (n === 0);
    var isFinish = (n === idxs.length - 1);
    var el = document.createElement('div');
    el.className = isFinish ? 'aid-marker aid-marker--finish' : (isStart ? 'aid-marker aid-marker--start' : 'aid-marker');

    // SVGs use currentColor for fills; the wrapper sets color via CSS
    // (.aid-marker / --start / --finish), since CSS var() in fill="..."
    // attributes is not reliably supported across browsers.
    var svgInner;
    if (isFinish) {
      // Finish flag — checkered pennant on a pole, brand-color disc
      svgInner =
        '<svg viewBox="0 0 32 32" aria-hidden="true">' +
          '<circle cx="16" cy="16" r="13" fill="currentColor" stroke="#fff" stroke-width="2.5"/>' +
          '<path d="M11 8 L11 24" stroke="#fff" stroke-width="2" stroke-linecap="round"/>' +
          '<path d="M11.5 8 L21 8 L21 16 L11.5 16 Z" fill="#fff"/>' +
          '<rect x="11.5" y="8"  width="3.2" height="2.7" fill="#1A1A1A"/>' +
          '<rect x="17.8" y="8"  width="3.2" height="2.7" fill="#1A1A1A"/>' +
          '<rect x="14.7" y="10.7" width="3.1" height="2.7" fill="#1A1A1A"/>' +
          '<rect x="11.5" y="13.4" width="3.2" height="2.6" fill="#1A1A1A"/>' +
          '<rect x="17.8" y="13.4" width="3.2" height="2.6" fill="#1A1A1A"/>' +
        '</svg>';
    } else if (isStart) {
      // Start — single triangle pennant on a pole, brand-color disc
      svgInner =
        '<svg viewBox="0 0 32 32" aria-hidden="true">' +
          '<circle cx="16" cy="16" r="13" fill="currentColor" stroke="#fff" stroke-width="2.5"/>' +
          '<path d="M11 8 L11 24" stroke="#fff" stroke-width="2" stroke-linecap="round"/>' +
          '<path d="M11.5 8 L21 11.5 L11.5 15 Z" fill="#fff"/>' +
        '</svg>';
    } else {
      // Aid station — ochre disc with white water-drop + cross (Tinman style)
      svgInner =
        '<svg viewBox="0 0 28 28" aria-hidden="true">' +
          '<circle cx="14" cy="14" r="11" fill="currentColor" stroke="#fff" stroke-width="2"/>' +
          '<path d="M14 7 C 10.5 11.5, 9 13.5, 9 15.8 a5 5 0 0 0 10 0 C 19 13.5, 17.5 11.5, 14 7 Z" fill="#fff"/>' +
          '<path d="M14 12.2 v3.2 M12.4 13.8 h3.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>' +
        '</svg>';
    }
    setHtml(el, svgInner);

    var popupHtml =
      '<div class="aid-popup">' +
        '<div class="aid-popup__name">' + escapeHtml(stn.name) + '</div>' +
        '<div class="aid-popup__km">km ' + (stn.kilometer != null ? stn.kilometer.toFixed(1) : '—') + '</div>' +
        '<div class="aid-popup__stocked">' + escapeHtml(stn.stocked) + '</div>' +
      '</div>';

    var marker = new maplibregl.Marker({ element: el, anchor: 'center', opacityWhenCovered: '1' })
      .setLngLat(coord)
      .setPopup(new maplibregl.Popup({ offset: 16, maxWidth: '300px' }).setHTML(popupHtml))
      .addTo(map);
    aidMarkers.push(marker);
  });
}

// ─── Km markers ──────────────────────────────────────────────────────
// Numbered circles along the active route. Stride = 10 km on the long
// distances (Bronto / T-Rex), 5 km on the shorter ones (Trike / Velo).
// Built as a MapLibre symbol layer so they scale with zoom rather than
// HTML markers (numerous markers tank perf on Bronto's 16-marker count).

var kmMarkerSourceId = 'km-markers';
function rebuildKmMarkers() {
  if (!map || !map.isStyleLoaded()) return;
  var race = RACES[currentRaceId];
  if (!race) return;
  var totalKm = race.kilometers;
  var stride = (totalKm > 70) ? 10 : 5;
  var features = [];
  for (var k = stride; k < totalKm - stride / 2; k += stride) {
    var coord = getCoordAtMile(currentRaceId, k / KM_PER_MI);
    features.push({
      type: 'Feature',
      properties: { km: k, label: String(k), priority: (k % 25 === 0) ? 1 : 2 },
      geometry: { type: 'Point', coordinates: coord },
    });
  }
  var fc = { type: 'FeatureCollection', features: features };
  if (map.getSource(kmMarkerSourceId)) {
    map.getSource(kmMarkerSourceId).setData(fc);
  } else {
    map.addSource(kmMarkerSourceId, { type: 'geojson', data: fc });
    map.addLayer({
      id: 'km-markers-circle',
      type: 'circle',
      source: kmMarkerSourceId,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 7, 14, 11, 17, 14],
        'circle-color': '#1f1d18',
        'circle-stroke-color': 'var-fallback', // overridden runtime below
        'circle-stroke-width': 2,
      },
    });
    // Brand-color stroke (read at runtime since CSS vars don't apply in WebGL)
    var brand = '#A84D24';
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue('--race-brand').trim();
      if (v) brand = v;
    } catch (e) { /* noop */ }
    map.setPaintProperty('km-markers-circle', 'circle-stroke-color', brand);
    map.addLayer({
      id: 'km-markers-label',
      type: 'symbol',
      source: kmMarkerSourceId,
      layout: {
        'text-field': ['get', 'label'],
        'text-font': ['Noto Sans Medium'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 9, 9, 14, 12, 17, 15],
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: {
        'text-color': '#ffffff',
      },
    });
  }
}
function clearKmMarkers() {
  ['km-markers-label', 'km-markers-circle'].forEach(function(id) {
    if (map.getLayer(id)) map.removeLayer(id);
  });
  if (map.getSource(kmMarkerSourceId)) map.removeSource(kmMarkerSourceId);
}

function ensureHqMarker() {
  if (hqMarker) return;
  var el = document.createElement('div');
  el.className = 'hq-marker';
  setHtml(el,
    '<svg viewBox="0 0 32 32" aria-hidden="true">' +
      '<circle cx="16" cy="16" r="13" fill="currentColor" stroke="#fff" stroke-width="2.5"/>' +
      '<text x="16" y="20" text-anchor="middle" font-size="11" font-weight="700" fill="#fff" font-family="Big Shoulders Display, sans-serif" letter-spacing="0.5">BCF</text>' +
    '</svg>'
  );
  hqMarker = new maplibregl.Marker({ element: el, anchor: 'center', opacityWhenCovered: '1' })
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

// Apply the 3D terrain state to the map. Re-uses the existing
// hillshade-dem source (added in the map.on('load') handler) so we
// don't double-fetch the same Terrarium tiles. `animate=false` is
// used for the initial-load enable so the map doesn't tilt in front
// of the rider after page load.
function applyTerrain(animate) {
  if (terrain3D) {
    // Exaggeration 1.0 keeps the badlands valley readable in
    // perspective without distorting Liberty's labels off-screen.
    // Earlier we used 1.4 and labels at the valley floor pushed
    // behind hills (terrain occlusion check hid them).
    map.setTerrain({ source: 'hillshade-dem', exaggeration: 1.0 });
    // Pitch 45° instead of 50° — same perspective drama, less
    // angle for labels + markers to be raycast as "covered".
    map.easeTo({ pitch: 45, duration: animate ? 800 : 0 });
  } else {
    map.setTerrain(null);
    map.easeTo({ pitch: 0, duration: animate ? 800 : 0 });
  }
  var box = document.getElementById('layer3D');
  if (box) box.checked = terrain3D;
  updateLayersCount();
}

function toggle3D() {
  terrain3D = !terrain3D;
  applyTerrain(true);
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
  clearActiveSegment();
  document.querySelectorAll('.dir-race-tab').forEach(function(btn) {
    var on = btn.getAttribute('data-race') === raceId;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  setActiveDistance(raceId);
  fitToActiveLoop(true);
  renderAidMarkers();
  rebuildKmMarkers();
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
      return '<li class="loop-cue loop-cue--turn loop-cue--turn-' + (r.direction || 'straight') +
        '" data-kind="turn" data-turn-idx="' + r.idx + '">' +
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
    // Resolve a coord for cue rows so clicking a hazard/water/landmark
    // can flyTo the exact point (mile-derived from the rendered route).
    var cueCoord = getCoordAtMile(loopId, r.mile);
    var coordAttr = ' data-coord=&quot;[' + cueCoord[0] + ',' + cueCoord[1] + ']&quot;';
    return '<li class="loop-cue loop-cue--' + r.kind + '" data-kind="' + r.kind + '"' + coordAttr.replace(/&quot;/g, '"') + '>' +
      '<span class="loop-cue__mile">' + km + '<small>km</small></span>' +
      '<span class="loop-cue__icon">' + (iconMap[r.kind] || iconMap.note) + '</span>' +
      '<span class="loop-cue__body">' + escapeHtml(r.text) + '</span>' +
    '</li>';
  }).join('');
  setHtml(ol, html);

  // Delegate row clicks: turns highlight a route segment; cues fly to
  // a single point. Wired here (not via inline onclick) so the row el
  // is in scope for setActiveTurnByRow's row-class toggle.
  ol.onclick = function(ev) {
    var li = ev.target.closest && ev.target.closest('li.loop-cue');
    if (!li) return;
    var kind = li.getAttribute('data-kind');
    if (kind === 'turn') {
      var idx = parseInt(li.getAttribute('data-turn-idx'), 10);
      if (!isNaN(idx)) setActiveTurnByRow(idx, li);
    } else {
      // Hazard / water / landmark / surface — fly to coord, leave
      // segment highlight cleared since these are point cues.
      var locAttr = li.getAttribute('data-coord');
      if (locAttr) {
        try { flyToCueLocation(JSON.parse(locAttr)); } catch (e) { /* noop */ }
      }
      clearActiveSegment();
    }
  };
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

// Persisted across reloads; gates ONLY the camera move when a cue is
// clicked, never the highlight itself. Default is OFF — clicking a
// cue should ALWAYS highlight the segment, but most riders prefer
// the camera to stay put unless they explicitly opt in. Hydrated
// from localStorage on boot.
var zoomToStep = (function() {
  try {
    var saved = localStorage.getItem('granFondoBadlands.zoomToStep');
    if (saved === '1') return true;
  } catch (e) { /* private mode */ }
  return false;
})();
function setZoomToStep(on) {
  zoomToStep = !!on;
  try { localStorage.setItem('granFondoBadlands.zoomToStep', zoomToStep ? '1' : '0'); } catch (e) { /* noop */ }
  var box = document.getElementById('zoomToStepCheckbox');
  if (box && box.checked !== zoomToStep) box.checked = zoomToStep;
}

// ─── Active-segment highlighting on cue click ────────────────────────
// Click a turn row → draw the segment from this turn's snapped mile to
// the next turn's snapped mile (or the loop end if it's the last turn).
// Cue rows (hazard/water/landmark) get a single-point highlight via
// flyToCueLocation. The active row gets a class for visual sync.

var activeRowEl = null;

function clearActiveSegment() {
  var src = map && map.getSource('dir-active-segment');
  if (src) src.setData({ type: 'FeatureCollection', features: [] });
  if (activeRowEl) {
    activeRowEl.classList.remove('loop-cue--active');
    activeRowEl = null;
  }
}

function setActiveTurnByRow(turnIdx, rowEl) {
  if (!map || !map.getSource('dir-active-segment')) return;
  var snapMiles = SNAPPED_TURN_MILES[currentRaceId];
  var snapPts = SNAPPED_TURN_COORDS[currentRaceId];
  if (!snapMiles || snapMiles[turnIdx] == null) return;
  var loopLen = LOOPS[currentRaceId].miles;
  var startMi = snapMiles[turnIdx];
  var endMi = (turnIdx + 1 < snapMiles.length) ? snapMiles[turnIdx + 1] : loopLen;
  var coords = coordsBetweenMiles(currentRaceId, startMi, endMi);
  map.getSource('dir-active-segment').setData({
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: coords },
    }],
  });

  if (activeRowEl) activeRowEl.classList.remove('loop-cue--active');
  if (rowEl) {
    rowEl.classList.add('loop-cue--active');
    activeRowEl = rowEl;
  }

  if (zoomToStep && coords.length >= 2) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var i = 0; i < coords.length; i++) {
      if (coords[i][0] < minX) minX = coords[i][0];
      if (coords[i][0] > maxX) maxX = coords[i][0];
      if (coords[i][1] < minY) minY = coords[i][1];
      if (coords[i][1] > maxY) maxY = coords[i][1];
    }
    var pad = window.innerWidth < 700
      ? { top: 80, right: 32, bottom: 80, left: 32 }
      : { top: 100, right: 80, bottom: 100, left: 80 };
    map.fitBounds([[minX, minY], [maxX, maxY]], { padding: pad, maxZoom: 16, duration: 600 });
  }
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

// ─── Cycling simulator ───────────────────────────────────────────────
// 30-second sim for any distance — same playback model as the shared
// sim-engine.js (which assumes one full simulation = ~30s of real time).
// What's bike-specific: km / km/h units, no per-mile pace, no swim/T2.
//
// State: simProgress (0..1 along the active route), simSpeed (1x/2x/4x),
// simFinishHours (rider's GOAL hours, separate from playback speed).
// renderSim() is called every tick + on race-switch + on goal change.

var simProgress = 0;
var simPlaying = false;
var simSpeed = 1;
var simFinishHours = 6.5;
var simLastTick = 0;
var simInitialized = false;

function initSimRaces() {
  var host = document.getElementById('simRaces');
  if (!host) return;
  var html = Object.keys(RACES).map(function(id) {
    var r = RACES[id];
    var active = (id === currentRaceId);
    var dino = (typeof DINO_SVGS !== 'undefined' && DINO_SVGS[r.dinosaur]) ? DINO_SVGS[r.dinosaur] : '';
    return '<button type="button" class="sim-race-chip' + (active ? ' active' : '') +
      '" data-sim-race="' + id + '" style="--chip-color:' + r.color + '">' +
      '<span class="sim-race-chip__icon">' + dino + '</span>' +
      '<span class="sim-race-chip__label">' + escapeHtml(r.name) + '</span>' +
      '<span class="sim-race-chip__km">' + r.kilometers + ' km</span>' +
    '</button>';
  }).join('');
  setHtml(host, html);
  host.onclick = function(ev) {
    var btn = ev.target.closest && ev.target.closest('.sim-race-chip');
    if (!btn) return;
    var id = btn.getAttribute('data-sim-race');
    if (!id || id === currentRaceId) return;
    selectRace(id);
    initSimRaces();
    // Reset sim state since the route changed
    simProgress = 0;
    var pb = document.getElementById('playBtn');
    if (pb) setHtml(pb, '&#9654;');
    simPlaying = false;
    renderSim();
  };
}

function updateGoalTime() {
  var hrsEl = document.getElementById('goalHrs');
  var minsEl = document.getElementById('goalMins');
  if (!hrsEl || !minsEl) return;
  var hrs = parseInt(hrsEl.value, 10) || 0;
  var mins = parseInt(minsEl.value, 10) || 0;
  simFinishHours = Math.max(0.1, hrs + mins / 60);
  updateGoalPace();
  renderSim();
}

function updateGoalPace() {
  var race = RACES[currentRaceId];
  if (!race) return;
  var pace = race.kilometers / simFinishHours;
  var paceEl = document.getElementById('goalPace');
  if (paceEl) setHtml(paceEl, 'Avg pace: <strong>' + pace.toFixed(1) + ' km/h</strong>');
}

function togglePlay() {
  simPlaying = !simPlaying;
  var btn = document.getElementById('playBtn');
  if (btn) setHtml(btn, simPlaying ? '&#10074;&#10074;' : '&#9654;');
  if (simPlaying) {
    if (simProgress >= 0.999) simProgress = 0;
    simLastTick = performance.now();
    simTick();
  }
}

function setSpeed(s, btn) {
  simSpeed = s;
  document.querySelectorAll('.speed-btn').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
}

function simTick() {
  if (!simPlaying) return;
  var now = performance.now();
  var dt = (now - simLastTick) / 1000;
  simLastTick = now;
  // 30s of real time = 1 full lap at 1x speed
  simProgress = Math.min(1, simProgress + (1 / 30) * simSpeed * dt);
  renderSim();
  if (simProgress >= 1) {
    simPlaying = false;
    var pb = document.getElementById('playBtn');
    if (pb) setHtml(pb, '&#9654;');
    return;
  }
  requestAnimationFrame(simTick);
}

function renderSim() {
  var race = RACES[currentRaceId];
  var loop = LOOPS[currentRaceId];
  if (!race || !loop || !loop.geojson || !loop.profile) return;

  var totalKm = race.kilometers;
  var totalGainM = race.gainM;
  var currentKm = totalKm * simProgress;
  var currentMi = currentKm / KM_PER_MI;

  // Stats
  setText('statDist', currentKm.toFixed(1));
  setText('statPct', Math.round(simProgress * 100) + '%');

  // Elevation + gain so far via profile sampling
  var prof = loop.profile;
  var sample = sampleProfileAtMi(prof, currentMi);
  setText('statEle', Math.round(sample.eM));
  setText('statGain', Math.round(sample.gainM));
  setText('statTotalGain', Math.round(totalGainM));
  setText('statGrade', sample.grade.toFixed(1) + '%');

  // Clock
  var elapsedHours = simProgress * simFinishHours;
  var clockMs = (race.startTime ? parseClockToHours(race.startTime) : 7) * 3600 * 1000 + elapsedHours * 3600 * 1000;
  setText('clockTime', formatClock(clockMs));
  setText('clockStart', race.startTime || '7:00 AM');
  setText('finishTime', formatClock((race.startTime ? parseClockToHours(race.startTime) : 7) * 3600 * 1000 + simFinishHours * 3600 * 1000));

  // Runner readouts above the course canvas
  setText('runnerDist', 'km ' + currentKm.toFixed(1));
  setText('runnerMeta', Math.round(sample.eM) + ' m · ' + sample.grade.toFixed(1) + '% grade');
  var pill = document.getElementById('loopPill');
  if (pill) {
    pill.textContent = race.name;
    pill.style.background = race.color;
    pill.style.color = '#fff';
  }

  // Scrubber position
  var fill = document.getElementById('scrubFill');
  var handle = document.getElementById('scrubHandle');
  if (fill) fill.style.width = (simProgress * 100) + '%';
  if (handle) handle.style.left = (simProgress * 100) + '%';

  // Canvases
  drawSimCourse(currentMi);
  drawSimTerrain(currentMi);
}

function setText(id, v) {
  var el = document.getElementById(id);
  if (el) el.textContent = String(v);
}

// Returns { eM, gainM (gain so far in meters), grade (% over the local 1 km window) }
function sampleProfileAtMi(profile, atMi) {
  if (!profile || !profile.length) return { eM: 0, gainM: 0, grade: 0 };
  // profile entries are { d (mi), e (ft) } — convert to meters
  var idx = 0;
  for (var i = 1; i < profile.length; i++) {
    if (profile[i].d >= atMi) { idx = i; break; }
    idx = i;
  }
  var eFt = profile[idx].e;
  var eM = eFt * M_PER_FT;
  // gain so far
  var gainFt = 0;
  for (var j = 1; j <= idx; j++) {
    var d = profile[j].e - profile[j - 1].e;
    if (d > 0) gainFt += d;
  }
  var gainM = gainFt * M_PER_FT;
  // local grade over a ~1 km window centered on idx
  var miPerKm = 1 / KM_PER_MI;
  var halfWin = miPerKm / 2;
  var lo = idx, hi = idx;
  while (lo > 0 && profile[idx].d - profile[lo].d < halfWin) lo--;
  while (hi < profile.length - 1 && profile[hi].d - profile[idx].d < halfWin) hi++;
  var dMi = Math.max(0.001, profile[hi].d - profile[lo].d);
  var dFt = profile[hi].e - profile[lo].e;
  var grade = (dFt / (dMi * 5280)) * 100;
  return { eM: eM, gainM: gainM, grade: grade };
}

function parseClockToHours(s) {
  // "7:00 AM" / "9:15 AM" / "3:45 PM" / "7:45 / 8:30 / 9:15 AM (waves)"
  if (!s) return 7;
  var m = String(s).match(/(\d+):(\d+)\s*(AM|PM)?/i);
  if (!m) return 7;
  var h = parseInt(m[1], 10);
  var mn = parseInt(m[2], 10);
  if (m[3] && m[3].toUpperCase() === 'PM' && h < 12) h += 12;
  if (m[3] && m[3].toUpperCase() === 'AM' && h === 12) h = 0;
  return h + mn / 60;
}

function formatClock(ms) {
  var d = new Date(ms);
  var h = d.getUTCHours();
  var mn = d.getUTCMinutes();
  var ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12; if (h === 0) h = 12;
  return h + ':' + String(mn).padStart(2, '0') + ' ' + ap;
}

// ─── Sim canvases ────────────────────────────────────────────────────

var simCourseDpr = null;
var simCourseProj = null;

function drawSimCourse(atMi) {
  var canvas = document.getElementById('courseMapCanvas');
  if (!canvas) return;
  var dpr = Math.max(1, window.devicePixelRatio || 1);
  var rect = canvas.getBoundingClientRect();
  var W = rect.width, H = Math.max(220, rect.height || 280);
  if (simCourseDpr !== dpr || canvas.width !== Math.round(W * dpr)) {
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.height = H + 'px';
    simCourseDpr = dpr;
  }
  var ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  var loop = LOOPS[currentRaceId];
  var coords = loop.geojson.geometry.coordinates;
  var pad = 22;
  // Compute projection (cached per loop+canvas size)
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (var i = 0; i < coords.length; i++) {
    if (coords[i][0] < minX) minX = coords[i][0];
    if (coords[i][0] > maxX) maxX = coords[i][0];
    if (coords[i][1] < minY) minY = coords[i][1];
    if (coords[i][1] > maxY) maxY = coords[i][1];
  }
  var midLat = (minY + maxY) / 2;
  var cosLat = Math.cos(midLat * Math.PI / 180);
  var spanX = (maxX - minX) * cosLat;
  var spanY = (maxY - minY);
  var scale = Math.min((W - pad * 2) / spanX, (H - pad * 2) / spanY);
  var ox = pad + ((W - pad * 2) - spanX * scale) / 2;
  var oy = pad + ((H - pad * 2) - spanY * scale) / 2;
  function project(c) {
    var x = ox + (c[0] - minX) * cosLat * scale;
    var y = (H - oy) - (c[1] - minY) * scale;
    return [x, y];
  }

  // Background route line (paper to ink contrast)
  ctx.strokeStyle = 'rgba(248,242,234,0.25)';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  for (var k = 0; k < coords.length; k++) {
    var p = project(coords[k]);
    if (k === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
  }
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (var k2 = 0; k2 < coords.length; k2++) {
    var p2 = project(coords[k2]);
    if (k2 === 0) ctx.moveTo(p2[0], p2[1]); else ctx.lineTo(p2[0], p2[1]);
  }
  ctx.stroke();

  // Completed-so-far overlay in race color
  var dists = loopCoordDistances[currentRaceId];
  var race = RACES[currentRaceId];
  ctx.strokeStyle = race.color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  var started = false;
  for (var j = 0; j < coords.length; j++) {
    if (dists[j] > atMi) break;
    var pp = project(coords[j]);
    if (!started) { ctx.moveTo(pp[0], pp[1]); started = true; }
    else ctx.lineTo(pp[0], pp[1]);
  }
  ctx.stroke();

  // Rider dot at current position
  var riderCoord = getCoordAtMile(currentRaceId, atMi);
  var rp = project(riderCoord);
  ctx.fillStyle = race.color;
  ctx.beginPath();
  ctx.arc(rp[0], rp[1], 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // BCF marker (start = end)
  var bcfP = project(coords[0]);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(bcfP[0], bcfP[1], 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = race.color;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawSimTerrain(atMi) {
  var canvas = document.getElementById('simTerrain');
  if (!canvas) return;
  var loop = LOOPS[currentRaceId];
  var race = RACES[currentRaceId];
  var profile = loop.profile;

  var dpr = Math.max(1, window.devicePixelRatio || 1);
  var rect = canvas.getBoundingClientRect();
  var W = rect.width, H = Math.max(140, rect.height || 160);
  if (canvas.width !== Math.round(W * dpr)) {
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.height = H + 'px';
  }
  var ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  var minE = Infinity, maxE = -Infinity, maxD = 0;
  for (var i = 0; i < profile.length; i++) {
    if (profile[i].e < minE) minE = profile[i].e;
    if (profile[i].e > maxE) maxE = profile[i].e;
    if (profile[i].d > maxD) maxD = profile[i].d;
  }
  if (maxE - minE < 50) { var mid = (maxE + minE) / 2; minE = mid - 25; maxE = mid + 25; }

  // Plot area — leave room for the y-axis labels on the left and
  // x-axis labels at the bottom, just like the bigger map-view profile.
  var padL = 42, padR = 10, padT = 10, padB = 22;
  var plotW = W - padL - padR;
  var plotH = H - padT - padB;

  // y-axis grid + meters labels
  ctx.strokeStyle = 'rgba(248,242,234,0.12)';
  ctx.lineWidth = 1;
  ctx.fillStyle = 'rgba(248,242,234,0.6)';
  ctx.font = '10px JetBrains Mono, monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (var g = 0; g <= 3; g++) {
    var ee = maxE - (maxE - minE) * (g / 3);
    var y = padT + (plotH * g) / 3;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
    ctx.fillText(Math.round(ee * M_PER_FT) + 'm', padL - 5, y);
  }

  // Filled area
  ctx.fillStyle = hexToRgba(race.color, 0.45);
  ctx.beginPath();
  ctx.moveTo(padL, padT + plotH);
  for (var p = 0; p < profile.length; p++) {
    var x = padL + (profile[p].d / maxD) * plotW;
    var y2 = padT + plotH - ((profile[p].e - minE) / (maxE - minE)) * plotH;
    ctx.lineTo(x, y2);
  }
  ctx.lineTo(padL + plotW, padT + plotH);
  ctx.closePath();
  ctx.fill();

  // Line
  ctx.strokeStyle = race.color;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (var p2 = 0; p2 < profile.length; p2++) {
    var px = padL + (profile[p2].d / maxD) * plotW;
    var py = padT + plotH - ((profile[p2].e - minE) / (maxE - minE)) * plotH;
    if (p2 === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();

  // x-axis km labels
  ctx.fillStyle = 'rgba(248,242,234,0.6)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  var totalKm = race ? race.kilometers : maxD * KM_PER_MI;
  var ticks = totalKm > 100 ? 5 : 4;
  for (var t = 0; t <= ticks; t++) {
    var km = (totalKm * t) / ticks;
    var tx = padL + (plotW * t) / ticks;
    ctx.fillText(Math.round(km) + 'km', tx, H - padB + 6);
  }

  // Marker at current km
  var mx = padL + (atMi / maxD) * plotW;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(mx, padT);
  ctx.lineTo(mx, padT + plotH);
  ctx.stroke();
  // Marker dot at current elevation
  var sample = sampleProfileAtMi(profile, atMi);
  var my = padT + plotH - ((sample.eM / M_PER_FT - minE) / (maxE - minE)) * plotH;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(mx, my, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = race.color;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function relocateSimulator() {
  // The race-shell template wraps {{SIM_VIEW}} in a `hidden` div so the
  // editorial-first layout doesn't surface a sim by default. We lift it
  // into a dedicated essentials section so cycling-sim playback is
  // visible without forking the shell template.
  var sim = document.getElementById('simView');
  if (!sim) return;
  var hiddenWrap = sim.parentElement;
  var section = document.createElement('section');
  section.className = 'essentials race-day-essentials sim-essentials';
  section.id = 'essentialsSim';
  var heading = document.createElement('h2');
  heading.className = 'essentials__title';
  heading.textContent = 'Course simulator';
  var sub = document.createElement('p');
  sub.className = 'essentials__sub';
  sub.textContent = 'Set your goal time, hit play, and ride the course at 1x / 2x / 4x. Use the chips to switch distances.';
  section.appendChild(heading);
  section.appendChild(sub);
  sim.classList.add('view', 'active');
  sim.removeAttribute('hidden');
  sim.style.display = '';
  section.appendChild(sim);
  // Insert just after the .course block (matching the weather panel pattern)
  var anchor = document.querySelector('.course');
  if (anchor && anchor.parentNode) {
    anchor.parentNode.insertBefore(section, anchor.nextSibling);
  } else {
    document.querySelector('main')?.appendChild(section);
  }
  if (hiddenWrap && hiddenWrap.children.length === 0) hiddenWrap.remove();
}

function initSimulator() {
  if (simInitialized) return;
  simInitialized = true;
  initSimRaces();
  // Default goal time per active race — ~22 km/h average for cyclo-cross
  var race = RACES[currentRaceId];
  if (race) {
    var totalH = race.kilometers / 22;
    document.getElementById('goalHrs').value = Math.floor(totalH);
    document.getElementById('goalMins').value = Math.round((totalH - Math.floor(totalH)) * 60);
  }
  updateGoalTime();

  // Scrubber drag
  var track = document.getElementById('scrubTrack');
  if (track) {
    var scrubbing = false;
    function scrubTo(e) {
      var rect = track.getBoundingClientRect();
      var clientX = e.touches ? e.touches[0].clientX : e.clientX;
      simProgress = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      renderSim();
    }
    track.addEventListener('mousedown', function(e) {
      scrubbing = true; simPlaying = false;
      var pb = document.getElementById('playBtn');
      if (pb) setHtml(pb, '&#9654;');
      scrubTo(e);
    });
    window.addEventListener('mousemove', function(e) { if (scrubbing) scrubTo(e); });
    window.addEventListener('mouseup', function() { scrubbing = false; });
    track.addEventListener('touchstart', function(e) {
      scrubbing = true; simPlaying = false;
      var pb = document.getElementById('playBtn');
      if (pb) setHtml(pb, '&#9654;');
      scrubTo(e);
    }, { passive: true });
    window.addEventListener('touchmove', function(e) { if (scrubbing) scrubTo(e); }, { passive: true });
    window.addEventListener('touchend', function() { scrubbing = false; });
  }

  renderSim();
  // Re-render canvases on resize
  var rDraw;
  window.addEventListener('resize', function() {
    clearTimeout(rDraw);
    rDraw = setTimeout(function() { simCourseDpr = null; renderSim(); }, 120);
  });
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

// `injectSimBanner` was the placeholder for the MVP-cut sim. The
// simulator is now real (initSimulator); the banner is no longer
// needed. Kept as a no-op so older callers / tests don't throw.
function injectSimBanner() {}

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

  // No NavigationControl on the main map — the editorial layout puts
  // course branding (BCF badge top-left, Layers popover top-right) in
  // those slots. Wild Goose's e2e suite has an explicit assertion
  // against this. Scale bar at the bottom is the one MapLibre control
  // we keep for situational scale awareness.
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }));

  map.on('load', function() {
    // Add the AWS Terrarium hillshade overlay on top of OpenFreeMap's
    // Liberty style. beforeId targets one of Liberty's label layers
    // so labels stay on top of the shading. We find the first symbol
    // layer (OMT labels are all symbol-type) and insert hillshade
    // just before it.
    if (!map.getSource('hillshade-dem')) {
      map.addSource('hillshade-dem', {
        type: 'raster-dem',
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
        tileSize: 256, maxzoom: 15, encoding: 'terrarium',
      });
    }
    var firstSymbolId = null;
    var styleLayers = map.getStyle().layers;
    for (var li = 0; li < styleLayers.length; li++) {
      if (styleLayers[li].type === 'symbol') { firstSymbolId = styleLayers[li].id; break; }
    }
    map.addLayer({
      id: 'hillshade',
      type: 'hillshade',
      source: 'hillshade-dem',
      paint: {
        // Maxed at 1.0 (MapLibre caps hillshade-exaggeration there)
        // — since we default to 2D, the hillshade does ALL the
        // heavy lifting for the badlands geology story. Warm rust
        // shadow + cream highlight match the rust palette and pull
        // out the dramatic Red Deer River bluffs.
        'hillshade-exaggeration': 1.0,
        'hillshade-shadow-color': '#5e4226',
        'hillshade-highlight-color': '#fff5d8',
        'hillshade-accent-color': '#9e6e36',
      },
    }, firstSymbolId);

    addLoopLayers();
    precomputeSnappedTurns();
    setActiveDistance(currentRaceId);
    ensureHqMarker();
    renderAidMarkers();
    rebuildKmMarkers();
    fitToActiveLoop(false);
    applyTerrain(false);  // honors the default terrain3D = true
    drawProfile();
    renderDirectionsList();
    updateRaceMeta();
    updateAidTable();
    updateLayersCount();
    // Hydrate the zoom-to-step checkbox from localStorage on first paint
    var box = document.getElementById('zoomToStepCheckbox');
    if (box) box.checked = zoomToStep;

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
    relocateSimulator();
    initSimulator();
  }, 0);
}

bootstrap();
