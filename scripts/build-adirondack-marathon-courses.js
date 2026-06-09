#!/usr/bin/env node
// Builds the per-distance course GeoJSON + elevation profile for the
// Adirondack Marathon & Half Marathon (Schroon Lake, NY). The course
// GPX is reconstructed from OpenStreetMap road geometry via OSRM (see
// adk_marathon_gpx/build_adk_gpx_overpass.py) and carries lat/lon only —
// no <ele> tags — so this script fetches per-coordinate elevation from
// the Open-Meteo Elevation API (free, no API key, batches of 100) and
// emits the same schema the rest of the catalog uses:
//   data/<id>.geojson           — FeatureCollection w/ LineString coords [lng,lat,ele_ft]
//   data/<id>-profile.json      — [{ d: cumulative miles, e: elevation feet }, ...]
//
// Reads `data/<id>.gpx` directly so the script is self-contained and can
// be rerun any time the course is regenerated. The half marathon is the
// exact back half of the marathon (Hamlet of Adirondack -> Schroon Public
// Beach), so its profile is the marathon's tail re-zeroed to mile 0.
//
// Run once from the repo root:
//   node scripts/build-adirondack-marathon-courses.js

const fs = require('fs');
const path = require('path');
const https = require('https');

const SRC = path.join(__dirname, '..', 'src', 'maps', 'adirondack-marathon', 'data');

