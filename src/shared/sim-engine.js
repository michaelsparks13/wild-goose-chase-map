// sim-engine.js - initSim, simTick, togglePlay, setSpeed, updateGoalTime
// Requires: CONFIG, TOTAL_MILES (may be mutable for multi-lap), renderSim

var TOTAL_MILES = CONFIG.totalMiles;
var TOTAL_GAIN = CONFIG.totalGain;
var RACE_START_HOUR = CONFIG.raceStartHour;
var simProgress = 0;
var simPlaying = false;
var simSpeed = 1;
var simFinishHours = CONFIG.defaultGoalHours + CONFIG.defaultGoalMins / 60;
var simLastTick = 0;

// Multi-lap support
var raceLaps = 1;

function initSim() {
  if (simInitialized) return;
  simInitialized = true;
  updateGoalPace();

  // Scrubber interaction
  var track = document.getElementById('scrubTrack');
  var scrubbing = false;
  var scrubTo = function(e) {
    var rect = track.getBoundingClientRect();
    var clientX = e.touches ? e.touches[0].clientX : e.clientX;
    simProgress = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    renderSim();
  };
  track.addEventListener('mousedown', function(e) { scrubbing = true; simPlaying = false; document.getElementById('playBtn').innerHTML = '&#9654;'; scrubTo(e); });
  window.addEventListener('mousemove', function(e) { if (scrubbing) scrubTo(e); });
  window.addEventListener('mouseup', function() { scrubbing = false; });
  track.addEventListener('touchstart', function(e) { scrubbing = true; simPlaying = false; document.getElementById('playBtn').innerHTML = '&#9654;'; scrubTo(e); }, { passive: true });
  window.addEventListener('touchmove', function(e) { if (scrubbing) scrubTo(e); }, { passive: true });
  window.addEventListener('touchend', function() { scrubbing = false; });
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
  var paceMin = totalMins / TOTAL_MILES;
  var pm = Math.floor(paceMin);
  var ps = Math.round((paceMin - pm) * 60);
  document.getElementById('goalPace').innerHTML = 'Avg pace: <strong>' + pm + ':' + String(ps).padStart(2, '0') + ' /mi</strong>';
}

function togglePlay() {
  simPlaying = !simPlaying;
  document.getElementById('playBtn').innerHTML = simPlaying ? '&#9208;' : '&#9654;';
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
    document.getElementById('playBtn').innerHTML = '&#9654;';
    return;
  }
  requestAnimationFrame(simTick);
}
