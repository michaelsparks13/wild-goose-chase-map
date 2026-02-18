// map-toggles.js - toggleCourse, toggle3D, toggleTrails, toggleAidStations
// Requires: CONFIG, map, courseVisible, terrain3D, trailsOn, aidVisible, aidMarkers

function toggleCourse() {
  courseVisible = !courseVisible;
  document.getElementById('courseBtn').classList.toggle('active', courseVisible);
  var vis = courseVisible ? 'visible' : 'none';
  if (map.getLayer('course-line')) {
    map.setLayoutProperty('course-line', 'visibility', vis);
    map.setLayoutProperty('course-outline', 'visibility', vis);
  }
  if (map.getLayer('mile-markers-circle')) {
    map.setLayoutProperty('mile-markers-circle', 'visibility', vis);
    map.setLayoutProperty('mile-markers-label', 'visibility', vis);
  }
}

function toggle3D() {
  terrain3D = !terrain3D;
  document.getElementById('terrainBtn').classList.toggle('active', terrain3D);
  if (terrain3D) {
    if (!map.getSource('terrain-dem')) {
      map.addSource('terrain-dem', {
        type: 'raster-dem',
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
        tileSize: 256, maxzoom: 15, encoding: 'terrarium'
      });
    }
    map.setTerrain({ source: 'terrain-dem', exaggeration: 1.5 });
    map.easeTo({ pitch: 45, duration: 1000 });
  } else {
    map.setTerrain(null);
    map.easeTo({ pitch: 0, duration: 1000 });
  }
}

function toggleTrails() {
  trailsOn = !trailsOn;
  document.getElementById('trailBtn').classList.toggle('active', trailsOn);
  if (!map) return;

  if (trailsOn) {
    if (!map.getSource('park-trails')) {
      addTrailLayers();
    }
    map.setLayoutProperty('park-trails-line', 'visibility', 'visible');
    map.setLayoutProperty('park-trails-label', 'visibility', 'visible');
  } else {
    if (map.getLayer('park-trails-line')) map.setLayoutProperty('park-trails-line', 'visibility', 'none');
    if (map.getLayer('park-trails-label')) map.setLayoutProperty('park-trails-label', 'visibility', 'none');
  }
}

function addTrailLayers() {
  if (!map.getSource('park-trails')) {
    map.addSource('park-trails', { type: 'geojson', data: CONFIG.trailsData });
  }
  if (!map.getLayer('park-trails-line')) {
    map.addLayer({
      id: 'park-trails-line', type: 'line', source: 'park-trails',
      paint: {
        'line-color': ['match', ['get', 'blaze'],
          'white', '#ffffff', 'blue', '#2196F3', 'yellow', '#FFD700',
          'orange', '#FF9800', 'green', '#4CAF50', 'red', '#f44336',
          'violet', '#9C27B0', 'purple', '#9C27B0', 'teal', '#009688', '#9E9E9E'
        ],
        'line-width': ['interpolate', ['linear'], ['zoom'], 12, 3, 15, 5, 20, 8],
        'line-dasharray': [2, 3],
        'line-opacity': 0.9
      },
      layout: { 'line-cap': 'butt', 'line-join': 'round' }
    });
  }
  if (!map.getLayer('park-trails-label')) {
    map.addLayer({
      id: 'park-trails-label', type: 'symbol', source: 'park-trails',
      layout: {
        'symbol-placement': 'line',
        'text-field': ['get', 'name'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 13, 9, 16, 13, 20, 16],
        'text-font': ['Noto Sans Medium'],
        'text-max-angle': 30,
        'text-padding': 10
      },
      paint: {
        'text-color': CONFIG.colors.trailLabelColor || '#333',
        'text-halo-color': CONFIG.colors.trailLabelHalo || '#fff',
        'text-halo-width': 1.5,
        'text-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 13.5, 1]
      }
    });
  }
}

function toggleAidStations() {
  aidVisible = !aidVisible;
  document.getElementById('aidBtn').classList.toggle('active', aidVisible);
  aidMarkers.forEach(function(m) { if (aidVisible) m.addTo(map); else m.remove(); });
}
