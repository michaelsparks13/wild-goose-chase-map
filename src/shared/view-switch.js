// view-switch.js - switchView, currentView state
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
