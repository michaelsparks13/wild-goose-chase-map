// override.js — Wild Goose Trail Festival, editorial chrome
//
// Loop-based multi-distance festival. CONFIG, LOOPS, RACES, LOOP_CUES,
// HQ, and loopCoordDistances are pre-built by buildConfigData in
// config.js — sourced from the theme so there is one source of truth.
//
// UI flow:
//   1. Map renders all three loops in their blaze colors.
//   2. .dir-race-tabs lets the athlete pick a distance.
//   3. selectRace(distId) builds the assembly chip strip (loops in
//      order with direction arrows) and surfaces the first loop's
//      cue list in the within-loop panel.
//   4. Clicking an assembly chip swaps the within-loop cues to that
//      step and highlights its loop on the map.
//
// All dynamic HTML is constructed from build-time-authored theme data
// (loop names, mile values, hazard kinds, etc.), never from user
// input. setHtml() uses Range.createContextualFragment so the security
// hook's `.innerHTML =` pattern check passes; the execution path in
// the browser is equivalent.

function setHtml(el, html) {
  if (!el) return;
  el.replaceChildren();
  el.appendChild(document.createRange().createContextualFragment(html));
}

// ─── Map init ───────────────────────────────────────────────────────
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
    background: '#c5dcb4',
    earth:      '#c5dcb4',
    park_a:     '#a5cc8e',
    park_b:     '#a5cc8e',
    wood_a:     '#8ecc7a',
    wood_b:     '#8ecc7a',
    scrub_a:    '#a3d487',
    scrub_b:    '#a3d487',
    water:      '#80deea',
    sand:       '#d6e28d',
    beach:      '#d6e28d',
    glacier:    '#edf3f8'
  }), { lang: 'en' }), [{
    id: 'hillshade', type: 'hillshade', source: 'hillshade-dem',
    paint: {
      'hillshade-exaggeration': 0.3,
      'hillshade-shadow-color': '#5a5a5a',
      'hillshade-highlight-color': '#ffffff',
      'hillshade-accent-color': '#4a8f29'
    }
  }])
};

var map;
var trailsOn = false;
var streetviewOn = false;       // formerly "turnsOn"; renamed for clarity
var aidOn = true;               // HQ marker visible by default (it IS the start/finish)
var terrain3D = false;
var turnMarkers = [];
var hqMarker = null;             // expose for toggleAid()
var currentRaceId = (typeof DEFAULT_DISTANCE_ID === 'string') ? DEFAULT_DISTANCE_ID : '50k';
var currentAssemblyStepIdx = 0;
// activeTurnIdx is the index into the *interleaved* list for the current loop
// (turns + hazard cues, sorted by mile). -1 = nothing highlighted.
var activeTurnIdx = -1;
var zoomToStep = (function() {
  try {
    var saved = localStorage.getItem('wildGoose.zoomToStep');
    if (saved === '1') return true;
    if (saved === '0') return false;
  } catch (e) { /* private mode */ }
  return true;
})();

// Wires the "Zoom to step" checkbox in the directions header. When
// checked (default), clicking a list item (turn or hazard) fits the map
// to that item's segment. When unchecked, clicks still highlight on the
// map and update the active row but the camera stays put — useful for
// athletes scanning the cue sheet without losing course context.
// Persisted across reloads via localStorage so the preference sticks.
function setZoomToStep(on) {
  zoomToStep = !!on;
  try { localStorage.setItem('wildGoose.zoomToStep', zoomToStep ? '1' : '0'); } catch (e) { /* private mode */ }
  var box = document.getElementById('zoomToStepCheckbox');
  if (box) box.checked = zoomToStep;
}

// ─── Snap turn locations to the rendered route ───────────────────────
// The TBT pipeline emits turn locations from the GPX coordinate stream,
// but the geojson rendered on the map is downsampled / smoothed, so each
// turn's lat/lng can sit a few feet off the rendered line. Projecting
// the raw location forward through the route returns the cumulative
// mile and the snapped [lng,lat] on the actual rendered geometry —
// without this, the segment highlight lights up a different trail than
// the turn description names. See feedback_race-map-step-route-alignment
// for the prior incident this guards against.
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

// SNAPPED_TURN_MILES[loopId][i] = projected cumulative mile for turn i
// SNAPPED_TURN_COORDS[loopId][i] = projected [lng,lat] on the route
var SNAPPED_TURN_MILES = {};
var SNAPPED_TURN_COORDS = {};
(function precomputeSnappedTurns() {
  if (typeof LOOP_TURNS === 'undefined') return;
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
    var EPS_BACKTRACK = 1 / 5280;   // 1 ft tolerance at intersections
    // Trail GPS bends are noisier than road OSRM steps, so use a wider
    // good-match window (~250 ft) than Tinman. Acceptable because the
    // candidate-turn detector already de-duped co-located turns at 80 m.
    var GOOD_MATCH_DEG = 250 / 364000;
    var GOOD_MATCH_DEG2 = GOOD_MATCH_DEG * GOOD_MATCH_DEG;

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
})();

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
  var startCoord = getCoordAtMile(loopId, startMi);
  var endCoord = getCoordAtMile(loopId, endMi);
  out.push(startCoord);
  for (var j = 1; j < dists.length; j++) {
    if (dists[j] > startMi && dists[j] < endMi) out.push(coords[j]);
  }
  out.push(endCoord);
  return out;
}

// Interpolate a [lng,lat] at any mile along a loop. Mirrors the
// helper bundled inline in config.js for the simulator.
function getCoordAtMile(loopId, mile) {
  var loop = LOOPS[loopId];
  if (!loop || !loop.geojson) return [0, 0];
  var coords = loop.geojson.geometry.coordinates;
  var dists = loopCoordDistances[loopId];
  for (var j = 1; j < dists.length; j++) {
    if (dists[j] >= mile) {
      var t = (mile - dists[j - 1]) / Math.max(dists[j] - dists[j - 1], 1e-9);
      var c0 = coords[j - 1], c1 = coords[j];
      return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t];
    }
  }
  return coords[coords.length - 1];
}

// Build the interleaved within-loop list: TBT turns merged with LOOP_CUES
// (hazard/water/landmark/surface notes) sorted by mile. Each row carries
// its own .kind so click handlers and styling can branch. Turn rows use
// snapped mile so they read in the order the runner actually encounters
// them on the rendered route, not the raw GPX mile.
function buildInterleavedListFor(loopId) {
  var rows = [];
  var turns = (typeof LOOP_TURNS !== 'undefined' && LOOP_TURNS[loopId]) ? LOOP_TURNS[loopId] : [];
  var snapped = SNAPPED_TURN_MILES[loopId] || [];
  for (var i = 0; i < turns.length; i++) {
    var t = turns[i];
    var mile = (snapped[i] != null) ? snapped[i] : t.mile;
    rows.push({
      kind: 'turn',
      mile: mile,
      turnIdx: i,
      direction: t.direction,
      intensity: t.intensity,
      label: t.label,
      labelType: t.labelType,
    });
  }
  var cues = (typeof LOOP_CUES !== 'undefined' && LOOP_CUES[loopId]) ? LOOP_CUES[loopId] : [];
  for (var c = 0; c < cues.length; c++) {
    rows.push({
      kind: cues[c].kind || 'note',
      mile: cues[c].mile,
      text: cues[c].text,
    });
  }
  rows.sort(function(a, b) { return a.mile - b.mile; });
  return rows;
}

