// pocket-map.js - Offline Pocket Map generator
// Requires: CONFIG, map (MapLibre instance), coordDistances, eleProfile, getCoordAtDist
// Generates a self-contained HTML file the runner can save and open offline.

// --- Modal open/close ---

function openPocketModal() {
  updatePocketSizeEstimate();
  document.getElementById('pocketBackdrop').classList.add('open');
}

function closePocketModal() {
  document.getElementById('pocketBackdrop').classList.remove('open');
  document.getElementById('pocketStatus').textContent = '';
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closePocketModal();
});

function updatePocketSizeEstimate() {
  var base = 380; // KB: map snapshot (PNG) + aid cards + cue sheet + CSS
  if (document.getElementById('pocketIncludeSim') && document.getElementById('pocketIncludeSim').checked) base += 45;
  if (document.getElementById('pocketIncludeElevation') && document.getElementById('pocketIncludeElevation').checked) base += 10;
  var el = document.getElementById('pocketSizeEstimate');
  if (el) el.textContent = '~' + base + ' KB';
}

// --- Main generation entry point ---

function generatePocketMap() {
  if (!CONFIG || !CONFIG.courseCoords) {
    document.getElementById('pocketStatus').textContent = 'Pocket map not available for this map type.';
    return;
  }

  var btn = document.getElementById('pocketDownloadBtn');
  var status = document.getElementById('pocketStatus');
  btn.disabled = true;
  btn.textContent = 'Generating\u2026';
  status.textContent = 'Resetting map view\u2026';

  // Compute geo bounds from course coords (used for GPS projection)
  var geoBounds = computeCourseBounds();

  // Try to capture a map snapshot; fall back gracefully if map/WebGL unavailable
  try {
    if (!map || !map.getCanvas) { throw new Error('Map not ready'); }
    // Reset to a clean 2D view so the snapshot is useful for GPS projection
    map.setPitch(0);
    map.setBearing(0);

    // Fit to course bounds (same as initial load)
    var bounds = new maplibregl.LngLatBounds();
    CONFIG.courseCoords.forEach(function(c) { bounds.extend(c); });
    map.fitBounds(bounds, { padding: 40, duration: 0 });

    // Give fitBounds a moment to settle, then capture
    setTimeout(function() {
      status.textContent = 'Capturing map snapshot\u2026';

      // Set a timeout in case the render event never fires (e.g. headless/no WebGL)
      var captureTimeout = setTimeout(function() {
        assemblePocketMap(null, geoBounds, btn, status);
      }, 5000);

      map.once('render', function() {
        clearTimeout(captureTimeout);
        try {
          var snapshot = map.getCanvas().toDataURL('image/png');
          // Capture actual rendered bounds (may differ from computed bounds due to aspect ratio)
          var renderedBounds = map.getBounds();
          var renderedGeoBounds = {
            minLng: renderedBounds.getWest(),
            maxLng: renderedBounds.getEast(),
            minLat: renderedBounds.getSouth(),
            maxLat: renderedBounds.getNorth()
          };
          // Validate: a blank PNG is ~1.5 KB; anything real is larger
          if (snapshot.length >= 5000) {
            assemblePocketMap(snapshot, renderedGeoBounds, btn, status);
          } else {
            assemblePocketMap(null, geoBounds, btn, status);
          }
        } catch (err) {
          assemblePocketMap(null, geoBounds, btn, status);
        }
      });
      map.triggerRepaint();
    }, 350);
  } catch (e) {
    // Map not available — generate pocket map without a snapshot
    assemblePocketMap(null, geoBounds, btn, status);
  }
}

function computeCourseBounds() {
  var minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  CONFIG.courseCoords.forEach(function(c) {
    if (c[0] < minLng) minLng = c[0];
    if (c[0] > maxLng) maxLng = c[0];
    if (c[1] < minLat) minLat = c[1];
    if (c[1] > maxLat) maxLat = c[1];
  });
  return { minLng: minLng, maxLng: maxLng, minLat: minLat, maxLat: maxLat };
}

function assemblePocketMap(snapshot, geoBounds, btn, status) {
  try {
    status.textContent = 'Assembling pocket map\u2026';

    var options = {
      snapshot: snapshot,
      geoBounds: geoBounds,
      includeSim: document.getElementById('pocketIncludeSim') ? document.getElementById('pocketIncludeSim').checked : true,
      includeElevation: document.getElementById('pocketIncludeElevation') ? document.getElementById('pocketIncludeElevation').checked : true,
      includeGPS: document.getElementById('pocketIncludeGPS') ? document.getElementById('pocketIncludeGPS').checked : true
    };

    var html = buildPocketHTML(options);
    triggerPocketDownload(html);

    status.textContent = 'Download started!';
    btn.textContent = 'Download Pocket Map';
    btn.disabled = false;
    setTimeout(function() {
      status.textContent = '';
    }, 3000);
  } catch (err) {
    status.textContent = 'Error: ' + err.message;
    btn.textContent = 'Download Pocket Map';
    btn.disabled = false;
  }
}

// --- Aid station card HTML ---

