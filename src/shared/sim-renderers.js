// sim-renderers.js - renderSim, renderCourseMap, renderSimProfile
// Requires: CONFIG, TOTAL_MILES, TOTAL_GAIN, RACE_START_HOUR, simProgress, simFinishHours
// Requires: getEleAtDist, getGradeAtDist, getGainAtDist, getCoordAtDist, coordDistances, eleProfile, loopDist

function renderSim() {
  var dist = simProgress * TOTAL_MILES;
  var ele = getEleAtDist(dist);
  var grade = getGradeAtDist(dist);
  var gain = getGainAtDist(dist);

  // Scrubber
  document.getElementById('scrubFill').style.width = (simProgress * 100) + '%';
  document.getElementById('scrubHandle').style.left = (simProgress * 100) + '%';

  // Runner info
  document.getElementById('runnerDist').textContent = 'Mile ' + dist.toFixed(1);
  var gradeDir = grade > 2 ? 'Climbing' : grade < -2 ? 'Descending' : 'Rolling';
  var lapInfo = '';
  if (CONFIG.loopMiles && raceLaps > 1) {
    lapInfo = ' \u00b7 Lap ' + (Math.floor(dist / CONFIG.loopMiles) + 1);
  }
  document.getElementById('runnerMeta').textContent = Math.round(ele).toLocaleString() + ' ft \u00b7 ' + gradeDir + lapInfo;

  // Clock
  var elapsed = (dist / TOTAL_MILES) * simFinishHours;
  var tod = RACE_START_HOUR + elapsed;
  var hrs = Math.floor(tod) % 24;
  var mins = Math.floor((tod % 1) * 60);
  var ampm = hrs >= 12 ? 'PM' : 'AM';
  var dispHrs = hrs > 12 ? hrs - 12 : (hrs === 0 ? 12 : hrs);
  document.getElementById('clockTime').textContent = dispHrs + ':' + String(mins).padStart(2, '0') + ' ' + ampm;

  var finishTod = RACE_START_HOUR + simFinishHours;
  var finishHrs = Math.floor(finishTod) % 24;
  var finishMins = Math.round((finishTod % 1) * 60);
  var finishAmpm = finishHrs >= 12 ? 'PM' : 'AM';
  var finishDispHrs = finishHrs > 12 ? finishHrs - 12 : (finishHrs === 0 ? 12 : finishHrs);
  document.getElementById('finishTime').textContent = finishDispHrs + ':' + String(finishMins).padStart(2, '0') + ' ' + finishAmpm;

  // Stats
  document.getElementById('statDist').textContent = dist.toFixed(1);
  document.getElementById('statEle').textContent = Math.round(ele).toLocaleString();
  document.getElementById('statGain').textContent = Math.round(gain).toLocaleString();
  document.getElementById('statGrade').textContent = (grade > 0 ? '+' : '') + grade.toFixed(0) + '%';
  document.getElementById('statPct').textContent = Math.round(simProgress * 100) + '%';

  // Pace
  var totalMins = simFinishHours * 60;
  var paceMin = totalMins / TOTAL_MILES;
  var pm = Math.floor(paceMin);
  var ps = Math.round((paceMin - pm) * 60);
  if (document.getElementById('statPace')) {
    document.getElementById('statPace').textContent = pm + ':' + String(ps).padStart(2, '0');
  }

  // Draw canvases
  renderCourseMap(dist);
  renderSimProfile(dist, ele);
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
  var colors = CONFIG.colors;

  // Background
  var bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, colors.courseMapBg[0]);
  bgGrad.addColorStop(1, colors.courseMapBg[1]);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Compute bounding box of course
  var coords = CONFIG.courseCoords;
  var minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (var ci = 0; ci < coords.length; ci++) {
    var lng = coords[ci][0], lat = coords[ci][1];
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  var padding = 15;
  var drawW = W - padding * 2;
  var drawH = H - padding * 2;
  var lngRange = maxLng - minLng;
  var latRange = maxLat - minLat;
  var scale = Math.min(drawW / lngRange, drawH / latRange);
  var offsetX = padding + (drawW - lngRange * scale) / 2;
  var offsetY = padding + (drawH - latRange * scale) / 2;

  var toX = function(lng) { return offsetX + (lng - minLng) * scale; };
  var toY = function(lat) { return offsetY + (maxLat - lat) * scale; };

  // Find runner index
  var actualDist = CONFIG.loopMiles ? loopDist(currentDist) : currentDist;
  var runnerCoord = getCoordAtDist(currentDist);
  var runnerIdx = 0;
  for (var i = 1; i < coordDistances.length; i++) {
    if (coordDistances[i] >= actualDist) { runnerIdx = i; break; }
  }

  // Trail shadow (full course, dim)
  ctx.beginPath();
  for (var i = 0; i < coords.length; i++) {
    var x = toX(coords[i][0]);
    var y = toY(coords[i][1]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = colors.courseMapShadow;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Remaining portion (dim)
  ctx.beginPath();
  for (var i = Math.max(0, runnerIdx - 1); i < coords.length; i++) {
    var x = toX(coords[i][0]);
    var y = toY(coords[i][1]);
    if (i === Math.max(0, runnerIdx - 1)) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = colors.courseMapRemaining;
  ctx.lineWidth = 4;
  ctx.stroke();

  // Completed portion
  if (runnerIdx > 0) {
    ctx.beginPath();
    for (var i = 0; i <= Math.min(runnerIdx, coords.length - 1); i++) {
      var x = toX(coords[i][0]);
      var y = toY(coords[i][1]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    var rx = toX(runnerCoord[0]);
    var ry = toY(runnerCoord[1]);
    ctx.lineTo(rx, ry);
    ctx.strokeStyle = colors.primary;
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  // Start marker
  var sx = toX(coords[0][0]);
  var sy = toY(coords[0][1]);
  ctx.beginPath();
  ctx.arc(sx, sy, 6, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.strokeStyle = colors.primary;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = colors.primary;
  ctx.font = 'bold 8px ' + CONFIG.fontFamily;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('S', sx, sy + 0.5);

  // Finish marker (point-to-point only)
  if (CONFIG.finishCoords) {
    var fx = toX(coords[coords.length - 1][0]);
    var fy = toY(coords[coords.length - 1][1]);
    ctx.beginPath();
    ctx.arc(fx, fy, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = colors.primary;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = colors.primary;
    ctx.font = 'bold 8px ' + CONFIG.fontFamily;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('F', fx, fy + 0.5);
  }

  // Runner dot
  var rx = toX(runnerCoord[0]);
  var ry = toY(runnerCoord[1]);

  // Glow
  ctx.beginPath();
  ctx.arc(rx, ry, 14, 0, Math.PI * 2);
  var glow = ctx.createRadialGradient(rx, ry, 4, rx, ry, 14);
  glow.addColorStop(0, colors.runnerGlow[0]);
  glow.addColorStop(1, colors.runnerGlow[1]);
  ctx.fillStyle = glow;
  ctx.fill();

  // Dot
  ctx.beginPath();
  ctx.arc(rx, ry, 7, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.strokeStyle = colors.primary;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Mile markers — priority-based with collision suppression
  var markerR = Math.max(8, Math.min(11, W / 35));
  var markerFont = Math.max(7, Math.min(9, W / 45));
  var gap = 3;
  var totalM = CONFIG.loopMiles || CONFIG.totalMiles;
  var candidates = [];
  for (var m = 1; m <= Math.floor(totalM); m++) {
    var mc = getCoordAtDist(m);
    var mx = toX(mc[0]);
    var my = toY(mc[1]);
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
      ctx.fillStyle = colors.mileMarkerFill;
      ctx.fill();
      ctx.strokeStyle = c.priority === 1 ? colors.mileMarkerStrokePrimary : colors.mileMarkerStrokeSecondary;
      ctx.lineWidth = c.priority === 1 ? 1.5 : 1;
      ctx.stroke();
      ctx.fillStyle = c.priority === 1 ? colors.mileMarkerTextPrimary : colors.mileMarkerTextSecondary;
      ctx.font = (c.priority === 1 ? '700 ' : '600 ') + markerFont + 'px ' + CONFIG.fontFamily;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(c.mile, c.x, c.y);
      placed.push(c);
    }
  }
}

function renderSimProfile(currentDist, currentEle) {
  var canvas = document.getElementById('simProfileCanvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var rect = canvas.getBoundingClientRect();
  var dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  var W = rect.width, H = rect.height;
  var colors = CONFIG.colors;

  // Windowed view centered on runner
  var windowMiles = Math.min(TOTAL_MILES, Math.max(6, TOTAL_MILES * 0.4));
  var windowStart = Math.max(0, currentDist - windowMiles * 0.35);
  var windowEnd = Math.min(TOTAL_MILES, windowStart + windowMiles);
  if (windowEnd - windowStart < windowMiles) windowStart = Math.max(0, windowEnd - windowMiles);

  // Build full-race elevation profile (supports multi-lap)
  var fullProfile = [];
  var loopM = CONFIG.loopMiles || CONFIG.totalMiles;
  for (var lap = 0; lap < raceLaps; lap++) {
    for (var i = 0; i < eleProfile.length; i++) {
      fullProfile.push({ d: eleProfile[i].d + lap * loopM, e: eleProfile[i].e });
    }
  }

  // Sample points in view
  var pts = [];
  for (var i = 0; i < fullProfile.length; i++) {
    if (fullProfile[i].d >= windowStart && fullProfile[i].d <= windowStart + windowMiles) {
      pts.push(fullProfile[i]);
    }
  }
  if (pts.length < 2) return;

  var eles = pts.map(function(p) { return p.e; });
  var eMin = Math.min.apply(null, eles) - 30;
  var eMax = Math.max.apply(null, eles) + 50;
  var mt = Math.min(30, H * 0.15), mb = 0;

  var xScale = function(d) { return ((d - windowStart) / windowMiles) * W; };
  var yScale = function(e) { return mt + (H - mt - mb) - ((e - eMin) / (eMax - eMin)) * (H - mt - mb); };

  // Sky gradient (time-of-day)
  var elapsed = (currentDist / TOTAL_MILES) * simFinishHours;
  var tod = RACE_START_HOUR + elapsed;
  var skyTop, skyBot;
  var sky = colors.sky;
  if (tod < 6) { skyTop = sky.night[0]; skyBot = sky.night[1]; }
  else if (tod < 8) { skyTop = sky.dawn[0]; skyBot = sky.dawn[1]; }
  else if (tod < 17) { skyTop = sky.day[0]; skyBot = sky.day[1]; }
  else if (tod < 20) { skyTop = sky.dusk[0]; skyBot = sky.dusk[1]; }
  else { skyTop = sky.night[0]; skyBot = sky.night[1]; }

  var skyGrad = ctx.createLinearGradient(0, 0, 0, H);
  skyGrad.addColorStop(0, skyTop);
  skyGrad.addColorStop(1, skyBot);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, W, H);

  // Terrain fill
  ctx.beginPath();
  ctx.moveTo(xScale(pts[0].d), yScale(pts[0].e));
  for (var i = 0; i < pts.length; i++) ctx.lineTo(xScale(pts[i].d), yScale(pts[i].e));
  ctx.lineTo(xScale(pts[pts.length - 1].d), H);
  ctx.lineTo(xScale(pts[0].d), H);
  ctx.closePath();
  var tGrad = ctx.createLinearGradient(0, mt, 0, H);
  tGrad.addColorStop(0, colors.terrainFillTop);
  tGrad.addColorStop(1, colors.terrainFillBottom);
  ctx.fillStyle = tGrad;
  ctx.fill();

  // Terrain line
  ctx.beginPath();
  ctx.moveTo(xScale(pts[0].d), yScale(pts[0].e));
  for (var i = 0; i < pts.length; i++) ctx.lineTo(xScale(pts[i].d), yScale(pts[i].e));
  ctx.strokeStyle = colors.primary;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Dim behind runner
  if (currentDist > windowStart) {
    ctx.fillStyle = colors.dimBehindRunner;
    ctx.fillRect(0, 0, xScale(currentDist), H);
  }

  // Runner dot
  var rx = xScale(currentDist);
  var ry = yScale(currentEle);

  ctx.beginPath();
  ctx.arc(rx, ry, 12, 0, Math.PI * 2);
  var glow = ctx.createRadialGradient(rx, ry, 3, rx, ry, 12);
  glow.addColorStop(0, colors.runnerGlow[0]);
  glow.addColorStop(1, colors.runnerGlow[1]);
  ctx.fillStyle = glow;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(rx, ry, 7, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.strokeStyle = colors.primary;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Mile markers in view
  for (var m = Math.ceil(windowStart); m <= Math.floor(windowStart + windowMiles); m++) {
    if (m <= 0 || m >= TOTAL_MILES) continue;
    var mx = xScale(m);
    ctx.beginPath();
    ctx.moveTo(mx, mt);
    ctx.lineTo(mx, H);
    ctx.strokeStyle = colors.simMileMarkerLine;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = colors.simMileMarkerText;
    ctx.font = '9px ' + CONFIG.fontFamily;
    ctx.textAlign = 'center';
    ctx.fillText(m + ' mi', mx, mt - 8);
  }
}
