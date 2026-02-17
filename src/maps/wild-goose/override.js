// override.js - Wild Goose Trail Festival
// Complete standalone JS (shared modules skipped via skipSharedJs)
// Multi-loop course with LOOPS, RACES, shared segments, turn markers, and race picker

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
    glacier: '#edf3f8'
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
var turnsOn = false;
var terrain3D = false;
var turnMarkers = [];

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
  document.getElementById(view + 'View').classList.add('active');
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
// MAP VIEW
// ═══════════════════════════════════════════════════════════
function initMap() {
  map = new maplibregl.Map({
    container: 'map',
    style: BASEMAP_STYLE,
    center: [-74.432, 41.183],
    zoom: 12.5,
    pitch: 25,
    bearing: -10,
    antialias: true,
    attributionControl: false
  });

  map.addControl(new maplibregl.AttributionControl({ compact: true }));
  map.once('load', function() {
    var attrib = document.querySelector('.maplibregl-ctrl-attrib');
    if (attrib) { attrib.removeAttribute('open'); attrib.classList.remove('maplibregl-compact-show'); }
  });

  map.addControl(new maplibregl.NavigationControl(), 'top-right');

  map.on('load', function() {
    // Hide basemap trail/path layers that conflict with our custom overlays
    ['roads_other','roads_bridges_other','roads_bridges_other_casing',
     'roads_tunnels_other','roads_tunnels_other_casing','roads_labels_minor'
    ].forEach(function(id) { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none'); });

    // Add terrain source (toggled on/off via 3D button)
    map.addSource('terrain-dem', {
      type: 'raster-dem',
      tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
      tileSize: 256, maxzoom: 15, encoding: 'terrarium'
    });

    // Add loops in order: pink first, then blue, then checkered
    var loopOrder = ['pink', 'blue', 'checkered'];
    for (var li = 0; li < loopOrder.length; li++) {
      var id = loopOrder[li];
      var loop = LOOPS[id];
      map.addSource(id, { type: 'geojson', data: loop.geojson });
      map.addLayer({ id: id + '-outline', type: 'line', source: id, paint: { 'line-color': '#000', 'line-width': 5, 'line-opacity': 0.25 } });
      if (loop.pattern === 'checkered') {
        map.addLayer({ id: id + '-white', type: 'line', source: id, paint: { 'line-color': '#fff', 'line-width': 4 } });
        map.addLayer({ id: id, type: 'line', source: id, paint: { 'line-color': '#000', 'line-width': 4, 'line-dasharray': [1, 1] } });
      } else {
        map.addLayer({ id: id, type: 'line', source: id, paint: { 'line-color': loop.color, 'line-width': 3.5 } });
      }
      (function(loopId, loopObj) {
        map.on('click', loopId, function(e) {
          var popupColor = loopObj.pattern === 'checkered' ? '#333' : loopObj.color;
          new maplibregl.Popup({ offset: 12 }).setLngLat(e.lngLat).setHTML('<strong style="color:' + popupColor + '">' + loopObj.label + ' Loop</strong><br><span style="color:#666">' + loopObj.miles + ' mi · ' + loopObj.gain + "' gain</span>").addTo(map);
        });
        map.on('mouseenter', loopId, function() { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', loopId, function() { map.getCanvas().style.cursor = ''; });
      })(id, loop);
    }

    // Create shared segment overlay (Blue & Pink overlap on Laurel Pond/Double Pond trails)
    var blueCoords = LOOPS.blue.geojson.geometry.coordinates;
    var sharedCoords = blueCoords.slice(305);
    var sharedSegment = {
      type: 'Feature',
      properties: { name: 'Shared Blue/Pink' },
      geometry: { type: 'LineString', coordinates: sharedCoords }
    };
    map.addSource('shared-segment', { type: 'geojson', data: { type: 'FeatureCollection', features: [sharedSegment] } });
    map.addLayer({ id: 'shared-pink-offset', type: 'line', source: 'shared-segment', paint: { 'line-color': '#E834EC', 'line-width': 2.5, 'line-offset': -1.5 } });
    map.addLayer({ id: 'shared-blue-offset', type: 'line', source: 'shared-segment', paint: { 'line-color': '#0479FF', 'line-width': 2.5, 'line-offset': 1.5 } });

    // HQ marker
    var el = document.createElement('div');
    el.className = 'hq-marker';
    el.innerHTML = '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="#FFD700" stroke="#1a1a1a" stroke-width="2"/><text x="16" y="20" text-anchor="middle" font-size="12" font-weight="bold" fill="#1a1a1a">S</text></svg>';
    new maplibregl.Marker({ element: el }).setLngLat(HQ).setPopup(new maplibregl.Popup({ offset: 15 }).setHTML('<strong style="color:#5CA921">SQUATCH HQ</strong><br><span style="color:#666">Start/Finish · Aid Station</span>')).addTo(map);

    // Course turn markers with Street View
    var TURNS = [
      { name: 'Turn onto Warwick Turnpike', coords: [-74.39210797569987, 41.19636530290526], pano: 'Nr-Rvka4ohEaY8AjwC0gsQ', heading: 317, pitch: 17 },
      { name: 'Auxillary Gate', coords: [-74.43182534018032, 41.19216403412413], pano: 'FtAEp2_NGkJHYUXXBSwuNg', heading: 85, pitch: 15 },
      { name: 'Turn onto Wawayanda Road', coords: [-74.4288102608505, 41.192782095039625], pano: 'XZQCZiPY8CU0xLnQ7vDMSg', heading: 52, pitch: 7 },
      { name: 'Parking Lot & Squatch HQ', coords: [-74.42913536110542, 41.19011668988375], pano: 'xCf0GcVhiksIRm7dhE1pdg', heading: 160, pitch: 0 },
      { name: 'The Iron Furnace', coords: [-74.42144128042324, 41.18550102782616], pano: 'IYBYofrjAaiSWokYyvJPDg', heading: 216, pitch: 12 },
      { name: 'Turn onto Campsite Road', coords: [-74.41643440559857, 41.19219802627929], pano: 'Y9aP4Whq-jNi7guY5sDQlQ', heading: 158, pitch: 3 },
      { name: 'Trail Junction', coords: [-74.40938333820336, 41.195586314503146], pano: 'gn7_WCu3J2MYargxxvBV2w', heading: 63, pitch: 6 }
    ];

    TURNS.forEach(function(turn, i) {
      var markerEl = document.createElement('div');
      markerEl.className = 'turn-marker';
      markerEl.style.display = 'none';
      markerEl.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#FF6B35" stroke="#fff" stroke-width="2"/><text x="12" y="16" text-anchor="middle" font-size="11" font-weight="bold" fill="#fff">' + (i + 1) + '</text></svg>';

      var streetViewUrl = 'https://streetviewpixels-pa.googleapis.com/v1/thumbnail?panoid=' + turn.pano + '&cb_client=maps_sv.tactile&w=640&h=360&yaw=' + turn.heading + '&pitch=' + turn.pitch;
      var mapsUrl = 'https://www.google.com/maps/@?api=1&map_action=pano&pano=' + turn.pano + '&heading=' + turn.heading + '&pitch=' + turn.pitch;

      var popupHtml = '<img class="streetview-img" src="' + streetViewUrl + '" alt="Street View"><div class="streetview-caption"><strong>' + turn.name + '</strong><a href="' + mapsUrl + '" target="_blank">Open in Google Maps →</a></div>';

      var marker = new maplibregl.Marker({ element: markerEl })
        .setLngLat(turn.coords)
        .setPopup(new maplibregl.Popup({ offset: 15, className: 'streetview-popup', maxWidth: '320px' }).setHTML(popupHtml))
        .addTo(map);
      turnMarkers.push({ marker: marker, element: markerEl });
    });

    drawProfile('all');
    buildCards();
  });
}

// ═══════════════════════════════════════════════════════════
// LOOP TOGGLES
// ═══════════════════════════════════════════════════════════
function toggleLoop(id) {
  var loop = LOOPS[id];
  loop.visible = !loop.visible;
  document.querySelector('[data-loop="' + id + '"]').classList.toggle('active', loop.visible);
  if (map && map.getLayer(id)) {
    var v = loop.visible ? 'visible' : 'none';
    map.setLayoutProperty(id, 'visibility', v);
    map.setLayoutProperty(id + '-outline', 'visibility', v);
    if (map.getLayer(id + '-white')) map.setLayoutProperty(id + '-white', 'visibility', v);
    if ((id === 'blue' || id === 'pink') && map.getLayer('shared-blue-offset')) {
      var sharedV = (LOOPS.blue.visible && LOOPS.pink.visible) ? 'visible' : 'none';
      map.setLayoutProperty('shared-pink-offset', 'visibility', sharedV);
      map.setLayoutProperty('shared-blue-offset', 'visibility', sharedV);
    }
  }
  drawProfileFromVisible();
}

function drawProfileFromVisible() {
  var active = Object.keys(LOOPS).filter(function(id) { return LOOPS[id].visible; });
  drawCombined(active, 'Selected');
}

function selectRace(raceId) {
  var race = RACES[raceId];
  var activeSet = {};
  for (var i = 0; i < race.loops.length; i++) activeSet[race.loops[i]] = true;
  for (var id in LOOPS) {
    var show = !!activeSet[id];
    LOOPS[id].visible = show;
    document.querySelector('[data-loop="' + id + '"]').classList.toggle('active', show);
    if (map && map.getLayer(id)) {
      map.setLayoutProperty(id, 'visibility', show ? 'visible' : 'none');
      map.setLayoutProperty(id + '-outline', 'visibility', show ? 'visible' : 'none');
    }
  }
  drawProfile(raceId);
  document.querySelectorAll('.race-card').forEach(function(c) { c.classList.toggle('active', c.dataset.race === raceId); });
}

function buildCards() {
  var html = '';
  for (var id in RACES) {
    if (id === 'all') continue;
    var race = RACES[id];
    var dots = race.loops.map(function(l) {
      if (LOOPS[l].pattern === 'checkered') {
        return '<div class="dot checkered-dot"></div>';
      }
      return '<div class="dot" style="background:' + LOOPS[l].color + '"></div>';
    }).join('');
    html += '<div class="race-card" data-race="' + id + '" onclick="selectRace(\'' + id + '\')"><div class="name">' + race.name + '</div><div class="details">' + race.miles + ' mi</div><div class="dots">' + dots + '</div></div>';
  }
  document.getElementById('raceCards').innerHTML = html;
}

function drawProfile(raceId) { drawCombined(RACES[raceId].loops, RACES[raceId].name); }

function drawCombined(loopSeq, title) {
  var canvas = document.getElementById('profileCanvas');
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
    segments.push({ pts: pts, color: loop.color, pattern: loop.pattern });
    offset += maxD;
  }

  document.getElementById('profileTitle').textContent = 'Elevation — ' + title;
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
  document.getElementById('profileStats').innerHTML = '<div><span class="val">' + totalD.toFixed(1) + '</span> mi</div><div><span class="val">+' + Math.round(totalGain).toLocaleString() + '</span> ft</div>';

  var ml = 32, mr = 6, mt = 6, mb = 14;
  var cw = W - ml - mr, ch = H - mt - mb;
  var pad = 20, eMin = minE - pad, eMax = maxE + pad;
  var xS = function(d) { return ml + (d / totalD) * cw; };
  var yS = function(e) { return mt + ch - ((e - eMin) / (eMax - eMin)) * ch; };

  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(0,0,0,0.05)'; ctx.lineWidth = 1;
  for (var e = Math.ceil(eMin / 100) * 100; e <= eMax; e += 100) {
    var y = yS(e);
    ctx.beginPath(); ctx.moveTo(ml, y); ctx.lineTo(W - mr, y); ctx.stroke();
    ctx.fillStyle = '#999'; ctx.font = '9px Inter,sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(e + "'", ml - 3, y + 3);
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
    if (seg.pattern === 'checkered') {
      var checkSize = 4;
      var patternCanvas = document.createElement('canvas');
      patternCanvas.width = checkSize * 2;
      patternCanvas.height = checkSize * 2;
      var pctx = patternCanvas.getContext('2d');
      pctx.fillStyle = 'rgba(0,0,0,0.25)';
      pctx.fillRect(0, 0, checkSize, checkSize);
      pctx.fillRect(checkSize, checkSize, checkSize, checkSize);
      pctx.fillStyle = 'rgba(255,255,255,0.25)';
      pctx.fillRect(checkSize, 0, checkSize, checkSize);
      pctx.fillRect(0, checkSize, checkSize, checkSize);
      ctx.fillStyle = ctx.createPattern(patternCanvas, 'repeat');
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(xS(pts[0].d), yS(pts[0].e));
      for (var i = 1; i < pts.length; i++) ctx.lineTo(xS(pts[i].d), yS(pts[i].e));
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.stroke();
      ctx.setLineDash([]);
    } else {
      var hex = seg.color, r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
      var grad = ctx.createLinearGradient(0, mt, 0, H - mb);
      grad.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',0.35)');
      grad.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0.05)');
      ctx.fillStyle = grad; ctx.fill();
      ctx.beginPath();
      ctx.moveTo(xS(pts[0].d), yS(pts[0].e));
      for (var i = 1; i < pts.length; i++) ctx.lineTo(xS(pts[i].d), yS(pts[i].e));
      ctx.strokeStyle = seg.color; ctx.lineWidth = 2; ctx.stroke();
    }
  }
}

// ═══════════════════════════════════════════════════════════
// TRAIL + TERRAIN TOGGLES
// ═══════════════════════════════════════════════════════════
function toggleTrails() {
  trailsOn = !trailsOn;
  document.getElementById('trailBtn').classList.toggle('active', trailsOn);
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
          'text-size': ['interpolate', ['linear'], ['zoom'], 13, 10, 16, 14, 20, 18],
          'text-font': ['Noto Sans Medium'],
          'text-max-angle': 30,
          'text-padding': 10,
          'text-offset': [0, -1.2]
        },
        paint: {
          'text-color': '#222',
          'text-halo-color': '#fff',
          'text-halo-width': 2,
          'text-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 13.5, 1]
        },
        minzoom: 13
      });
    }
    map.setLayoutProperty('course-trails-line', 'visibility', 'visible');
    map.setLayoutProperty('course-trails-label', 'visibility', 'visible');
  } else {
    if (map.getLayer('course-trails-line')) map.setLayoutProperty('course-trails-line', 'visibility', 'none');
    if (map.getLayer('course-trails-label')) map.setLayoutProperty('course-trails-label', 'visibility', 'none');
  }
}

