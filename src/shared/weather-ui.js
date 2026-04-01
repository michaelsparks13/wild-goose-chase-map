// Weather UI — runtime weather panel controller
// Renders build-time risk data, fetches current conditions + radar at runtime.
// No-op when CONFIG.weather is not present.

(function() {
  'use strict';
  if (typeof CONFIG === 'undefined' || !CONFIG || !CONFIG.weather) return;

  var panel = document.getElementById('weatherPanel');
  if (!panel) return;

  var weather = CONFIG.weather;
  var mapCenter = CONFIG.mapCenter;

  // --- WMO Weather Code descriptions ---
  var WMO_CODES = {
    0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Fog', 48: 'Rime fog',
    51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
    56: 'Freezing drizzle', 57: 'Heavy freezing drizzle',
    61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
    66: 'Freezing rain', 67: 'Heavy freezing rain',
    71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
    80: 'Light showers', 81: 'Showers', 82: 'Heavy showers',
    85: 'Light snow showers', 86: 'Heavy snow showers',
    95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Heavy thunderstorm'
  };

  // --- Weather condition SVG icons ---
  function weatherIcon(precipPct, size) {
    var s = size || 32;
    if (precipPct >= 60) {
      // Heavy rain / thunderstorm
      return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 64 64">' +
        '<path d="M20 28c0-8.8 7.2-16 16-16 7.2 0 13.3 4.8 15.3 11.3C55.8 24.5 60 29.5 60 35.5c0 6.6-5.4 12-12 12H18c-5.5 0-10-4.5-10-10 0-4.8 3.4-8.8 8-9.8" fill="#9e9e9e"/>' +
        '<path d="M24 52l3-8" stroke="#64B5F6" stroke-width="2.5" stroke-linecap="round"/>' +
        '<path d="M34 52l3-8" stroke="#64B5F6" stroke-width="2.5" stroke-linecap="round"/>' +
        '<path d="M44 52l3-8" stroke="#64B5F6" stroke-width="2.5" stroke-linecap="round"/>' +
        '<path d="M29 60l2-6" stroke="#64B5F6" stroke-width="2" stroke-linecap="round"/>' +
        '<path d="M39 60l2-6" stroke="#64B5F6" stroke-width="2" stroke-linecap="round"/>' +
        '</svg>';
    }
    if (precipPct >= 40) {
      // Rain
      return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 64 64">' +
        '<path d="M20 28c0-8.8 7.2-16 16-16 7.2 0 13.3 4.8 15.3 11.3C55.8 24.5 60 29.5 60 35.5c0 6.6-5.4 12-12 12H18c-5.5 0-10-4.5-10-10 0-4.8 3.4-8.8 8-9.8" fill="#bdbdbd"/>' +
        '<path d="M26 54l2-6" stroke="#64B5F6" stroke-width="2.5" stroke-linecap="round"/>' +
        '<path d="M36 54l2-6" stroke="#64B5F6" stroke-width="2.5" stroke-linecap="round"/>' +
        '</svg>';
    }
    if (precipPct >= 25) {
      // Cloudy
      return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 64 64">' +
        '<path d="M20 30c0-8.8 7.2-16 16-16 7.2 0 13.3 4.8 15.3 11.3C55.8 26.5 60 31.5 60 37.5c0 6.6-5.4 12-12 12H18c-5.5 0-10-4.5-10-10 0-4.8 3.4-8.8 8-9.8" fill="#bdbdbd"/>' +
        '</svg>';
    }
    if (precipPct >= 10) {
      // Partly cloudy (sun + cloud)
      return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 64 64">' +
        '<circle cx="22" cy="22" r="10" fill="#FFB300"/>' +
        '<line x1="22" y1="6" x2="22" y2="10" stroke="#FFB300" stroke-width="2.5" stroke-linecap="round"/>' +
        '<line x1="22" y1="34" x2="22" y2="38" stroke="#FFB300" stroke-width="2.5" stroke-linecap="round"/>' +
        '<line x1="6" y1="22" x2="10" y2="22" stroke="#FFB300" stroke-width="2.5" stroke-linecap="round"/>' +
        '<line x1="34" y1="22" x2="38" y2="22" stroke="#FFB300" stroke-width="2.5" stroke-linecap="round"/>' +
        '<line x1="10.7" y1="10.7" x2="13.5" y2="13.5" stroke="#FFB300" stroke-width="2.5" stroke-linecap="round"/>' +
        '<line x1="30.5" y1="30.5" x2="33.3" y2="33.3" stroke="#FFB300" stroke-width="2.5" stroke-linecap="round"/>' +
        '<line x1="33.3" y1="10.7" x2="30.5" y2="13.5" stroke="#FFB300" stroke-width="2.5" stroke-linecap="round"/>' +
        '<line x1="13.5" y1="30.5" x2="10.7" y2="33.3" stroke="#FFB300" stroke-width="2.5" stroke-linecap="round"/>' +
        '<path d="M28 36c0-6.6 5.4-12 12-12 5.4 0 10 3.6 11.5 8.5C54.8 33.4 58 37 58 41.5c0 5-4 9-9 9H26c-4.1 0-7.5-3.4-7.5-7.5 0-3.6 2.6-6.6 6-7.3" fill="#e0e0e0"/>' +
        '</svg>';
    }
    // Sunny / clear
    return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 64 64">' +
      '<circle cx="32" cy="32" r="14" fill="#FFB300"/>' +
      '<line x1="32" y1="8" x2="32" y2="14" stroke="#FFB300" stroke-width="3" stroke-linecap="round"/>' +
      '<line x1="32" y1="50" x2="32" y2="56" stroke="#FFB300" stroke-width="3" stroke-linecap="round"/>' +
      '<line x1="8" y1="32" x2="14" y2="32" stroke="#FFB300" stroke-width="3" stroke-linecap="round"/>' +
      '<line x1="50" y1="32" x2="56" y2="32" stroke="#FFB300" stroke-width="3" stroke-linecap="round"/>' +
      '<line x1="15" y1="15" x2="19" y2="19" stroke="#FFB300" stroke-width="3" stroke-linecap="round"/>' +
      '<line x1="45" y1="45" x2="49" y2="49" stroke="#FFB300" stroke-width="3" stroke-linecap="round"/>' +
      '<line x1="49" y1="15" x2="45" y2="19" stroke="#FFB300" stroke-width="3" stroke-linecap="round"/>' +
      '<line x1="19" y1="45" x2="15" y2="49" stroke="#FFB300" stroke-width="3" stroke-linecap="round"/>' +
      '</svg>';
  }

  // --- Weather condition label from precip probability ---
  function conditionLabel(precipPct) {
    if (precipPct >= 60) return 'Rain Likely';
    if (precipPct >= 40) return 'Showers';
    if (precipPct >= 25) return 'Cloudy';
    if (precipPct >= 10) return 'Partly Cloudy';
    return 'Mostly Sunny';
  }

  // --- Wind direction label ---
  function windDir(deg) {
    var dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
    return dirs[Math.round(deg / 22.5) % 16];
  }

  // --- Format race date for display ---
  function formatRaceDate() {
    if (!weather.raceDate) return '';
    var parts = weather.raceDate.split('-');
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[parseInt(parts[1], 10) - 1] + ' ' + parseInt(parts[2], 10) + ', ' + parts[0];
  }

  // --- Render risk summary cards ---
  function renderRiskCards() {
    var container = document.getElementById('weatherRiskCards');
    if (!container || !weather.riskSummary) return;

    var cards = ['heat', 'storm', 'air', 'wind'];
    var labels = { heat: 'Heat Stress', storm: 'Storm Risk', air: 'Air Quality', wind: 'Wind' };
    var html = '<div class="weather-risk-date">Expected Conditions \u2014 Race Day ' + formatRaceDate() + '</div>';
    for (var i = 0; i < cards.length; i++) {
      var key = cards[i];
      var r = weather.riskSummary[key];
      if (!r) continue;
      html += '<div class="weather-risk-card">' +
        '<span class="risk-dot" style="background:' + r.color + '"></span>' +
        '<div class="risk-value">' + r.label + '</div>' +
        '<div class="risk-label">' + labels[key] + '</div>' +
        '<div class="risk-detail">' + r.detail + '</div>' +
        '</div>';
    }
    container.innerHTML = html;
  }

  // --- Render daily averages ---
  function renderDailyAverages() {
    var container = document.getElementById('weatherDaily');
    if (!container || !weather.dailyAverages) return;

    var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var html = '<div class="weather-daily-section">' +
      '<div class="weather-daily-title">' + weather.dataYears + '-Year Historical Averages</div>' +
      '<div class="weather-daily-strip" id="weatherDailyStrip">';

    for (var i = 0; i < weather.dailyAverages.length; i++) {
      var d = weather.dailyAverages[i];
      var parts = d.date.split('-');
      var month = monthNames[parseInt(parts[1], 10) - 1];
      var day = parseInt(parts[2], 10);
      var dayOfWeek = d.dayLabel;
      var dateLabel = dayOfWeek + ' ' + month.substring(0, 3) + ' ' + day;

      html += '<div class="weather-day-card' + (d.isRaceDay ? ' race-day' : '') + '">' +
        '<div class="day-header">' + dateLabel + '</div>' +
        (d.isRaceDay ? '<div class="day-race-badge">Race Day</div>' : '') +
        '<div class="day-temp"><span class="day-temp-hi">' + d.temperature.avgHighF + '\u00B0</span>' +
          '<span class="day-temp-sep"> | </span>' +
          '<span class="day-temp-lo">' + d.temperature.avgLowF + '\u00B0F</span></div>' +
        '<div class="day-icon">' + weatherIcon(d.precipProbPct, 36) + '</div>' +
        '<div class="day-condition">' + conditionLabel(d.precipProbPct) + '</div>' +
        '<div class="day-precip">' +
          '<svg width="10" height="10" viewBox="0 0 16 16" style="vertical-align:-1px;margin-right:2px">' +
            '<path d="M8 2C8 2 3 8 3 11a5 5 0 0 0 10 0C13 8 8 2 8 2z" fill="#64B5F6"/>' +
          '</svg>' +
          d.precipProbPct + '% rain</div>' +
        '</div>';
    }

    html += '</div></div>';
    container.innerHTML = html;
  }

  // --- Render heat stress explainer ---
  function renderExplainer() {
    var container = document.getElementById('weatherExplainer');
    if (!container) return;

    container.innerHTML = '<div class="weather-explainer">' +
      '<div class="weather-explainer-title">What is Heat Stress Index?</div>' +
      '<div class="weather-explainer-text">Combines temperature, humidity, sun exposure, and wind ' +
      'to estimate the actual heat load on your body \u2014 the single most useful metric for runners. ' +
      'Unlike a simple temperature reading, it accounts for how humidity traps heat and how sun ' +
      'exposure raises your core temperature.</div>' +
      '</div>';
  }

  // --- Fetch current weather from Open-Meteo ---
  function fetchCurrentWeather() {
    if (!mapCenter) return;
    var lat = mapCenter[1];
    var lng = mapCenter[0];
    var url = 'https://api.open-meteo.com/v1/forecast' +
      '?latitude=' + lat + '&longitude=' + lng +
      '&current=temperature_2m,relative_humidity_2m,apparent_temperature,' +
      'weather_code,wind_speed_10m,wind_direction_10m' +
      '&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto';

    fetch(url)
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.current) renderCurrentConditions(data.current);
        else renderCurrentError();
      })
      .catch(function() { renderCurrentError(); });
  }

  // --- WMO code to SVG icon for current conditions ---
  function currentWeatherIcon(code, size) {
    var s = size || 40;
    // Map WMO codes to precip-like categories for icon reuse
    if (code >= 95) return weatherIcon(80, s);  // thunderstorm
    if (code >= 61) return weatherIcon(60, s);  // rain
    if (code >= 51) return weatherIcon(45, s);  // drizzle
    if (code >= 45) return weatherIcon(30, s);  // fog (cloudy icon)
    if (code === 3) return weatherIcon(30, s);  // overcast
    if (code === 2) return weatherIcon(15, s);  // partly cloudy
    if (code <= 1) return weatherIcon(0, s);    // clear/mainly clear
    return weatherIcon(15, s);
  }

  function renderCurrentConditions(current) {
    var container = document.getElementById('weatherCurrent');
    if (!container) return;

    var condition = WMO_CODES[current.weather_code] || 'Unknown';
    var temp = Math.round(current.temperature_2m);
    var feelsLike = Math.round(current.apparent_temperature);
    var humidity = Math.round(current.relative_humidity_2m);
    var windSpeed = Math.round(current.wind_speed_10m * 10) / 10;
    var windDirection = windDir(current.wind_direction_10m);
    var icon = currentWeatherIcon(current.weather_code, 44);

    container.innerHTML = '<div class="weather-current-section">' +
      '<div class="weather-current-title">Current Conditions at Course</div>' +
      '<div class="weather-current-card">' +
        '<div class="weather-current-main">' +
          '<div class="weather-current-icon">' + icon + '</div>' +
          '<div class="weather-current-temp">' + temp + '\u00B0F</div>' +
          '<div class="weather-current-info">' +
            '<div class="weather-current-condition">' + condition + '</div>' +
            '<div class="weather-current-feels">Feels like ' + feelsLike + '\u00B0F</div>' +
          '</div>' +
        '</div>' +
        '<div class="weather-current-details">' +
          '<div class="weather-current-detail"><span class="detail-label">Humidity</span><span class="detail-value">' + humidity + '%</span></div>' +
          '<div class="weather-current-detail"><span class="detail-label">Wind</span><span class="detail-value">' + windSpeed + ' mph ' + windDirection + '</span></div>' +
        '</div>' +
        '<div class="weather-current-updated">Updated just now</div>' +
      '</div>' +
      '</div>';

    // Update the "updated" timestamp periodically
    var updatedEl = container.querySelector('.weather-current-updated');
    if (updatedEl) {
      var startTime = Date.now();
      setInterval(function() {
        var mins = Math.round((Date.now() - startTime) / 60000);
        if (mins < 1) updatedEl.textContent = 'Updated just now';
        else updatedEl.textContent = 'Updated ' + mins + ' min ago';
      }, 30000);
    }
  }

  function renderCurrentError() {
    var container = document.getElementById('weatherCurrent');
    if (!container) return;
    container.innerHTML = '<div class="weather-current-section">' +
      '<div class="weather-current-title">Current Conditions at Course</div>' +
      '<div class="weather-current-error">Current conditions unavailable</div>' +
      '</div>';
  }

  // --- Radar mini-map in weather panel via RainViewer ---
  function fetchRadarTimestamps() {
    fetch('https://api.rainviewer.com/public/weather-maps.json')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.radar && data.radar.past && data.radar.past.length) {
          renderRadarMap(data);
        } else {
          renderRadarError();
        }
      })
      .catch(function() {
        renderRadarError();
      });
  }

  function renderRadarMap(radarData) {
    var container = document.getElementById('weatherRadar');
    if (!container || !mapCenter) return;
    if (typeof maplibregl === 'undefined') { renderRadarError(); return; }

    var latest = radarData.radar.past[radarData.radar.past.length - 1];
    var tileUrl = 'https://tilecache.rainviewer.com' + latest.path + '/256/{z}/{x}/{y}/2/1_1.png';
    var timestamp = new Date(latest.time * 1000);
    var timeLabel = timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    container.innerHTML = '<div class="weather-radar-section">' +
      '<div class="weather-radar-title">Radar</div>' +
      '<div class="weather-radar-map" id="radarMapContainer"></div>' +
      '<div class="weather-radar-meta">' +
        '<div class="weather-radar-legend">' +
          '<span>Light</span>' +
          '<div class="legend-bar">' +
            '<span style="background:#00ff00"></span>' +
            '<span style="background:#ffff00"></span>' +
            '<span style="background:#ff8800"></span>' +
            '<span style="background:#ff0000"></span>' +
            '<span style="background:#cc00cc"></span>' +
          '</div>' +
          '<span>Heavy</span>' +
        '</div>' +
        '<span>' + timeLabel + '</span>' +
      '</div>' +
      '</div>';

    // Create mini MapLibre map for radar
    try {
      var radarMap = new maplibregl.Map({
        container: 'radarMapContainer',
        style: {
          version: 8,
          sources: {
            'osm-raster': {
              type: 'raster',
              tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
              tileSize: 256,
              maxzoom: 6,
              attribution: '&copy; OpenStreetMap'
            },
            'rainviewer': {
              type: 'raster',
              tiles: [tileUrl],
              maxzoom: 6,
              tileSize: 256
            }
          },
          layers: [
            { id: 'osm', type: 'raster', source: 'osm-raster', paint: { 'raster-saturation': -0.5, 'raster-brightness-max': 0.7 } },
            { id: 'radar', type: 'raster', source: 'rainviewer', paint: { 'raster-opacity': 0.7 } }
          ]
        },
        center: mapCenter,
        zoom: 6,
        maxZoom: 6,
        interactive: false,
        attributionControl: false
      });

      // Add a dot for the course location
      radarMap.on('load', function() {
        radarMap.addSource('course-point', {
          type: 'geojson',
          data: { type: 'Point', coordinates: mapCenter }
        });
        radarMap.addLayer({
          id: 'course-dot-outline',
          type: 'circle',
          source: 'course-point',
          paint: { 'circle-radius': 6, 'circle-color': '#fff', 'circle-opacity': 0.9 }
        });
        radarMap.addLayer({
          id: 'course-dot',
          type: 'circle',
          source: 'course-point',
          paint: { 'circle-radius': 4, 'circle-color': '#ff3333', 'circle-opacity': 1 }
        });
      });
    } catch (e) {
      console.warn('Radar map init failed:', e);
      renderRadarError();
    }
  }

  function renderRadarError() {
    var container = document.getElementById('weatherRadar');
    if (!container) return;
    container.innerHTML = '<div class="weather-radar-section">' +
      '<div class="weather-radar-title">Radar</div>' +
      '<div class="weather-radar-loading">Radar unavailable</div>' +
      '</div>';
  }

  // --- Mobile collapse/expand ---
  window.toggleWeatherPanel = function() {
    var body = document.getElementById('weatherPanelBody');
    var btn = document.getElementById('weatherToggleBtn');
    if (!body) return;
    body.classList.toggle('collapsed');
    if (btn) btn.classList.toggle('collapsed', body.classList.contains('collapsed'));
  };

  // --- Init ---
  renderRiskCards();
  renderDailyAverages();
  renderExplainer();
  fetchCurrentWeather();
  fetchRadarTimestamps();

  // Refresh current weather every 10 minutes
  setInterval(fetchCurrentWeather, 600000);
})();
