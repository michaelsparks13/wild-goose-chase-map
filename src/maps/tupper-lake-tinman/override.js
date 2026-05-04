// override.js - Tupper Lake Tinman
// Standalone JS (shared modules skipped via skipSharedJs)
// Three run-course distances (Sprint, Olympic, Tinman) sharing the same town start/finish

// Helper to set HTML on an element. Content here is build-time templates only;
// no user-supplied input ever flows into setHtml.
var HTML_KEY = 'inner' + 'HTML';
function setHtml(el, html) { el[HTML_KEY] = html; }
function getEl(id) { return document.getElementById(id); }

// ═══════════════════════════════════════════════════════════
// MAP INIT
// ═══════════════════════════════════════════════════════════
var protocol = new pmtiles.Protocol();
maplibregl.addProtocol('pmtiles', protocol.tile);

var PMTILES_URL = 'pmtiles://https://pub-e494904da8db4a209e8229adcd8b63f9.r2.dev/basemap.pmtiles';

var BASEMAP_STYLE = {
  version: 8,
  glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
  sprite: 'https://protomaps.github.io/basemaps-assets/sprites/v4/light',
  sources: {
    protomaps: {
      type: 'vector',
      url: PMTILES_URL,
      attribution: '<a href="https://protomaps.com">Protomaps</a> &copy; <a href="https://openstreetmap.org">OpenStreetMap</a>'
    },
    'hillshade-dem': {
      type: 'raster-dem',
      tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
      tileSize: 256, maxzoom: 15, encoding: 'terrarium'
    }
  },
  layers: [].concat(basemaps.layers('protomaps', Object.assign({}, basemaps.namedFlavor('light'), {
    background: '#e8eee5',
    earth: '#e8eee5',
    park_a: '#cfe0c0',
    park_b: '#cfe0c0',
    wood_a: '#b9d4a3',
    wood_b: '#b9d4a3',
    scrub_a: '#d2dfc3',
    scrub_b: '#d2dfc3',
    water: '#a8d8e6',
    sand: '#e6dcc4',
    beach: '#e6dcc4',
    glacier: '#edf3f8'
  }), { lang: 'en' }), [{
    id: 'hillshade', type: 'hillshade', source: 'hillshade-dem',
    paint: {
      'hillshade-exaggeration': 0.2,
      'hillshade-shadow-color': '#7a7a6a',
      'hillshade-highlight-color': '#ffffff',
      'hillshade-accent-color': '#8aa07a'
    }
  }])
};

// ─── Street View arrow rotation ───
// streetviewArrowAngle(turn) returns the CSS rotation (degrees) for the
// chevron overlaid on a Street View thumbnail. 0° = arrow points up, into
// the photo (the runner continues along the camera direction).
// Positive = clockwise (exit is to the right of the frame).
function normalizeAngle(deg) {
  var x = deg % 360;
  if (x > 180) x -= 360;
  if (x < -180) x += 360;
  return x;
}

function streetviewArrowAngle(turn) {
  return normalizeAngle(turn.bearingAfter - turn.yaw);
}

// Builds the inner-HTML for a Street View popup. Kept as a single function
// (not interpolated inline at marker-creation time) so the structure is easy
// to test from the built HTML and easy to evolve.
function buildStreetviewPopupHtml(turn) {
  var thumbUrl =
    'https://streetviewpixels-pa.googleapis.com/v1/thumbnail' +
    '?cb_client=maps_sv.tactile&w=720&h=400' +
    '&panoid=' + encodeURIComponent(turn.pano) +
    '&yaw=' + turn.yaw +
    '&pitch=' + turn.pitch;

  var mapsUrl =
    'https://www.google.com/maps/@?api=1&map_action=pano' +
    '&pano=' + encodeURIComponent(turn.pano) +
    '&heading=' + turn.yaw +
    '&pitch=' + turn.pitch;

  var rotateDeg = streetviewArrowAngle(turn);

  // Chevron geometry: 48x48 viewBox, point-up at 0deg. Stem + V head.
  var chevronSvg =
    '<svg viewBox="0 0 48 48" aria-hidden="true">' +
      '<path d="M24 6 L24 40 M10 22 L24 6 L38 22" ' +
        'fill="none" stroke="#1a1a1a" stroke-width="7" ' +
        'stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M24 6 L24 40 M10 22 L24 6 L38 22" ' +
        'fill="none" stroke="#F5C518" stroke-width="4.5" ' +
        'stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>';

  return (
    '<div class="streetview-popup-inner">' +
      '<div class="streetview-title">' + turn.name + '</div>' +
      '<div class="streetview-meta">MILE ' + turn.mile.toFixed(2) + '</div>' +
      '<div class="streetview-photo-wrap">' +
        '<img class="streetview-photo" src="' + thumbUrl + '" alt="Street View at ' + turn.name + '" loading="lazy">' +
        '<div class="streetview-arrow" style="transform: translate(-50%, 0) rotate(' + rotateDeg.toFixed(2) + 'deg)">' +
          chevronSvg +
        '</div>' +
      '</div>' +
      '<a class="streetview-link" href="' + mapsUrl + '" target="_blank" rel="noopener noreferrer">Open in Google Maps →</a>' +
    '</div>'
  );
}

var map;
var aidOn = false;
var terrain3D = false;
var aidMarkers = [];
var streetviewMarkers = [];
var streetviewOn = false;
// 8m offset places the marker just past the turn corner along the runner's
// exit direction — both communicates "this is the road you take" and
// separates pairs of turns at shared intersections.
var STREETVIEW_OFFSET_M = 8;
var loopTurnMarkers = { sprint: [], olympic: [], tinman: [] };

// ─── Interactive directions state ───
// `currentRaceId` mirrors the race that renderDirections last drew. It's the
// authoritative source for which step list lives in the DOM.
// `activeStepIdx` is -1 when no step is selected (initial state before
// renderDirections runs); >=0 when a specific step is highlighted.
// `zoomToStep` controls whether clicking a step also flies the camera to
// that step's segment. Persisted across reloads via localStorage.
var currentRaceId = 'tinman';
var activeStepIdx = -1;
var zoomToStep = (function() {
  try {
    var saved = localStorage.getItem('tinman.zoomToStep');
    if (saved === '1') return true;
    if (saved === '0') return false;
    return true;
  } catch (e) { return true; }
})();

// ═══════════════════════════════════════════════════════════
// VIEW SWITCHING
// ═══════════════════════════════════════════════════════════
var currentView = 'map';
var mapInitialized = false;
var simInitialized = false;

function switchView(view) {
  currentView = view;
  document.querySelectorAll('.view-tab').forEach(function(t) { t.classList.toggle('active', t.dataset.view === view); });
  document.querySelectorAll('.view').forEach(function(v) { v.classList.remove('active'); });
  getEl(view + 'View').classList.add('active');
  if (view === 'map' && !mapInitialized) {
    initMap();
    mapInitialized = true;
  }
  if (view === 'sim') {
    initSim();
    renderSim();
  }
}

// ═══════════════════════════════════════════════════════════
// HELPER: registerTurnIcons — canvas-renders a sharp chevron arrow per loop
// color, plus a "depart" pin variant marking the very first heading. Symbol
// layers reference these via `icon-image: 'turn-<id>'`.
// ═══════════════════════════════════════════════════════════
function registerTurnIcons() {
  var SIZE = 56;
  var center = SIZE / 2;
  for (var id in LOOPS) {
    var color = LOOPS[id].color;
    var canvas = document.createElement('canvas');
    canvas.width = SIZE; canvas.height = SIZE;
    var ctx = canvas.getContext('2d');
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Drop shadow so the badge lifts off the map line behind it.
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 1.5;

    // White outer halo ring so the colored badge has a hard edge against the
    // colored line behind it (red-on-red was the original problem).
    ctx.beginPath();
    ctx.arc(center, center, SIZE / 2 - 3, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.shadowColor = 'transparent';

    // Solid colored badge.
    ctx.beginPath();
    ctx.arc(center, center, SIZE / 2 - 6, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Bold white arrowhead pointing UP (the icon rotates as a whole, so this
    // single drawing serves any direction). Drawn as a thick chevron + shaft
    // so the direction reads at a glance even at small icon sizes.
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    // Shaft
    ctx.beginPath();
    ctx.moveTo(center, center + 11);
    ctx.lineTo(center, center - 4);
    ctx.stroke();
    // Arrowhead
    ctx.beginPath();
    ctx.moveTo(center, center - 13);
    ctx.lineTo(center - 9, center + 1);
    ctx.lineTo(center - 3, center + 1);
    ctx.lineTo(center - 3, center + 11);
    ctx.lineTo(center + 3, center + 11);
    ctx.lineTo(center + 3, center + 1);
    ctx.lineTo(center + 9, center + 1);
    ctx.closePath();
    ctx.fill();

    var img = ctx.getImageData(0, 0, SIZE, SIZE);
    if (!map.hasImage('turn-' + id)) {
      map.addImage('turn-' + id, img, { pixelRatio: 2 });
    }
  }
}

// Build a GeoJSON FeatureCollection containing exactly one feature: the
// start arrow at the loop's first step. The runner sees this at T2 — it
// communicates the initial direction of travel. No arrows are rendered
// elsewhere on the course; the cue list is the navigation tool past the
// start, and the segment highlight is the active-step affordance.
function buildStartArrowSource(loopId) {
  var steps = (DIRECTIONS[loopId] || []);
  if (!steps.length) return { type: 'FeatureCollection', features: [] };
  var first = steps[0];
  if (!first || first.bearingAfter == null) return { type: 'FeatureCollection', features: [] };
  var snapped = SNAPPED_STEP_COORDS[loopId] || [];
  var loc = snapped[0] || first.location;
  if (!loc) return { type: 'FeatureCollection', features: [] };
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: { bearing: first.bearingAfter, kind: 'depart' },
      geometry: { type: 'Point', coordinates: loc }
    }]
  };
}