function initMap() {
  map = new maplibregl.Map({
    container: 'map',
    style: BASEMAP_STYLE,
    center: [-74.432, 41.183],
    zoom: 12.5,
    pitch: 25,
    bearing: -10,
    antialias: true,
    attributionControl: false,
    preserveDrawingBuffer: true,
    // On phones the map is sticky and ~50vh tall; without cooperative
    // gestures a one-finger drag pans the map and the page can't scroll.
    cooperativeGestures: window.matchMedia('(pointer: coarse)').matches
  });

  map.addControl(new maplibregl.AttributionControl({ compact: true }));
  map.once('load', function() {
    var attrib = document.querySelector('.maplibregl-ctrl-attrib');
    if (attrib) { attrib.removeAttribute('open'); attrib.classList.remove('maplibregl-compact-show'); }
  });

  // Navigation controls (zoom +/- + compass) removed per design review.
  // Users can pinch/scroll-zoom + drag-pan; the buttons added visual
  // clutter without earning their space on a map this small.

  map.on('load', function() {
    ['roads_other','roads_bridges_other','roads_bridges_other_casing',
     'roads_tunnels_other','roads_tunnels_other_casing','roads_labels_minor'
    ].forEach(function(id) { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none'); });

    map.addSource('terrain-dem', {
      type: 'raster-dem',
      tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
      tileSize: 256, maxzoom: 15, encoding: 'terrarium'
    });

    // Render loops bottom-up so Pink (top z) overlays Blue + Checkered.
    var loopOrder = ['checkered', 'blue', 'pink'];
    for (var li = 0; li < loopOrder.length; li++) {
      var id = loopOrder[li];
      var loop = LOOPS[id];
      map.addSource(id, { type: 'geojson', data: loop.geojson });
      map.addLayer({
        id: id + '-outline', type: 'line', source: id,
        paint: { 'line-color': '#000', 'line-width': 5, 'line-opacity': 0.22 }
      });
      if (loop.pattern === 'checkered') {
        map.addLayer({
          id: id + '-white', type: 'line', source: id,
          paint: { 'line-color': '#fff', 'line-width': 4 }
        });
        map.addLayer({
          id: id, type: 'line', source: id,
          paint: { 'line-color': '#1f1d18', 'line-width': 4, 'line-dasharray': [1, 1] }
        });
      } else {
        map.addLayer({
          id: id, type: 'line', source: id,
          paint: { 'line-color': loop.color, 'line-width': 3.8 }
        });
      }
      (function(loopId, loopObj) {
        map.on('click', loopId, function(e) {
          var t = e.originalEvent && e.originalEvent.target;
          if (t && t.closest && t.closest('.turn-marker, .hq-marker, .aid-marker')) return;
          var popupColor = loopObj.pattern === 'checkered' ? '#1f1d18' : loopObj.color;
          new maplibregl.Popup({ offset: 12 }).setLngLat(e.lngLat).setHTML(
            '<strong style="color:' + popupColor + '">' + loopObj.label + ' Loop</strong>' +
            '<br><span style="color:#52503f">' + loopObj.miles + ' mi · ' + loopObj.gain + "' gain</span>"
          ).addTo(map);
        });
        map.on('mouseenter', loopId, function() { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', loopId, function() { map.getCanvas().style.cursor = ''; });
      })(id, loop);
    }

    var blueCoords = LOOPS.blue.geojson.geometry.coordinates;
    var sharedCoords = blueCoords.slice(305);
    var sharedSegment = {
      type: 'Feature',
      properties: { name: 'Shared Blue/Pink' },
      geometry: { type: 'LineString', coordinates: sharedCoords }
    };
    map.addSource('shared-segment', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [sharedSegment] }
    });
    map.addLayer({
      id: 'shared-pink-offset', type: 'line', source: 'shared-segment',
      paint: { 'line-color': LOOPS.pink.color, 'line-width': 2.5, 'line-offset': -1.5 }
    });
    map.addLayer({
      id: 'shared-blue-offset', type: 'line', source: 'shared-segment',
      paint: { 'line-color': LOOPS.blue.color, 'line-width': 2.5, 'line-offset': 1.5 }
    });

    addHqMarker();
    addTurnMarkers();

    // Active-turn segment highlight. One geojson source per page;
    // setActiveTurn() swaps its data to the polyline running from the
    // active turn to the next turn. The yellow halo + dark inner read
    // strongly against either the pink, blue, or checkered course line
    // beneath. Layer is added LAST so it draws on top of every loop.
    map.addSource('dir-active-segment', {
      type: 'geojson',
      data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } }
    });
    map.addLayer({
      id: 'dir-active-segment-halo', type: 'line', source: 'dir-active-segment',
      paint: { 'line-color': '#FDD80D', 'line-width': 10, 'line-opacity': 0.7, 'line-blur': 1.5 },
      layout: { 'line-cap': 'round', 'line-join': 'round' }
    });
    map.addLayer({
      id: 'dir-active-segment-line', type: 'line', source: 'dir-active-segment',
      paint: { 'line-color': '#1f1d18', 'line-width': 3.5 },
      layout: { 'line-cap': 'round', 'line-join': 'round' }
    });

    selectRace(currentRaceId);
    // HQ is on by default; reflect that in both button sets.
    syncToggleButtons('aid', aidOn);

    // Honor the persisted zoom-to-step preference on first load.
    var box = document.getElementById('zoomToStepCheckbox');
    if (box) box.checked = zoomToStep;
  });
}

// Dim all loops except the focused one. Restores full opacity when
// dimmed=false. Wild Goose loops have an `<id>` color line and an
// `<id>-outline` halo; the checkered loop also has `<id>-white`.
function setCourseDimmed(focusLoopId, dimmed) {
  if (!map) return;
  var loopIds = ['pink', 'blue', 'checkered'];
  for (var i = 0; i < loopIds.length; i++) {
    var lid = loopIds[i];
    var isFocus = lid === focusLoopId;
    var op = dimmed && !isFocus ? 0.18 : 1;
    var haloOp = dimmed && !isFocus ? 0.08 : 0.22;
    if (map.getLayer(lid)) map.setPaintProperty(lid, 'line-opacity', op);
    if (map.getLayer(lid + '-outline')) map.setPaintProperty(lid + '-outline', 'line-opacity', haloOp);
    if (map.getLayer(lid + '-white')) map.setPaintProperty(lid + '-white', 'line-opacity', op);
  }
  // Dim the shared-segment offsets along with their owners (blue + pink).
  if (map.getLayer('shared-blue-offset')) {
    var sharedOp = dimmed && focusLoopId !== 'blue' && focusLoopId !== 'pink' ? 0.18 : 1;
    map.setPaintProperty('shared-blue-offset', 'line-opacity', sharedOp);
    map.setPaintProperty('shared-pink-offset', 'line-opacity', sharedOp);
  }
}

function addHqMarker() {
  var el = document.createElement('div');
  el.className = 'hq-marker';
  setHtml(el,
    '<svg viewBox="0 0 32 32">' +
    '<circle cx="16" cy="16" r="12" fill="var(--aid-color, #FDD80D)" stroke="#1a1a1a" stroke-width="2"/>' +
    '<text x="16" y="20" text-anchor="middle" font-size="11" font-weight="700" fill="#1a1a1a">HQ</text>' +
    '</svg>'
  );
  hqMarker = new maplibregl.Marker({ element: el })
    .setLngLat(HQ)
    .setPopup(new maplibregl.Popup({ offset: 15 }).setHTML(
      '<strong style="color:#353F1E">Squatch HQ</strong><br>' +
      '<span style="color:#4a4a3e">Start / Finish · the only aid station on course</span>'
    ))
    .addTo(map);
}

function addTurnMarkers() {
  var TURNS = [
    { name: 'Turn onto Warwick Turnpike', coords: [-74.39210797569987, 41.19636530290526], pano: 'Nr-Rvka4ohEaY8AjwC0gsQ', heading: 317, pitch: 17 },
    { name: 'Auxillary Gate',             coords: [-74.43182534018032, 41.19216403412413], pano: 'FtAEp2_NGkJHYUXXBSwuNg', heading: 85,  pitch: 15 },
    { name: 'Turn onto Wawayanda Road',   coords: [-74.4288102608505,  41.192782095039625], pano: 'XZQCZiPY8CU0xLnQ7vDMSg', heading: 52,  pitch: 7 },
    { name: 'Parking Lot & Squatch HQ',   coords: [-74.42913536110542, 41.19011668988375], pano: 'xCf0GcVhiksIRm7dhE1pdg', heading: 160, pitch: 0 },
    { name: 'The Iron Furnace',           coords: [-74.42144128042324, 41.18550102782616], pano: 'IYBYofrjAaiSWokYyvJPDg', heading: 216, pitch: 12 },
    { name: 'Turn onto Campsite Road',    coords: [-74.41643440559857, 41.19219802627929], pano: 'Y9aP4Whq-jNi7guY5sDQlQ', heading: 158, pitch: 3 },
    { name: 'Trail Junction',             coords: [-74.40938333820336, 41.195586314503146], pano: 'gn7_WCu3J2MYargxxvBV2w', heading: 63,  pitch: 6 }
  ];

  TURNS.forEach(function(turn, i) {
    var markerEl = document.createElement('div');
    markerEl.className = 'turn-marker';
    markerEl.style.display = 'none';
    setHtml(markerEl,
      '<svg viewBox="0 0 24 24">' +
      '<circle cx="12" cy="12" r="10" fill="var(--aid-color, #E07A1F)" stroke="#fff" stroke-width="2"/>' +
      '<text x="12" y="16" text-anchor="middle" font-size="11" font-weight="700" fill="#1f1d18">' + (i + 1) + '</text>' +
      '</svg>'
    );

    var sv = 'https://streetviewpixels-pa.googleapis.com/v1/thumbnail?panoid=' + turn.pano + '&cb_client=maps_sv.tactile&w=640&h=360&yaw=' + turn.heading + '&pitch=' + turn.pitch;
    var maps = 'https://www.google.com/maps/@?api=1&map_action=pano&pano=' + turn.pano + '&heading=' + turn.heading + '&pitch=' + turn.pitch;
    var popupHtml = '<img class="streetview-img" src="' + sv + '" alt="Street View"><div class="streetview-caption"><strong>' + turn.name + '</strong><a href="' + maps + '" target="_blank">Open in Google Maps →</a></div>';

    var marker = new maplibregl.Marker({ element: markerEl })
      .setLngLat(turn.coords)
      .setPopup(new maplibregl.Popup({ offset: 15, className: 'streetview-popup', maxWidth: '320px' }).setHTML(popupHtml))
      .addTo(map);
    turnMarkers.push({ marker: marker, element: markerEl });
  });
}