function toggleTurns() {
  turnsOn = !turnsOn;
  document.getElementById('turnsBtn').classList.toggle('active', turnsOn);
  turnMarkers.forEach(function(t) {
    t.element.style.display = turnsOn ? 'block' : 'none';
  });
}

function toggle3D() {
  terrain3D = !terrain3D;
  document.getElementById('terrainBtn').classList.toggle('active', terrain3D);
  if (!map) return;
  if (terrain3D) {
    map.setTerrain({ source: 'terrain-dem', exaggeration: 1.3 });
    map.setSky({
      'sky-color': '#88C6FC',
      'horizon-color': '#ffffff',
      'sky-horizon-blend': 0.8,
      'fog-color': '#ffffff',
      'fog-ground-blend': 0.5
    });
    map.easeTo({ pitch: 45, duration: 1000 });
  } else {
    map.setTerrain(null);
    map.setSky(null);
    map.easeTo({ pitch: 0, duration: 1000 });
  }
}

// ═══════════════════════════════════════════════════════════
// SIMULATOR ENGINE
// ═══════════════════════════════════════════════════════════
var simRace = RACES['half'];
var simProgress = 0;
var simPlaying = false;
var simSpeed = 1;
var simFinishHours = 2.5;
var simProfile = [];
var simTotalDist = 0;
var simTotalGain = 0;
var simLastTick = 0;
var simInitialized = false;

