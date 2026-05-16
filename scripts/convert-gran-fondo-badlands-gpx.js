#!/usr/bin/env node
// Converts each of the 4 Gran Fondo Badlands GPX files into a
// FeatureCollection geojson + an elevation profile array, in the same
// schema the rest of the site uses (distance in miles, elevation in feet
// — km/m metadata kept in properties so the UI can label in metric).
//
// Run from repo root:  node scripts/convert-gran-fondo-badlands-gpx.js

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src', 'maps', 'gran-fondo-badlands', 'data');

// Colors here are stored as metadata only — the actual map render
// color comes from src/themes/gran-fondo-badlands.js. Keep them in
// sync so the geojson properties don't lie. Updated 2026-05-16 after
// the accessibility audit: rust + ochre both darkened to meet WCAG
// 1.4.11 3:1 contrast against OpenFreeMap Liberty's cream substrate.
const DISTANCES = [
  { id: 'brontosaurus', label: 'Brontosaurus 163K', color: '#A24414' },
  { id: 'trex',         label: 'T-Rex 100K',        color: '#8B2668' },
  { id: 'triceratops',  label: 'Triceratops 75K',   color: '#8D5F11' },
  { id: 'velociraptor', label: 'Velociraptor 50K',  color: '#3F6B5F' },
];

const M_TO_FT = 3.28084;
const KM_TO_MI = 0.621371;
const R_KM = 6371.0;

function haversineKm(lat1, lon1, lat2, lon2) {
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const dphi = phi2 - phi1;
  const dlam = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dphi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlam / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.sqrt(a));
}

function parseGpx(filePath) {
  const txt = fs.readFileSync(filePath, 'utf8');
  const trkptRe = /<trkpt\s+lat="([\d.\-]+)"\s+lon="([\d.\-]+)"[^>]*>([\s\S]*?)<\/trkpt>/g;
  const eleRe = /<ele>([\d.\-]+)<\/ele>/;
  const pts = [];
  for (const m of txt.matchAll(trkptRe)) {
    const eleM = m[3].match(eleRe);
    pts.push({
      lat: +m[1],
      lon: +m[2],
      ele_m: eleM ? +eleM[1] : null,
    });
  }
  return pts;
}

// Lightweight Douglas-Peucker simplification on [lon,lat] pairs to keep
// the inlined coord stream reasonable for mobile bandwidth. Tolerance in
// degrees — at this latitude (~51°N) 0.00003° ≈ 3.3m, finer than GPS noise.
function douglasPeucker(coords, tolerance) {
  if (coords.length <= 2) return coords;
  const n = coords.length;
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let maxD = 0, maxIdx = -1;
    const [x1, y1] = coords[s];
    const [x2, y2] = coords[e];
    const dx = x2 - x1, dy = y2 - y1;
    const denom = Math.sqrt(dx * dx + dy * dy);
    for (let i = s + 1; i < e; i++) {
      const [x, y] = coords[i];
      let d;
      if (denom === 0) d = Math.hypot(x - x1, y - y1);
      else d = Math.abs(dy * x - dx * y + x2 * y1 - y2 * x1) / denom;
      if (d > maxD) { maxD = d; maxIdx = i; }
    }
    if (maxIdx > 0 && maxD > tolerance) {
      keep[maxIdx] = 1;
      stack.push([s, maxIdx]);
      stack.push([maxIdx, e]);
    }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(coords[i]);
  return out;
}

function buildOutputs(slug, label, color) {
  const gpxPath = path.join(SRC, slug + '.gpx');
  const pts = parseGpx(gpxPath);
  if (!pts.length) throw new Error(`No trkpts in ${gpxPath}`);

  const cumKm = [0];
  for (let i = 1; i < pts.length; i++) {
    cumKm.push(cumKm[i - 1] + haversineKm(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon));
  }
  const totalKm = cumKm[pts.length - 1];

  const eleM = pts.map(p => p.ele_m);
  const smoothed = eleM.map((_, i) => {
    let s = 0, c = 0;
    for (let j = Math.max(0, i - 2); j <= Math.min(eleM.length - 1, i + 2); j++) {
      if (eleM[j] !== null) { s += eleM[j]; c++; }
    }
    return c ? s / c : null;
  });
  let gainM = 0;
  for (let i = 1; i < smoothed.length; i++) {
    if (smoothed[i - 1] !== null && smoothed[i] !== null) {
      const d = smoothed[i] - smoothed[i - 1];
      if (d > 0) gainM += d;
    }
  }
  const minEleM = Math.min(...smoothed.filter(v => v !== null));
  const maxEleM = Math.max(...smoothed.filter(v => v !== null));

  const rawCoords = pts.map(p => [
    +p.lon.toFixed(6),
    +p.lat.toFixed(6),
    p.ele_m !== null ? Math.round(p.ele_m * M_TO_FT) : 0,
  ]);
  const simplified = douglasPeucker(rawCoords, 0.00003);

  const profile = [];
  const totalMi = totalKm * KM_TO_MI;
  const targetSamples = Math.min(2000, Math.max(400, Math.round(totalMi * 12)));
  const stepMi = totalMi / targetSamples;
  let idx = 0;
  for (let s = 0; s <= totalMi + stepMi / 2; s += stepMi) {
    const kmTarget = s / KM_TO_MI;
    while (idx < cumKm.length - 1 && cumKm[idx + 1] < kmTarget) idx++;
    const eM = smoothed[idx] !== null ? smoothed[idx] : 0;
    profile.push({ d: +s.toFixed(3), e: +(eM * M_TO_FT).toFixed(1) });
  }

  const distanceMi = +totalMi.toFixed(2);
  const gainFt = Math.round(gainM * M_TO_FT);
  const minEleFt = Math.round(minEleM * M_TO_FT);
  const maxEleFt = Math.round(maxEleM * M_TO_FT);

  const fc = {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {
        name: label,
        loop: slug,
        color,
        distance_km: +totalKm.toFixed(2),
        distance_mi: distanceMi,
        gain_m: Math.round(gainM),
        gain_ft: gainFt,
        loss_m: Math.round(gainM),
        loss_ft: gainFt,
        min_ele_m: Math.round(minEleM),
        max_ele_m: Math.round(maxEleM),
        min_ele_ft: minEleFt,
        max_ele_ft: maxEleFt,
      },
      geometry: {
        type: 'LineString',
        coordinates: simplified,
      },
    }],
  };

  return { fc, profile, stats: {
    rawPts: pts.length,
    simplifiedPts: simplified.length,
    distance_km: +totalKm.toFixed(2),
    gain_m: Math.round(gainM),
  }};
}

const summary = [];
for (const d of DISTANCES) {
  const out = buildOutputs(d.id, d.label, d.color);
  fs.writeFileSync(path.join(SRC, d.id + '.geojson'), JSON.stringify(out.fc));
  fs.writeFileSync(path.join(SRC, d.id + '-profile.json'), JSON.stringify(out.profile));
  summary.push({ id: d.id, ...out.stats });
}
console.log('Conversion complete:');
console.table(summary);