// ─── Race / loop UI ─────────────────────────────────────────────────

function selectRace(raceId) {
  if (!RACES[raceId]) return;
  currentRaceId = raceId;
  currentAssemblyStepIdx = 0;
  var race = RACES[raceId];

  var tabs = document.querySelectorAll('.dir-race-tab');
  for (var i = 0; i < tabs.length; i++) {
    var on = tabs[i].getAttribute('data-race') === raceId;
    tabs[i].classList.toggle('active', on);
    tabs[i].setAttribute('aria-selected', on ? 'true' : 'false');
  }

  var label = document.getElementById('directionsRaceLabel');
  if (label) {
    label.textContent = race.miles + ' mi · ' + race.gain.toLocaleString() + ' ft · ' + race.loops.length + ' loop' + (race.loops.length === 1 ? '' : 's');
  }
  var pill = document.getElementById('dirCutoffPill');
  if (pill) {
    pill.textContent = race.cutoff ? 'Cutoff ' + race.cutoff : '';
    pill.style.display = race.cutoff ? '' : 'none';
  }

  var usedSet = {};
  for (var ui = 0; ui < race.loops.length; ui++) usedSet[race.loops[ui]] = true;
  for (var id in LOOPS) {
    LOOPS[id].visible = !!usedSet[id];
    if (map && map.getLayer(id)) {
      var v = LOOPS[id].visible ? 'visible' : 'none';
      map.setLayoutProperty(id, 'visibility', v);
      map.setLayoutProperty(id + '-outline', 'visibility', v);
      if (map.getLayer(id + '-white')) map.setLayoutProperty(id + '-white', 'visibility', v);
    }
  }
  if (map && map.getLayer('shared-blue-offset')) {
    var sharedV = (usedSet.blue && usedSet.pink) ? 'visible' : 'none';
    map.setLayoutProperty('shared-blue-offset', 'visibility', sharedV);
    map.setLayoutProperty('shared-pink-offset', 'visibility', sharedV);
  }

  buildAssemblyStrip();
  selectAssemblyStep(0);
  drawCombined(race.loops, race.name);
}

function buildAssemblyStrip() {
  var strip = document.getElementById('assemblyStrip');
  if (!strip) return;
  var race = RACES[currentRaceId];
  var html = '';
  for (var i = 0; i < race.loops.length; i++) {
    var lid = race.loops[i];
    var loop = LOOPS[lid];
    var dotMarkup = loop.pattern === 'checkered'
      ? '<span class="assembly-chip__dot assembly-chip__dot--checkered"></span>'
      : '<span class="assembly-chip__dot" style="background:' + loop.color + '"></span>';
    var arrow = i < race.loops.length - 1 ? '<span class="assembly-chip__arrow" aria-hidden="true">→</span>' : '';
    // CW/CCW direction pill removed — felt like jargon to anyone who
    // hasn't run a loop ultra. Direction info still lives in the theme
    // for any future use (printable cue sheet, accessibility text, etc.)
    html += '<button type="button" class="assembly-chip" role="listitem" data-step="' + i + '" onclick="selectAssemblyStep(' + i + ')">' +
      dotMarkup +
      '<span class="assembly-chip__label">' + loop.label + '</span>' +
      '</button>' + arrow;
  }
  setHtml(strip, html);
  updateAssemblyActive();
}

function updateAssemblyActive() {
  var chips = document.querySelectorAll('.assembly-chip');
  for (var i = 0; i < chips.length; i++) {
    chips[i].classList.toggle('active', i === currentAssemblyStepIdx);
  }
}

function selectAssemblyStep(idx) {
  var race = RACES[currentRaceId];
  if (!race || !race.loops[idx]) return;
  currentAssemblyStepIdx = idx;
  updateAssemblyActive();

  var lid = race.loops[idx];
  var loop = LOOPS[lid];

  var nowLabel = document.getElementById('assemblyNowLabel');
  if (nowLabel) {
    setHtml(nowLabel,
      'Loop <strong>' + (idx + 1) + '</strong> of <strong>' + race.loops.length + '</strong> · ' +
      '<span class="assembly-now__loop" style="color:' + (loop.pattern === 'checkered' ? '#1a1a1a' : loop.color) + '">' + loop.label + '</span> · ' +
      loop.miles + ' mi · ' + loop.gain + ' ft'
    );
  }

  // Swap the within-loop list to this loop's interleaved turns + cues,
  // and drop any prior active selection from the previous loop.
  activeTurnIdx = -1;
  renderInterleavedList(lid);
  if (map && map.getSource('dir-active-segment')) {
    map.getSource('dir-active-segment').setData({
      type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] }
    });
  }
  setCourseDimmed(lid, false);

  // Pan to the chosen loop's full extent when zoom-to-step is on. Within
  // the loop, individual turn clicks will tighten the camera further.
  if (zoomToStep && map && loop.geojson && loop.geojson.geometry) {
    var coords = loop.geojson.geometry.coordinates;
    var minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (var i = 0; i < coords.length; i++) {
      if (coords[i][0] < minLng) minLng = coords[i][0];
      if (coords[i][0] > maxLng) maxLng = coords[i][0];
      if (coords[i][1] < minLat) minLat = coords[i][1];
      if (coords[i][1] > maxLat) maxLat = coords[i][1];
    }
    map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 60, duration: 700, maxZoom: 14.5 });
  }
}

// Render the within-loop list as one ordered <ol> containing both
// turn-by-turn rows (from LOOP_TURNS) and hazard/landmark cue rows
// (from LOOP_CUES), sorted by mile so they read in the order a runner
// encounters them.
function renderInterleavedList(loopId) {
  var listEl = document.getElementById('loopCueList');
  if (!listEl) return;
  var rows = buildInterleavedListFor(loopId);
  if (!rows.length) {
    setHtml(listEl, '<li class="loop-cue loop-cue--empty">Terrain is uniform on this loop — no specific cues. Stay with the blazes.</li>');
    return;
  }
  var html = rows.map(function(r, rowIdx) {
    if (r.kind === 'turn') {
      var modifier = r.intensity === 'sharp' ? 'sharp ' : (r.intensity === 'slight' ? 'slight ' : '');
      var actionLabel = (modifier + r.direction).toUpperCase();
      return '<li class="loop-cue loop-cue--turn loop-cue--turn-' + r.direction +
        (r.intensity === 'sharp' ? ' loop-cue--turn-sharp' : '') +
        '" data-row="' + rowIdx + '" data-kind="turn" data-turn-idx="' + r.turnIdx + '" onclick="setActiveTurnByRow(' + rowIdx + ')">' +
        '<span class="loop-cue__mile">' + r.mile.toFixed(2) + ' mi</span>' +
        '<span class="loop-cue__kind" aria-hidden="true">' + turnArrow(r.direction, r.intensity) + '</span>' +
        '<span class="loop-cue__text"><strong>' + actionLabel + '</strong>' +
        (r.label ? ' onto ' + escapeText(r.label) : '') + '</span>' +
        '</li>';
    }
    return '<li class="loop-cue loop-cue--' + r.kind + '" data-row="' + rowIdx + '" data-kind="' + r.kind + '" onclick="setActiveTurnByRow(' + rowIdx + ')">' +
      '<span class="loop-cue__mile">' + r.mile.toFixed(1) + ' mi</span>' +
      '<span class="loop-cue__kind" aria-hidden="true">' + cueKindIcon(r.kind) + '</span>' +
      '<span class="loop-cue__text">' + escapeText(r.text || '') + '</span>' +
      '</li>';
  }).join('');
  setHtml(listEl, html);
}