function buildPocketAidCards() {
  if (!CONFIG.aidStations || CONFIG.aidStations.length === 0) {
    return '<p style="color:#888;font-size:0.85rem;padding:8px 0;">No aid station data available.</p>';
  }
  return CONFIG.aidStations.map(function(s) {
    return '<div class="pm-aid-card">' +
      '<div class="pm-aid-top">' +
        '<span class="pm-aid-name">' + escHtml(s.name) + '</span>' +
        '<span class="pm-aid-mile">Mile ' + s.mile + '</span>' +
      '</div>' +
      (s.services ? '<div class="pm-aid-services">' + escHtml(s.services) + '</div>' : '') +
      '</div>';
  }).join('');
}

// --- Trail cue sheet HTML ---

function buildPocketCueSheet() {
  if (!CONFIG.trailsData || !CONFIG.trailsData.features || CONFIG.trailsData.features.length === 0) {
    return '<p style="color:#888;font-size:0.85rem;padding:8px 0;">No trail data available.</p>';
  }

  var blazeColors = {
    'white': '#e8e8e8', 'blue': '#2196F3', 'yellow': '#FFD700',
    'orange': '#FF9800', 'green': '#4CAF50', 'red': '#f44336',
    'violet': '#9C27B0', 'purple': '#9C27B0', 'teal': '#009688'
  };

  var segments = [];
  CONFIG.trailsData.features.forEach(function(feature) {
    var name = (feature.properties && feature.properties.name) ? feature.properties.name : 'Trail';
    var blaze = (feature.properties && feature.properties.blaze) ? feature.properties.blaze : null;
    var color = blazeColors[blaze] || '#9E9E9E';

    // Find nearest course coordinate to get approximate start mile
    var geom = feature.geometry;
    var startCoord = (geom && geom.coordinates && geom.coordinates.length > 0)
      ? (geom.type === 'LineString' ? geom.coordinates[0] : geom.coordinates)
      : null;

    var mile = 0;
    if (startCoord && coordDistances && CONFIG.courseCoords) {
      var bestIdx = 0;
      var bestDist = Infinity;
      for (var i = 0; i < CONFIG.courseCoords.length; i++) {
        var dx = CONFIG.courseCoords[i][0] - startCoord[0];
        var dy = CONFIG.courseCoords[i][1] - startCoord[1];
        var d = dx * dx + dy * dy;
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
      mile = coordDistances[bestIdx] || 0;
    }

    segments.push({ name: name, blaze: blaze, color: color, mile: mile });
  });

  // Sort by mile, deduplicate consecutive same-name segments
  segments.sort(function(a, b) { return a.mile - b.mile; });
  var deduped = [];
  for (var i = 0; i < segments.length; i++) {
    if (i === 0 || segments[i].name !== segments[i - 1].name) {
      deduped.push(segments[i]);
    }
  }

  return '<div class="pm-cue-list">' + deduped.map(function(seg) {
    var borderStyle = seg.blaze === 'white' ? 'border:1px solid #ccc;' : '';
    return '<div class="pm-cue-row">' +
      '<span class="pm-cue-mile">' + seg.mile.toFixed(1) + '</span>' +
      '<span class="pm-blaze" style="background:' + seg.color + ';' + borderStyle + '"></span>' +
      '<span class="pm-cue-name">' + escHtml(seg.name) + '</span>' +
      '</div>';
  }).join('') + '</div>';
}

// --- Escape HTML helper ---

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// --- Downsample coordinates (keeps file size manageable for long courses) ---

function downsampleCoords(coords, maxPoints) {
  if (coords.length <= maxPoints) return coords;
  var step = Math.ceil(coords.length / maxPoints);
  var result = [];
  for (var i = 0; i < coords.length; i += step) {
    result.push(coords[i]);
  }
  var last = coords[coords.length - 1];
  if (result[result.length - 1] !== last) result.push(last);
  return result;
}

// --- Build the coord-helpers IIFE source string for embedding in pocket HTML ---
// (We reconstruct the IIFE since the original already ran; named fns use .toString())

function buildPocketCoordHelpersSource(pocketConfig) {
  // The IIFE that builds coordDistances + eleProfile must run again in the pocket page
  var iife = [
    'var coordDistances = [0];',
    '(function() {',
    '  var c = CONFIG.courseCoords;',
    '  for (var i = 1; i < c.length; i++) {',
    '    var x1=c[i-1][0], y1=c[i-1][1], x2=c[i][0], y2=c[i][1];',
    '    var dLng = (x2-x1)*Math.cos((y1+y2)/2*Math.PI/180)*69.172;',
    '    var dLat = (y2-y1)*69.172;',
    '    coordDistances.push(coordDistances[i-1]+Math.sqrt(dLng*dLng+dLat*dLat));',
    '  }',
    '  var normMiles = CONFIG.loopMiles || CONFIG.totalMiles;',
    '  var rawTotal = coordDistances[coordDistances.length-1];',
    '  for (var i = 0; i < coordDistances.length; i++) {',
    '    coordDistances[i] = (coordDistances[i]/rawTotal)*normMiles;',
    '  }',
    '})();',
    '',
    'var eleProfile = CONFIG.elevations.map(function(e, i) {',
    '  var normMiles = CONFIG.loopMiles || CONFIG.totalMiles;',
    '  return { d: (i/(CONFIG.elevations.length-1))*normMiles, e: e*3.28084 };',
    '});',
  ].join('\n');

  // Named helper functions — use .toString() to embed source directly
  var helpers = [
    loopDist.toString(),
    getEleAtDist.toString(),
    getGradeAtDist.toString(),
    getGainAtDist.toString(),
    getCoordAtDist.toString(),
  ].join('\n\n');

  return iife + '\n\n' + helpers;
}

// --- Build simulator JS source for embedding ---

function buildPocketSimulatorSource() {
  // Sim engine globals + scrubber/play/pause (adapted for pm- prefixed element IDs)
  var engine = [
    'var TOTAL_MILES = CONFIG.totalMiles;',
    'var TOTAL_GAIN = CONFIG.totalGain;',
    'var RACE_START_HOUR = CONFIG.raceStartHour;',
    'var simProgress = 0;',
    'var simPlaying = false;',
    'var simSpeed = 1;',
    'var simFinishHours = CONFIG.defaultGoalHours + CONFIG.defaultGoalMins / 60;',
    'var simLastTick = 0;',
    'var raceLaps = 1;',
    '',
    'function pmUpdateGoalPace() {',
    '  var totalMins = simFinishHours * 60;',
    '  var paceMin = totalMins / TOTAL_MILES;',
    '  var pm2 = Math.floor(paceMin);',
    '  var ps = Math.round((paceMin - pm2) * 60);',
    '  var el = document.getElementById("pmGoalPace");',
    '  if (el) el.innerHTML = "Avg pace: <strong>" + pm2 + ":" + String(ps).padStart(2,"0") + " /mi</strong>";',
    '}',
    '',
    'function pmUpdateGoalTime() {',
    '  var h = parseInt(document.getElementById("pmGoalHrs").value) || 0;',
    '  var m = parseInt(document.getElementById("pmGoalMins").value) || 0;',
    '  simFinishHours = h + m / 60;',
    '  if (simFinishHours < 0.1) simFinishHours = 0.1;',
    '  pmUpdateGoalPace();',
    '  pmRenderSim();',
    '}',
    '',
    'function pmTogglePlay() {',
    '  simPlaying = !simPlaying;',
    '  document.getElementById("pmPlayBtn").innerHTML = simPlaying ? "&#9208;" : "&#9654;";',
    '  if (simPlaying) {',
    '    if (simProgress >= 0.999) simProgress = 0;',
    '    simLastTick = performance.now();',
    '    pmSimTick();',
    '  }',
    '}',
    '',
    'function pmSetSpeed(s, btn) {',
    '  simSpeed = s;',
    '  document.querySelectorAll(".pm-speed-btn").forEach(function(b) { b.classList.remove("active"); });',
    '  btn.classList.add("active");',
    '}',
    '',
    'function pmSimTick() {',
    '  if (!simPlaying) return;',
    '  var now = performance.now();',
    '  var dt = (now - simLastTick) / 1000;',
    '  simLastTick = now;',
    '  simProgress = Math.min(1, simProgress + (1/30) * simSpeed * dt);',
    '  pmRenderSim();',
    '  if (simProgress >= 1) {',
    '    simPlaying = false;',
    '    document.getElementById("pmPlayBtn").innerHTML = "&#9654;";',
    '    return;',
    '  }',
    '  requestAnimationFrame(pmSimTick);',
    '}',
    '',
    'function pmInitSim() {',
    '  pmUpdateGoalPace();',
    '  var track = document.getElementById("pmScrubTrack");',
    '  if (!track) return;',
    '  var scrubbing = false;',
    '  var scrubTo = function(e) {',
    '    var rect = track.getBoundingClientRect();',
    '    var clientX = e.touches ? e.touches[0].clientX : e.clientX;',
    '    simProgress = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));',
    '    pmRenderSim();',
    '  };',
    '  track.addEventListener("mousedown", function(e) { scrubbing=true; simPlaying=false; document.getElementById("pmPlayBtn").innerHTML="&#9654;"; scrubTo(e); });',
    '  window.addEventListener("mousemove", function(e) { if (scrubbing) scrubTo(e); });',
    '  window.addEventListener("mouseup", function() { scrubbing=false; });',
    '  track.addEventListener("touchstart", function(e) { scrubbing=true; simPlaying=false; document.getElementById("pmPlayBtn").innerHTML="&#9654;"; scrubTo(e); }, {passive:true});',
    '  window.addEventListener("touchmove", function(e) { if (scrubbing) scrubTo(e); }, {passive:true});',
    '  window.addEventListener("touchend", function() { scrubbing=false; });',
    '}',
  ].join('\n');

  // pmRenderSim — adapted from renderSim() for pm- element IDs
  var renderSimFn = [
    'function pmRenderSim() {',
    '  var dist = simProgress * TOTAL_MILES;',
    '  var ele = getEleAtDist(dist);',
    '  var grade = getGradeAtDist(dist);',
    '  var gain = getGainAtDist(dist);',
    '  var fill = document.getElementById("pmScrubFill");',
    '  var handle = document.getElementById("pmScrubHandle");',
    '  if (fill) fill.style.width = (simProgress*100)+"%";',
    '  if (handle) handle.style.left = (simProgress*100)+"%";',
    '  var el;',
    '  el = document.getElementById("pmRunnerDist"); if (el) el.textContent = "Mile "+dist.toFixed(1);',
    '  var gradeDir = grade > 2 ? "Climbing" : grade < -2 ? "Descending" : "Rolling";',
    '  el = document.getElementById("pmRunnerMeta"); if (el) el.textContent = Math.round(ele).toLocaleString()+" ft \u00b7 "+gradeDir;',
    '  var elapsed = (dist/TOTAL_MILES)*simFinishHours;',
    '  var tod = RACE_START_HOUR + elapsed;',
    '  var hrs = Math.floor(tod)%24;',
    '  var mins2 = Math.floor((tod%1)*60);',
    '  var ampm = hrs>=12?"PM":"AM";',
    '  var dispHrs = hrs>12?hrs-12:(hrs===0?12:hrs);',
    '  el = document.getElementById("pmClockTime"); if (el) el.textContent = dispHrs+":"+String(mins2).padStart(2,"0")+" "+ampm;',
    '  var finishTod = RACE_START_HOUR + simFinishHours;',
    '  var finishHrs = Math.floor(finishTod)%24;',
    '  var finishMins = Math.round((finishTod%1)*60);',
    '  var finishAmpm = finishHrs>=12?"PM":"AM";',
    '  var finishDispHrs = finishHrs>12?finishHrs-12:(finishHrs===0?12:finishHrs);',
    '  el = document.getElementById("pmFinishTime"); if (el) el.textContent = finishDispHrs+":"+String(finishMins).padStart(2,"0")+" "+finishAmpm;',
    '  el = document.getElementById("pmStatDist"); if (el) el.textContent = dist.toFixed(1);',
    '  el = document.getElementById("pmStatEle"); if (el) el.textContent = Math.round(ele).toLocaleString();',
    '  el = document.getElementById("pmStatGain"); if (el) el.textContent = Math.round(gain).toLocaleString();',
    '  el = document.getElementById("pmStatGrade"); if (el) el.textContent = (grade>0?"+":"")+grade.toFixed(0)+"%";',
    '  el = document.getElementById("pmStatPct"); if (el) el.textContent = Math.round(simProgress*100)+"%";',
    '  var totalMins2 = simFinishHours*60;',
    '  var paceMin2 = totalMins2/TOTAL_MILES;',
    '  var pm3 = Math.floor(paceMin2);',
    '  var ps2 = Math.round((paceMin2-pm3)*60);',
    '  el = document.getElementById("pmStatPace"); if (el) el.textContent = pm3+":"+String(ps2).padStart(2,"0");',
    '  pmRenderCourseMap(dist);',
    '  pmRenderSimProfile(dist, ele);',
    '}',
  ].join('\n');

  // pmRenderCourseMap and pmRenderSimProfile — adapted with pm- canvas IDs
  // We use .toString() on the originals and patch element IDs
  var courseMapSrc = renderCourseMap.toString()
    .replace('function renderCourseMap(', 'function pmRenderCourseMap(')
    .replace("document.getElementById('courseMapCanvas')", "document.getElementById('pmCourseMapCanvas')");

  var simProfileSrc = renderSimProfile.toString()
    .replace('function renderSimProfile(', 'function pmRenderSimProfile(')
    .replace("document.getElementById('simProfileCanvas')", "document.getElementById('pmSimProfileCanvas')");

  return engine + '\n\n' + renderSimFn + '\n\n' + courseMapSrc + '\n\n' + simProfileSrc;
}

// --- Build elevation profile JS source ---

function buildPocketElevationSource() {
  return drawElevationProfile.toString()
    .replace('function drawElevationProfile()', 'function pmDrawElevationProfile()')
    .replace("document.getElementById('profileCanvas')", "document.getElementById('pmProfileCanvas')");
}

// --- Build GPS tracking JS ---

function buildPocketGPSSource(geoBounds) {
  var boundsJson = JSON.stringify(geoBounds);
  return [
    'var PM_GEO_BOUNDS = ' + boundsJson + ';',
    'var pmGpsWatchId = null;',
    'var pmGpsActive = false;',
    '',
    'function pmToggleGPS() {',
    '  if (pmGpsActive) {',
    '    if (pmGpsWatchId !== null) navigator.geolocation.clearWatch(pmGpsWatchId);',
    '    pmGpsActive = false;',
    '    pmGpsWatchId = null;',
    '    var dot = document.getElementById("pmGpsDot");',
    '    if (dot) dot.style.display = "none";',
    '    var btn = document.getElementById("pmGpsBtn");',
    '    if (btn) btn.textContent = "Enable GPS";',
    '    var st = document.getElementById("pmGpsStatus");',
    '    if (st) st.textContent = "";',
    '    return;',
    '  }',
    '  if (!navigator.geolocation) {',
    '    var st = document.getElementById("pmGpsStatus");',
    '    if (st) st.textContent = "GPS not available on this device";',
    '    return;',
    '  }',
    '  pmGpsActive = true;',
    '  var btn = document.getElementById("pmGpsBtn");',
    '  if (btn) btn.textContent = "Disable GPS";',
    '  var st = document.getElementById("pmGpsStatus");',
    '  if (st) st.textContent = "Acquiring position\u2026";',
    '  pmGpsWatchId = navigator.geolocation.watchPosition(',
    '    function(pos) {',
    '      var lat = pos.coords.latitude;',
    '      var lng = pos.coords.longitude;',
    '      var acc = pos.coords.accuracy;',
    '      var pad = 0.02;',
    '      var b = PM_GEO_BOUNDS;',
    '      if (lng < b.minLng-pad || lng > b.maxLng+pad || lat < b.minLat-pad || lat > b.maxLat+pad) {',
    '        var dot = document.getElementById("pmGpsDot");',
    '        if (dot) dot.style.display = "none";',
    '        var st2 = document.getElementById("pmGpsStatus");',
    '        if (st2) st2.textContent = "Outside map area";',
    '        return;',
    '      }',
    '      var xPct = (lng - b.minLng) / (b.maxLng - b.minLng) * 100;',
    '      var yPct = (b.maxLat - lat) / (b.maxLat - b.minLat) * 100;',
    '      xPct = Math.max(0, Math.min(100, xPct));',
    '      yPct = Math.max(0, Math.min(100, yPct));',
    '      var dot2 = document.getElementById("pmGpsDot");',
    '      if (dot2) { dot2.style.display="block"; dot2.style.left=xPct+"%"; dot2.style.top=yPct+"%"; }',
    '      var st3 = document.getElementById("pmGpsStatus");',
    '      if (st3) st3.textContent = "\u00b1" + Math.round(acc) + "m accuracy";',
    '    },',
    '    function(err) {',
    '      var msg = err.code === 1 ? "Location permission denied" : "GPS error";',
    '      var st4 = document.getElementById("pmGpsStatus");',
    '      if (st4) st4.textContent = msg;',
    '      pmGpsActive = false;',
    '      var btn2 = document.getElementById("pmGpsBtn");',
    '      if (btn2) btn2.textContent = "Enable GPS";',
    '    },',
    '    { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }',
    '  );',
    '}',
  ].join('\n');
}

// --- Assemble the full pocket HTML ---

function buildPocketHTML(options) {
  var snapshot = options.snapshot;
  var geoBounds = options.geoBounds;
  var includeSim = options.includeSim;
  var includeElevation = options.includeElevation;
  var includeGPS = options.includeGPS;

  // Downsample coordinates to keep file size manageable for long courses
  var pocketCoords = downsampleCoords(CONFIG.courseCoords, 1000);

  // Build the CONFIG object for the pocket page (all the data needed by the simulator)
  var pocketConfig = {
    slug: CONFIG.slug,
    raceName: CONFIG.raceName,
    totalMiles: CONFIG.totalMiles,
    totalGain: CONFIG.totalGain,
    loopMiles: CONFIG.loopMiles || null,
    raceStartHour: CONFIG.raceStartHour,
    defaultGoalHours: CONFIG.defaultGoalHours,
    defaultGoalMins: CONFIG.defaultGoalMins,
    courseCoords: pocketCoords,
    elevations: CONFIG.elevations,
    profileMaxEle: CONFIG.profileMaxEle,
    profileMinEle: CONFIG.profileMinEle,
    profileMaxDist: CONFIG.profileMaxDist || CONFIG.totalMiles,
    profileMileStep: CONFIG.profileMileStep || 3,
    finishCoords: CONFIG.finishCoords || null,
    colors: CONFIG.colors,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    aidStations: CONFIG.aidStations || null,
    cutoffs: CONFIG.cutoffs || null,
    mileMarkerFillColor: CONFIG.mileMarkerFillColor,
    mileMarkerStrokeColor: CONFIG.mileMarkerStrokeColor,
    mileMarkerTextColor: CONFIG.mileMarkerTextColor || '#fff',
    mileMarkerRadius: CONFIG.mileMarkerRadius || 10
  };

  var configJson = 'var CONFIG = ' + JSON.stringify(pocketConfig) + ';';

  // Aid stations and cue sheet (generated before template)
  var aidCardsHtml = buildPocketAidCards();
  var cueSheetHtml = buildPocketCueSheet();

  // JS sources
  var coordHelpersJs = buildPocketCoordHelpersSource(pocketConfig);
  var elevationJs = includeElevation ? buildPocketElevationSource() : '';
  var simulatorJs = includeSim ? buildPocketSimulatorSource() : '';
  var gpsJs = includeGPS ? buildPocketGPSSource(geoBounds) : '';

  // Tab HTML
  var simTabBtn = includeSim ? '<button class="pm-tab" onclick="pmSwitchTab(\'sim\')">Simulator</button>' : '';
  var simTabContent = '';
  if (includeSim) {
    simTabContent = [
      '<div id="pm-sim" class="pm-view" style="display:none">',
      '  <div class="pm-sim-controls">',
      '    <div class="pm-goal-row">',
      '      <label class="pm-goal-label">Goal Time</label>',
      '      <div class="pm-goal-inputs">',
      '        <input type="number" id="pmGoalHrs" min="0" max="99" value="' + CONFIG.defaultGoalHours + '" onchange="pmUpdateGoalTime()"> hrs',
      '        <input type="number" id="pmGoalMins" min="0" max="59" value="' + CONFIG.defaultGoalMins + '" onchange="pmUpdateGoalTime()"> min',
      '      </div>',
      '      <div class="pm-goal-pace" id="pmGoalPace"></div>',
      '    </div>',
      '    <div class="pm-scrub-row">',
      '      <button class="pm-play-btn" id="pmPlayBtn" onclick="pmTogglePlay()">&#9654;</button>',
      '      <div class="pm-scrub-track" id="pmScrubTrack">',
      '        <div class="pm-scrub-fill" id="pmScrubFill"></div>',
      '        <div class="pm-scrub-handle" id="pmScrubHandle"></div>',
      '      </div>',
      '    </div>',
      '    <div class="pm-speed-row">',
      '      <button class="pm-speed-btn active" onclick="pmSetSpeed(1,this)">1\u00d7</button>',
      '      <button class="pm-speed-btn" onclick="pmSetSpeed(4,this)">4\u00d7</button>',
      '      <button class="pm-speed-btn" onclick="pmSetSpeed(16,this)">16\u00d7</button>',
      '    </div>',
      '  </div>',
      '  <div class="pm-runner-info">',
      '    <div class="pm-runner-main">',
      '      <span id="pmRunnerDist">Mile 0.0</span>',
      '      <span id="pmClockTime">' + (CONFIG.defaultClock || '') + '</span>',
      '    </div>',
      '    <div class="pm-runner-sub">',
      '      <span id="pmRunnerMeta">' + (CONFIG.defaultRunnerMeta || '') + '</span>',
      '      <span>\u2192 <span id="pmFinishTime">' + (CONFIG.defaultFinishTime || '') + '</span></span>',
      '    </div>',
      '  </div>',
      '  <canvas id="pmCourseMapCanvas" class="pm-course-canvas"></canvas>',
      '  <canvas id="pmSimProfileCanvas" class="pm-sim-profile-canvas"></canvas>',
      '  <div class="pm-stats-grid">',
      '    <div class="pm-stat-card"><div class="pm-stat-val" id="pmStatDist">0.0</div><div class="pm-stat-lbl">Miles</div></div>',
      '    <div class="pm-stat-card"><div class="pm-stat-val" id="pmStatEle">0</div><div class="pm-stat-lbl">Elevation ft</div></div>',
      '    <div class="pm-stat-card"><div class="pm-stat-val" id="pmStatGain">0</div><div class="pm-stat-lbl">Gain ft</div></div>',
      '    <div class="pm-stat-card"><div class="pm-stat-val" id="pmStatGrade">0%</div><div class="pm-stat-lbl">Grade</div></div>',
      '    <div class="pm-stat-card"><div class="pm-stat-val" id="pmStatPct">0%</div><div class="pm-stat-lbl">Complete</div></div>',
      '    <div class="pm-stat-card"><div class="pm-stat-val" id="pmStatPace">--:--</div><div class="pm-stat-lbl">Avg Pace</div></div>',
      '  </div>',
      '</div>',
    ].join('\n');
  }

  var profileCanvas = includeElevation
    ? '<canvas id="pmProfileCanvas" class="pm-profile-canvas"></canvas>'
    : '';

  var gpsBar = includeGPS ? [
    '<div class="pm-gps-bar">',
    '  <button class="pm-gps-btn" id="pmGpsBtn" onclick="pmToggleGPS()">Enable GPS</button>',
    '  <span class="pm-gps-status" id="pmGpsStatus"></span>',
    '</div>',
  ].join('\n') : '';

  var gpsDot = includeGPS ? '<div id="pmGpsDot" class="pm-gps-dot" style="display:none"><div class="pm-gps-pulse"></div></div>' : '';

  var initScript = [
    'window.addEventListener("DOMContentLoaded", function() {',
    '  pmSwitchTab("map");',
    includeElevation ? '  pmDrawElevationProfile();' : '',
    includeSim ? '  pmInitSim(); pmRenderSim();' : '',
    '});',
    'window.addEventListener("resize", function() {',
    includeElevation ? '  pmDrawElevationProfile();' : '',
    includeSim ? '  pmRenderSim();' : '',
    '});',
  ].filter(Boolean).join('\n');

  var downloadDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return '<!DOCTYPE html>\n' +
  '<html lang="en">\n' +
  '<head>\n' +
  '<meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5">\n' +
  '<meta name="apple-mobile-web-app-capable" content="yes">\n' +
  '<title>' + escHtml(CONFIG.raceName) + ' \u2014 Pocket Map</title>\n' +
  '<style>\n' + buildPocketCSS(pocketConfig) + '\n</style>\n' +
  '</head>\n' +
  '<body>\n' +
  '<header class="pm-header">\n' +
  '  <div class="pm-header-title">' + escHtml(CONFIG.raceName) + '</div>\n' +
  '  <div class="pm-tabs">\n' +
  '    <button class="pm-tab active" id="pm-tab-map" onclick="pmSwitchTab(\'map\')">Map</button>\n' +
  '    <button class="pm-tab" id="pm-tab-info" onclick="pmSwitchTab(\'info\')">Info</button>\n' +
  simTabBtn + '\n' +
  '  </div>\n' +
  '</header>\n' +
  '\n' +
  '<div id="pm-map" class="pm-view">\n' +
  '  <div class="pm-map-container">\n' +
  '    <img id="pmMapImg" src="' + (snapshot || '') + '" alt="Course Map" class="pm-map-img"' + (snapshot ? '' : ' style="display:none"') + '>\n' +
  gpsDot + '\n' +
  '  </div>\n' +
  gpsBar + '\n' +
  profileCanvas + '\n' +
  '</div>\n' +
  '\n' +
  '<div id="pm-info" class="pm-view" style="display:none">\n' +
  '  <div class="pm-info-scroll">\n' +
  '    <section class="pm-section">\n' +
  '      <h2>Race Stats</h2>\n' +
  '      <div class="pm-race-stats">\n' +
  '        <div class="pm-race-stat"><div class="pm-race-stat-val">' + CONFIG.totalMiles + '</div><div class="pm-race-stat-lbl">Miles</div></div>\n' +
  '        <div class="pm-race-stat"><div class="pm-race-stat-val">' + CONFIG.totalGain.toLocaleString() + '</div><div class="pm-race-stat-lbl">Ft Gain</div></div>\n' +
  '      </div>\n' +
  '    </section>\n' +
  '    <section class="pm-section">\n' +
  '      <h2>Aid Stations</h2>\n' +
  aidCardsHtml + '\n' +
  '    </section>\n' +
  '    <section class="pm-section">\n' +
  '      <h2>Trail Cue Sheet</h2>\n' +
  cueSheetHtml + '\n' +
  '    </section>\n' +
  '  </div>\n' +
  '</div>\n' +
  '\n' +
  simTabContent + '\n' +
  '\n' +
  '<footer class="pm-footer">\n' +
  '  Pocket Map &middot; <a href="https://falsesummitstudio.com" style="color:inherit">falsesummitstudio.com</a><br>\n' +
  '  Downloaded ' + downloadDate + ' &middot; Open offline in any browser\n' +
  '</footer>\n' +
  '\n' +
  '<scr' + 'ipt>\n' +
  configJson + '\n\n' +
  'function pmSwitchTab(tab) {\n' +
  '  ["map","info"' + (includeSim ? ',"sim"' : '') + '].forEach(function(t) {\n' +
  '    var view = document.getElementById("pm-"+t);\n' +
  '    var btn = document.getElementById("pm-tab-"+t);\n' +
  '    if (view) view.style.display = t === tab ? "" : "none";\n' +
  '    if (btn) btn.classList.toggle("active", t === tab);\n' +
  '  });\n' +
  (includeElevation ? '  if (tab === "map") pmDrawElevationProfile();\n' : '') +
  (includeSim ? '  if (tab === "sim") pmRenderSim();\n' : '') +
  '}\n\n' +
  coordHelpersJs + '\n\n' +
  (elevationJs ? elevationJs + '\n\n' : '') +
  (simulatorJs ? simulatorJs + '\n\n' : '') +
  (gpsJs ? gpsJs + '\n\n' : '') +
  initScript + '\n' +
  '</' + 'script>\n' +
  '</' + 'body>\n' +
  '</html>';
}

// --- Pocket map CSS (fully self-contained, system fonts, hardcoded colors) ---

function buildPocketCSS(cfg) {
  var primary = (cfg.colors && cfg.colors.primary) ? cfg.colors.primary : '#333';
  var courseMapBg0 = (cfg.colors && cfg.colors.courseMapBg) ? cfg.colors.courseMapBg[0] : '#e8ede9';
  var courseMapBg1 = (cfg.colors && cfg.colors.courseMapBg) ? cfg.colors.courseMapBg[1] : '#dde3de';

  return [
    '*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }',
    'html, body { height: 100%; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; background: #f5f5f5; color: #222; font-size: 14px; }',
    'body { display: flex; flex-direction: column; min-height: 100vh; }',

    // Header
    '.pm-header { background: #fff; border-bottom: 1px solid #e0e0e0; padding: 10px 14px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 50; }',
    '.pm-header-title { font-size: 0.85rem; font-weight: 700; color: #222; flex: 1; margin-right: 10px; }',
    '.pm-tabs { display: flex; gap: 3px; background: #f0f0f0; padding: 3px; border-radius: 8px; }',
    '.pm-tab { padding: 5px 10px; border: none; border-radius: 5px; background: transparent; font-family: inherit; font-size: 0.7rem; font-weight: 600; color: #888; cursor: pointer; white-space: nowrap; }',
    '.pm-tab.active { background: #fff; color: #222; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }',

    // Views
    '.pm-view { flex: 1; }',

    // Map tab
    '.pm-map-container { position: relative; overflow: hidden; background: #e8e8e8; }',
    '.pm-map-img { display: block; width: 100%; height: auto; }',
    '.pm-gps-dot { position: absolute; width: 20px; height: 20px; transform: translate(-50%, -50%); pointer-events: none; z-index: 10; }',
    '.pm-gps-pulse { width: 20px; height: 20px; background: #4285F4; border: 2.5px solid #fff; border-radius: 50%; box-shadow: 0 0 0 0 rgba(66,133,244,0.4); animation: pm-pulse 2s infinite; }',
    '@keyframes pm-pulse { 0% { box-shadow: 0 0 0 0 rgba(66,133,244,0.4); } 70% { box-shadow: 0 0 0 12px rgba(66,133,244,0); } 100% { box-shadow: 0 0 0 0 rgba(66,133,244,0); } }',
    '.pm-gps-bar { display: flex; align-items: center; gap: 10px; padding: 8px 14px; background: #fff; border-top: 1px solid #e0e0e0; }',
    '.pm-gps-btn { background: ' + primary + '; color: #fff; border: none; border-radius: 6px; padding: 6px 12px; font-family: inherit; font-size: 0.75rem; font-weight: 600; cursor: pointer; }',
    '.pm-gps-status { font-size: 0.7rem; color: #888; }',
    '.pm-profile-canvas { display: block; width: 100%; height: 90px; background: #fff; border-top: 1px solid #e0e0e0; }',

    // Info tab
    '.pm-info-scroll { overflow-y: auto; padding: 14px; }',
    '.pm-section { margin-bottom: 20px; }',
    '.pm-section h2 { font-size: 0.7rem; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; }',
    '.pm-race-stats { display: flex; gap: 10px; }',
    '.pm-race-stat { flex: 1; background: #fff; border: 1px solid #e0e0e0; border-radius: 10px; padding: 12px; text-align: center; }',
    '.pm-race-stat-val { font-size: 1.6rem; font-weight: 700; color: ' + primary + '; }',
    '.pm-race-stat-lbl { font-size: 0.65rem; color: #888; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; }',

    // Aid station cards
    '.pm-aid-card { background: #fff; border: 1px solid #e0e0e0; border-radius: 10px; padding: 12px; margin-bottom: 8px; }',
    '.pm-aid-top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px; }',
    '.pm-aid-name { font-weight: 600; font-size: 0.9rem; color: #222; }',
    '.pm-aid-mile { font-size: 0.75rem; font-weight: 600; color: ' + primary + '; }',
    '.pm-aid-services { font-size: 0.75rem; color: #666; line-height: 1.4; }',

    // Cue sheet
    '.pm-cue-list { display: flex; flex-direction: column; gap: 6px; }',
    '.pm-cue-row { display: flex; align-items: center; gap: 10px; background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 8px 12px; }',
    '.pm-cue-mile { font-size: 0.75rem; font-weight: 700; color: ' + primary + '; min-width: 38px; }',
    '.pm-blaze { display: inline-block; width: 12px; height: 12px; border-radius: 3px; flex-shrink: 0; }',
    '.pm-cue-name { font-size: 0.82rem; color: #333; font-weight: 500; }',

    // Simulator tab
    '.pm-sim-controls { padding: 12px 14px; background: #fff; border-bottom: 1px solid #e0e0e0; }',
    '.pm-goal-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }',
    '.pm-goal-label { font-size: 0.7rem; font-weight: 600; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }',
    '.pm-goal-inputs { display: flex; align-items: center; gap: 6px; font-size: 0.8rem; color: #555; }',
    '.pm-goal-inputs input { width: 44px; padding: 4px 6px; border: 1px solid #ddd; border-radius: 5px; font-family: inherit; font-size: 0.85rem; text-align: center; }',
    '.pm-goal-pace { font-size: 0.75rem; color: #555; }',
    '.pm-goal-pace strong { color: ' + primary + '; }',
    '.pm-scrub-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }',
    '.pm-play-btn { width: 32px; height: 32px; border-radius: 50%; background: ' + primary + '; color: #fff; border: none; font-size: 0.85rem; cursor: pointer; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }',
    '.pm-scrub-track { flex: 1; height: 6px; background: #e0e0e0; border-radius: 3px; position: relative; cursor: pointer; }',
    '.pm-scrub-fill { height: 100%; background: ' + primary + '; border-radius: 3px; width: 0%; }',
    '.pm-scrub-handle { position: absolute; top: 50%; width: 16px; height: 16px; background: #fff; border: 2px solid ' + primary + '; border-radius: 50%; transform: translate(-50%, -50%); left: 0%; }',
    '.pm-speed-row { display: flex; gap: 6px; }',
    '.pm-speed-btn { padding: 4px 10px; border: 1px solid #ddd; border-radius: 5px; background: #f5f5f5; font-family: inherit; font-size: 0.7rem; font-weight: 600; color: #666; cursor: pointer; }',
    '.pm-speed-btn.active { background: ' + primary + '; color: #fff; border-color: ' + primary + '; }',
    '.pm-runner-info { padding: 10px 14px; background: #fafafa; border-bottom: 1px solid #e0e0e0; }',
    '.pm-runner-main { display: flex; justify-content: space-between; font-size: 0.9rem; font-weight: 600; color: #222; margin-bottom: 3px; }',
    '.pm-runner-sub { display: flex; justify-content: space-between; font-size: 0.72rem; color: #666; }',
    '.pm-course-canvas { display: block; width: 100%; height: 180px; background: linear-gradient(180deg,' + courseMapBg0 + ',' + courseMapBg1 + '); }',
    '.pm-sim-profile-canvas { display: block; width: 100%; height: 100px; background: #eaeaea; }',
    '.pm-stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: #e0e0e0; }',
    '.pm-stat-card { background: #fff; padding: 10px; text-align: center; }',
    '.pm-stat-val { font-size: 1.1rem; font-weight: 700; color: ' + primary + '; }',
    '.pm-stat-lbl { font-size: 0.6rem; color: #888; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; }',

    // Footer
    '.pm-footer { padding: 14px; text-align: center; font-size: 0.65rem; color: #aaa; border-top: 1px solid #e0e0e0; background: #fff; margin-top: auto; line-height: 1.8; }',
  ].join('\n');
}

// --- Download trigger ---

function triggerPocketDownload(html) {
  var filename = (CONFIG.slug || 'race') + '-pocket-map.html';

  // iOS / Safari: try Web Share API first (lets user "Save to Files")
  var isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  if (isIOS && navigator.share && window.File) {
    var file = new File([html], filename, { type: 'text/html' });
    navigator.share({ files: [file] }).catch(function() {
      triggerBlobDownload(html, filename);
    });
    return;
  }

  triggerBlobDownload(html, filename);
}

function triggerBlobDownload(html, filename) {
  var blob = new Blob([html], { type: 'text/html' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function() { URL.revokeObjectURL(url); }, 15000);
}
