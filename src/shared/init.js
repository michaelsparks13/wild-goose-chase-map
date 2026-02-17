// init.js - Bootstrap: wire up toggle buttons, init map, attach resize handler
// Requires: all other shared modules loaded, CONFIG

// Wire up toggle buttons
if (document.getElementById('courseBtn')) document.getElementById('courseBtn').onclick = toggleCourse;
if (document.getElementById('trailBtn')) document.getElementById('trailBtn').onclick = toggleTrails;
if (document.getElementById('aidBtn')) document.getElementById('aidBtn').onclick = toggleAidStations;
if (document.getElementById('terrainBtn')) document.getElementById('terrainBtn').onclick = toggle3D;

// Multi-lap support (Sleeping Giant)
if (CONFIG.loopMiles) {
  var LOOP_MILES = CONFIG.loopMiles;
  var LOOP_GAIN = CONFIG.loopGain;

  // setDistance function for distance picker
  window.setDistance = function(dist, btn) {
    document.querySelectorAll('.dist-btn').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    if (dist === '50k') {
      raceLaps = 2;
      TOTAL_MILES = LOOP_MILES * 2;
      TOTAL_GAIN = LOOP_GAIN * 2;
      document.getElementById('goalHrs').value = 5;
      document.getElementById('goalMins').value = 0;
    } else {
      raceLaps = 1;
      TOTAL_MILES = LOOP_MILES;
      TOTAL_GAIN = LOOP_GAIN;
      document.getElementById('goalHrs').value = 2;
      document.getElementById('goalMins').value = 30;
    }
    simProgress = 0;
    simPlaying = false;
    document.getElementById('playBtn').innerHTML = '&#9654;';
    updateGoalTime();
  };
}

// Initialize
initMap();
mapInitialized = true;
window.addEventListener('load', drawElevationProfile);
window.addEventListener('resize', function() {
  drawElevationProfile();
  if (currentView === 'sim') renderSim();
});