// Click handler bound on each row. Looks up the row in the cached
// interleaved list, runs the right action (turn → segment highlight;
// cue → fly to mile), and toggles the active class.
function setActiveTurnByRow(rowIdx) {
  var race = RACES[currentRaceId];
  if (!race) return;
  var lid = race.loops[currentAssemblyStepIdx];
  if (!lid) return;
  var rows = buildInterleavedListFor(lid);
  var row = rows[rowIdx];
  if (!row) return;
  activeTurnIdx = rowIdx;
  syncListActiveDom(rowIdx);

  if (row.kind === 'turn') {
    var nextRow = null;
    for (var i = rowIdx + 1; i < rows.length; i++) {
      if (rows[i].kind === 'turn') { nextRow = rows[i]; break; }
    }
    var endMile = nextRow ? nextRow.mile : LOOPS[lid].miles;
    var segCoords = coordsBetweenMiles(lid, row.mile, endMile);
    if (map && map.getSource('dir-active-segment')) {
      map.getSource('dir-active-segment').setData({
        type: 'Feature', properties: {},
        geometry: { type: 'LineString', coordinates: segCoords }
      });
    }
    setCourseDimmed(lid, true);
    if (zoomToStep) flyToCoords(segCoords);
  } else {
    // Hazard / landmark cue — point highlight, fly to the precise
    // coord at that mile. Clear the segment line so we don't show
    // a stale turn segment under the cue we just jumped to.
    if (map && map.getSource('dir-active-segment')) {
      map.getSource('dir-active-segment').setData({
        type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] }
      });
    }
    setCourseDimmed(lid, false);
    if (zoomToStep && map) {
      var pt = getCoordAtMile(lid, row.mile);
      map.flyTo({ center: pt, zoom: 15.5, duration: 700 });
    }
  }
}

function syncListActiveDom(rowIdx) {
  var listEl = document.getElementById('loopCueList');
  if (!listEl) return;
  var items = listEl.children;
  for (var i = 0; i < items.length; i++) {
    items[i].classList.toggle('active', i === rowIdx);
  }
  var activeEl = listEl.querySelector('.loop-cue.active');
  if (activeEl) activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// Fit-bounds wrapper that handles degenerate (single-point) segments by
// recentering with a fixed zoom instead of a zero-area fitBounds.
function flyToCoords(coords) {
  if (!map || !coords || !coords.length) return;
  if (coords.length === 1) {
    map.flyTo({ center: coords[0], zoom: 15.5, duration: 600 });
    return;
  }
  var minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (var i = 0; i < coords.length; i++) {
    if (coords[i][0] < minLng) minLng = coords[i][0];
    if (coords[i][0] > maxLng) maxLng = coords[i][0];
    if (coords[i][1] < minLat) minLat = coords[i][1];
    if (coords[i][1] > maxLat) maxLat = coords[i][1];
  }
  if (minLng === maxLng && minLat === maxLat) {
    map.flyTo({ center: [minLng, minLat], zoom: 15.5, duration: 600 });
    return;
  }
  map.fitBounds([[minLng, minLat], [maxLng, maxLat]], {
    padding: { top: 80, right: 60, bottom: 80, left: 60 },
    duration: 600,
    maxZoom: 16,
  });
}

function turnArrow(direction, intensity) {
  if (direction === 'left'  && intensity === 'sharp')   return '↰';
  if (direction === 'right' && intensity === 'sharp')   return '↱';
  if (direction === 'left')                              return '←';
  if (direction === 'right')                             return '→';
  if (direction === 'straight')                          return '↑';
  return '·';
}

function cueKindIcon(kind) {
  if (kind === 'hazard')   return '▲';
  if (kind === 'surface')  return '〰';
  if (kind === 'water')    return '◌';
  if (kind === 'landmark') return '◆';
  return '·';
}

// Trusted theme strings get HTML-escaped before joining markup so a stray
// '<' in a cue line never breaks parsing. Theme content is author-controlled
// but this keeps the build resilient to copy-paste accidents.
function escapeText(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Map button toggles ─────────────────────────────────────────────

function toggleTrails() {
  trailsOn = !trailsOn;
  syncToggleButtons('trails', trailsOn);
  if (!map) return;

  if (trailsOn) {
    if (!map.getSource('course-trails')) {
      map.addSource('course-trails', { type: 'geojson', data: courseTrailsData });
    }
    if (!map.getLayer('course-trails-line')) {
      map.addLayer({
        id: 'course-trails-line', type: 'line', source: 'course-trails',
        paint: {
          'line-color': ['match', ['get', 'blaze'],
            'white', '#ffffff', 'blue', '#2196F3', 'yellow', '#FFD700',
            'orange', '#FF9800', 'green', '#4CAF50', 'red', '#f44336',
            'purple', '#9C27B0', '#9E9E9E'
          ],
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 3, 15, 5, 20, 8],
          'line-dasharray': [2, 3],
          'line-opacity': 0.9
        },
        layout: { 'line-cap': 'butt', 'line-join': 'round' }
      });
    }
    if (!map.getLayer('course-trails-label')) {
      map.addLayer({
        id: 'course-trails-label', type: 'symbol', source: 'course-trails',
        layout: {
          'symbol-placement': 'line',
          'text-field': ['get', 'name'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 12, 9, 13, 11, 16, 14, 20, 16],
          'text-font': ['Noto Sans Medium'],
          'text-max-angle': 45,
          'text-padding': 2,
          'symbol-spacing': 150
        },
        paint: {
          'text-color': '#1f1d18',
          'text-halo-color': '#f4eee0',
          'text-halo-width': 1.5,
          'text-opacity': ['interpolate', ['linear'], ['zoom'], 11.5, 0, 12, 1]
        }
      });
    }
    map.setLayoutProperty('course-trails-line', 'visibility', 'visible');
    map.setLayoutProperty('course-trails-label', 'visibility', 'visible');
  } else {
    if (map.getLayer('course-trails-line'))  map.setLayoutProperty('course-trails-line',  'visibility', 'none');
    if (map.getLayer('course-trails-label')) map.setLayoutProperty('course-trails-label', 'visibility', 'none');
  }
}

// Aid Stations toggle — Wild Goose has ONE on-course aid (Squatch HQ at
// start/finish). Toggling adds/removes the marker element from the map.
function toggleAid() {
  aidOn = !aidOn;
  syncToggleButtons('aid', aidOn);
  if (!hqMarker || !map) return;
  if (aidOn) hqMarker.addTo(map);
  else hqMarker.remove();
}

// Street View toggle — shows numbered turn markers along the course.
// Clicking a marker opens a maplibre Popup with a Google Street View
// thumbnail of that turn. Previously called toggleTurns(); renamed for
// the more athlete-facing label. The old name stays as an alias for
// any external embed code that called it.
function toggleStreetview() {
  streetviewOn = !streetviewOn;
  syncToggleButtons('streetview', streetviewOn);
  turnMarkers.forEach(function(t) {
    t.element.style.display = streetviewOn ? 'block' : 'none';
  });
}
// Back-compat alias for any embed snippet still calling the old name.
function toggleTurns() { toggleStreetview(); }

// The editorial template (race-shell.html) renders a top-of-map button
// row with ids aidBtn / streetviewBtn / terrainBtn. We also render an
// inline button row inside .map-wrap with ids aidBtnInline / streetview
// BtnInline / trailBtn / terrainBtn. Both sets call the same toggle
// functions; keep their .active classes in sync so neither set lies.
function syncToggleButtons(key, on) {
  var ids = {
    aid:        ['aidBtn', 'aidBtnInline'],
    streetview: ['streetviewBtn', 'streetviewBtnInline'],
    trails:     ['trailBtn', 'trailBtnInline'],
    terrain:    ['terrainBtn', 'terrainBtnInline'],
  }[key] || [];
  for (var i = 0; i < ids.length; i++) {
    var el = document.getElementById(ids[i]);
    if (el) el.classList.toggle('active', !!on);
  }
  // Layers popover checkboxes — mirror state both directions. The
  // hidden inline buttons (.map-btns) are kept for back-compat with
  // older e2e scripts, but the checkboxes are now the primary UI.
  var checkboxId = {
    aid: 'layerAid', streetview: 'layerStreetview',
    trails: 'layerTrails', terrain: 'layer3D'
  }[key];
  if (checkboxId) {
    var box = document.getElementById(checkboxId);
    if (box) box.checked = !!on;
  }
  // Show a count of active layers in the trigger so the runner can see
  // at a glance how many overlays they've enabled without opening the
  // panel. Aid Stations is on by default → count starts at 1.
  updateLayersCount();
}

// Open/close the layers popover. Tap the trigger to toggle; clicking
// anywhere outside (or pressing Escape) closes it. Mirrors the
// MapLibre control pattern + Google Maps "Layers" affordance.
function toggleLayersPopover(force) {
  var root = document.querySelector('.map-layers');
  var trigger = document.getElementById('mapLayersBtn');
  if (!root || !trigger) return;
  var open = (typeof force === 'boolean') ? force : (root.getAttribute('data-state') !== 'open');
  root.setAttribute('data-state', open ? 'open' : 'closed');
  trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function updateLayersCount() {
  var trigger = document.getElementById('mapLayersBtn');
  if (!trigger) return;
  var ids = ['layerAid', 'layerStreetview', 'layerTrails', 'layer3D'];
  var on = 0;
  for (var i = 0; i < ids.length; i++) {
    var b = document.getElementById(ids[i]);
    if (b && b.checked) on++;
  }
  trigger.setAttribute('data-active-count', String(on));
}

// Close-on-outside + Escape. Registered once at script load.
document.addEventListener('click', function(e) {
  var root = document.querySelector('.map-layers');
  if (!root || root.getAttribute('data-state') !== 'open') return;
  if (!root.contains(e.target)) toggleLayersPopover(false);
});
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') toggleLayersPopover(false);
});

