#!/usr/bin/env node
/**
 * Convert Wild Goose Trail Festival GPX files to simplified GeoJSON.
 */
const fs = require('fs');
const path = require('path');

const HOME = require('os').homedir();
const OUT_DIR = path.join(__dirname, 'data');

const GPX_FILES = {
  pink: {
    path: path.join(HOME, 'Downloads', 'wild-goose-pink-loop-775m.gpx'),
    color: '#E834EC', label: 'Pink Loop', nominal_miles: 7.75, tag: 'trkpt',
  },
  blue: {
    path: path.join(HOME, 'Downloads', 'wild-goose-blue-6m.gpx'),
    color: '#0479FF', label: 'Blue Loop', nominal_miles: 6.0, tag: 'rtept',
  },
  checkered: {
    path: path.join(HOME, 'Downloads', 'wild-goose-checkered-loop-475m.gpx'),
    color: '#D4A017', label: 'Checkered Loop', nominal_miles: 4.75, tag: 'trkpt',
  },
};

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseGpxFast(filePath, tag) {
  const xml = fs.readFileSync(filePath, 'utf8');
  const coords = [];
  // Use regex to extract points — much faster than XML parser for large files
  const re = new RegExp(`<${tag}\\s+lat="([^"]+)"\\s+lon="([^"]+)"[^>]*>\\s*(?:<ele>([^<]*)</ele>)?`, 'g');
  let m;
  while ((m = re.exec(xml)) !== null) {
    coords.push([parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3] || '0')]);
  }
  return coords;
}

function dedup(coords) {
  if (coords.length === 0) return coords;
  const result = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    if (coords[i][0] !== result[result.length - 1][0] ||
        coords[i][1] !== result[result.length - 1][1]) {
      result.push(coords[i]);
    }
  }
  return result;
}

function simplify(coords, minDistM) {
  if (coords.length <= 2) return coords;
  const result = [coords[0]];
  for (let i = 1; i < coords.length - 1; i++) {
    const last = result[result.length - 1];
    if (haversine(last[0], last[1], coords[i][0], coords[i][1]) >= minDistM) {
      result.push(coords[i]);
    }
  }
  result.push(coords[coords.length - 1]);
  return result;
}

function computeStats(coords) {
  let dist = 0, gain = 0, loss = 0;
  const MtoFt = 3.28084, MtoMi = 0.000621371;
  const eles = coords.map(c => c[2] * MtoFt);

  for (let i = 1; i < coords.length; i++) {
    dist += haversine(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
    const dEle = coords[i][2] - coords[i - 1][2];
    if (dEle > 0) gain += dEle;
    else loss += Math.abs(dEle);
  }

  return {
    distance_mi: Math.round(dist * MtoMi * 100) / 100,
    gain_ft: Math.round(gain * MtoFt),
    loss_ft: Math.round(loss * MtoFt),
    min_ele_ft: Math.round(Math.min(...eles)),
    max_ele_ft: Math.round(Math.max(...eles)),
  };
}

function buildProfile(coords, targetPts = 200) {
  const MtoFt = 3.28084, MtoMi = 0.000621371;
  const full = [{ d: 0, e: Math.round(coords[0][2] * MtoFt * 10) / 10 }];
  let cumDist = 0;
  for (let i = 1; i < coords.length; i++) {
    cumDist += haversine(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
    full.push({
      d: Math.round(cumDist * MtoMi * 1000) / 1000,
      e: Math.round(coords[i][2] * MtoFt * 10) / 10,
    });
  }
  if (full.length <= targetPts) return full;
  const step = Math.floor(full.length / targetPts);
  const result = [];
  for (let i = 0; i < full.length; i += step) result.push(full[i]);
  if (result[result.length - 1] !== full[full.length - 1]) result.push(full[full.length - 1]);
  return result;
}

function processLoop(name, config) {
  console.log(`Processing ${name}...`);
  const raw = parseGpxFast(config.path, config.tag);
  console.log(`  Raw points: ${raw.length}`);

  const deduped = dedup(raw);
  console.log(`  After dedup: ${deduped.length}`);

  const stats = computeStats(deduped);
  console.log(`  Distance: ${stats.distance_mi} mi, Gain: ${stats.gain_ft} ft`);

  const profile = buildProfile(deduped);
  console.log(`  Profile points: ${profile.length}`);

  const simplified = deduped.length > 400 ? simplify(deduped, 15) : deduped;
  console.log(`  Simplified: ${simplified.length} points`);

  const geojson = {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {
        name: config.label,
        loop: name,
        color: config.color,
        nominal_miles: config.nominal_miles,
        ...stats,
      },
      geometry: {
        type: 'LineString',
        coordinates: simplified.map(c => [c[1], c[0], c[2]]),  // [lon, lat, ele]
      },
    }],
    profile,
  };

  const outPath = path.join(OUT_DIR, `${name}.geojson`);
  fs.writeFileSync(outPath, JSON.stringify(geojson));
  const size = Math.round(fs.statSync(outPath).size / 1024);
  console.log(`  Wrote ${outPath} (${size} KB)`);
  return geojson;
}

// Main
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const allData = {};
for (const [name, config] of Object.entries(GPX_FILES)) {
  allData[name] = processLoop(name, config);
}

console.log('\n=== Summary ===');
for (const [name, data] of Object.entries(allData)) {
  const p = data.features[0].properties;
  const nPts = data.features[0].geometry.coordinates.length;
  console.log(`${p.name}: ${p.distance_mi} mi | +${p.gain_ft}/-${p.loss_ft} ft | Ele: ${p.min_ele_ft}-${p.max_ele_ft} ft | ${nPts} pts`);
}