const DISTANCES = [
  { id: 'marathon',      label: 'Adirondack Marathon',      color: '#13364A' },
  { id: 'half-marathon', label: 'Adirondack Half Marathon', color: '#3E8E5A' },
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

function dedupConsecutive(coords) {
  const out = [];
  for (let i = 0; i < coords.length; i++) {
    const c = coords[i];
    const prev = out[out.length - 1];
    if (!prev || Math.abs(c[0] - prev[0]) > 1e-7 || Math.abs(c[1] - prev[1]) > 1e-7) {
      out.push(c);
    }
  }
  return out;
}

function fetchJson(urlStr) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = https.request({
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method: 'GET',
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Bad JSON: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function fetchElevationsMeters(coords) {
  // Open-Meteo Elevation API: max 100 coordinates per request, and a
  // minute-rate-limit beyond which the API returns
  // {"error":true,"reason":"Minutely API request limit exceeded"}. We
  // back off 65s on that error and retry the same batch.
  const out = new Array(coords.length);
  const batchSize = 100;
  let done = 0;
  for (let i = 0; i < coords.length; i += batchSize) {
    const batch = coords.slice(i, i + batchSize);
    const lats = batch.map(c => c[1].toFixed(6)).join(',');
    const lons = batch.map(c => c[0].toFixed(6)).join(',');
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`;
    let json;
    for (let attempt = 0; attempt < 4; attempt++) {
      json = await fetchJson(url);
      if (json.elevation && json.elevation.length === batch.length) break;
      if (json.error && /limit/i.test(json.reason || '')) {
        process.stdout.write(`\n  rate-limited at ${done}/${coords.length}; backing off 65s (attempt ${attempt + 1})\n`);
        await new Promise(r => setTimeout(r, 65000));
        continue;
      }
      throw new Error('Open-Meteo Elevation unexpected response: ' + JSON.stringify(json).slice(0, 200));
    }
    if (!json.elevation || json.elevation.length !== batch.length) {
      throw new Error('Open-Meteo Elevation exhausted retries: ' + JSON.stringify(json).slice(0, 200));
    }
    for (let j = 0; j < batch.length; j++) out[i + j] = json.elevation[j];
    done += batch.length;
    process.stdout.write(`\r  elevation: ${done}/${coords.length}`);
    // Heavier courtesy delay (1.2s) so the full course stays well under
    // the minute budget. Bursting trips the limiter.
    if (i + batchSize < coords.length) await new Promise(r => setTimeout(r, 1200));
  }
  process.stdout.write('\n');
  return out;
}

function parseGpxCoords(filePath) {
  const txt = fs.readFileSync(filePath, 'utf8');
  const trkptRe = /<trkpt\s+lat="([\d.\-]+)"\s+lon="([\d.\-]+)"/g;
  const out = [];
  for (const m of txt.matchAll(trkptRe)) {
    out.push([parseFloat(m[2]), parseFloat(m[1])]); // [lng, lat]
  }
  return out;
}

async function buildOne(d) {
  console.log(`\n[${d.id}] reading GPX…`);
  const rawCoords = parseGpxCoords(path.join(SRC, d.id + '.gpx'));
  if (!rawCoords.length) throw new Error(`No trkpts in ${d.id}.gpx`);

  // 2D dedup + DP simplify FIRST (saves elevation API quota).
  const flat = dedupConsecutive(rawCoords.map(c => [c[0], c[1]]));
  const simplified = douglasPeucker(flat, 0.00003); // ~3.3m
  console.log(`[${d.id}] raw=${rawCoords.length}  deduped=${flat.length}  simplified=${simplified.length}`);

  // Cumulative km from simplified line
  const cumKm = [0];
  for (let i = 1; i < simplified.length; i++) {
    cumKm.push(cumKm[i - 1] + haversineKm(simplified[i - 1][1], simplified[i - 1][0], simplified[i][1], simplified[i][0]));
  }
  const totalKm = cumKm[cumKm.length - 1];
  const totalMi = totalKm * KM_TO_MI;
  console.log(`[${d.id}] distance: ${totalKm.toFixed(2)} km · ${totalMi.toFixed(2)} mi`);

  // Fetch elevation in meters for each simplified vertex
  console.log(`[${d.id}] fetching elevation for ${simplified.length} points…`);
  const eleM = await fetchElevationsMeters(simplified);

  // Light 5-point window smoothing to absorb DEM tile-boundary noise
  const smoothed = eleM.map((_, i) => {
    let s = 0, c = 0;
    for (let j = Math.max(0, i - 2); j <= Math.min(eleM.length - 1, i + 2); j++) {
      if (eleM[j] !== null && eleM[j] !== undefined) { s += eleM[j]; c++; }
    }
    return c ? s / c : 0;
  });

  let gainM = 0;
  for (let i = 1; i < smoothed.length; i++) {
    const delta = smoothed[i] - smoothed[i - 1];
    if (delta > 0) gainM += delta;
  }
  const minEleM = Math.min(...smoothed);
  const maxEleM = Math.max(...smoothed);

  const coords3d = simplified.map((c, i) => [
    +c[0].toFixed(6),
    +c[1].toFixed(6),
    Math.round(smoothed[i] * M_TO_FT),
  ]);

  // Profile: aim for ~250-1000 samples (1 per 0.05-0.1 mi)
  const profile = [];
  const targetSamples = Math.min(1200, Math.max(250, Math.round(totalMi * 25)));
  const stepMi = totalMi / targetSamples;
  let idx = 0;
  for (let s = 0; s <= totalMi + stepMi / 2; s += stepMi) {
    const kmTarget = s / KM_TO_MI;
    while (idx < cumKm.length - 1 && cumKm[idx + 1] < kmTarget) idx++;
    profile.push({ d: +s.toFixed(3), e: +(smoothed[idx] * M_TO_FT).toFixed(1) });
  }

  const gainFt = Math.round(gainM * M_TO_FT);
  const fc = {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {
        name: d.label,
        loop: d.id,
        color: d.color,
        distance_km: +totalKm.toFixed(2),
        distance_mi: +totalMi.toFixed(2),
        gain_m: Math.round(gainM),
        gain_ft: gainFt,
        loss_m: Math.round(gainM),
        loss_ft: gainFt,
        min_ele_m: Math.round(minEleM),
        max_ele_m: Math.round(maxEleM),
        min_ele_ft: Math.round(minEleM * M_TO_FT),
        max_ele_ft: Math.round(maxEleM * M_TO_FT),
      },
      geometry: {
        type: 'LineString',
        coordinates: coords3d,
      },
    }],
  };

  fs.writeFileSync(path.join(SRC, d.id + '.geojson'), JSON.stringify(fc));
  fs.writeFileSync(path.join(SRC, d.id + '-profile.json'), JSON.stringify(profile));
  return {
    id: d.id,
    rawPts: rawCoords.length,
    points: coords3d.length,
    distance_mi: +totalMi.toFixed(2),
    gain_ft: gainFt,
    min_ft: Math.round(minEleM * M_TO_FT),
    max_ft: Math.round(maxEleM * M_TO_FT),
  };
}

(async () => {
  const summary = [];
  for (const d of DISTANCES) {
    summary.push(await buildOne(d));
  }
  console.log('\nConversion complete:');
  console.table(summary);
})();