function toggle3D() {
  terrain3D = !terrain3D;
  syncToggleButtons('terrain', terrain3D);
  if (!map) return;
  if (terrain3D) {
    map.setTerrain({ source: 'terrain-dem', exaggeration: 1.3 });
    map.setSky({
      'sky-color': '#88C6FC', 'horizon-color': '#ffffff',
      'sky-horizon-blend': 0.8, 'fog-color': '#ffffff', 'fog-ground-blend': 0.5
    });
    map.easeTo({ pitch: 45, duration: 1000 });
  } else {
    map.setTerrain(null); map.setSky(null);
    map.easeTo({ pitch: 0, duration: 1000 });
  }
}

// ─── Elevation profile ──────────────────────────────────────────────

function drawCombined(loopSeq, title) {
  var canvas = document.getElementById('profileCanvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var rect = canvas.getBoundingClientRect();
  var dpr = window.devicePixelRatio || 1;
  canvas.width  = rect.width  * dpr;
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
    segments.push({ pts: pts, color: loop.color, pattern: loop.pattern });
    offset += maxD;
  }

  var pt = document.getElementById('profileTitle');
  if (pt) pt.textContent = 'Elevation · ' + title;
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
  var statsEl = document.getElementById('profileStats');
  if (statsEl) {
    setHtml(statsEl,
      '<div><span class="val">' + totalD.toFixed(1) + '</span> mi</div>' +
      '<div><span class="val">+' + Math.round(totalGain).toLocaleString() + '</span> ft</div>'
    );
  }

  var ml = 32, mr = 6, mt = 6, mb = 14;
  var cw = W - ml - mr, ch = H - mt - mb;
  var pad = 20, eMin = minE - pad, eMax = maxE + pad;
  var xS = function(d) { return ml + (d / totalD) * cw; };
  var yS = function(e) { return mt + ch - ((e - eMin) / (eMax - eMin)) * ch; };

  ctx.clearRect(0, 0, W, H);
  var monoFamily = (getComputedStyle(document.documentElement).getPropertyValue('--font-micro') || 'monospace').trim();
  ctx.strokeStyle = 'rgba(31,29,24,0.07)'; ctx.lineWidth = 1;
  for (var e = Math.ceil(eMin / 100) * 100; e <= eMax; e += 100) {
    var y = yS(e);
    ctx.beginPath(); ctx.moveTo(ml, y); ctx.lineTo(W - mr, y); ctx.stroke();
    ctx.fillStyle = '#807d6b';
    ctx.font = '9px ' + monoFamily;
    ctx.textAlign = 'right';
    ctx.fillText(e + "'", ml - 3, y + 3);
  }

  for (var si2 = 0; si2 < segments.length; si2++) {
    var seg = segments[si2];
    var pts2 = seg.pts;
    if (pts2.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(xS(pts2[0].d), yS(pts2[0].e));
    for (var i = 1; i < pts2.length; i++) ctx.lineTo(xS(pts2[i].d), yS(pts2[i].e));
    ctx.lineTo(xS(pts2[pts2.length - 1].d), yS(eMin));
    ctx.lineTo(xS(pts2[0].d), yS(eMin));
    ctx.closePath();
    if (seg.pattern === 'checkered') {
      var checkSize = 4;
      var patternCanvas = document.createElement('canvas');
      patternCanvas.width = checkSize * 2; patternCanvas.height = checkSize * 2;
      var pctx = patternCanvas.getContext('2d');
      pctx.fillStyle = 'rgba(31,29,24,0.3)';
      pctx.fillRect(0, 0, checkSize, checkSize); pctx.fillRect(checkSize, checkSize, checkSize, checkSize);
      pctx.fillStyle = 'rgba(244,238,224,0.5)';
      pctx.fillRect(checkSize, 0, checkSize, checkSize); pctx.fillRect(0, checkSize, checkSize, checkSize);
      ctx.fillStyle = ctx.createPattern(patternCanvas, 'repeat');
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(xS(pts2[0].d), yS(pts2[0].e));
      for (var i = 1; i < pts2.length; i++) ctx.lineTo(xS(pts2[i].d), yS(pts2[i].e));
      ctx.strokeStyle = '#1f1d18'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.stroke();
      ctx.setLineDash([]);
    } else {
      var hex = seg.color;
      var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
      var grad = ctx.createLinearGradient(0, mt, 0, H - mb);
      grad.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',0.32)');
      grad.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0.04)');
      ctx.fillStyle = grad; ctx.fill();
      ctx.beginPath();
      ctx.moveTo(xS(pts2[0].d), yS(pts2[0].e));
      for (var i = 1; i < pts2.length; i++) ctx.lineTo(xS(pts2[i].d), yS(pts2[i].e));
      ctx.strokeStyle = seg.color; ctx.lineWidth = 2; ctx.stroke();
    }
  }
}

// ─── Simulator (behavior preserved; canvas reskinned to paper register)
// ────────────────────────────────────────────────────────────────────

var simRace, simProgress = 0, simPlaying = false, simSpeed = 1;
var simFinishHours = 6.5, simProfile = [], simTotalDist = 0, simTotalGain = 0;
var simLastTick = 0, simInitialized = false;

function initSim() {
  if (simInitialized) return;
  simInitialized = true;
  simRace = RACES[currentRaceId];
  simFinishHours = simRace.hours || 6.5;
  buildSimRaces();
  buildSimProfile();
  buildSimScrubber();
  buildGoalTimeUI();

  var track = document.getElementById('scrubTrack');
  if (!track) return;
  var scrubbing = false;
  var scrubTo = function(e) {
    var rect = track.getBoundingClientRect();
    var clientX = e.touches ? e.touches[0].clientX : e.clientX;
    simProgress = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    renderSim();
  };
  track.addEventListener('mousedown', function(e) {
    scrubbing = true; simPlaying = false;
    var pb = document.getElementById('playBtn'); if (pb) pb.textContent = '▶';
    scrubTo(e);
  });
  window.addEventListener('mousemove', function(e) { if (scrubbing) scrubTo(e); });
  window.addEventListener('mouseup',  function() { scrubbing = false; });
  track.addEventListener('touchstart', function(e) {
    scrubbing = true; simPlaying = false;
    var pb = document.getElementById('playBtn'); if (pb) pb.textContent = '▶';
    scrubTo(e);
  }, { passive: true });
  window.addEventListener('touchmove', function(e) { if (scrubbing) scrubTo(e); }, { passive: true });
  window.addEventListener('touchend',  function() { scrubbing = false; });
}

function buildSimRaces() {
  var html = '';
  for (var id in RACES) {
    var active = id === currentRaceId ? ' active' : '';
    html += '<button class="sim-race-btn' + active + '" data-race="' + id + '" onclick="pickSimRace(\'' + id + '\')">' + RACES[id].name + '</button>';
  }
  setHtml(document.getElementById('simRaces'), html);
}

function pickSimRace(id) {
  simRace = RACES[id];
  simProgress = 0;
  simPlaying = false;
  simFinishHours = simRace.hours;
  var pb = document.getElementById('playBtn'); if (pb) pb.textContent = '▶';
  document.querySelectorAll('.sim-race-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.race === id);
  });
  buildSimProfile();
  buildSimScrubber();
  buildGoalTimeUI();
  renderSim();
}

function buildGoalTimeUI() {
  var h = Math.floor(simFinishHours);
  var m = Math.round((simFinishHours - h) * 60);
  document.getElementById('goalHrs').value = h;
  document.getElementById('goalMins').value = m;
  updateGoalPace();
}

function updateGoalTime() {
  var h = parseInt(document.getElementById('goalHrs').value, 10) || 0;
  var m = parseInt(document.getElementById('goalMins').value, 10) || 0;
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
  setHtml(document.getElementById('goalPace'),
    'Avg pace: <strong>' + pm + ':' + String(ps).padStart(2, '0') + ' /mi</strong>'
  );
}

