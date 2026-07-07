// Pure helpers for the AR viewer — kept dependency-free so vitest can import
// them directly while build.js inlines them into the page's module script.

// Decides which AR entry to offer. WebXR gives the full experience (tap
// aid stations, scrub the timeline in AR); 'native' hands off to Scene
// Viewer / Quick Look via model-viewer's built-in button; 'none' keeps the
// page as a plain 3D viewer.
export function chooseArMode({ xrArSupported, canActivateNativeAr }) {
  if (xrArSupported) return 'webxr';
  if (canActivateNativeAr) return 'native';
  return 'none';
}

// Maps a scrubber value (0..max) to a course mile.
export function scrubValueToMile(value, max, totalMiles) {
  const frac = Math.min(Math.max(value / max, 0), 1);
  return frac * totalMiles;
}

// Formats a mile readout with one decimal (12 → "12.0").
export function formatMile(mile) {
  return (Math.round(mile * 10) / 10).toFixed(1);
}