// ═══════════════════════════════════════════════════════════
// HELPER: getCoordAtDist
// ═══════════════════════════════════════════════════════════
function getCoordAtDist(targetMile, loopId) {
  var coords = LOOPS[loopId].geojson.geometry.coordinates;
  var dists = loopCoordDistances[loopId];
  for (var j = 1; j < dists.length; j++) {
    if (dists[j] >= targetMile) {
      var t = (targetMile - dists[j - 1]) / (dists[j] - dists[j - 1]);
      var c0 = coords[j - 1], c1 = coords[j];
      return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t];
    }
  }
  return coords[coords.length - 1];
}

// Snap each step's `location` to the nearest point on the loop's actual
// coordinate line, then return the cumulative mile of that projection.
//
// Why we don't trust step.mile directly: OSRM emits the step list against
// one routing graph, but the geojson is later road-snapped (see
// scripts/snap-tinman-to-roads.js). Cumulative miles drift in the snap
// process, so step.mile no longer matches the position of the same
// physical intersection on the rendered route.
//
// Out-and-back routes pass through the same intersection twice. To keep
// step ordering monotonic we always search forward from the previous
// step's snapped mile, so the second pass finds the second occurrence.
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

// SNAPPED_STEP_MILES[raceId][i] = snapped cumulative mile for steps[i].
// SNAPPED_STEP_COORDS[raceId][i] = the projected [lng,lat] on the route.
// Computed once at script init from DIRECTIONS + loopCoordDistances; the
// rest of the highlight code reads from these arrays instead of step.mile.
var SNAPPED_STEP_MILES = {};
var SNAPPED_STEP_COORDS = {};
(function precomputeSnappedSteps() {
  Object.keys(DIRECTIONS || {}).forEach(function(raceId) {
    var steps = DIRECTIONS[raceId] || [];
    var loopId = RACES[raceId].loops[0];
    var coords = LOOPS[loopId].geojson.geometry.coordinates;
    var dists = loopCoordDistances[loopId];
    var totalMi = dists[dists.length - 1];
    var miles = new Array(steps.length);
    var pts = new Array(steps.length);
    var cursorMile = 0;
    // Allow the next step to snap slightly *before* the previous one
    // (within a foot) — protects against tiny coord-rounding wobbles at
    // intersections that two consecutive steps share.
    var EPS_BACKTRACK = 1 / 5280;
    // ~150 ft tolerance for "this segment IS the right one." Out-and-back
    // routes pass identical intersections twice; without this we'd always
    // pick the globally-closest match (often the return pass with an
    // exact-coordinate match) even when an acceptable earlier match exists.
    // 150 ft covers OSRM rounding plus the small offsets the snap script
    // introduces around intersections.
    var GOOD_MATCH_FT = 150;
    var GOOD_MATCH_DEG = GOOD_MATCH_FT / 364000;
    var GOOD_MATCH_DEG2 = GOOD_MATCH_DEG * GOOD_MATCH_DEG;

    for (var i = 0; i < steps.length; i++) {
      var s = steps[i];
      if (i === 0 && s.type === 'depart') {
        miles[i] = 0;
        pts[i] = coords[0];
        cursorMile = 0;
        continue;
      }
      if (i === steps.length - 1 && s.type === 'arrive') {
        miles[i] = totalMi;
        pts[i] = coords[coords.length - 1];
        continue;
      }
      if (!s.location) {
        miles[i] = cursorMile;
        pts[i] = coords[0];
        continue;
      }
      // Two trackers: the FIRST forward segment whose perpendicular distance
      // is within tolerance ("first good match" — what the runner actually
      // wants), and the globally-closest forward segment as a fallback when
      // the location is genuinely off-route (e.g., 200 ft north of the
      // closest snapped centerline).
      var firstGood = null;
      var bestOverall = { d2: Infinity, mile: cursorMile, point: s.location };
      var minMile = cursorMile - EPS_BACKTRACK;
      for (var j = 1; j < coords.length; j++) {
        if (dists[j] < minMile) continue;
        var r = distSqPointToSegment(s.location, coords[j - 1], coords[j]);
        var ax = coords[j - 1][0], ay = coords[j - 1][1];
        var bx = coords[j][0],     by = coords[j][1];
        var snapMile = dists[j - 1] + r.t * (dists[j] - dists[j - 1]);
        if (snapMile < minMile) snapMile = minMile;
        var snapPt = [ax + r.t * (bx - ax), ay + r.t * (by - ay)];
        if (r.d2 < bestOverall.d2) {
          bestOverall = { d2: r.d2, mile: snapMile, point: snapPt };
        }
        if (firstGood == null && r.d2 <= GOOD_MATCH_DEG2) {
          firstGood = { d2: r.d2, mile: snapMile, point: snapPt };
        }
      }
      var winner = firstGood || bestOverall;
      miles[i] = winner.mile;
      pts[i] = winner.point;
      cursorMile = winner.mile;
    }
    SNAPPED_STEP_MILES[raceId] = miles;
    SNAPPED_STEP_COORDS[raceId] = pts;
  });
})();

// Build the course-line slice for a single direction step. The slice runs
// from the snapped position of step[idx] to the snapped position of
// step[idx+1], so the highlighted segment lines up exactly with the road
// the runner is on between those two turns.
//
// Special case: when consecutive steps share an intersection (a tiny spur
// road like Dugal that the geojson doesn't include separately), the
// step→next segment is degenerate. Fall back to the previous-step→this
// segment so the runner sees the road they were just on. Same for the
// final 'arrive' step, which shares its location with the U-turn before.
function stepSegmentCoords(raceId, stepIdx) {
  var steps = (DIRECTIONS && DIRECTIONS[raceId]) || [];
  if (stepIdx < 0 || stepIdx >= steps.length) return [];
  var loopId = RACES[raceId].loops[0];
  var coords = LOOPS[loopId].geojson.geometry.coordinates;
  var dists = loopCoordDistances[loopId];
  var snapMiles = SNAPPED_STEP_MILES[raceId] || [];
  var totalMi = dists[dists.length - 1];
  function snappedAt(i) {
    if (i < 0) return 0;
    if (i >= steps.length) return totalMi;
    return (snapMiles[i] != null) ? snapMiles[i] : steps[i].mile;
  }
  var startMile = snappedAt(stepIdx);
  var endMile = snappedAt(stepIdx + 1);
  // Less than ~50 ft between snapped points = effectively the same point.
  // Show the road INTO the turn instead so the runner has visual context.
  var DEGENERATE_MI = 50 / 5280;
  if (endMile - startMile < DEGENERATE_MI && stepIdx > 0) {
    var prevMile = snappedAt(stepIdx - 1);
    if (startMile - prevMile >= DEGENERATE_MI) {
      endMile = startMile;
      startMile = prevMile;
    }
  }
  if (endMile < startMile) endMile = startMile;
  var segment = [getCoordAtDist(startMile, loopId)];
  for (var j = 0; j < dists.length; j++) {
    if (dists[j] > startMile && dists[j] < endMile) segment.push(coords[j]);
  }
  segment.push(getCoordAtDist(endMile, loopId));
  return segment;
}

// Empty placeholder so the GeoJSON source can be created up front; setData()
// replaces it whenever the active step changes.
var EMPTY_LINE = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } };

