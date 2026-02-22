// override.js - Javelina Jundred
// Complete standalone JS (shared modules skipped via skipSharedJs)
// Multi-loop desert course with aid stations, photos, cutoff markers

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
    background: '#e8dcc8',
    earth: '#e8dcc8',
    park_a: '#d9ccb0',
    park_b: '#d9ccb0',
    wood_a: '#c8bb9a',
    wood_b: '#c8bb9a',
    scrub_a: '#d4c7a8',
    scrub_b: '#d4c7a8',
    water: '#80c4d6',
    sand: '#e0d4b0',
    beach: '#e0d4b0',
    glacier: '#edf3f8'
  }), { lang: 'en' }), [{
    id: 'hillshade', type: 'hillshade', source: 'hillshade-dem',
    paint: {
      'hillshade-exaggeration': 0.25,
      'hillshade-shadow-color': '#8a7a60',
      'hillshade-highlight-color': '#ffffff',
      'hillshade-accent-color': '#a08060'
    }
  }])
};

var map;
var trailsOn = false;
var photosOn = false;
var aidOn = false;
var terrain3D = false;
var photoMarkers = [];
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
// HELPER: getCoordAtDist (for placing aid stations / mile markers)
// ═══════════════════════════════════════════════════════════
function getCoordAtDist(targetMile, loopId) {
  var id = loopId || 'standard';
  var coords = LOOPS[id].geojson.geometry.coordinates;
  var dists = loopCoordDistances[id];
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
    center: [-111.74, 33.695],
    zoom: 12.2,
    pitch: 20,
    bearing: 0,
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
    // Hide basemap trail/path layers
    ['roads_other','roads_bridges_other','roads_bridges_other_casing',
     'roads_tunnels_other','roads_tunnels_other_casing','roads_labels_minor'
    ].forEach(function(id) { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none'); });

    // Terrain source for 3D toggle
    map.addSource('terrain-dem', {
      type: 'raster-dem',
      tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
      tileSize: 256, maxzoom: 15, encoding: 'terrarium'
    });

    // Add loops: loop1 (orange shared), escondido (blue extension), standard (orange)
    var loopOrder = ['loop1', 'escondido', 'standard'];
    for (var li = 0; li < loopOrder.length; li++) {
      var id = loopOrder[li];
      var loop = LOOPS[id];
      map.addSource(id, { type: 'geojson', data: loop.geojson });

      // Outer glow
      map.addLayer({
        id: id + '-glow',
        type: 'line',
        source: id,
        paint: {
          'line-color': loop.color,
          'line-width': 8,
          'line-opacity': 0.3
        }
      });
      // Dark core line
      map.addLayer({
        id: id + '-outline',
        type: 'line',
        source: id,
        paint: {
          'line-color': '#111',
          'line-width': 5,
          'line-opacity': 0.3
        }
      });
      // Colored line
      map.addLayer({
        id: id,
        type: 'line',
        source: id,
        paint: {
          'line-color': loop.color,
          'line-width': 3.5
        }
      });

      // Click popup
      (function(loopId, loopObj) {
        map.on('click', loopId, function(e) {
          new maplibregl.Popup({ offset: 12 }).setLngLat(e.lngLat).setHTML(
            '<strong style="color:' + loopObj.color + '">' + loopObj.label + '</strong><br>' +
            '<span style="color:#a0b4c0">' + loopObj.miles + ' mi \u00b7 ' + loopObj.gain + '\' gain</span>'
          ).addTo(map);
        });
        map.on('mouseenter', loopId, function() { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', loopId, function() { map.getCanvas().style.cursor = ''; });
      })(id, loop);
    }

    // Mile markers for the standard loop
    var mileFeatures = [];
    for (var m = 1; m <= Math.floor(LOOPS.standard.miles); m++) {
      var coord = getCoordAtDist(m, 'standard');
      mileFeatures.push({
        type: 'Feature',
        properties: { mile: m, label: String(m), priority: (m % 5 === 0) ? 1 : 2 },
        geometry: { type: 'Point', coordinates: coord }
      });
    }
    map.addSource('mile-markers', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: mileFeatures }
    });
    map.addLayer({
      id: 'mile-markers-circle',
      type: 'circle',
      source: 'mile-markers',
      paint: {
        'circle-radius': ['step', ['zoom'], 0, 12.5, ['case', ['==', ['get', 'priority'], 1], 7, 0], 13.5, 7],
        'circle-color': '#1a3a4a',
        'circle-stroke-color': '#FF8C00',
        'circle-stroke-width': 1.5
      }
    });
    map.addLayer({
      id: 'mile-markers-label',
      type: 'symbol',
      source: 'mile-markers',
      layout: {
        'text-field': ['get', 'label'],
        'text-font': ['Noto Sans Medium'],
        'text-size': 9,
        'text-allow-overlap': true
      },
      paint: {
        'text-color': '#fff',
        'text-opacity': ['step', ['zoom'], 0, 12.5, ['case', ['==', ['get', 'priority'], 1], 1, 0], 13.5, 1]
      }
    });

    // HQ marker
    var hqEl = document.createElement('div');
    hqEl.className = 'hq-marker';
    hqEl.innerHTML = '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="#FF8C00" stroke="#0d1b2a" stroke-width="2"/><text x="16" y="20" text-anchor="middle" font-size="11" font-weight="bold" fill="#0d1b2a">HQ</text></svg>';
    new maplibregl.Marker({ element: hqEl }).setLngLat(HQ).setPopup(
      new maplibregl.Popup({ offset: 15 }).setHTML(
        '<strong style="color:#FF8C00">Javelina Jeadquarters</strong><br>' +
        '<span style="color:#a0b4c0">Start/Finish \u00b7 Main Aid \u00b7 Crew Access</span><br>' +
        '<span style="font-size:0.7rem;color:#6b8899">Four Peaks Staging Area<br>16300 McDowell Mtn Park Dr</span>'
      )
    ).addTo(map);

    // Create aid station markers (hidden by default)
    AID_STATIONS.forEach(function(station) {
      var coord = getCoordAtDist(station.mile, 'standard');
      var el = document.createElement('div');
      el.className = 'aid-marker';
      el.innerHTML = '<svg viewBox="0 0 28 28"><circle cx="14" cy="14" r="11" fill="#00CED1" stroke="#0d1b2a" stroke-width="2"/><text x="14" y="18" text-anchor="middle" font-size="14" font-weight="bold" fill="#0d1b2a">+</text></svg>';
      var marker = new maplibregl.Marker({ element: el })
        .setLngLat(coord)
        .setPopup(new maplibregl.Popup({ offset: 15 }).setHTML(
          '<strong style="color:#00CED1">' + station.name + '</strong><br>' +
          '<span style="color:#a0b4c0">Mile ' + station.mile + '</span>' +
          '<br><span style="font-size:0.7rem;color:#6b8899">' + station.services + '</span>'
        ));
      aidMarkers.push(marker);
    });

    // Create photo markers (hidden by default)
    COURSE_PHOTOS.forEach(function(photo, i) {
      var el = document.createElement('div');
      el.className = 'photo-marker';
      el.innerHTML = '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="13" fill="#FDCF00" stroke="#0d1b2a" stroke-width="2"/><text x="16" y="21" text-anchor="middle" font-size="16" fill="#0d1b2a">\uD83D\uDCF7</text></svg>';
      var popupHtml = '<img class="photo-img" src="' + photo.url + '" alt="' + photo.name + '" loading="lazy"><div class="photo-caption"><strong>' + photo.name + '</strong><span>' + photo.caption + '</span></div>';
      var marker = new maplibregl.Marker({ element: el })
        .setLngLat(photo.coords)
        .setPopup(new maplibregl.Popup({ offset: 15, className: 'photo-popup', maxWidth: '340px' }).setHTML(popupHtml));
      photoMarkers.push(marker);
    });

    // Key location labels
    var locationLabels = [
      { name: 'Shallmo Wash', coords: [-111.712, 33.677] },
      { name: 'Pemberton Wash', coords: [-111.715, 33.670] },
      { name: 'Tonto Tank Trail', coords: [-111.733, 33.672] },
      { name: 'Granite Tank', coords: [-111.775, 33.717] },
      { name: 'Escondido Trail', coords: [-111.695, 33.693] },
      { name: 'Cinch Trail', coords: [-111.708, 33.698] },
      { name: 'North Road', coords: [-111.718, 33.710] }
    ];
    map.addSource('location-labels', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: locationLabels.map(function(loc) {
          return {
            type: 'Feature',
            properties: { name: loc.name },
            geometry: { type: 'Point', coordinates: loc.coords }
          };
        })
      }
    });
    map.addLayer({
      id: 'location-labels',
      type: 'symbol',
      source: 'location-labels',
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Medium'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 12, 10, 15, 13, 20, 16],
        'text-offset': [0, 1.2],
        'text-anchor': 'top',
        'text-allow-overlap': false,
        'text-padding': 5
      },
      paint: {
        'text-color': '#5a4a30',
        'text-halo-color': '#f0e8d8',
        'text-halo-width': 1.5,
        'text-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0, 13, 1]
      },
      minzoom: 12.5
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
    map.setLayoutProperty(id + '-glow', 'visibility', v);
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
      map.setLayoutProperty(id + '-glow', 'visibility', show ? 'visible' : 'none');
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
    segments.push({ pts: pts, color: loop.color });
    offset += maxD;
  }

  document.getElementById('profileTitle').textContent = 'Elevation \u2014 ' + title;
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
  var pad = 30, eMin = minE - pad, eMax = maxE + pad;
  var xS = function(d) { return ml + (d / totalD) * cw; };
  var yS = function(e) { return mt + ch - ((e - eMin) / (eMax - eMin)) * ch; };

  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
  for (var e = Math.ceil(eMin / 200) * 200; e <= eMax; e += 200) {
    var y = yS(e);
    ctx.beginPath(); ctx.moveTo(ml, y); ctx.lineTo(W - mr, y); ctx.stroke();
    ctx.fillStyle = '#6b8899'; ctx.font = '9px Lato,sans-serif'; ctx.textAlign = 'right';
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

// ═══════════════════════════════════════════════════════════
// TRAIL + FEATURE TOGGLES
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
          'line-color': '#a08060',
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2, 15, 4, 20, 7],
          'line-dasharray': [2, 3],
          'line-opacity': 0.7
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
          'text-size': ['interpolate', ['linear'], ['zoom'], 13, 9, 16, 13, 20, 16],
          'text-font': ['Noto Sans Medium'],
          'text-max-angle': 30,
          'text-padding': 10,
          'text-offset': [0, -1.2]
        },
        paint: {
          'text-color': '#5a4a30',
          'text-halo-color': '#f0e8d8',
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

function togglePhotos() {
  photosOn = !photosOn;
  document.getElementById('photosBtn').classList.toggle('active', photosOn);
  photoMarkers.forEach(function(m) {
    if (photosOn) m.addTo(map);
    else m.remove();
  });
}

function toggleAidStations() {
  aidOn = !aidOn;
  document.getElementById('aidBtn').classList.toggle('active', aidOn);
  aidMarkers.forEach(function(m) {
    if (aidOn) m.addTo(map);
    else m.remove();
  });
}

function toggle3D() {
  terrain3D = !terrain3D;
  document.getElementById('terrainBtn').classList.toggle('active', terrain3D);
  if (!map) return;
  if (terrain3D) {
    map.setTerrain({ source: 'terrain-dem', exaggeration: 1.5 });
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
var simRace = RACES['100m'];
var simProgress = 0;
var simPlaying = false;
var simSpeed = 1;
var simFinishHours = 30;
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

  var track = document.getElementById('scrubTrack');
  var scrubbing = false;
  var scrubTo = function(e) {
    var rect = track.getBoundingClientRect();
    var clientX = e.touches ? e.touches[0].clientX : e.clientX;
    simProgress = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    renderSim();
  };
  track.addEventListener('mousedown', function(e) { scrubbing = true; simPlaying = false; document.getElementById('playBtn').innerHTML = '\u25B6'; scrubTo(e); });
  window.addEventListener('mousemove', function(e) { if (scrubbing) scrubTo(e); });
  window.addEventListener('mouseup', function() { scrubbing = false; });
  track.addEventListener('touchstart', function(e) { scrubbing = true; simPlaying = false; document.getElementById('playBtn').innerHTML = '\u25B6'; scrubTo(e); }, { passive: true });
  window.addEventListener('touchmove', function(e) { if (scrubbing) scrubTo(e); }, { passive: true });
  window.addEventListener('touchend', function() { scrubbing = false; });
}

function buildSimRaces() {
  var html = '';
  var defaultRace = '100m';
  for (var id in RACES) {
    if (id === 'all') continue;
    html += '<button class="sim-race-btn' + (id === defaultRace ? ' active' : '') + '" data-race="' + id + '" onclick="pickSimRace(\'' + id + '\')">' + RACES[id].name + '</button>';
  }
  document.getElementById('simRaces').innerHTML = html;
}

function pickSimRace(id) {
  simRace = RACES[id];
  simProgress = 0;
  simPlaying = false;
  simFinishHours = simRace.hours;
  document.getElementById('playBtn').innerHTML = '\u25B6';
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
}

function buildSimScrubber() {
  var segsHtml = '', hqHtml = '', cumDist = 0;
  for (var i = 0; i < simRace.loops.length; i++) {
    var id = simRace.loops[i];
    var loop = LOOPS[id];
    var loopDist = loop.profile[loop.profile.length - 1].d;
    var pct = (loopDist / simTotalDist) * 100;
    segsHtml += '<div class="scrub-seg" style="width:' + pct + '%;background:' + loop.color + ';opacity:0.3"></div>';
    if (i < simRace.loops.length - 1) {
      cumDist += loopDist;
      hqHtml += '<div class="hq-tick" style="left:' + ((cumDist / simTotalDist) * 100) + '%"></div>';
    }
  }
  // Add cutoff marker on scrubber
  if (typeof CUTOFFS !== 'undefined') {
    for (var ci = 0; ci < CUTOFFS.length; ci++) {
      var cutoffPct = (CUTOFFS[ci].mile / simTotalDist) * 100;
      if (cutoffPct <= 100) {
        hqHtml += '<div class="cutoff-tick" style="left:' + cutoffPct + '%"></div>';
        hqHtml += '<div class="cutoff-label" style="left:' + cutoffPct + '%">' + CUTOFFS[ci].time + '</div>';
      }
    }
  }
  document.getElementById('scrubSegs').innerHTML = segsHtml;
  document.getElementById('scrubHQ').innerHTML = hqHtml;
}

function togglePlay() {
  simPlaying = !simPlaying;
  document.getElementById('playBtn').innerHTML = simPlaying ? '\u23F8' : '\u25B6';
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
  if (simProgress >= 1) { simPlaying = false; document.getElementById('playBtn').innerHTML = '\u25B6'; return; }
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

  // Clock: race starts at 6 AM Saturday
  var elapsed = (dist / simRace.miles) * simFinishHours;
  var tod = 6 + elapsed;
  var dayLabel = tod >= 24 ? ' Sun' : ' Sat';
  var todNorm = tod % 24;
  var hrs = Math.floor(todNorm);
  var mins = Math.floor((todNorm % 1) * 60);
  var ampm = hrs >= 12 ? 'PM' : 'AM';
  var dispHrs = hrs > 12 ? hrs - 12 : (hrs === 0 ? 12 : hrs);
  document.getElementById('clockTime').textContent = dispHrs + ':' + String(mins).padStart(2, '0') + ' ' + ampm + dayLabel;

  var finishTod = 6 + simFinishHours;
  var finishDayLabel = finishTod >= 24 ? ' Sun' : ' Sat';
  var finishTodNorm = finishTod % 24;
  var finishHrs = Math.floor(finishTodNorm);
  var finishMins = Math.round((finishTodNorm % 1) * 60);
  var finishAmpm = finishHrs >= 12 ? 'PM' : 'AM';
  var finishDispHrs = finishHrs > 12 ? finishHrs - 12 : (finishHrs === 0 ? 12 : finishHrs);
  document.getElementById('finishTime').textContent = finishDispHrs + ':' + String(finishMins).padStart(2, '0') + ' ' + finishAmpm + finishDayLabel;

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
    // Count which "actual loop" we're on (loop1+escondido = Loop 1, each standard = Loop 2,3,4,5)
    var loopLabel;
    if (id === 'loop1') { loopLabel = 'Loop 1'; }
    else if (id === 'escondido') { loopLabel = 'Escondido Ext.'; }
    else {
      var stdCount = 1;
      for (var si = 0; si < i; si++) { if (simRace.loops[si] === 'standard') stdCount++; }
      loopLabel = 'Loop ' + (stdCount + 1);
    }
    html += '<div class="loop-row' + (isCurrent ? ' current' : '') + '"><span class="lname">' + loopLabel + ' <span class="ldot" style="background:' + LOOPS[id].color + '"></span></span>' + status + '</div>';
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

  var bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, '#0a1520');
  bgGrad.addColorStop(1, '#0f1a28');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Bounding box across all loop coords
  var minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  var loopIds = ['loop1', 'escondido', 'standard'];
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

  // Draw dim background trace for each loop
  var usedLoops = {};
  for (var i = 0; i < simRace.loops.length; i++) usedLoops[simRace.loops[i]] = true;

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
    var r = parseInt(color.slice(1, 3), 16), g = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16);
    ctx.strokeStyle = 'rgba(' + r + ',' + g + ',' + b + ',0.35)';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  // Draw completed portions
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
      ctx.beginPath();
      for (var i = 0; i < coords.length; i++) {
        var x = toX(coords[i][0]);
        var y = toY(coords[i][1]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    } else if (currentDist > loopStart) {
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
        ctx.strokeStyle = color;
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
  ctx.fillStyle = '#FF8C00';
  ctx.fill();
  ctx.strokeStyle = '#0d1b2a';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#0d1b2a';
  ctx.font = 'bold 7px Lato, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('HQ', sx, sy + 0.5);

  // Mile markers
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
      ctx.fillStyle = 'rgba(10,21,32,0.85)';
      ctx.fill();
      ctx.strokeStyle = c.priority === 1 ? 'rgba(255,140,0,0.5)' : 'rgba(255,255,255,0.2)';
      ctx.lineWidth = c.priority === 1 ? 1.5 : 1;
      ctx.stroke();
      ctx.fillStyle = c.priority === 1 ? '#FF8C00' : 'rgba(255,255,255,0.6)';
      ctx.font = (c.priority === 1 ? '700 ' : '600 ') + markerFont + 'px Lato, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(c.mile, c.x, c.y);
      placed.push(c);
    }
  }

  // Cutoff marker on course map
  if (typeof CUTOFFS !== 'undefined') {
    for (var ci = 0; ci < CUTOFFS.length; ci++) {
      if (CUTOFFS[ci].mile <= simTotalDist) {
        var cc = getSimCoordAtDist(CUTOFFS[ci].mile);
        var cx = toX(cc.coord[0]);
        var cy = toY(cc.coord[1]);
        // Flag icon
        ctx.beginPath();
        ctx.moveTo(cx, cy - 8);
        ctx.lineTo(cx + 8, cy - 5);
        ctx.lineTo(cx, cy - 2);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,59,48,0.8)';
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(cx, cy - 8);
        ctx.lineTo(cx, cy + 4);
        ctx.strokeStyle = '#ff3b30';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
  }

  // Runner dot with glow
  var rx = toX(runner.coord[0]);
  var ry = toY(runner.coord[1]);
  var loopColor = LOOPS[runner.loopId].color;
  var glowColor = parseInt(loopColor.slice(1, 3), 16) + ',' + parseInt(loopColor.slice(3, 5), 16) + ',' + parseInt(loopColor.slice(5, 7), 16);

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
  ctx.strokeStyle = loopColor;
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

  var windowMiles = Math.min(simTotalDist, Math.max(8, simTotalDist * 0.3));
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

  // Sky gradient (desert sunset tones)
  var elapsed = (currentDist / simRace.miles) * simFinishHours;
  var tod = 6 + elapsed;
  var todNorm = tod % 24;
  var skyTop, skyBot;
  if (todNorm < 6) { skyTop = '#0a1520'; skyBot = '#152535'; }
  else if (todNorm < 8) { skyTop = '#1a2a40'; skyBot = '#3a3050'; }
  else if (todNorm < 17) { skyTop = '#2a3545'; skyBot = '#4a5565'; }
  else if (todNorm < 20) { skyTop = '#3a2a40'; skyBot = '#5a3a50'; }
  else { skyTop = '#0a1520'; skyBot = '#152535'; }

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

    segStart = segEnd + 1;
  }

  // Cutoff line on terrain
  if (typeof CUTOFFS !== 'undefined') {
    for (var ci = 0; ci < CUTOFFS.length; ci++) {
      var cmile = CUTOFFS[ci].mile;
      if (cmile >= actualStart && cmile <= actualStart + windowMiles) {
        var cx = xScale(cmile);
        ctx.beginPath();
        ctx.moveTo(cx, 0);
        ctx.lineTo(cx, H);
        ctx.strokeStyle = 'rgba(255,59,48,0.5)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
        // Pill label
        ctx.fillStyle = 'rgba(255,59,48,0.8)';
        var pillW = 50, pillH = 14;
        ctx.beginPath();
        ctx.roundRect(cx - pillW / 2, 2, pillW, pillH, 4);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = '600 8px Lato, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Cutoff ' + CUTOFFS[ci].time, cx, 9);
      }
    }
  }

  // Dim behind runner
  if (currentDist > actualStart) {
    ctx.fillStyle = 'rgba(10,21,32,0.4)';
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
