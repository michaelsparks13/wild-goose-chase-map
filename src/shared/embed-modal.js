// embed-modal.js - Embed code modal for the main map pages (not included in embed builds)

function getEmbedSlug() {
  if (typeof CONFIG !== 'undefined' && CONFIG.slug) return CONFIG.slug;
  // Fallback: extract slug from URL path (/maps/some-slug/)
  var parts = window.location.pathname.split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

function getEmbedUrl() {
  var base = 'https://falsesummitstudio.com/embed/' + getEmbedSlug();
  var params = [];
  if (document.getElementById('embedCompact') && document.getElementById('embedCompact').checked) {
    params.push('height=compact');
  }
  if (document.getElementById('embedNoSim') && document.getElementById('embedNoSim').checked) {
    params.push('hide=simulator');
  }
  if (document.getElementById('embedDark') && document.getElementById('embedDark').checked) {
    params.push('theme=dark');
  }
  return base + (params.length ? '?' + params.join('&') : '');
}

function buildEmbedSnippet() {
  var url = getEmbedUrl();
  return '<iframe\n  src="' + url + '"\n  width="100%" height="600"\n  style="border: none; border-radius: 8px;"\n  loading="lazy"\n  allow="geolocation"\n></iframe>';
}

function updateEmbedCode() {
  var el = document.getElementById('embedCode');
  if (el) el.textContent = buildEmbedSnippet();
  var btn = document.getElementById('embedCopyBtn');
  if (btn) btn.textContent = 'Copy';
}

function openEmbedModal() {
  updateEmbedCode();
  document.getElementById('embedBackdrop').classList.add('open');
}

function closeEmbedModal() {
  document.getElementById('embedBackdrop').classList.remove('open');
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closeEmbedModal();
});

function copyEmbedCode() {
  var code = buildEmbedSnippet();
  navigator.clipboard.writeText(code).then(function() {
    var btn = document.getElementById('embedCopyBtn');
    if (btn) {
      btn.textContent = 'Copied!';
      setTimeout(function() { btn.textContent = 'Copy'; }, 2000);
    }
  });
}