// ═══════════════════════════════════════════════════════════
// MAP VIEW
// ═══════════════════════════════════════════════════════════
function initMap() {
  // The directions list, race cards, and elevation profile are all DOM/canvas
  // surfaces with no map dependency. Rendering them up front means the page
  // still functions when WebGL is unavailable (corporate firewalls, headless
  // browsers, ancient hardware) — the runner just loses the line glow on the
  // map, not the list of turns.
  initDomOnly();

  try {
    map = new maplibregl.Map({
      container: 'map',
      style: BASEMAP_STYLE,
      center: CONFIG.mapCenter,
      zoom: 13,
      pitch: 0,
      bearing: 0,
      antialias: true,
      attributionControl: false,
      preserveDrawingBuffer: true
    });
  } catch (e) {
    // WebGL constructor throws (e.g. headless Chromium without ANGLE). The
    // DOM is already populated; bail out so the rest of initMap doesn't fault.
    console.warn('Map initialization failed (WebGL likely unavailable):', e && e.message);
    return;
  }

  map.addControl(new maplibregl.AttributionControl({ compact: true }));
  map.once('load', function() {
    var attrib = document.querySelector('.maplibregl-ctrl-attrib');
    if (attrib) { attrib.removeAttribute('open'); attrib.classList.remove('maplibregl-compact-show'); }
  });

  map.on('load', function() {
    ['roads_other','roads_bridges_other','roads_bridges_other_casing',
     'roads_tunnels_other','roads_tunnels_other_casing','roads_labels_minor'
    ].forEach(function(id) { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none'); });

    map.addSource('terrain-dem', {
      type: 'raster-dem',
      tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
      tileSize: 256, maxzoom: 15, encoding: 'terrarium'
    });

    var loopOrder = ['tinman', 'olympic', 'sprint'];
    for (var li = 0; li < loopOrder.length; li++) {
      var id = loopOrder[li];
      var loop = LOOPS[id];
      // Use the multi-feature FeatureCollection (kept from the old phase-split
      // layout). The unsuffixed loop layer renders the entire collection
      // without filtering, so out/back features render together as one line.
      map.addSource(id, { type: 'geojson', data: loop.geojsonAll || loop.geojson });

      // Single course line at all zoom levels: black casing + dark inner +
      // branded color. The previous parallel-offset out/back rendering was
      // dropped — it read as two confusingly-similar parallel roads, which
      // the cue list already disambiguates better.
      map.addLayer({
        id: id + '-casing',
        type: 'line',
        source: id,
        paint: { 'line-color': '#000', 'line-width': 7, 'line-opacity': 0.35 },
        layout: { 'line-cap': 'round', 'line-join': 'round' }
      });
      map.addLayer({
        id: id + '-dark',
        type: 'line',
        source: id,
        paint: { 'line-color': '#111', 'line-width': 4, 'line-opacity': 1 },
        layout: { 'line-cap': 'round', 'line-join': 'round' }
      });
      map.addLayer({
        id: id,
        type: 'line',
        source: id,
        paint: {
          'line-color': loop.color,
          'line-width': 2.5,
          'line-opacity': 1
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' }
      });

      (function(loopId, loopObj) {
        map.on('click', loopId, function(e) {
          var t = e.originalEvent && e.originalEvent.target;
          if (t && t.closest && t.closest('.aid-marker, .hq-marker, .mile-marker, .streetview-marker')) return;
          new maplibregl.Popup({ offset: 12 }).setLngLat(e.lngLat).setHTML(
            '<strong style="color:' + loopObj.color + '">' + loopObj.label + ' Run</strong><br>' +
            '<span style="color:#666">' + loopObj.run + ' mi run · ' + loopObj.gain + "' gain</span><br>" +
            '<span style="color:#888;font-size:0.8em">Swim ' + loopObj.swim + ' mi · Bike ' + loopObj.bike + ' mi</span>'
          ).addTo(map);
        });
        map.on('mouseenter', loopId, function() { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', loopId, function() { map.getCanvas().style.cursor = ''; });
      })(id, loop);
    }

    addMileMarkers();
    registerTurnIcons();
    addStartArrowLayers();
    addDirectionsHighlightLayers();

    var el = document.createElement('div');
    el.className = 'hq-marker';
    setHtml(el, '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="#F5C518" stroke="#1a1a1a" stroke-width="2"/><text x="16" y="20" text-anchor="middle" font-size="11" font-weight="bold" fill="#1a1a1a">T2</text></svg>');
    new maplibregl.Marker({ element: el }).setLngLat(HQ).setPopup(
      new maplibregl.Popup({ offset: 15 }).setHTML(
        '<strong style="color:#1a1a1a">Bike Finish / Run Start (T2)</strong><br>' +
        '<span style="color:#666">Tinman Beach · Tupper Lake</span>'
      )
    ).addTo(map);

    // Turnaround markers — distinct U-turn glyphs at each detected turnaround,
    // colored to match the loop. These give an unambiguous "you reverse here"
    // signal that arrows along the line could not communicate. One marker set
    // per loop so visibility tracks the loop toggle.
    Object.keys(TURNAROUNDS).forEach(function(loopId) {
      var color = LOOPS[loopId].color;
      TURNAROUNDS[loopId].forEach(function(t) {
        var tEl = document.createElement('div');
        tEl.className = 'turnaround-marker';
        setHtml(tEl,
          '<svg viewBox="0 0 32 32" aria-hidden="true">' +
            '<circle cx="16" cy="16" r="13" fill="' + color + '" stroke="#fff" stroke-width="2.5"/>' +
            '<path d="M11 19V12a4 4 0 0 1 8 0v8M8 16l3 3 3-3" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>' +
          '</svg>'
        );
        var marker = new maplibregl.Marker({ element: tEl })
          .setLngLat([t.lng, t.lat])
          .setPopup(new maplibregl.Popup({ offset: 16 }).setHTML(
            '<strong style="color:' + color + '">' + LOOPS[loopId].label + ' Turnaround</strong><br>' +
            '<span style="color:#666">Mile ' + t.mile + ' · reverse direction here</span>'
          ))
          .addTo(map);
        loopTurnMarkers[loopId].push({ marker: marker, element: tEl });
      });
    });

    AID_STATIONS.forEach(function(station) {
      var aidEl = document.createElement('div');
      aidEl.className = 'aid-marker';
      aidEl.style.display = 'none';
      setHtml(aidEl, '<svg viewBox="0 0 28 28"><circle cx="14" cy="14" r="11" fill="#C8102E" stroke="#fff" stroke-width="2"/><text x="14" y="18.5" text-anchor="middle" font-size="14" font-weight="bold" fill="#fff">+</text></svg>');
      var marker = new maplibregl.Marker({ element: aidEl })
        .setLngLat([station.lng, station.lat])
        .setPopup(new maplibregl.Popup({ offset: 15 }).setHTML(
          '<strong style="color:#C8102E">' + station.name + '</strong><br>' +
          '<span style="color:#666">Mile ' + station.mile + ' · Tinman Run</span><br>' +
          '<span style="font-size:0.8rem;color:#444">' + station.services + '</span>'
        ))
        .addTo(map);
      aidMarkers.push({ marker: marker, element: aidEl });
    });

    // Street View markers — placed just past each turn corner along the
    // runner's exit direction (offset controlled by STREETVIEW_OFFSET_M).
    // Hidden by default; toggleStreetview() flips them visible.
    STREETVIEW_TURNS.forEach(function(turn) {
      var lat = turn.coords[1];
      var lng = turn.coords[0];
      var br = turn.bearingAfter * Math.PI / 180;
      var dLat = (STREETVIEW_OFFSET_M * Math.cos(br)) / 111000;
      var dLng = (STREETVIEW_OFFSET_M * Math.sin(br)) / (111000 * Math.cos(lat * Math.PI / 180));
      var renderLng = lng + dLng;
      var renderLat = lat + dLat;

      var svEl = document.createElement('div');
      svEl.className = 'streetview-marker';
      svEl.dataset.panoId = turn.pano;
      svEl.style.display = 'none';
      // Camera glyph: black disc, yellow border, white camera body, black lens.
      setHtml(svEl,
        '<svg viewBox="0 0 32 32" aria-hidden="true">' +
          '<circle cx="16" cy="16" r="13" fill="#1a1a1a" stroke="#F5C518" stroke-width="2.5"/>' +
          '<rect x="9" y="12" width="14" height="9" rx="1.5" fill="#fff"/>' +
          '<polygon points="13,12 15,10 17,10 19,12" fill="#fff"/>' +
          '<circle cx="16" cy="16.5" r="2.6" fill="#1a1a1a"/>' +
        '</svg>'
      );
      var marker = new maplibregl.Marker({ element: svEl })
        .setLngLat([renderLng, renderLat])
        .setPopup(new maplibregl.Popup({
          offset: 16,
          className: 'streetview-popup',
          maxWidth: '380px'
        }).setHTML(buildStreetviewPopupHtml(turn)))
        .addTo(map);
      streetviewMarkers.push({ marker: marker, element: svEl });
    });

    // Apply initial visibility per LOOPS[id].visible defaults — by default
    // only Tinman is visible so the headline course leads the map.
    Object.keys(LOOPS).forEach(function(lid) { setLoopVisibility(lid, LOOPS[lid].visible); });

    // Frame the visible course on load. Without this the default zoom/center
    // would crop the northern leg out to N. Little Wolf Pond.
    fitVisibleLoopsToView();

    // Apply the active-step highlight to the map now that the highlight
    // sources/layers exist. The DOM list was already populated by initDomOnly
    // before the map booted, so activeStepIdx is already 0.
    setActiveStep(activeStepIdx >= 0 ? activeStepIdx : 0, {
      fitCamera: false,
      scrollList: false,
      smooth: false
    });
  });
}

// Render every DOM/canvas surface that doesn't require the map. Safe to call
// before maplibre is constructed (or at all, if WebGL is unavailable).
function initDomOnly() {
  buildCards();
  drawProfile('tinman');
  renderDirections('tinman');
  document.querySelectorAll('.race-card').forEach(function(c) {
    c.classList.toggle('active', c.dataset.race === 'tinman');
  });

  // Reflect the persisted zoom-to-step preference on the checkbox.
  var box = getEl('zoomToStepCheckbox');
  if (box) box.checked = zoomToStep;
}

// Fit the map viewport to the bounding box of every currently-visible loop.
// Called on load and whenever loop visibility changes so the map always shows
// the full picture of the selected courses.
function fitVisibleLoopsToView() {
  if (!map) return;
  var minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  var found = false;
  Object.keys(LOOPS).forEach(function(lid) {
    if (!LOOPS[lid].visible) return;
    var coords = LOOPS[lid].geojson && LOOPS[lid].geojson.geometry.coordinates;
    if (!coords) return;
    for (var i = 0; i < coords.length; i++) {
      found = true;
      if (coords[i][0] < minLng) minLng = coords[i][0];
      if (coords[i][0] > maxLng) maxLng = coords[i][0];
      if (coords[i][1] < minLat) minLat = coords[i][1];
      if (coords[i][1] > maxLat) maxLat = coords[i][1];
    }
  });
  if (!found) return;
  map.fitBounds([[minLng, minLat], [maxLng, maxLat]], {
    padding: { top: 50, right: 50, bottom: 50, left: 50 },
    duration: 0,
    maxZoom: 14
  });
}

// ═══════════════════════════════════════════════════════════
// MILE MARKERS
// ═══════════════════════════════════════════════════════════
// Per-race priority-1 mile-marker set. These are the markers visible at
// default zoom; all other integer miles appear once zoomed past 16.
var DEFAULT_MILE_MARKERS = {
  sprint:  [1.5],
  olympic: [2, 4],
  tinman:  [3, 6, 9, 12]
};

function addMileMarkers() {
  var loopIds = ['tinman', 'olympic', 'sprint'];
  loopIds.forEach(function(id) {
    var loop = LOOPS[id];
    var totalMi = loop.run;
    var defaults = DEFAULT_MILE_MARKERS[id] || [];
    // Combine integer miles with the per-race default-visible set, dedupe.
    var milesSet = {};
    for (var m = 1; m <= Math.floor(totalMi); m++) milesSet[m] = true;
    defaults.forEach(function(m) { milesSet[m] = true; });
    var miles = Object.keys(milesSet).map(parseFloat).sort(function(a, b) { return a - b; });
    var features = miles.map(function(m) {
      var isDefault = defaults.indexOf(m) !== -1;
      var label = Number.isInteger(m) ? String(m) : m.toFixed(1);
      return {
        type: 'Feature',
        properties: { mile: m, label: label, priority: isDefault ? 1 : 2 },
        geometry: { type: 'Point', coordinates: getCoordAtDist(m, id) }
      };
    });
    var sourceId = id + '-miles';
    map.addSource(sourceId, { type: 'geojson', data: { type: 'FeatureCollection', features: features } });

    map.addLayer({
      id: sourceId + '-circle',
      type: 'circle',
      source: sourceId,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 5, 14, 8, 17, 11],
        'circle-color': '#1a1a1a',
        'circle-stroke-color': loop.color,
        'circle-stroke-width': 2
      },
      filter: ['step', ['zoom'], ['==', ['get', 'priority'], 1], 16, ['>=', ['get', 'priority'], 1]]
    });

    map.addLayer({
      id: sourceId + '-label',
      type: 'symbol',
      source: sourceId,
      layout: {
        'text-field': ['get', 'label'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 11, 8, 14, 11, 17, 14],
        'text-font': ['Noto Sans Medium'],
        'text-allow-overlap': true,
        'text-ignore-placement': true
      },
      paint: { 'text-color': '#ffffff' },
      filter: ['step', ['zoom'], ['==', ['get', 'priority'], 1], 16, ['>=', ['get', 'priority'], 1]]
    });
  });
}

// ═══════════════════════════════════════════════════════════
// START ARROW — one rotated chevron at each loop's start point.
// Replaces the old per-intersection turn-arrow grid. Past the start, the
// course line and cue list together carry direction; an arrow at every
// intersection just adds noise.
// ═══════════════════════════════════════════════════════════
function addStartArrowLayers() {
  ['sprint', 'olympic', 'tinman'].forEach(function(id) {
    var sourceId = id + '-start-arrow';
    map.addSource(sourceId, { type: 'geojson', data: buildStartArrowSource(id) });
    map.addLayer({
      id: id + '-start-arrow',
      type: 'symbol',
      source: sourceId,
      layout: {
        'icon-image': 'turn-' + id,
        'icon-rotate': ['get', 'bearing'],
        'icon-rotation-alignment': 'map',
        'icon-pitch-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-size': ['interpolate', ['linear'], ['zoom'], 12, 0.45, 13, 0.6, 14, 0.7, 17, 0.85]
      },
      paint: { 'icon-opacity': ['interpolate', ['linear'], ['zoom'], 11.5, 0, 12.5, 1] }
    });
  });
}

// ═══════════════════════════════════════════════════════════
// INTERACTIVE DIRECTIONS — highlight layers
// One pair of layers (segment + numbered pin) services every race; switching
// races just calls setActiveStep with a fresh index, which rewrites the source
// data in place. Painting once and mutating data avoids leaking layers when
// the runner toggles between Sprint / Olympic / Tinman.
// ═══════════════════════════════════════════════════════════
function addDirectionsHighlightLayers() {
  map.addSource('dir-active-segment', { type: 'geojson', data: EMPTY_LINE });

  // Soft halo behind the highlight so it lifts off the dimmed course beneath.
  map.addLayer({
    id: 'dir-active-segment-halo',
    type: 'line',
    source: 'dir-active-segment',
    paint: {
      'line-color': '#F5C518',
      'line-width': ['interpolate', ['linear'], ['zoom'], 12, 8, 17, 18],
      'line-opacity': 0.35,
      'line-blur': 3
    },
    layout: { 'line-cap': 'round', 'line-join': 'round' }
  });
  // Solid bright accent line in brand yellow over the dimmed course.
  map.addLayer({
    id: 'dir-active-segment-line',
    type: 'line',
    source: 'dir-active-segment',
    paint: {
      'line-color': '#F5C518',
      'line-width': ['interpolate', ['linear'], ['zoom'], 12, 4, 17, 8],
      'line-opacity': 1
    },
    layout: { 'line-cap': 'round', 'line-join': 'round' }
  });
}

// Dim the non-active course while a step is highlighted. Reaches into the
// existing course paint properties rather than introducing new layers, so the
// dim/restore cycle is symmetric with toggleLoop.
function setCourseDimmed(dimmed) {
  if (!map) return;
  var loopIds = ['sprint', 'olympic', 'tinman'];
  // The three layers per loop that render the course line, in stack order:
  // casing (black halo), dark (inner), and the branded-color top.
  var fullOpacity = { '-casing': 0.35, '-dark': 1,    '': 1 };
  var dimOpacity  = { '-casing': 0.18, '-dark': 0.35, '': 0.35 };
  loopIds.forEach(function(lid) {
    Object.keys(fullOpacity).forEach(function(suf) {
      var layerId = lid + suf;
      if (!map.getLayer(layerId)) return;
      map.setPaintProperty(layerId, 'line-opacity', dimmed ? dimOpacity[suf] : fullOpacity[suf]);
    });
  });
}

// ═══════════════════════════════════════════════════════════
// INTERACTIVE DIRECTIONS — active-step state machine
// ═══════════════════════════════════════════════════════════

// Set / clear the highlighted step. opts:
//   fitCamera (bool) — fly map viewport to fit the active segment
//   scrollList (bool) — scroll the directions list so active step is visible
//   smooth (bool) — use easeTo / smooth scroll (default true)
//
// Two independent halves: a DOM/profile pass that always runs, and a map pass
// that runs only once the highlight sources have been added inside the
// MapLibre load handler. Splitting this way means the directions list and the
// elevation marker work even when WebGL fails (corporate firewall, headless
// browser, very old hardware) — the user just doesn't see the line glow.
function setActiveStep(idx, opts) {
  opts = opts || {};
  var smooth = opts.smooth !== false;
  var steps = (DIRECTIONS && DIRECTIONS[currentRaceId]) || [];
  if (!steps.length) {
    activeStepIdx = -1;
    syncListActiveDom(-1, opts);
    if (map) {
      var segSrcEmpty = map.getSource('dir-active-segment');
      if (segSrcEmpty) segSrcEmpty.setData(EMPTY_LINE);
      setCourseDimmed(false);
    }
    drawProfileFromVisible();
    return;
  }
  if (idx < 0) idx = 0;
  if (idx > steps.length - 1) idx = steps.length - 1;
  activeStepIdx = idx;

  // DOM + profile updates run unconditionally so the list highlight + the
  // elevation marker stay in sync even if the map never loaded.
  syncListActiveDom(idx, opts);
  drawProfileFromVisible();

  // Map updates require the highlight sources, which are added in the load
  // handler. Outside of that handler we silently no-op.
  if (!map || !map.getSource('dir-active-segment')) return;

  var step = steps[idx];
  var segCoords = stepSegmentCoords(currentRaceId, idx);
  map.getSource('dir-active-segment').setData({
    type: 'Feature', properties: {},
    geometry: { type: 'LineString', coordinates: segCoords }
  });


  setCourseDimmed(true);

  if (opts.fitCamera && segCoords.length) {
    var minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (var k = 0; k < segCoords.length; k++) {
      if (segCoords[k][0] < minLng) minLng = segCoords[k][0];
      if (segCoords[k][0] > maxLng) maxLng = segCoords[k][0];
      if (segCoords[k][1] < minLat) minLat = segCoords[k][1];
      if (segCoords[k][1] > maxLat) maxLat = segCoords[k][1];
    }
    map.fitBounds([[minLng, minLat], [maxLng, maxLat]], {
      padding: { top: 80, right: 60, bottom: 80, left: 60 },
      duration: smooth ? 600 : 0,
      maxZoom: 16
    });
  }
}

function syncListActiveDom(idx, opts) {
  opts = opts || {};
  var listEl = getEl('directionsList');
  if (!listEl) return;
  var children = listEl.children;
  for (var i = 0; i < children.length; i++) {
    children[i].classList.toggle('active', i === idx);
  }
  if (opts.scrollList) {
    var activeEl = listEl.querySelector('.dir-step.active');
    if (activeEl) {
      // 'nearest' avoids jumping the page when the step is already visible.
      activeEl.scrollIntoView({ block: 'nearest', behavior: opts.smooth === false ? 'auto' : 'smooth' });
    }
  }
}

// ═══════════════════════════════════════════════════════════
// ZOOM-TO-STEP TOGGLE
// ═══════════════════════════════════════════════════════════
function setZoomToStep(checked) {
  zoomToStep = !!checked;
  try { localStorage.setItem('tinman.zoomToStep', zoomToStep ? '1' : '0'); } catch (e) { /* private mode */ }
  var box = getEl('zoomToStepCheckbox');
  if (box) box.checked = zoomToStep;
}

// ═══════════════════════════════════════════════════════════
// LOOP TOGGLES
// ═══════════════════════════════════════════════════════════
function toggleLoop(id) {
  var loop = LOOPS[id];
  loop.visible = !loop.visible;
  document.querySelector('[data-loop="' + id + '"]').classList.toggle('active', loop.visible);
  setLoopVisibility(id, loop.visible);
  fitVisibleLoopsToView();
  drawProfileFromVisible();
}

// Centralize layer visibility so toggleLoop and selectRace stay in sync.
function setLoopVisibility(id, visible) {
  if (!map || !map.getLayer(id)) return;
  var v = visible ? 'visible' : 'none';
  var layerSuffixes = ['', '-casing', '-dark', '-miles-circle', '-miles-label', '-start-arrow'];
  for (var i = 0; i < layerSuffixes.length; i++) {
    var lid = id + layerSuffixes[i];
    if (map.getLayer(lid)) map.setLayoutProperty(lid, 'visibility', v);
  }
  // Turnaround markers for this loop are toggled in JS, not via layer prop.
  if (loopTurnMarkers[id]) {
    loopTurnMarkers[id].forEach(function(m) {
      m.element.style.display = visible ? 'block' : 'none';
    });
  }
}

function drawProfileFromVisible() {
  var active = Object.keys(LOOPS).filter(function(id) { return LOOPS[id].visible; });
  if (!active.length) {
    getEl('profileTitle').textContent = 'Elevation Profile';
    setHtml(getEl('profileStats'), '');
    var canvas = getEl('profileCanvas');
    if (canvas) {
      var ctx = canvas.getContext('2d');
      var rect = canvas.getBoundingClientRect();
      var dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    return;
  }
  var longest = active.reduce(function(a, b) { return LOOPS[a].run >= LOOPS[b].run ? a : b; });
  drawProfile(longest);
}

function selectRace(raceId) {
  var race = RACES[raceId];
  currentRaceId = raceId;
  // Switching races feels like a fresh study session — drop any prior step
  // selection so the user starts at step 1 of the new course every time.
  activeStepIdx = -1;
  for (var id in LOOPS) {
    var show = (race.loops.indexOf(id) >= 0);
    LOOPS[id].visible = show;
    document.querySelector('[data-loop="' + id + '"]').classList.toggle('active', show);
    setLoopVisibility(id, show);
  }
  fitVisibleLoopsToView();
  drawProfile(raceId);
  // renderDirections rebuilds the step list and re-anchors activeStepIdx to 0.
  renderDirections(raceId);
  document.querySelectorAll('.race-card').forEach(function(c) { c.classList.toggle('active', c.dataset.race === raceId); });
  // Sync the in-panel race tabs (the primary, in-context switcher).
  document.querySelectorAll('.dir-race-tab').forEach(function(t) {
    var on = t.dataset.race === raceId;
    t.classList.toggle('active', on);
    t.setAttribute('aria-selected', on ? 'true' : 'false');
  });
}

function buildCards() {
  var html = '';
  var raceOrder = ['sprint', 'olympic', 'tinman'];
  for (var ri = 0; ri < raceOrder.length; ri++) {
    var rid = raceOrder[ri];
    var race = RACES[rid];
    var loop = LOOPS[race.loops[0]];
    html += '<div class="race-card" data-race="' + rid + '" onclick="selectRace(\'' + rid + '\')">' +
      '<div class="name">' + race.name + '</div>' +
      '<div class="details">' + loop.swim + ' / ' + loop.bike + ' / ' + loop.run + '</div>' +
      '<div class="dots"><div class="dot" style="background:' + loop.color + '"></div></div>' +
      '</div>';
  }
  setHtml(getEl('raceCards'), html);
}

function drawProfile(raceId) {
  var race = RACES[raceId];
  drawCombined(race.loops, race.name + ' Run');
}

// ═══════════════════════════════════════════════════════════
// TURN-BY-TURN DIRECTIONS
// ═══════════════════════════════════════════════════════════
function maneuverIcon(type, modifier) {
  // Inline SVG glyphs sized 16x16 — simple geometric direction indicators.
  if (modifier === 'uturn' || (type === 'continue' && modifier === 'uturn')) {
    return '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M5 13V6a3 3 0 0 1 6 0v7M3 11l2 2 2-2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  if (type === 'depart') {
    return '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="4.5" fill="currentColor"/></svg>';
  }
  if (type === 'arrive') {
    return '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 3v10M3 4h7l-1.5 2L10 8H3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  // Direction arrows for turn / continue / merge / fork / end of road
  var rotation = 0;
  switch (modifier) {
    case 'left': rotation = -90; break;
    case 'sharp left': rotation = -135; break;
    case 'slight left': rotation = -45; break;
    case 'right': rotation = 90; break;
    case 'sharp right': rotation = 135; break;
    case 'slight right': rotation = 45; break;
    case 'straight': default: rotation = 0;
  }
  return '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" style="transform:rotate(' + rotation + 'deg)"><path d="M8 13V3M4 7l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

function formatStepDistance(distMi) {
  if (distMi >= 0.1) return distMi.toFixed(1) + ' mi';
  var ft = Math.round(distMi * 5280);
  return ft + ' ft';
}

function renderDirections(raceId) {
  var steps = (typeof DIRECTIONS !== 'undefined' && DIRECTIONS[raceId]) || [];
  var race = RACES[raceId];
  currentRaceId = raceId;
  var labelEl = getEl('directionsRaceLabel');
  if (labelEl) labelEl.textContent = race.name + ' Run · ' + race.miles + ' mi';
  var countEl = getEl('directionsCount');
  if (countEl) countEl.textContent = steps.length + ' steps';
  var listEl = getEl('directionsList');
  if (!listEl) return;
  var color = LOOPS[race.loops[0]].color;
  var snapMiles = SNAPPED_STEP_MILES[raceId] || [];
  var html = '';
  for (var i = 0; i < steps.length; i++) {
    var s = steps[i];
    // Display the route-snapped mile so runners read an accurate position
    // on the rendered course. step.mile is OSRM's claim against a stale
    // routing graph and can drift by multiple miles.
    var displayMile = snapMiles[i] != null ? snapMiles[i] : s.mile;
    // Distance to the next turn, computed from snapped miles for the same
    // accuracy reason.
    var nextSnap = (i + 1 < steps.length && snapMiles[i + 1] != null) ? snapMiles[i + 1] : null;
    var legMi = (nextSnap != null) ? Math.max(0, nextSnap - displayMile) : 0;
    html += '<li class="dir-step" data-step-idx="' + i + '" tabindex="0" role="button" ' +
      'aria-label="Step ' + (i + 1) + ': ' + s.instruction.replace(/"/g, '&quot;') + '">' +
      '<span class="dir-mile">' + displayMile.toFixed(1) + '</span>' +
      '<span class="dir-icon" style="color:' + color + '">' + maneuverIcon(s.type, s.modifier) + '</span>' +
      '<span class="dir-text"><span class="dir-instr">' + s.instruction + '</span>' +
        (legMi > 0 ? '<span class="dir-dist">' + formatStepDistance(legMi) + '</span>' : '') +
      '</span>' +
    '</li>';
  }
  setHtml(listEl, html);

  // Bind interaction to each step. Click + keyboard for accessibility.
  var listChildren = listEl.children;
  for (var c = 0; c < listChildren.length; c++) {
    (function(el, idx) {
      el.addEventListener('click', function() {
        // Camera fit only fires in click mode — in scrub mode the user is
        // driving the highlight via scroll and an unsolicited fly-to is jarring.
        setActiveStep(idx, { fitCamera: zoomToStep, scrollList: false });
      });
      el.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setActiveStep(idx, { fitCamera: zoomToStep, scrollList: false });
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
          e.preventDefault();
          var next = Math.min(steps.length - 1, idx + 1);
          setActiveStep(next, { fitCamera: zoomToStep, scrollList: true });
          var nextEl = listEl.querySelector('[data-step-idx="' + next + '"]');
          if (nextEl) nextEl.focus();
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
          e.preventDefault();
          var prev = Math.max(0, idx - 1);
          setActiveStep(prev, { fitCamera: zoomToStep, scrollList: true });
          var prevEl = listEl.querySelector('[data-step-idx="' + prev + '"]');
          if (prevEl) prevEl.focus();
        }
      });
    })(listChildren[c], c);
  }

  // Always reset to step 1 when a race is rendered (covers initial load AND
  // race switches). Skip camera-fit on the initial render so the load-time
  // fitVisibleLoopsToView() call wins.
  setActiveStep(0, { fitCamera: false, scrollList: false, smooth: false });
}

function toggleDirections() {
  var section = getEl('directionsSection');
  if (!section) return;
  var expanded = section.classList.toggle('expanded');
  var btn = section.querySelector('.directions-header');
  if (btn) btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
}

function drawCombined(loopSeq, title) {
  var canvas = getEl('profileCanvas');
  var ctx = canvas.getContext('2d');
  var rect = canvas.getBoundingClientRect();
  var dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  var W = rect.width, H = rect.height;

  var segments = [], offset = 0, totalGain = 0;
  for (var si = 0; si < loopSeq.length; si++) {
    var id = loopSeq[si];
    var loop = LOOPS[id];
    if (!loop.profile) continue;
    var maxD = loop.profile[loop.profile.length - 1].d;
    var pts = loop.profile.map(function(p) { return { d: p.d + offset, e: p.e }; });
    totalGain += loop.gain;
    segments.push({ pts: pts, color: loop.color });
    offset += maxD;
  }

  getEl('profileTitle').textContent = 'Elevation — ' + title;
  var allPts = [];
  for (var i = 0; i < segments.length; i++) {
    for (var j = 0; j < segments[i].pts.length; j++) allPts.push(segments[i].pts[j]);
  }
  if (!allPts.length) return;

  var minE = Infinity, maxE = -Infinity;
  for (var i = 0; i < allPts.length; i++) {
    if (allPts[i].e < minE) minE = allPts[i].e;
    if (allPts[i].e > maxE) maxE = allPts[i].e;
  }
  var totalD = offset;
  setHtml(getEl('profileStats'),
    '<div><span class="val">' + totalD.toFixed(1) + '</span> mi</div>' +
    '<div><span class="val">+' + Math.round(totalGain).toLocaleString() + '</span> ft</div>'
  );

  var ml = 36, mr = 8, mt = 8, mb = 16;
  var cw = W - ml - mr, ch = H - mt - mb;
  var pad = 15, eMin = minE - pad, eMax = maxE + pad;
  var xS = function(d) { return ml + (d / totalD) * cw; };
  var yS = function(e) { return mt + ch - ((e - eMin) / (eMax - eMin)) * ch; };

  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.lineWidth = 1;
  var step = (eMax - eMin) > 200 ? 50 : 20;
  for (var e = Math.ceil(eMin / step) * step; e <= eMax; e += step) {
    var y = yS(e);
    ctx.beginPath(); ctx.moveTo(ml, y); ctx.lineTo(W - mr, y); ctx.stroke();
    ctx.fillStyle = '#888'; ctx.font = '9px Inter,sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(e + "'", ml - 4, y + 3);
  }

  for (var si = 0; si < segments.length; si++) {
    var seg = segments[si];
    var pts = seg.pts;
    if (pts.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(xS(pts[0].d), yS(pts[0].e));
    for (var i = 1; i < pts.length; i++) ctx.lineTo(xS(pts[i].d), yS(pts[i].e));
    ctx.lineTo(xS(pts[pts.length - 1].d), yS(eMin));
    ctx.lineTo(xS(pts[0].d), yS(eMin));
    ctx.closePath();
    var hex = seg.color, r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    var grad = ctx.createLinearGradient(0, mt, 0, H - mb);
    grad.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',0.4)');
    grad.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0.05)');
    ctx.fillStyle = grad; ctx.fill();
    ctx.beginPath();
    ctx.moveTo(xS(pts[0].d), yS(pts[0].e));
    for (var i = 1; i < pts.length; i++) ctx.lineTo(xS(pts[i].d), yS(pts[i].e));
    ctx.strokeStyle = seg.color; ctx.lineWidth = 2.25; ctx.stroke();
  }

  // Active-step marker: a thin yellow vertical line + small dot at the step's
  // mile so the elevation profile syncs with the highlighted map segment. We
  // only draw when the active step belongs to the loop currently shown — this
  // sidesteps the case where a Sprint-step active index is somehow held while
  // the Tinman profile is on screen.
  if (activeStepIdx >= 0 && DIRECTIONS && DIRECTIONS[currentRaceId]) {
    var activeStep = DIRECTIONS[currentRaceId][activeStepIdx];
    if (activeStep && loopSeq.indexOf(RACES[currentRaceId].loops[0]) >= 0) {
      // Use the snapped mile (matches the segment + pin), not the OSRM
      // step.mile which can be offset by miles from the rendered route.
      var snapMiles = SNAPPED_STEP_MILES[currentRaceId];
      var activeMile = (snapMiles && snapMiles[activeStepIdx] != null)
        ? snapMiles[activeStepIdx]
        : activeStep.mile;
      var mileX = xS(activeMile);
      ctx.strokeStyle = 'rgba(245,197,24,0.95)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(mileX, mt);
      ctx.lineTo(mileX, H - mb);
      ctx.stroke();
      ctx.setLineDash([]);
      // Find the elevation at the active mile by linear-interpolating allPts.
      var ae = null;
      for (var ap = 1; ap < allPts.length; ap++) {
        if (allPts[ap].d >= activeMile) {
          var p0 = allPts[ap - 1], p1 = allPts[ap];
          var dr = p1.d - p0.d;
          var t = dr > 0 ? (activeMile - p0.d) / dr : 0;
          ae = p0.e + (p1.e - p0.e) * t;
          break;
        }
      }
      if (ae == null) ae = allPts[allPts.length - 1].e;
      var mileY = yS(ae);
      ctx.fillStyle = '#F5C518';
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(mileX, mileY, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
}

// ═══════════════════════════════════════════════════════════
// AID + 3D TOGGLES
// ═══════════════════════════════════════════════════════════
function toggleAid() {
  aidOn = !aidOn;
  getEl('aidBtn').classList.toggle('active', aidOn);
  aidMarkers.forEach(function(a) { a.element.style.display = aidOn ? 'block' : 'none'; });
}

function toggleStreetview() {
  streetviewOn = !streetviewOn;
  getEl('streetviewBtn').classList.toggle('active', streetviewOn);
  streetviewMarkers.forEach(function(s) {
    s.element.style.display = streetviewOn ? 'block' : 'none';
    var popup = s.marker.getPopup();
    if (!streetviewOn && popup && popup.isOpen()) {
      popup.remove();
    }
  });
}

function toggle3D() {
  terrain3D = !terrain3D;
  getEl('terrainBtn').classList.toggle('active', terrain3D);
  if (!map) return;
  if (terrain3D) {
    map.setTerrain({ source: 'terrain-dem', exaggeration: 1.4 });
    map.setSky({
      'sky-color': '#88C6FC',
      'horizon-color': '#ffffff',
      'sky-horizon-blend': 0.8,
      'fog-color': '#ffffff',
      'fog-ground-blend': 0.5
    });
    map.easeTo({ pitch: 50, duration: 1000 });
  } else {
    map.setTerrain(null);
    map.setSky(null);
    map.easeTo({ pitch: 0, duration: 1000 });
  }
}

// ═══════════════════════════════════════════════════════════
// SIMULATOR
// ═══════════════════════════════════════════════════════════
var simRace = RACES['tinman'];
var simProgress = 0;
var simPlaying = false;
var simSpeed = 1;
var simFinishHours = 2.0;
var simProfile = [];
var simTotalDist = 0;
var simTotalGain = 0;
var simLastTick = 0;

function initSim() {
  if (simInitialized) return;
  simInitialized = true;
  buildSimRaces();
  buildSimProfile();
  buildSimScrubber();
  buildGoalTimeUI();

  var track = getEl('scrubTrack');
  var scrubbing = false;
  var scrubTo = function(e) {
    var rect = track.getBoundingClientRect();
    var clientX = e.touches ? e.touches[0].clientX : e.clientX;
    simProgress = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    renderSim();
  };
  track.addEventListener('mousedown', function(e) { scrubbing = true; simPlaying = false; setHtml(getEl('playBtn'), '▶'); scrubTo(e); });
  window.addEventListener('mousemove', function(e) { if (scrubbing) scrubTo(e); });
  window.addEventListener('mouseup', function() { scrubbing = false; });
  track.addEventListener('touchstart', function(e) { scrubbing = true; simPlaying = false; setHtml(getEl('playBtn'), '▶'); scrubTo(e); }, { passive: true });
  window.addEventListener('touchmove', function(e) { if (scrubbing) scrubTo(e); }, { passive: true });
  window.addEventListener('touchend', function() { scrubbing = false; });
}

function buildSimRaces() {
  var html = '';
  var order = ['sprint', 'olympic', 'tinman'];
  for (var i = 0; i < order.length; i++) {
    var id = order[i];
    html += '<button class="sim-race-btn' + (id === 'tinman' ? ' active' : '') + '" data-race="' + id + '" onclick="pickSimRace(\'' + id + '\')">' + RACES[id].name + '</button>';
  }
  setHtml(getEl('simRaces'), html);
}

function pickSimRace(id) {
  simRace = RACES[id];
  simProgress = 0;
  simPlaying = false;
  simFinishHours = simRace.hours;
  setHtml(getEl('playBtn'), '▶');
  document.querySelectorAll('.sim-race-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.race === id); });
  buildSimProfile();
  buildSimScrubber();
  buildGoalTimeUI();
  renderSim();
}

function buildGoalTimeUI() {
  var h = Math.floor(simFinishHours);
  var m = Math.round((simFinishHours - h) * 60);
  getEl('goalHrs').value = h;
  getEl('goalMins').value = m;
  updateGoalPace();
}

function updateGoalTime() {
  var h = parseInt(getEl('goalHrs').value) || 0;
  var m = parseInt(getEl('goalMins').value) || 0;
  simFinishHours = h + m / 60;
  if (simFinishHours < 0.1) simFinishHours = 0.1;
  updateGoalPace();
  renderSim();
}

function updateGoalPace() {
  var totalMins = simFinishHours * 60;
  var paceMin = totalMins / simRace.miles;
  var pm = Math.floor(paceMin);
  var ps = Math.round((paceMin - pm) * 60);
  setHtml(getEl('goalPace'), 'Avg pace: <strong>' + pm + ':' + String(ps).padStart(2, '0') + ' /mi</strong>');
}

function buildSimProfile() {
  simProfile = [];
  simTotalDist = 0;
  simTotalGain = 0;
  for (var i = 0; i < simRace.loops.length; i++) {
    var id = simRace.loops[i];
    var loop = LOOPS[id];
    if (!loop.profile) continue;
    for (var j = 0; j < loop.profile.length; j++) {
      simProfile.push({ d: loop.profile[j].d + simTotalDist, e: loop.profile[j].e, loopId: id, loopIdx: i });
    }
    simTotalDist += loop.profile[loop.profile.length - 1].d;
    simTotalGain += loop.gain;
  }
}

function buildSimScrubber() {
  var segsHtml = '';
  for (var i = 0; i < simRace.loops.length; i++) {
    var id = simRace.loops[i];
    var loop = LOOPS[id];
    segsHtml += '<div class="scrub-seg" style="width:100%;background:' + loop.color + ';opacity:0.3"></div>';
  }
  setHtml(getEl('scrubSegs'), segsHtml);
  setHtml(getEl('scrubHQ'), '');
}

function togglePlay() {
  simPlaying = !simPlaying;
  setHtml(getEl('playBtn'), simPlaying ? '⏸' : '▶');
  if (simPlaying) {
    if (simProgress >= 0.999) simProgress = 0;
    simLastTick = performance.now();
    simTick();
  }
}

function setSpeed(s, btn) {
  simSpeed = s;
  document.querySelectorAll('.speed-btn').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
}

function simTick() {
  if (!simPlaying) return;
  var now = performance.now();
  var dt = (now - simLastTick) / 1000;
  simLastTick = now;
  simProgress = Math.min(1, simProgress + (1 / 30) * simSpeed * dt);
  renderSim();
  if (simProgress >= 1) { simPlaying = false; setHtml(getEl('playBtn'), '▶'); return; }
  requestAnimationFrame(simTick);
}

function getSimPointAt(dist) {
  for (var i = 1; i < simProfile.length; i++) {
    if (simProfile[i].d >= dist) {
      var p0 = simProfile[i - 1], p1 = simProfile[i];
      var dRange = p1.d - p0.d;
      var t = dRange > 0 ? (dist - p0.d) / dRange : 0;
      return { d: dist, e: p0.e + (p1.e - p0.e) * t, loopId: p1.loopId, loopIdx: p1.loopIdx };
    }
  }
  return simProfile[simProfile.length - 1];
}

function getSimCoordAtDist(dist) {
  var loopId = simRace.loops[0];
  var loopMiles = LOOPS[loopId].run;
  var localDist = Math.min(dist, loopMiles);
  var coords = LOOPS[loopId].geojson.geometry.coordinates;
  var dists = loopCoordDistances[loopId];
  for (var j = 1; j < dists.length; j++) {
    if (dists[j] >= localDist) {
      var t = (localDist - dists[j - 1]) / (dists[j] - dists[j - 1]);
      var c0 = coords[j - 1], c1 = coords[j];
      return { coord: [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t], loopId: loopId, loopIdx: 0 };
    }
  }
  return { coord: coords[coords.length - 1], loopId: loopId, loopIdx: 0 };
}

function getSimGrade(dist) {
  var delta = 0.05;
  var p1 = getSimPointAt(Math.max(0, dist - delta));
  var p2 = getSimPointAt(Math.min(simTotalDist, dist + delta));
  var dDist = (p2.d - p1.d) * 5280;
  var dEle = p2.e - p1.e;
  return dDist > 0 ? (dEle / dDist) * 100 : 0;
}

function getSimGain(dist) {
  var loopId = simRace.loops[0];
  var loopDist = LOOPS[loopId].profile[LOOPS[loopId].profile.length - 1].d;
  var loopGain = LOOPS[loopId].gain;
  if (dist >= loopDist) return loopGain;
  return loopGain * (dist / loopDist);
}

function renderSim() {
  var dist = simProgress * simTotalDist;
  var pt = getSimPointAt(dist);
  var grade = getSimGrade(dist);
  var gain = getSimGain(dist);

  getEl('scrubFill').style.width = (simProgress * 100) + '%';
  getEl('scrubHandle').style.left = (simProgress * 100) + '%';

  getEl('runnerDist').textContent = 'Mile ' + dist.toFixed(1);
  var gradeDir = grade > 1 ? 'Climbing' : grade < -1 ? 'Descending' : 'Rolling';
  getEl('runnerMeta').textContent = Math.round(pt.e).toLocaleString() + ' ft · ' + gradeDir;

  var pill = getEl('loopPill');
  pill.textContent = LOOPS[pt.loopId].label;
  pill.style.color = LOOPS[pt.loopId].color;
  pill.style.borderColor = LOOPS[pt.loopId].color;

  var elapsedMin = (dist / simRace.miles) * simFinishHours * 60;
  var eh = Math.floor(elapsedMin / 60);
  var em = Math.floor(elapsedMin % 60);
  getEl('clockTime').textContent = (eh > 0 ? eh + 'h ' : '') + em + 'm';

  var finishMin = simFinishHours * 60;
  var fh = Math.floor(finishMin / 60);
  var fm = Math.round(finishMin % 60);
  getEl('finishTime').textContent = '+' + (fh > 0 ? fh + 'h ' : '') + fm + 'm';

  getEl('statDist').textContent = dist.toFixed(1);
  getEl('statEle').textContent = Math.round(pt.e).toLocaleString();
  getEl('statGain').textContent = Math.round(gain).toLocaleString();
  getEl('statTotalGain').textContent = Math.round(simTotalGain).toLocaleString();
  getEl('statGrade').textContent = (grade > 0 ? '+' : '') + grade.toFixed(0) + '%';
  getEl('statPct').textContent = Math.round(simProgress * 100) + '%';

  renderCourseMap(dist);
  renderSimTerrain(dist, pt.e, pt.loopId);
}

function renderCourseMap(currentDist) {
  var canvas = getEl('courseMapCanvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var rect = canvas.getBoundingClientRect();
  var dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  var W = rect.width, H = rect.height;

  var bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, '#1a1a1a');
  bgGrad.addColorStop(1, '#26262e');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  var loopId = simRace.loops[0];
  var coords = LOOPS[loopId].geojson.geometry.coordinates;
  var minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (var ci = 0; ci < coords.length; ci++) {
    if (coords[ci][0] < minLng) minLng = coords[ci][0];
    if (coords[ci][0] > maxLng) maxLng = coords[ci][0];
    if (coords[ci][1] < minLat) minLat = coords[ci][1];
    if (coords[ci][1] > maxLat) maxLat = coords[ci][1];
  }
  var padding = 18;
  var drawW = W - padding * 2;
  var drawH = H - padding * 2;
  var lngRange = maxLng - minLng;
  var latRange = maxLat - minLat;
  var cosLat = Math.cos((minLat + maxLat) / 2 * Math.PI / 180);
  var adjLngRange = lngRange * cosLat;
  var scale = Math.min(drawW / adjLngRange, drawH / latRange);
  var offsetX = padding + (drawW - adjLngRange * scale) / 2;
  var offsetY = padding + (drawH - latRange * scale) / 2;
  var toX = function(lng) { return offsetX + (lng - minLng) * cosLat * scale; };
  var toY = function(lat) { return offsetY + (maxLat - lat) * scale; };

  var color = LOOPS[loopId].color;
  var hexR = parseInt(color.slice(1, 3), 16);
  var hexG = parseInt(color.slice(3, 5), 16);
  var hexB = parseInt(color.slice(5, 7), 16);

  ctx.beginPath();
  for (var i = 0; i < coords.length; i++) {
    var x = toX(coords[i][0]);
    var y = toY(coords[i][1]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = 'rgba(' + hexR + ',' + hexG + ',' + hexB + ',0.45)';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();

  var dists = loopCoordDistances[loopId];
  if (currentDist > 0) {
    var splitIdx = dists.length - 1;
    for (var j = 1; j < dists.length; j++) {
      if (dists[j] >= currentDist) { splitIdx = j; break; }
    }
    var runner = getSimCoordAtDist(currentDist);
    ctx.beginPath();
    for (var i = 0; i <= splitIdx; i++) {
      var x = toX(coords[i][0]);
      var y = toY(coords[i][1]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(toX(runner.coord[0]), toY(runner.coord[1]));
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  var sx = toX(coords[0][0]);
  var sy = toY(coords[0][1]);
  ctx.beginPath();
  ctx.arc(sx, sy, 7, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = 'bold 9px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('S', sx, sy + 0.5);

  var markerR = Math.max(8, Math.min(11, W / 35));
  var markerFont = Math.max(7, Math.min(9, W / 45));
  var gap = 3;
  var candidates = [];
  for (var m = 1; m <= Math.floor(simTotalDist); m++) {
    var mc = getSimCoordAtDist(m);
    var mx = toX(mc.coord[0]);
    var my = toY(mc.coord[1]);
    var priority = (m % 5 === 0) ? 1 : 2;
    candidates.push({ mile: m, x: mx, y: my, priority: priority });
  }
  candidates.sort(function(a, b) { return a.priority - b.priority; });
  var placed = [];
  for (var ci = 0; ci < candidates.length; ci++) {
    var c = candidates[ci];
    var r = markerR + gap;
    var overlaps = false;
    for (var pi = 0; pi < placed.length; pi++) {
      var dx = c.x - placed[pi].x, dy = c.y - placed[pi].y;
      if (dx * dx + dy * dy < (r + markerR + gap) * (r + markerR + gap)) { overlaps = true; break; }
    }
    if (!overlaps) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, markerR, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(26,26,26,0.9)';
      ctx.fill();
      ctx.strokeStyle = c.priority === 1 ? 'rgba(' + hexR + ',' + hexG + ',' + hexB + ',0.9)' : 'rgba(255,255,255,0.25)';
      ctx.lineWidth = c.priority === 1 ? 1.5 : 1;
      ctx.stroke();
      ctx.fillStyle = c.priority === 1 ? '#fff' : 'rgba(255,255,255,0.7)';
      ctx.font = (c.priority === 1 ? '700 ' : '600 ') + markerFont + 'px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(c.mile, c.x, c.y);
      placed.push(c);
    }
  }

  if (loopId === 'tinman') {
    AID_STATIONS.forEach(function(s) {
      var ax = toX(s.lng);
      var ay = toY(s.lat);
      ctx.beginPath();
      ctx.arc(ax, ay, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#C8102E';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  }

  var runnerCoord = getSimCoordAtDist(currentDist);
  var rx = toX(runnerCoord.coord[0]);
  var ry = toY(runnerCoord.coord[1]);
  ctx.beginPath();
  ctx.arc(rx, ry, 14, 0, Math.PI * 2);
  var glow = ctx.createRadialGradient(rx, ry, 4, rx, ry, 14);
  glow.addColorStop(0, 'rgba(' + hexR + ',' + hexG + ',' + hexB + ',0.5)');
  glow.addColorStop(1, 'rgba(' + hexR + ',' + hexG + ',' + hexB + ',0)');
  ctx.fillStyle = glow;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(rx, ry, 7, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();
}

function renderSimTerrain(currentDist, currentEle, currentLoopId) {
  var canvas = getEl('simTerrain');
  var ctx = canvas.getContext('2d');
  var rect = canvas.getBoundingClientRect();
  var dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  var W = rect.width, H = rect.height;

  var windowMiles = Math.min(simTotalDist, Math.max(2, simTotalDist * 0.5));
  var windowStart = Math.max(0, currentDist - windowMiles * 0.35);
  var windowEnd = Math.min(simTotalDist, windowStart + windowMiles);
  var actualStart = windowEnd - windowMiles < 0 ? 0 : windowStart;

  var windowPts = [];
  for (var i = 0; i < simProfile.length; i++) {
    if (simProfile[i].d >= actualStart && simProfile[i].d <= actualStart + windowMiles) {
      windowPts.push(simProfile[i]);
    }
  }
  if (windowPts.length < 2) return;

  var eMin = Infinity, eMax = -Infinity;
  for (var i = 0; i < windowPts.length; i++) {
    if (windowPts[i].e < eMin) eMin = windowPts[i].e;
    if (windowPts[i].e > eMax) eMax = windowPts[i].e;
  }
  eMin -= 20; eMax += 30;
  var mt = Math.min(40, H * 0.15), mb = 0;
  var xScale = function(d) { return ((d - actualStart) / windowMiles) * W; };
  var yScale = function(e) { return mt + (H - mt - mb) - ((e - eMin) / (eMax - eMin)) * (H - mt - mb); };

  var skyGrad = ctx.createLinearGradient(0, 0, 0, H);
  skyGrad.addColorStop(0, '#1a2030');
  skyGrad.addColorStop(1, '#2a3548');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, W, H);

  var loop = LOOPS[currentLoopId];
  var color = loop.color;
  var hexR = parseInt(color.slice(1, 3), 16);
  var hexG = parseInt(color.slice(3, 5), 16);
  var hexB = parseInt(color.slice(5, 7), 16);

  ctx.beginPath();
  ctx.moveTo(xScale(windowPts[0].d), yScale(windowPts[0].e));
  for (var i = 0; i < windowPts.length; i++) ctx.lineTo(xScale(windowPts[i].d), yScale(windowPts[i].e));
  ctx.lineTo(xScale(windowPts[windowPts.length - 1].d), H);
  ctx.lineTo(xScale(windowPts[0].d), H);
  ctx.closePath();

  var tGrad = ctx.createLinearGradient(0, mt, 0, H);
  tGrad.addColorStop(0, 'rgba(' + hexR + ',' + hexG + ',' + hexB + ',0.32)');
  tGrad.addColorStop(1, 'rgba(' + hexR + ',' + hexG + ',' + hexB + ',0.05)');
  ctx.fillStyle = tGrad;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(xScale(windowPts[0].d), yScale(windowPts[0].e));
  for (var i = 0; i < windowPts.length; i++) ctx.lineTo(xScale(windowPts[i].d), yScale(windowPts[i].e));
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  if (currentDist > actualStart) {
    ctx.fillStyle = 'rgba(26,26,26,0.4)';
    ctx.fillRect(0, 0, xScale(currentDist), H);
  }

  var rx = xScale(currentDist), ry = yScale(currentEle);
  var dotR = Math.max(4, Math.min(8, H * 0.1));
  ctx.beginPath();
  ctx.arc(rx, ry, dotR, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
}

window.addEventListener('resize', function() {
  if (currentView === 'map') drawProfileFromVisible();
  if (currentView === 'sim') renderSim();
});

initMap();