function initSim() {
  if (simInitialized) return;
  simInitialized = true;
  buildSimRaces();
  buildSimProfile();
  buildSimScrubber();
  buildGoalTimeUI();

  var track = document.getElementById('scrubTrack');
  var scrubbing = false;
  var scrubTo = function(e) {
    var rect = track.getBoundingClientRect();
    var clientX = e.touches ? e.touches[0].clientX : e.clientX;
    simProgress = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    renderSim();
  };
  track.addEventListener('mousedown', function(e) { scrubbing = true; simPlaying = false; document.getElementById('playBtn').innerHTML = '▶'; scrubTo(e); });
  window.addEventListener('mousemove', function(e) { if (scrubbing) scrubTo(e); });
  window.addEventListener('mouseup', function() { scrubbing = false; });
  track.addEventListener('touchstart', function(e) { scrubbing = true; simPlaying = false; document.getElementById('playBtn').innerHTML = '▶'; scrubTo(e); }, { passive: true });
  window.addEventListener('touchmove', function(e) { if (scrubbing) scrubTo(e); }, { passive: true });
  window.addEventListener('touchend', function() { scrubbing = false; });
}

function buildSimRaces() {
  var html = '';
  for (var id in RACES) {
    if (id === 'all') continue;
    html += '<button class="sim-race-btn' + (id === 'half' ? ' active' : '') + '" data-race="' + id + '" onclick="pickSimRace(\'' + id + '\')">' + RACES[id].name + '</button>';
  }
  document.getElementById('simRaces').innerHTML = html;
}