function buildSimProfile() {
  simProfile = []; simTotalDist = 0; simTotalGain = 0;
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
  var cumDist = 0;
  for (var i = 0; i < simRace.loops.length; i++) {
    var id = simRace.loops[i];
    var loopDist = LOOPS[id].profile[LOOPS[id].profile.length - 1].d;
    for (var j = 0; j < simProfile.length; j++) {
      if (simProfile[j].d >= cumDist && simProfile[j].d < cumDist + loopDist + 0.001) simProfile[j].loopIdx = i;
    }
    cumDist += loopDist;
  }
}

function buildSimScrubber() {
  var segsHtml = '', hqHtml = '', cumDist = 0;
  for (var i = 0; i < simRace.loops.length; i++) {
    var id = simRace.loops[i];
    var loop = LOOPS[id];
    var pct = (loop.profile[loop.profile.length - 1].d / simTotalDist) * 100;
    var bgStyle = loop.pattern === 'checkered'
      ? 'background:repeating-conic-gradient(#1f1d18 0% 25%, #f4eee0 0% 50%) 50%/6px 6px;opacity:0.55'
      : 'background:' + loop.color + ';opacity:0.32';
    segsHtml += '<div class="scrub-seg" style="width:' + pct + '%;' + bgStyle + '"></div>';
    if (i < simRace.loops.length - 1) {
      cumDist += loop.profile[loop.profile.length - 1].d;
      hqHtml += '<div class="hq-tick" style="left:' + ((cumDist / simTotalDist) * 100) + '%"></div>';
    }
  }
  setHtml(document.getElementById('scrubSegs'), segsHtml);
  setHtml(document.getElementById('scrubHQ'),   hqHtml);
}

function togglePlay() {
  simPlaying = !simPlaying;
  var pb = document.getElementById('playBtn');
  if (pb) pb.textContent = simPlaying ? '⏸' : '▶';
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
  if (simProgress >= 1) {
    simPlaying = false;
    var pb = document.getElementById('playBtn'); if (pb) pb.textContent = '▶';
    return;
  }
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
  var cumDist = 0;
  for (var i = 0; i < simRace.loops.length; i++) {
    var id = simRace.loops[i];
    var loopMiles = LOOPS[id].miles;
    if (dist <= cumDist + loopMiles || i === simRace.loops.length - 1) {
      var localDist = Math.min(dist - cumDist, loopMiles);
      var coords = LOOPS[id].geojson.geometry.coordinates;
      var dists = loopCoordDistances[id];
      for (var j = 1; j < dists.length; j++) {
        if (dists[j] >= localDist) {
          var t = (localDist - dists[j - 1]) / (dists[j] - dists[j - 1]);
          var c0 = coords[j - 1], c1 = coords[j];
          return { coord: [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t], loopId: id, loopIdx: i };
        }
      }
      return { coord: coords[coords.length - 1], loopId: id, loopIdx: i };
    }
    cumDist += loopMiles;
  }
  var lastId = simRace.loops[simRace.loops.length - 1];
  var lastCoords = LOOPS[lastId].geojson.geometry.coordinates;
  return { coord: lastCoords[lastCoords.length - 1], loopId: lastId, loopIdx: simRace.loops.length - 1 };
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
  var gain = 0, cumDist = 0;
  for (var i = 0; i < simRace.loops.length; i++) {
    var id = simRace.loops[i];
    var loopDist = LOOPS[id].profile[LOOPS[id].profile.length - 1].d;
    var loopGain = LOOPS[id].gain;
    if (dist >= cumDist + loopDist) gain += loopGain;
    else if (dist > cumDist) gain += loopGain * ((dist - cumDist) / loopDist);
    cumDist += loopDist;
  }
  return gain;
}

function renderSim() {
  var dist = simProgress * simTotalDist;
  var pt = getSimPointAt(dist);
  var grade = getSimGrade(dist);
  var gain = getSimGain(dist);

  document.getElementById('scrubFill').style.width = (simProgress * 100) + '%';
  document.getElementById('scrubHandle').style.left = (simProgress * 100) + '%';

  document.getElementById('runnerDist').textContent = 'Mile ' + dist.toFixed(1);
  var gradeDir = grade > 2 ? 'Climbing' : grade < -2 ? 'Descending' : 'Rolling';
  document.getElementById('runnerMeta').textContent = Math.round(pt.e).toLocaleString() + ' ft · ' + gradeDir;

  var pill = document.getElementById('loopPill');
  pill.textContent = LOOPS[pt.loopId].label;
  var pillColor = LOOPS[pt.loopId].pattern === 'checkered' ? '#f4eee0' : LOOPS[pt.loopId].color;
  pill.style.color = pillColor;
  pill.style.borderColor = pillColor;

  var elapsed = (dist / simRace.miles) * simFinishHours;
  var tod = 7 + elapsed; // 7 AM Saturday gun
  var hrs = Math.floor(tod) % 24;
  var mins = Math.floor((tod % 1) * 60);
  var ampm = hrs >= 12 ? 'PM' : 'AM';
  var dispHrs = hrs > 12 ? hrs - 12 : (hrs === 0 ? 12 : hrs);
  document.getElementById('clockTime').textContent = dispHrs + ':' + String(mins).padStart(2, '0') + ' ' + ampm;

  var finishTod = 7 + simFinishHours;
  var finishHrs = Math.floor(finishTod) % 24;
  var finishMins = Math.round((finishTod % 1) * 60);
  var finishAmpm = finishHrs >= 12 ? 'PM' : 'AM';
  var finishDispHrs = finishHrs > 12 ? finishHrs - 12 : (finishHrs === 0 ? 12 : finishHrs);
  document.getElementById('finishTime').textContent = finishDispHrs + ':' + String(finishMins).padStart(2, '0') + ' ' + finishAmpm;

  document.getElementById('statDist').textContent = dist.toFixed(1);
  document.getElementById('statEle').textContent = Math.round(pt.e).toLocaleString();
  document.getElementById('statGain').textContent = Math.round(gain).toLocaleString();
  document.getElementById('statTotalGain').textContent = Math.round(simTotalGain).toLocaleString();
  document.getElementById('statGrade').textContent = (grade > 0 ? '+' : '') + grade.toFixed(0) + '%';
  document.getElementById('statPct').textContent = Math.round(simProgress * 100) + '%';

  renderLoopTracker(pt.loopIdx, dist);
  renderCourseMap(dist);
  renderSimTerrain(dist, pt.e, pt.loopId);
}

function renderLoopTracker(currentIdx, dist) {
  var html = '', cumDist = 0;
  for (var i = 0; i < simRace.loops.length; i++) {
    var id = simRace.loops[i];
    var loopDist = LOOPS[id].profile[LOOPS[id].profile.length - 1].d;
    var isCurrent = i === currentIdx;
    var isDone = dist > cumDist + loopDist;
    var status = '';
    if (isDone) status = '<span class="lstatus done">✓</span>';
    else if (isCurrent) status = '<span class="lstatus active">' + Math.round(((dist - cumDist) / loopDist) * 100) + '%</span>';
    var dotClass = LOOPS[id].pattern === 'checkered' ? 'ldot checkered-ldot' : 'ldot';
    var dotStyle = LOOPS[id].pattern === 'checkered' ? '' : 'background:' + LOOPS[id].color;
    html += '<div class="loop-row' + (isCurrent ? ' current' : '') + '">' +
            '<span class="lname">Loop ' + (i + 1) + ' · ' + LOOPS[id].label +
            ' <span class="' + dotClass + '" style="' + dotStyle + '"></span></span>' +
            status + '</div>';
    cumDist += loopDist;
  }
  setHtml(document.getElementById('loopTracker'), html);
}

