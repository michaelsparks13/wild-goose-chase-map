// embed-params.js - Parse URL params and apply overrides for embed mode
// Self-contained IIFE. Runs before initMap(). Only included in embed builds.

(function() {
  if (!document.body.classList.contains('embed-mode')) return;

  var params = new URLSearchParams(window.location.search);

  // Theme override
  var theme = params.get('theme');
  if (theme === 'dark') {
    document.documentElement.style.setProperty('--bg', '#1a1a2e');
    document.documentElement.style.setProperty('--bg-card', '#16213e');
    document.documentElement.style.setProperty('--bg-alt', '#0f3460');
    document.documentElement.style.setProperty('--text', '#ffffff');
    document.documentElement.style.setProperty('--text-secondary', '#cccccc');
    document.documentElement.style.setProperty('--text-muted', '#999999');
    document.documentElement.style.setProperty('--border', '#2a2a4a');
    var poweredBy = document.querySelector('.powered-by');
    if (poweredBy) poweredBy.style.background = 'rgba(0,0,0,0.5)';
  }

  // Accent color override
  var accent = params.get('accent');
  if (accent && /^[0-9a-fA-F]{3,6}$/.test(accent)) {
    var color = '#' + accent;
    document.documentElement.style.setProperty('--primary', color);
    document.documentElement.style.setProperty('--primary-dark', color);
  }

  // Zoom override (guard for skipSharedJs maps where CONFIG may not exist)
  var zoom = params.get('zoom');
  if (zoom && typeof CONFIG !== 'undefined') {
    CONFIG.mapZoom = parseFloat(zoom);
  }

  // Height mode
  if (params.get('height') === 'compact') {
    document.body.classList.add('compact');
  }

  // Feature visibility: hide specific sections
  var hide = params.get('hide');
  if (hide) {
    hide.split(',').forEach(function(feature) {
      document.body.setAttribute('data-embed-hide-' + feature.trim(), '');
    });
  }

  // Feature visibility: show only specific sections (hide everything else)
  var show = params.get('show');
  if (show) {
    var allFeatures = ['elevation', 'stats', 'description', 'simulator'];
    var shown = show.split(',').map(function(s) { return s.trim(); });
    allFeatures.forEach(function(feature) {
      if (shown.indexOf(feature) === -1) {
        document.body.setAttribute('data-embed-hide-' + feature, '');
      }
    });
  }

  // Default view
  var view = params.get('view');
  if (view === 'sim') {
    window._embedDefaultView = 'sim';
  }

  // postMessage API for parent page control
  window.addEventListener('message', function(event) {
    if (!event.data || typeof event.data !== 'object') return;
    var msg = event.data;

    if (msg.type === 'fss:switchView' && typeof switchView === 'function') {
      switchView(msg.view);
    }
    if (msg.type === 'fss:flyTo' && typeof map !== 'undefined' && map) {
      map.flyTo({ center: msg.center, zoom: msg.zoom || 14 });
    }
    if (msg.type === 'fss:toggleLayer' && typeof msg.layer === 'string') {
      if (msg.layer === 'trails' && typeof toggleTrails === 'function') toggleTrails();
      if (msg.layer === 'aid' && typeof toggleAidStations === 'function') toggleAidStations();
      if (msg.layer === '3d' && typeof toggle3D === 'function') toggle3D();
      if (msg.layer === 'course' && typeof toggleCourse === 'function') toggleCourse();
    }
  });

  // Notify parent that embed is ready
  if (window.parent !== window) {
    var slug = '';
    if (typeof CONFIG !== 'undefined' && CONFIG.slug) {
      slug = CONFIG.slug;
    } else {
      // Fallback: extract slug from URL path (/embed/some-slug/)
      var parts = window.location.pathname.split('/').filter(Boolean);
      slug = parts[parts.length - 1] || '';
    }
    window.parent.postMessage({ type: 'fss:ready', slug: slug }, '*');
  }
})();