function pickSimRace(id) {
  simRace = RACES[id];
  simProgress = 0;
  simPlaying = false;
  simFinishHours = simRace.hours;
  document.getElementById('playBtn').innerHTML = '▶';
  document.querySelectorAll('.sim-race-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.race === id); });
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
  var h = parseInt(document.getElementById('goalHrs').value) || 0;
  var m = parseInt(document.getElementById('goalMins').value) || 0;
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
  document.getElementById('goalPace').innerHTML = 'Avg pace: <strong>' + pm + ':' + String(ps).padStart(2, '0') + ' /mi</strong>';
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
  // Fix loopIdx to be sequential
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
      ? 'background:repeating-conic-gradient(#000 0% 25%, #fff 0% 50%) 50%/6px 6px;opacity:0.5'
      : 'background:' + loop.color + ';opacity:0.3';
    segsHtml += '<div class="scrub-seg" style="width:' + pct + '%;' + bgStyle + '"></div>';
    if (i < simRace.loops.length - 1) {
      cumDist += loop.profile[loop.profile.length - 1].d;
      hqHtml += '<div class="hq-tick" style="left:' + ((cumDist / simTotalDist) * 100) + '%"></div>';
    }
  }
  document.getElementById('scrubSegs').innerHTML = segsHtml;
  document.getElementById('scrubHQ').innerHTML = hqHtml;
}