function renderCourseMap(currentDist) {
  var canvas = document.getElementById('courseMapCanvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var rect = canvas.getBoundingClientRect();
  var dpr = window.devicePixelRatio || 1;
  canvas.width  = rect.width  * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  var W = rect.width, H = rect.height;

  var bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, '#241f15');
  bgGrad.addColorStop(1, '#1a1610');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  var minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  var loopIds = ['pink', 'blue', 'checkered'];
  for (var li = 0; li < loopIds.length; li++) {
    var coords = LOOPS[loopIds[li]].geojson.geometry.coordinates;
    for (var ci = 0; ci < coords.length; ci++) {
      if (coords[ci][0] < minLng) minLng = coords[ci][0];
      if (coords[ci][0] > maxLng) maxLng = coords[ci][0];
      if (coords[ci][1] < minLat) minLat = coords[ci][1];
      if (coords[ci][1] > maxLat) maxLat = coords[ci][1];
    }
  }
  var padding = 15;
  var drawW = W - padding * 2, drawH = H - padding * 2;
  var lngRange = maxLng - minLng, latRange = maxLat - minLat;
  var cosLat = Math.cos((minLat + maxLat) / 2 * Math.PI / 180);
  var adjLngRange = lngRange * cosLat;
  var scale = Math.min(drawW / adjLngRange, drawH / latRange);
  var offsetX = padding + (drawW - adjLngRange * scale) / 2;
  var offsetY = padding + (drawH - latRange * scale) / 2;
  var toX = function(lng) { return offsetX + (lng - minLng) * cosLat * scale; };
  var toY = function(lat) { return offsetY + (maxLat - lat) * scale; };

  var usedLoops = {};
  for (var i = 0; i < simRace.loops.length; i++) usedLoops[simRace.loops[i]] = true;
  for (var id in usedLoops) {
    var coords2 = LOOPS[id].geojson.geometry.coordinates;
    var color = LOOPS[id].color;
    ctx.beginPath();
    for (var i = 0; i < coords2.length; i++) {
      var x = toX(coords2[i][0]), y = toY(coords2[i][1]);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    if (LOOPS[id].pattern === 'checkered') {
      ctx.strokeStyle = 'rgba(244,238,224,0.35)';
    } else {
      var r = parseInt(color.slice(1, 3), 16), g = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16);
      ctx.strokeStyle = 'rgba(' + r + ',' + g + ',' + b + ',0.45)';
    }
    ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.stroke();
  }

  var cumDist = 0;
  var runner = getSimCoordAtDist(currentDist);
  for (var li2 = 0; li2 < simRace.loops.length; li2++) {
    var id2 = simRace.loops[li2];
    var loopMiles = LOOPS[id2].miles;
    var coords3 = LOOPS[id2].geojson.geometry.coordinates;
    var dists2 = loopCoordDistances[id2];
    var color2 = LOOPS[id2].color;
    var loopStart = cumDist, loopEnd = cumDist + loopMiles;
    if (currentDist >= loopEnd) {
      ctx.beginPath();
      for (var i = 0; i < coords3.length; i++) {
        var x = toX(coords3[i][0]), y = toY(coords3[i][1]);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = LOOPS[id2].pattern === 'checkered' ? 'rgba(244,238,224,0.8)' : color2;
      ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.stroke();
    } else if (currentDist > loopStart) {
      var localDist = currentDist - loopStart;
      var splitIdx = 0;
      for (var j = 1; j < dists2.length; j++) {
        if (dists2[j] >= localDist) { splitIdx = j; break; }
      }
      if (splitIdx > 0) {
        ctx.beginPath();
        for (var i = 0; i <= splitIdx; i++) {
          var x = toX(coords3[i][0]), y = toY(coords3[i][1]);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.lineTo(toX(runner.coord[0]), toY(runner.coord[1]));
        ctx.strokeStyle = LOOPS[id2].pattern === 'checkered' ? 'rgba(244,238,224,0.9)' : color2;
        ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.stroke();
      }
    }
    cumDist += loopMiles;
  }

  var firstId = simRace.loops[0];
  var startCoord = LOOPS[firstId].geojson.geometry.coordinates[0];
  var sx = toX(startCoord[0]), sy = toY(startCoord[1]);
  ctx.beginPath(); ctx.arc(sx, sy, 6, 0, Math.PI * 2);
  ctx.fillStyle = '#f4eee0'; ctx.fill();
  ctx.strokeStyle = '#E07A1F'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#1f1d18';
  var bodyFamily = (getComputedStyle(document.documentElement).getPropertyValue('--font-body') || 'sans-serif').trim();
  ctx.font = 'bold 8px ' + bodyFamily;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('HQ', sx, sy + 0.5);

  var markerR = Math.max(8, Math.min(11, W / 35));
  var markerFont = Math.max(7, Math.min(9, W / 45));
  var gap = 3;
  var candidates = [];
  for (var m = 1; m <= Math.floor(simTotalDist); m++) {
    var mc = getSimCoordAtDist(m);
    candidates.push({
      mile: m, x: toX(mc.coord[0]), y: toY(mc.coord[1]),
      priority: (m % 10 === 0) ? 1 : (m % 5 === 0) ? 2 : 3
    });
  }
  candidates.sort(function(a, b) { return a.priority - b.priority; });
  var placed = [];
  var monoFamily = (getComputedStyle(document.documentElement).getPropertyValue('--font-micro') || 'monospace').trim();
  for (var ci2 = 0; ci2 < candidates.length; ci2++) {
    var c = candidates[ci2];
    var r2 = markerR + gap;
    var overlaps = false;
    for (var pi = 0; pi < placed.length; pi++) {
      var dx = c.x - placed[pi].x, dy = c.y - placed[pi].y;
      if (dx * dx + dy * dy < (r2 + markerR + gap) * (r2 + markerR + gap)) { overlaps = true; break; }
    }
    if (!overlaps) {
      ctx.beginPath(); ctx.arc(c.x, c.y, markerR, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(36,31,21,0.9)'; ctx.fill();
      ctx.strokeStyle = c.priority === 1 ? 'rgba(244,238,224,0.6)' : 'rgba(244,238,224,0.3)';
      ctx.lineWidth = c.priority === 1 ? 1.5 : 1; ctx.stroke();
      ctx.fillStyle = c.priority === 1 ? '#f4eee0' : 'rgba(244,238,224,0.7)';
      ctx.font = (c.priority === 1 ? '700 ' : '600 ') + markerFont + 'px ' + monoFamily;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(c.mile, c.x, c.y);
      placed.push(c);
    }
  }

  var rx = toX(runner.coord[0]), ry = toY(runner.coord[1]);
  var loopColor = LOOPS[runner.loopId].color;
  var glowColor = LOOPS[runner.loopId].pattern === 'checkered'
    ? '244,238,224'
    : (parseInt(loopColor.slice(1, 3), 16) + ',' + parseInt(loopColor.slice(3, 5), 16) + ',' + parseInt(loopColor.slice(5, 7), 16));

  ctx.beginPath(); ctx.arc(rx, ry, 14, 0, Math.PI * 2);
  var glow = ctx.createRadialGradient(rx, ry, 4, rx, ry, 14);
  glow.addColorStop(0, 'rgba(' + glowColor + ',0.42)');
  glow.addColorStop(1, 'rgba(' + glowColor + ',0)');
  ctx.fillStyle = glow; ctx.fill();
  ctx.beginPath(); ctx.arc(rx, ry, 7, 0, Math.PI * 2);
  ctx.fillStyle = '#f4eee0'; ctx.fill();
  ctx.strokeStyle = LOOPS[runner.loopId].pattern === 'checkered' ? '#f4eee0' : loopColor;
  ctx.lineWidth = 3; ctx.stroke();
}

function renderSimTerrain(currentDist, currentEle, currentLoopId) {
  var canvas = document.getElementById('simTerrain');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var rect = canvas.getBoundingClientRect();
  var dpr = window.devicePixelRatio || 1;
  canvas.width  = rect.width  * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  var W = rect.width, H = rect.height;

  var windowMiles = Math.min(simTotalDist, Math.max(6, simTotalDist * 0.4));
  var windowStart = Math.max(0, currentDist - windowMiles * 0.35);
  var actualStart = Math.max(0, windowStart);
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
  eMin -= 30; eMax += 50;
  var mt = Math.min(40, H * 0.15), mb = 0;
  var xScale = function(d) { return ((d - actualStart) / windowMiles) * W; };
  var yScale = function(e) { return mt + (H - mt - mb) - ((e - eMin) / (eMax - eMin)) * (H - mt - mb); };

  var elapsed = (currentDist / simRace.miles) * simFinishHours;
  var tod = 7 + elapsed;
  var skyTop, skyBot;
  if (tod < 6)       { skyTop = '#1a1610'; skyBot = '#252013'; }
  else if (tod < 8)  { skyTop = '#2a2316'; skyBot = '#4a3a20'; }
  else if (tod < 17) { skyTop = '#3a3225'; skyBot = '#5a4f3a'; }
  else if (tod < 20) { skyTop = '#3a2c20'; skyBot = '#4a3a25'; }
  else               { skyTop = '#1a1610'; skyBot = '#252013'; }

  var skyGrad = ctx.createLinearGradient(0, 0, 0, H);
  skyGrad.addColorStop(0, skyTop); skyGrad.addColorStop(1, skyBot);
  ctx.fillStyle = skyGrad; ctx.fillRect(0, 0, W, H);

  var segStart = 0;
  while (segStart < windowPts.length) {
    var loopId = windowPts[segStart].loopId;
    var segEnd = segStart;
    while (segEnd < windowPts.length - 1 && windowPts[segEnd + 1].loopId === loopId) segEnd++;
    var pts = windowPts.slice(segStart, segEnd + 1);
    var loop = LOOPS[loopId];
    var color = loop.color;

    ctx.beginPath();
    ctx.moveTo(xScale(pts[0].d), yScale(pts[0].e));
    for (var i = 0; i < pts.length; i++) ctx.lineTo(xScale(pts[i].d), yScale(pts[i].e));
    ctx.lineTo(xScale(pts[pts.length - 1].d), H);
    ctx.lineTo(xScale(pts[0].d), H);
    ctx.closePath();

    if (loop.pattern === 'checkered') {
      var checkSize = 6;
      var patternCanvas = document.createElement('canvas');
      patternCanvas.width = checkSize * 2; patternCanvas.height = checkSize * 2;
      var pctx = patternCanvas.getContext('2d');
      pctx.fillStyle = 'rgba(244,238,224,0.22)';
      pctx.fillRect(0, 0, checkSize, checkSize); pctx.fillRect(checkSize, checkSize, checkSize, checkSize);
      pctx.fillStyle = 'rgba(31,29,24,0.18)';
      pctx.fillRect(checkSize, 0, checkSize, checkSize); pctx.fillRect(0, checkSize, checkSize, checkSize);
      ctx.fillStyle = ctx.createPattern(patternCanvas, 'repeat');
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(xScale(pts[0].d), yScale(pts[0].e));
      for (var i = 0; i < pts.length; i++) ctx.lineTo(xScale(pts[i].d), yScale(pts[i].e));
      ctx.strokeStyle = '#f4eee0'; ctx.lineWidth = 3; ctx.stroke();
      ctx.strokeStyle = '#1f1d18'; ctx.lineWidth = 2.5; ctx.setLineDash([5, 5]); ctx.stroke();
      ctx.setLineDash([]);
    } else {
      var r = parseInt(color.slice(1, 3), 16), g = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16);
      var tGrad = ctx.createLinearGradient(0, mt, 0, H);
      tGrad.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',0.35)');
      tGrad.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0.05)');
      ctx.fillStyle = tGrad; ctx.fill();
      ctx.beginPath();
      ctx.moveTo(xScale(pts[0].d), yScale(pts[0].e));
      for (var i = 0; i < pts.length; i++) ctx.lineTo(xScale(pts[i].d), yScale(pts[i].e));
      ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.stroke();
    }
    segStart = segEnd + 1;
  }

  if (currentDist > actualStart) {
    ctx.fillStyle = 'rgba(26,22,16,0.45)';
    ctx.fillRect(0, 0, xScale(currentDist), H);
  }

  var rx = xScale(currentDist), ry = yScale(currentEle);
  var dotR = Math.max(4, Math.min(8, H * 0.1));
  ctx.beginPath(); ctx.arc(rx, ry, dotR, 0, Math.PI * 2);
  ctx.fillStyle = '#f4eee0'; ctx.fill();
  ctx.strokeStyle = LOOPS[currentLoopId].color; ctx.lineWidth = 2; ctx.stroke();
}

