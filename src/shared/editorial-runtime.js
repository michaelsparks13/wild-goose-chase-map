// editorial-runtime.js — chrome wiring for the v2 athlete-first race page.
// Runs after the existing map/directions JS has populated DOM. Job list:
//   1. Relocate the legacy `.directions-section` + `.profile-section` from
//      inside the map column into the new layout slots so the cue panel
//      and elevation profile sit where the v2 chrome expects them.
//   2. Render the race-day countdown.
//   3. Fetch race-week conditions for the top-bar weather widget (best
//      effort — fall back gracefully if offline / blocked).
//   4. Detect ?embed=1 (or being framed) and apply the embed body class.
//   5. Wire cue-row hover → map highlight pan, in addition to the existing
//      click-to-pan behaviour from override.js.
//
// All work is `if (el)` guarded so the JS is a no-op on legacy maps that
// don't render the v2 chrome.

(function() {
  'use strict';

  document.addEventListener('DOMContentLoaded', boot);

  function boot() {
    if (!document.body.classList.contains('race-page')) return;

    relocateLegacySections();
    renderCountdown();
    detectEmbedMode();
    wireCueHoverSync();
    wireWeatherWidget();
    hydrateTopBarCollapse();
  }

  // ─── 6. Mobile top-bar collapse ─────────────────────────────────────
  // The header carries identity (race name) + urgency (countdown) at all
  // times, but the supporting context (edition line, gun time, weather,
  // embed buttons) eats meaningful real estate on phones. Default is
  // collapsed on mobile; the user's preference is persisted across
  // sessions via localStorage. Desktop ignores the attribute entirely.
  function hydrateTopBarCollapse() {
    var bar = document.querySelector('.top-bar');
    if (!bar) return;
    var stored;
    try { stored = localStorage.getItem('fss.topBarExpanded'); } catch (e) {}
    if (stored === 'true' || stored === 'false') {
      bar.setAttribute('data-expanded', stored);
      var btn = document.getElementById('topBarExpand');
      if (btn) btn.setAttribute('aria-expanded', stored);
    }
  }

  // Global toggle helper referenced by the inline onclick. Exposed on
  // window so the build's HTML-string templates can wire to it without
  // jQuery-style event binding.
  window.toggleTopBar = function() {
    var bar = document.querySelector('.top-bar');
    var btn = document.getElementById('topBarExpand');
    if (!bar) return;
    var next = bar.getAttribute('data-expanded') === 'true' ? 'false' : 'true';
    bar.setAttribute('data-expanded', next);
    if (btn) btn.setAttribute('aria-expanded', next);
    try { localStorage.setItem('fss.topBarExpanded', next); } catch (e) {}
  };

  // ─── 1. Relocate ────────────────────────────────────────────────────
  function relocateLegacySections() {
    var cues = document.querySelector('.course__cues');
    var dir = document.getElementById('directionsSection');
    if (cues && dir && dir.parentElement !== cues) {
      cues.appendChild(dir);
    }
    var essProfile = document.querySelector('#essentialsProfile .essentials__profile-canvas');
    var legacyProfile = document.querySelector('.profile-section');
    if (essProfile && legacyProfile) {
      while (essProfile.firstChild) essProfile.removeChild(essProfile.firstChild);
      essProfile.appendChild(legacyProfile);
      legacyProfile.style.background = 'transparent';
      legacyProfile.style.padding = '0';
      legacyProfile.style.border = '0';
    }
  }

  // ─── 2. Countdown ───────────────────────────────────────────────────
  function renderCountdown() {
    var el = document.getElementById('raceCountdown');
    if (!el) return;
    var iso = el.getAttribute('data-race-date');
    if (!iso) return;
    var raceMs = Date.parse(iso + 'T00:00:00');
    if (isNaN(raceMs)) return;
    update();
    // Re-tick once an hour — countdown is by-day, sub-day precision wastes work.
    setInterval(update, 60 * 60 * 1000);
    function update() {
      var diff = raceMs - Date.now();
      if (diff <= -86400000 * 2) {
        el.textContent = 'Past edition';
        return;
      }
      var days = Math.round(diff / 86400000);
      if (days > 1)        el.textContent = 'Race in ' + days + ' days';
      else if (days === 1) el.textContent = 'Race tomorrow';
      else if (days === 0) el.textContent = 'Race today';
      else                 el.textContent = 'Just raced';
    }
  }

  // ─── 3. Embed mode ──────────────────────────────────────────────────
  function detectEmbedMode() {
    var params = new URLSearchParams(window.location.search);
    var requested = params.get('embed') === '1';
    var framed = false;
    try { framed = window.self !== window.top; } catch (e) { framed = true; }
    if (requested || framed) {
      document.body.classList.add('race-page--embed');
      // Outbound links should escape the iframe by default.
      var links = document.querySelectorAll('a[href^="http"]:not([target])');
      for (var i = 0; i < links.length; i++) links[i].setAttribute('target', '_blank');
    }
  }

  // ─── 4. Cue hover → map highlight ───────────────────────────────────
  // override.js already wires step CLICKS to map pan/highlight. We add
  // a debounced HOVER → highlight so an athlete scanning the cue list
  // sees each cue's location as they read. Hover never auto-pans the
  // map (avoids a lurching map while reading); only click pans.
  function wireCueHoverSync() {
    var cues = document.querySelector('.course__cues');
    if (!cues) return;
    var lastHovered = null;
    cues.addEventListener('mouseover', function(e) {
      var step = e.target.closest && e.target.closest('.dir-step');
      if (!step || step === lastHovered) return;
      lastHovered = step;
      step.classList.add('dir-step--hover');
      if (typeof window.highlightStepOnMap === 'function') {
        var idx = parseInt(step.getAttribute('data-step-index'), 10);
        if (!isNaN(idx)) window.highlightStepOnMap(idx, { pan: false });
      }
    });
    cues.addEventListener('mouseout', function(e) {
      var step = e.target.closest && e.target.closest('.dir-step');
      if (step) step.classList.remove('dir-step--hover');
    });
  }

  // ─── 5. Top-bar weather widget ──────────────────────────────────────
  function wireWeatherWidget() {
    var widget = document.getElementById('rdsWeather');
    if (!widget) return;
    var temp = document.getElementById('rdsWeatherTemp');
    var cond = document.getElementById('rdsWeatherCond');
    var lat = window.CONFIG && window.CONFIG.mapCenter && window.CONFIG.mapCenter[1];
    var lng = window.CONFIG && window.CONFIG.mapCenter && window.CONFIG.mapCenter[0];
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      hide();
      return;
    }
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat
      + '&longitude=' + lng
      + '&current=temperature_2m,weather_code,wind_speed_10m'
      + '&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto';
    fetch(url, { cache: 'force-cache' })
      .then(function(r) { return r.ok ? r.json() : Promise.reject(); })
      .then(function(j) {
        var c = j && j.current;
        if (!c || typeof c.temperature_2m !== 'number') return hide();
        if (temp) temp.textContent = Math.round(c.temperature_2m) + '°';
        if (cond) cond.textContent = describeWmoCode(c.weather_code) + ' · ' + Math.round(c.wind_speed_10m) + ' mph';
      })
      .catch(hide);
    function hide() { widget.classList.add('rds-weather--unavailable'); }
  }

  function describeWmoCode(c) {
    if (c == null) return '—';
    if (c === 0) return 'Clear';
    if (c <= 2) return 'Partly cloudy';
    if (c === 3) return 'Overcast';
    if (c === 45 || c === 48) return 'Fog';
    if (c >= 51 && c <= 57) return 'Drizzle';
    if (c >= 61 && c <= 67) return 'Rain';
    if (c >= 71 && c <= 77) return 'Snow';
    if (c >= 80 && c <= 82) return 'Showers';
    if (c >= 95) return 'Thunderstorm';
    return 'Variable';
  }
})();