function togglePlay() {
  simPlaying = !simPlaying;
  document.getElementById('playBtn').innerHTML = simPlaying ? '⏸' : '▶';
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
  if (simProgress >= 1) { simPlaying = false; document.getElementById('playBtn').innerHTML = '▶'; return; }
  requestAnimationFrame(simTick);
}

// ═══════════════════════════════════════════════════════════
// SIMULATOR HELPERS
// ═══════════════════════════════════════════════════════════
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
    if (dist >= cumDist + loopDist) {
      gain += loopGain;
    } else if (dist > cumDist) {
      gain += loopGain * ((dist - cumDist) / loopDist);
    }
    cumDist += loopDist;
  }
  return gain;
}

// ═══════════════════════════════════════════════════════════
// SIMULATOR RENDERERS
// ═══════════════════════════════════════════════════════════
function renderSim() {
  var dist = simProgress * simTotalDist;
  var pt = getSimPointAt(dist);
  var grade = getSimGrade(dist);
  var gain = getSimGain(dist);

  document.getElementById('scrubFill').style.width = (simProgress * 100) + '%';
  document.getElementById('scrubHandle').style.left = (simProgress * 100) + '%';

  document.getElementById('runnerDist').textContent = 'Mile ' + dist.toFixed(1);
  var gradeDir = grade > 2 ? 'Climbing' : grade < -2 ? 'Descending' : 'Rolling';
  document.getElementById('runnerMeta').textContent = Math.round(pt.e).toLocaleString() + ' ft \u00b7 ' + gradeDir;

  var pill = document.getElementById('loopPill');
  pill.textContent = LOOPS[pt.loopId].label;
  pill.style.color = LOOPS[pt.loopId].color;
  pill.style.borderColor = LOOPS[pt.loopId].color;

  var elapsed = (dist / simRace.miles) * simFinishHours;
  var tod = 5 + elapsed;
  var hrs = Math.floor(tod) % 24;
  var mins = Math.floor((tod % 1) * 60);
  var ampm = hrs >= 12 ? 'PM' : 'AM';
  var dispHrs = hrs > 12 ? hrs - 12 : (hrs === 0 ? 12 : hrs);
  document.getElementById('clockTime').textContent = dispHrs + ':' + String(mins).padStart(2, '0') + ' ' + ampm;

  var finishTod = 5 + simFinishHours;
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
    if (isDone) status = '<span class="lstatus done">\u2713</span>';
    else if (isCurrent) status = '<span class="lstatus active">' + Math.round(((dist - cumDist) / loopDist) * 100) + '%</span>';
    var dotClass = LOOPS[id].pattern === 'checkered' ? 'ldot checkered-ldot' : 'ldot';
    var dotStyle = LOOPS[id].pattern === 'checkered' ? '' : 'background:' + LOOPS[id].color;
    html += '<div class="loop-row' + (isCurrent ? ' current' : '') + '"><span class="lname">Loop ' + (i + 1) + ' <span class="' + dotClass + '" style="' + dotStyle + '"></span></span>' + status + '</div>';
    cumDist += loopDist;
  }
  document.getElementById('loopTracker').innerHTML = html;
}

