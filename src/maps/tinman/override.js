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

var map;
var aidOn = false;
var terrain3D = false;
var aidMarkers = [];

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

// ═══════════════════════════════════════════════════════════
// MAP VIEW
// ═══════════════════════════════════════════════════════════
function initMap() {
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

  map.addControl(new maplibregl.AttributionControl({ compact: true }));
  map.once('load', function() {
    var attrib = document.querySelector('.maplibregl-ctrl-attrib');
    if (attrib) { attrib.removeAttribute('open'); attrib.classList.remove('maplibregl-compact-show'); }
  });

  map.addControl(new maplibregl.NavigationControl(), 'top-right');

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
      map.addSource(id, { type: 'geojson', data: loop.geojson });

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
        paint: { 'line-color': '#111', 'line-width': 4 },
        layout: { 'line-cap': 'round', 'line-join': 'round' }
      });

      map.addLayer({
        id: id,
        type: 'line',
        source: id,
        paint: { 'line-color': loop.color, 'line-width': 2.5 },
        layout: { 'line-cap': 'round', 'line-join': 'round' }
      });

      (function(loopId, loopObj) {
        map.on('click', loopId, function(e) {
          var t = e.originalEvent && e.originalEvent.target;
          if (t && t.closest && t.closest('.aid-marker, .hq-marker, .mile-marker')) return;
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

    var el = document.createElement('div');
    el.className = 'hq-marker';
    setHtml(el, '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="#F5C518" stroke="#1a1a1a" stroke-width="2"/><text x="16" y="20" text-anchor="middle" font-size="11" font-weight="bold" fill="#1a1a1a">T2</text></svg>');
    new maplibregl.Marker({ element: el }).setLngLat(HQ).setPopup(
      new maplibregl.Popup({ offset: 15 }).setHTML(
        '<strong style="color:#1a1a1a">Bike Finish / Run Start (T2)</strong><br>' +
        '<span style="color:#666">Tinman Beach · Tupper Lake</span>'
      )
    ).addTo(map);

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

    drawProfile('tinman');
    buildCards();
    document.querySelectorAll('.race-card').forEach(function(c) { c.classList.toggle('active', c.dataset.race === 'tinman'); });
  });
}

// ═══════════════════════════════════════════════════════════
// MILE MARKERS
// ═══════════════════════════════════════════════════════════
function addMileMarkers() {
  var loopIds = ['tinman', 'olympic', 'sprint'];
  loopIds.forEach(function(id) {
    var loop = LOOPS[id];
    var totalMi = loop.run;
    var features = [];
    for (var m = 1; m <= Math.floor(totalMi); m++) {
      features.push({
        type: 'Feature',
        properties: { mile: m, label: String(m), priority: (m % 5 === 0) ? 1 : 2 },
        geometry: { type: 'Point', coordinates: getCoordAtDist(m, id) }
      });
    }
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
      filter: ['step', ['zoom'], ['==', ['get', 'priority'], 1], 13.5, ['>=', ['get', 'priority'], 1]]
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
      filter: ['step', ['zoom'], ['==', ['get', 'priority'], 1], 13.5, ['>=', ['get', 'priority'], 1]]
    });
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
    map.setLayoutProperty(id + '-dark', 'visibility', v);
    map.setLayoutProperty(id + '-casing', 'visibility', v);
    if (map.getLayer(id + '-miles-circle')) map.setLayoutProperty(id + '-miles-circle', 'visibility', v);
    if (map.getLayer(id + '-miles-label')) map.setLayoutProperty(id + '-miles-label', 'visibility', v);
  }
  drawProfileFromVisible();
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
  for (var id in LOOPS) {
    var show = (race.loops.indexOf(id) >= 0);
    LOOPS[id].visible = show;
    document.querySelector('[data-loop="' + id + '"]').classList.toggle('active', show);
    if (map && map.getLayer(id)) {
      var vis = show ? 'visible' : 'none';
      map.setLayoutProperty(id, 'visibility', vis);
      map.setLayoutProperty(id + '-dark', 'visibility', vis);
      map.setLayoutProperty(id + '-casing', 'visibility', vis);
      if (map.getLayer(id + '-miles-circle')) map.setLayoutProperty(id + '-miles-circle', 'visibility', vis);
      if (map.getLayer(id + '-miles-label')) map.setLayoutProperty(id + '-miles-label', 'visibility', vis);
    }
  }
  drawProfile(raceId);
  document.querySelectorAll('.race-card').forEach(function(c) { c.classList.toggle('active', c.dataset.race === raceId); });
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
}

// ═══════════════════════════════════════════════════════════
// AID + 3D TOGGLES
// ═══════════════════════════════════════════════════════════
function toggleAid() {
  aidOn = !aidOn;
  getEl('aidBtn').classList.toggle('active', aidOn);
  aidMarkers.forEach(function(a) { a.element.style.display = aidOn ? 'block' : 'none'; });
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
