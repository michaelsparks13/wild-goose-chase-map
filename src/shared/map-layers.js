// map-layers.js - Course line, mile markers, start/finish markers, aid stations
// Requires: CONFIG, map, getCoordAtDist, coordDistances

function initMap() {
  map = new maplibregl.Map({
    container: 'map',
    style: BASEMAP_STYLE,
    center: CONFIG.mapCenter,
    zoom: CONFIG.mapZoom,
    pitch: 0,
    attributionControl: false
  });

  map.addControl(new maplibregl.AttributionControl({ compact: true }));
  map.once('load', function() {
    var attrib = document.querySelector('.maplibregl-ctrl-attrib');
    if (attrib) { attrib.removeAttribute('open'); attrib.classList.remove('maplibregl-compact-show'); }
  });
  map.addControl(new maplibregl.NavigationControl(), 'bottom-right');

  map.on('load', function() {
    // Hide basemap trail/path layers that conflict with our custom overlays
    ['roads_other','roads_bridges_other','roads_bridges_other_casing',
     'roads_tunnels_other','roads_tunnels_other_casing','roads_labels_minor'
    ].forEach(function(id) { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none'); });

    // Add course line
    var COURSE = {
      type: 'Feature',
      properties: { name: CONFIG.raceName, distance_mi: CONFIG.totalMiles },
      geometry: { type: 'LineString', coordinates: CONFIG.courseCoords }
    };
    map.addSource('course', { type: 'geojson', data: COURSE });
    map.addLayer({
      id: 'course-outline', type: 'line', source: 'course',
      paint: { 'line-color': CONFIG.courseOutlineColor, 'line-width': 7, 'line-opacity': 0.45 }
    });
    map.addLayer({
      id: 'course-line', type: 'line', source: 'course',
      paint: { 'line-color': CONFIG.courseLineColor, 'line-width': 4 }
    });

    // Start marker
    var startEl = document.createElement('div');
    startEl.className = 'start-marker';
    startEl.innerHTML = '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="' + CONFIG.colors.primary + '" stroke="#fff" stroke-width="2"/><text x="16" y="20" text-anchor="middle" font-size="12" font-weight="bold" fill="#fff">S</text></svg>';
    new maplibregl.Marker({ element: startEl })
      .setLngLat(CONFIG.startCoords)
      .setPopup(new maplibregl.Popup({ offset: 15 }).setHTML('<strong style="color:' + CONFIG.colors.primary + '">' + CONFIG.startLabel + '</strong><br><span style="color:#888">' + CONFIG.raceName + '</span>'))
      .addTo(map);

    // Finish marker (only for point-to-point courses)
    if (CONFIG.finishCoords) {
      var finishEl = document.createElement('div');
      finishEl.className = 'start-marker';
      finishEl.innerHTML = '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="' + CONFIG.colors.primary + '" stroke="#fff" stroke-width="2"/><text x="16" y="20" text-anchor="middle" font-size="12" font-weight="bold" fill="#fff">F</text></svg>';
      new maplibregl.Marker({ element: finishEl })
        .setLngLat(CONFIG.finishCoords)
        .setPopup(new maplibregl.Popup({ offset: 15 }).setHTML('<strong style="color:' + CONFIG.colors.primary + '">' + CONFIG.finishLabel + '</strong><br><span style="color:#888">' + CONFIG.raceName + '</span>'))
        .addTo(map);
    }

    // Mile markers
    var totalM = CONFIG.loopMiles || CONFIG.totalMiles;
    var MILE_MARKER_GEOJSON = { type: 'FeatureCollection', features: [] };
    for (var m = 1; m <= Math.floor(totalM); m++) {
      MILE_MARKER_GEOJSON.features.push({
        type: 'Feature',
        properties: { mile: m, label: String(m), priority: (m % 5 === 0) ? 1 : 2 },
        geometry: { type: 'Point', coordinates: getCoordAtDist(m) }
      });
    }
    map.addSource('mile-markers', { type: 'geojson', data: MILE_MARKER_GEOJSON });
    map.addLayer({
      id: 'mile-markers-circle', type: 'circle', source: 'mile-markers',
      paint: {
        'circle-radius': CONFIG.mileMarkerRadius || 10,
        'circle-color': CONFIG.mileMarkerFillColor,
        'circle-stroke-color': CONFIG.mileMarkerStrokeColor,
        'circle-stroke-width': 2
      },
      filter: ['step', ['zoom'], ['==', ['get', 'priority'], 1], 13.5, true]
    });
    map.addLayer({
      id: 'mile-markers-label', type: 'symbol', source: 'mile-markers',
      layout: {
        'text-field': ['get', 'label'],
        'text-font': ['Noto Sans Medium'],
        'text-size': 10,
        'text-allow-overlap': true
      },
      paint: { 'text-color': CONFIG.mileMarkerTextColor || '#fff' },
      filter: ['step', ['zoom'], ['==', ['get', 'priority'], 1], 13.5, true]
    });

    // Aid station markers (hidden by default)
    if (CONFIG.aidStations) {
      CONFIG.aidStations.forEach(function(station) {
        var coords = getCoordAtDist(station.mile);
        var el = document.createElement('div');
        el.className = 'aid-marker';
        var aidColor = CONFIG.colors.aidStation || CONFIG.colors.primary;
        el.innerHTML = '<svg viewBox="0 0 28 28"><circle cx="14" cy="14" r="11" fill="' + aidColor + '" stroke="#fff" stroke-width="2"/><text x="14" y="18" text-anchor="middle" font-size="14" font-weight="bold" fill="#fff">+</text></svg>';
        var marker = new maplibregl.Marker({ element: el })
          .setLngLat(coords)
          .setPopup(new maplibregl.Popup({ offset: 15 }).setHTML(
            '<strong style="color:' + aidColor + '">' + station.name + '</strong>' +
            '<br><span style="color:#888">Mile ' + station.mile + '</span>' +
            (station.services ? '<br><span style="font-size:0.8rem;color:#555">' + station.services + '</span>' : '')
          ));
        aidMarkers.push(marker);
      });
    }

    // Fit to course bounds
    var bounds = new maplibregl.LngLatBounds();
    CONFIG.courseCoords.forEach(function(coord) { bounds.extend(coord); });
    map.fitBounds(bounds, { padding: 40 });

    // Call map-specific post-load hook
    if (typeof onMapLoaded === 'function') onMapLoaded();
  });
}