function renderCourseMap(currentDist) {
  var canvas = document.getElementById('courseMapCanvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var rect = canvas.getBoundingClientRect();
  var dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  var W = rect.width, H = rect.height;

  // Background gradient
  var bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, '#1a2030');
  bgGrad.addColorStop(1, '#1f2538');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Compute bounding box across ALL loop coordinates
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

  // Determine which loops are used in the current race
  var usedLoops = {};
  for (var i = 0; i < simRace.loops.length; i++) usedLoops[simRace.loops[i]] = true;

  // Draw dim background trace for each used loop
  for (var id in usedLoops) {
    var coords = LOOPS[id].geojson.geometry.coordinates;
    var color = LOOPS[id].color;
    ctx.beginPath();
    for (var i = 0; i < coords.length; i++) {
      var x = toX(coords[i][0]);
      var y = toY(coords[i][1]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    if (LOOPS[id].pattern === 'checkered') {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    } else {
      var r = parseInt(color.slice(1, 3), 16), g = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16);
      ctx.strokeStyle = 'rgba(' + r + ',' + g + ',' + b + ',0.45)';
    }
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  // Draw completed and remaining portions for each loop occurrence
  var cumDist = 0;
  var runner = getSimCoordAtDist(currentDist);
  for (var li = 0; li < simRace.loops.length; li++) {
    var id = simRace.loops[li];
    var loopMiles = LOOPS[id].miles;
    var coords = LOOPS[id].geojson.geometry.coordinates;
    var dists = loopCoordDistances[id];
    var color = LOOPS[id].color;
    var loopStart = cumDist;
    var loopEnd = cumDist + loopMiles;

    if (currentDist >= loopEnd) {
      // Fully completed loop
      ctx.beginPath();
      for (var i = 0; i < coords.length; i++) {
        var x = toX(coords[i][0]);
        var y = toY(coords[i][1]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = LOOPS[id].pattern === 'checkered' ? 'rgba(255,255,255,0.7)' : color;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    } else if (currentDist > loopStart) {
      // Partially completed
      var localDist = currentDist - loopStart;
      var splitIdx = 0;
      for (var j = 1; j < dists.length; j++) {
        if (dists[j] >= localDist) { splitIdx = j; break; }
      }
      if (splitIdx > 0) {
        ctx.beginPath();
        for (var i = 0; i <= splitIdx; i++) {
          var x = toX(coords[i][0]);
          var y = toY(coords[i][1]);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.lineTo(toX(runner.coord[0]), toY(runner.coord[1]));
        ctx.strokeStyle = LOOPS[id].pattern === 'checkered' ? 'rgba(255,255,255,0.8)' : color;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      }
    }
    cumDist += loopMiles;
  }

  // Start marker
  var firstId = simRace.loops[0];
  var startCoord = LOOPS[firstId].geojson.geometry.coordinates[0];
  var sx = toX(startCoord[0]);
  var sy = toY(startCoord[1]);
  ctx.beginPath();
  ctx.arc(sx, sy, 6, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.strokeStyle = LOOPS[firstId].color;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = LOOPS[firstId].color;
  ctx.font = 'bold 8px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('S', sx, sy + 0.5);

  // Mile markers with collision suppression
  var markerR = Math.max(8, Math.min(11, W / 35));
  var markerFont = Math.max(7, Math.min(9, W / 45));
  var gap = 3;
  var candidates = [];
  for (var m = 1; m <= Math.floor(simTotalDist); m++) {
    var mc = getSimCoordAtDist(m);
    var mx = toX(mc.coord[0]);
    var my = toY(mc.coord[1]);
    var priority = (m % 10 === 0) ? 1 : (m % 5 === 0) ? 2 : 3;
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
      ctx.fillStyle = 'rgba(26,32,48,0.85)';
      ctx.fill();
      ctx.strokeStyle = c.priority === 1 ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.25)';
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

  // Runner dot with glow
  var rx = toX(runner.coord[0]);
  var ry = toY(runner.coord[1]);
  var loopColor = LOOPS[runner.loopId].color;
  var glowColor = LOOPS[runner.loopId].pattern === 'checkered' ? '255,255,255' : (
    parseInt(loopColor.slice(1, 3), 16) + ',' + parseInt(loopColor.slice(3, 5), 16) + ',' + parseInt(loopColor.slice(5, 7), 16)
  );

  ctx.beginPath();
  ctx.arc(rx, ry, 14, 0, Math.PI * 2);
  var glow = ctx.createRadialGradient(rx, ry, 4, rx, ry, 14);
  glow.addColorStop(0, 'rgba(' + glowColor + ',0.4)');
  glow.addColorStop(1, 'rgba(' + glowColor + ',0)');
  ctx.fillStyle = glow;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(rx, ry, 7, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.strokeStyle = LOOPS[runner.loopId].pattern === 'checkered' ? '#fff' : loopColor;
  ctx.lineWidth = 3;
  ctx.stroke();
}

function renderSimTerrain(currentDist, currentEle, currentLoopId) {
  var canvas = document.getElementById('simTerrain');
  var ctx = canvas.getContext('2d');
  var rect = canvas.getBoundingClientRect();
  var dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  var W = rect.width, H = rect.height;

  var windowMiles = Math.min(simTotalDist, Math.max(6, simTotalDist * 0.4));
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
  eMin -= 30; eMax += 50;
  var mt = Math.min(40, H * 0.15), mb = 0;
  var xScale = function(d) { return ((d - actualStart) / windowMiles) * W; };
  var yScale = function(e) { return mt + (H - mt - mb) - ((e - eMin) / (eMax - eMin)) * (H - mt - mb); };

  // Sky gradient
  var elapsed = (currentDist / simRace.miles) * simFinishHours;
  var tod = 5 + elapsed;
  var skyTop, skyBot;
  if (tod < 6) { skyTop = '#1a2030'; skyBot = '#252540'; }
  else if (tod < 8) { skyTop = '#2a3050'; skyBot = '#4a4070'; }
  else if (tod < 17) { skyTop = '#3a4560'; skyBot = '#5a6580'; }
  else if (tod < 20) { skyTop = '#3a3055'; skyBot = '#4a4070'; }
  else { skyTop = '#1a2030'; skyBot = '#252540'; }

  var skyGrad = ctx.createLinearGradient(0, 0, 0, H);
  skyGrad.addColorStop(0, skyTop);
  skyGrad.addColorStop(1, skyBot);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, W, H);

  // Draw terrain by loop
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
      patternCanvas.width = checkSize * 2;
      patternCanvas.height = checkSize * 2;
      var pctx = patternCanvas.getContext('2d');
      pctx.fillStyle = 'rgba(255,255,255,0.2)';
      pctx.fillRect(0, 0, checkSize, checkSize);
      pctx.fillRect(checkSize, checkSize, checkSize, checkSize);
      pctx.fillStyle = 'rgba(0,0,0,0.15)';
      pctx.fillRect(checkSize, 0, checkSize, checkSize);
      pctx.fillRect(0, checkSize, checkSize, checkSize);
      ctx.fillStyle = ctx.createPattern(patternCanvas, 'repeat');
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(xScale(pts[0].d), yScale(pts[0].e));
      for (var i = 0; i < pts.length; i++) ctx.lineTo(xScale(pts[i].d), yScale(pts[i].e));
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      var r = parseInt(color.slice(1, 3), 16), g = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16);
      var tGrad = ctx.createLinearGradient(0, mt, 0, H);
      tGrad.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',0.3)');
      tGrad.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0.05)');
      ctx.fillStyle = tGrad;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(xScale(pts[0].d), yScale(pts[0].e));
      for (var i = 0; i < pts.length; i++) ctx.lineTo(xScale(pts[i].d), yScale(pts[i].e));
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    segStart = segEnd + 1;
  }

  // Dim behind runner
  if (currentDist > actualStart) {
    ctx.fillStyle = 'rgba(26,32,48,0.4)';
    ctx.fillRect(0, 0, xScale(currentDist), H);
  }

  // Runner dot
  var rx = xScale(currentDist), ry = yScale(currentEle);
  var dotR = Math.max(4, Math.min(8, H * 0.1));
  ctx.beginPath();
  ctx.arc(rx, ry, dotR, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.strokeStyle = LOOPS[currentLoopId].color;
  ctx.lineWidth = 2;
  ctx.stroke();
}

// ═══════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════
window.addEventListener('resize', function() {
  if (currentView === 'map') drawProfile('all');
  if (currentView === 'sim') renderSim();
});

initMap();
mapInitialized = true;