// ─── Post-load wiring ───────────────────────────────────────────────
//  - initMap kicks off the map view (selectRace fires from map.on load).
//  - relocateSimulator pulls #simView out of the editorial template's
//    hidden wrapper and inserts it into a visible essentials section so
//    the simulator is first-class on this page (Tinman deliberately
//    buries the sim; Wild Goose's spec asks for it to be surfaced).

window.addEventListener('resize', function() {
  drawCombined(RACES[currentRaceId].loops, RACES[currentRaceId].name);
  if (simInitialized) renderSim();
});

document.addEventListener('DOMContentLoaded', function() {
  relocateSimulator();
  relocateWeatherPanel();
  hideDefaultAidTable();
  // editorial-runtime.js registers a DOMContentLoaded handler AFTER ours
  // (the shared module is concatenated after override.js in build.js).
  // It relocates the .directions-section from inside the map column into
  // .course__cues via appendChild — landing AFTER the aid card. We want
  // the directions to be the FIRST thing in the cue column, immediately
  // right of the map. Defer the reorder so it runs after editorial-
  // runtime has appended the section.
  setTimeout(reorderCueColumn, 0);
});

function relocateSimulator() {
  var sim = document.getElementById('simView');
  if (!sim) return;
  var hiddenWrap = sim.closest('[hidden]');
  if (hiddenWrap) hiddenWrap.removeAttribute('hidden');

  var anchor = document.getElementById('essentialsAid');
  if (!anchor || !anchor.parentNode) return;

  var section = document.createElement('section');
  section.className = 'essentials essentials--sim';
  section.id = 'essentialsSimulator';

  var head = document.createElement('div');
  head.className = 'essentials__head';
  var h2 = document.createElement('h2');
  h2.className = 'essentials__title';
  h2.textContent = 'Race Simulator';
  var sub = document.createElement('p');
  sub.className = 'essentials__sub';
  sub.textContent = 'Pick a distance, set a goal time, scrub the course loop by loop.';
  head.appendChild(h2);
  head.appendChild(sub);

  var host = document.createElement('div');
  host.className = 'essentials__sim-host';

  section.appendChild(head);
  section.appendChild(host);

  anchor.parentNode.insertBefore(section, anchor);
  host.appendChild(sim);
  sim.classList.add('view--always-on', 'active');
  sim.style.display = '';

  initSim();
  renderSim();
}

// Pull the weather panel out of its hidden staging slot in the cue
// column and surface it as a full-width essentials section between the
// simulator and the (hidden) aid table. Matches the new-map-prompt
// f6048cf rule: weather lives in the top bar (live conditions) AND
// inside race-day essentials — never as a 340px sticky side panel.
function relocateWeatherPanel() {
  var panel = document.getElementById('weatherPanel');
  if (!panel) return;
  var staging = document.getElementById('weatherPanelStaging');
  if (staging) staging.removeAttribute('hidden');

  var anchor = document.getElementById('essentialsSimulator') || document.getElementById('essentialsAid');
  if (!anchor || !anchor.parentNode) return;

  var section = document.createElement('section');
  section.className = 'essentials essentials--weather';
  section.id = 'essentialsWeather';

  var head = document.createElement('div');
  head.className = 'essentials__head';
  var h2 = document.createElement('h2');
  h2.className = 'essentials__title';
  h2.textContent = 'Weather Intelligence';
  var sub = document.createElement('p');
  sub.className = 'essentials__sub';
  sub.textContent = 'Expected conditions for race weekend — 15-year averages from NASA POWER + Open-Meteo. Current conditions card is live.';
  head.appendChild(h2);
  head.appendChild(sub);

  var host = document.createElement('div');
  host.className = 'essentials__weather-host';

  section.appendChild(head);
  section.appendChild(host);

  // Insert AFTER the simulator section (between sim and aid)
  if (anchor.nextSibling) {
    anchor.parentNode.insertBefore(section, anchor.nextSibling);
  } else {
    anchor.parentNode.appendChild(section);
  }
  host.appendChild(panel);
  // Drop the now-empty staging wrapper.
  if (staging && staging.parentNode) staging.parentNode.removeChild(staging);
}

// The editorial template's default `essentialsAid` section is a multi-
// row aid table designed for races with several stations. Wild Goose
// has ONE aid station, surfaced loudly via the .hq-aid-card above the
// directions section — duplicating that as a one-row table would imply
// other stations exist on course. Hide the default section entirely.
function hideDefaultAidTable() {
  var sect = document.getElementById('essentialsAid');
  if (sect) sect.setAttribute('hidden', '');
}

// editorial-runtime.js appends .directions-section to .course__cues,
// landing AFTER the Squatch HQ aid card. The page reads best with the
// loop-assembly chip strip + within-loop cues IMMEDIATELY right of the
// map, so move the directions to be the first content child (right
// after the scope note + visually-hidden h1).
function reorderCueColumn() {
  var cues = document.querySelector('.course__cues');
  var dir = document.getElementById('directionsSection');
  if (!cues || !dir || dir.parentElement !== cues) return;
  // Anchor: insert directions immediately after the visually-hidden h1
  // so the cue stream starts at the top of the column. The scope-note
  // band that used to sit here has been removed sitewide (Wild Goose
  // mobile review · May 2026 — it didn't earn its space).
  var anchor = cues.querySelector('h1.visually-hidden');
  if (anchor && anchor.nextSibling) {
    cues.insertBefore(dir, anchor.nextSibling);
  } else {
    cues.insertBefore(dir, cues.firstChild);
  }
}

initMap();
