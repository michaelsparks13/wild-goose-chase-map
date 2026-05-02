#!/usr/bin/env node
'use strict';
// Snap Tinman GPX tracks to actual roads via OSRM map-matching.
// The 2015 Garmin GPX files have noticeable GPS drift (parallel-to-road offsets,
// corner-cutting). OSRM's /match endpoint snaps a noisy trace back to OSM roads.

const fs = require('fs');
const path = require('path');
const https = require('https');

const GPX_DIR = '/Users/Sparks/Documents/false-summit-studio/tinman/gpx';
const OUT_DIR = path.join(__dirname, '..', 'src', 'maps', 'tinman', 'data');

// OSRM public demo. Profile 'driving' = vehicular roads only (cleaner than 'foot' for paved courses).
const OSRM_HOST = 'router.project-osrm.org';
const OSRM_PROFILE = 'driving';

const CHUNK = 10;        // OSRM public demo caps /match at ~10 trace coords
const OVERLAP = 2;       // overlap between chunks to avoid stitch jumps
const RADIUS = 25;       // meters of search radius (demo server caps the radius)

// Official course distances from tupperlaketinman.com — used to rescale snapped
// paths so mile markers and aid-station mileages match published values.
const OFFICIAL_MILES = { sprint: 3.1, olympic: 6.2, tinman: 13.1 };

function parseGpx(filename) {
  const xml = fs.readFileSync(path.join(GPX_DIR, filename), 'utf8');
  const trkpts = [];
  const trkRe = /<trkpt\s+lat="([\-\d\.]+)"\s+lon="([\-\d\.]+)">[\s\S]*?<ele>([\d\.]+)<\/ele>[\s\S]*?<\/trkpt>/g;
  for (const m of xml.matchAll(trkRe)) {
    trkpts.push({ lat: parseFloat(m[1]), lng: parseFloat(m[2]), ele: parseFloat(m[3]) });
  }
  const wpts = [];
  const wptRe = /<wpt\s+lat="([\-\d\.]+)"\s+lon="([\-\d\.]+)">([\s\S]*?)<\/wpt>/g;
  for (const m of xml.matchAll(wptRe)) {
    const inner = m[3];
    const nameMatch = inner.match(/<name>([^<]+)<\/name>/);
    const cmtMatch = inner.match(/<cmt>([^<]+)<\/cmt>/);
    wpts.push({
      lat: parseFloat(m[1]),
      lng: parseFloat(m[2]),
      name: nameMatch ? nameMatch[1] : '',
      cmt: cmtMatch ? cmtMatch[1] : '',
    });
  }
  return { trkpts, wpts };
}

function dist(p1, p2) {
  const dLng = (p2.lng - p1.lng) * Math.cos((p1.lat + p2.lat) / 2 * Math.PI / 180) * 69.172;
  const dLat = (p2.lat - p1.lat) * 69.172;
  return Math.sqrt(dLng * dLng + dLat * dLat);
}

function metersToFeet(m) { return m * 3.28084; }

function smoothEle(values, window) {
  const n = values.length;
  const out = new Array(n);
  const half = Math.floor(window / 2);
  for (let i = 0; i < n; i++) {
    let sum = 0, count = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(n - 1, i + half); j++) {
      sum += values[j];
      count++;
    }
    out[i] = sum / count;
  }
  return out;
}

function simplify(pts, maxPts) {
  if (pts.length <= maxPts) return pts;
  const stride = Math.ceil(pts.length / maxPts);
  const out = [];
  for (let i = 0; i < pts.length; i += stride) out.push(pts[i]);
  if (out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]);
  return out;
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 30_000 }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
          return;
        }
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
  });
}

async function matchChunk(chunk) {
  const coordStr = chunk.map(p => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
  const radiusStr = chunk.map(() => RADIUS).join(';');
  const url = `https://${OSRM_HOST}/match/v1/${OSRM_PROFILE}/${coordStr}?geometries=geojson&overview=full&radiuses=${radiusStr}&gaps=ignore&tidy=true`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const data = await httpGet(url);
      if (data.code !== 'Ok' || !data.matchings || !data.matchings.length) {
        throw new Error(`OSRM returned ${data.code}: ${data.message || ''}`);
      }
      // Concatenate all matching geometries (rare to have multiple, but possible with gaps)
      const allCoords = [];
      for (const m of data.matchings) {
        for (const c of m.geometry.coordinates) allCoords.push(c);
      }
      return allCoords;
    } catch (e) {
      console.warn(`  Match attempt ${attempt} failed: ${e.message}`);
      if (attempt === 3) throw e;
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
}

async function snapTrack(trkpts) {
  // Simplify input to ~120 points (CHUNK=10 → 12 OSRM requests). More points
  // helps OSRM disambiguate close-by parallel roads.
  const inputCount = Math.min(trkpts.length, 120);
  const simplified = simplify(trkpts, inputCount);
  console.log(`  Simplified ${trkpts.length} → ${simplified.length} input points before matching`);

  const allMatched = [];
  for (let i = 0; i < simplified.length; i += (CHUNK - OVERLAP)) {
    const end = Math.min(i + CHUNK, simplified.length);
    const chunk = simplified.slice(i, end);
    if (chunk.length < 2) break;
    console.log(`  Matching chunk ${i}..${end} (${chunk.length} pts)...`);
    const coords = await matchChunk(chunk);
    if (allMatched.length && coords.length) {
      // Drop a small overlap from the start of new chunk to avoid duplicating the seam
      coords.splice(0, Math.min(3, coords.length));
    }
    for (const c of coords) allMatched.push(c);
    if (end >= simplified.length) break;
    await new Promise(r => setTimeout(r, 250)); // be nice to demo server
  }
  return allMatched;
}

// Re-derive elevation profile from snapped coords by re-projecting onto original
// trackpoints. For each snapped coord, find the closest original trackpoint and
// take its elevation; also recompute cumulative distance from snapped coords.
function buildProfile(snappedCoords, originalTrkpts) {
  const dists = [0];
  for (let i = 1; i < snappedCoords.length; i++) {
    const a = { lng: snappedCoords[i - 1][0], lat: snappedCoords[i - 1][1] };
    const b = { lng: snappedCoords[i][0], lat: snappedCoords[i][1] };
    dists.push(dists[i - 1] + dist(a, b));
  }
  // Nearest-original elevation lookup
  const eles = snappedCoords.map(c => {
    let bestE = originalTrkpts[0].ele, bestD = Infinity;
    const p = { lng: c[0], lat: c[1] };
    for (const t of originalTrkpts) {
      const d = dist(p, t);
      if (d < bestD) { bestD = d; bestE = t.ele; }
    }
    return bestE;
  });
  const smoothed = smoothEle(eles, 7);
  return { dists, eles: smoothed };
}

async function processRace(filename, slug) {
  console.log(`\n=== ${slug} (${filename}) ===`);
  const { trkpts, wpts } = parseGpx(filename);
  console.log(`  GPX: ${trkpts.length} trackpoints, ${wpts.length} waypoints`);

  const officialMiles = OFFICIAL_MILES[slug];

  const snapped = await snapTrack(trkpts);
  console.log(`  Snapped to ${snapped.length} road-aligned coordinates`);

  const { dists, eles } = buildProfile(snapped, trkpts);
  const rawTotal = dists[dists.length - 1];
  // Rescale snapped cumulative distance to official miles so mile markers and
  // profile align with published values regardless of map-matching overshoot.
  const scale = officialMiles / rawTotal;
  for (let i = 0; i < dists.length; i++) dists[i] *= scale;

  let gain = 0;
  for (let i = 1; i < eles.length; i++) {
    const dEle = metersToFeet(eles[i]) - metersToFeet(eles[i - 1]);
    if (dEle > 0) gain += dEle;
  }
  console.log(`  Snapped raw: ${rawTotal.toFixed(2)} mi → rescaled to ${officialMiles} mi (factor ${scale.toFixed(3)})`);
  console.log(`  Gain: ${Math.round(gain)} ft`);

  // Use original GPX cumulative distances for aid station mileage (preserves
  // out-and-back two-pass mileages), then rescale to official.
  const origDists = [0];
  for (let i = 1; i < trkpts.length; i++) {
    origDists.push(origDists[i - 1] + dist(trkpts[i - 1], trkpts[i]));
  }
  const origTotal = origDists[origDists.length - 1];
  const origScale = officialMiles / origTotal;
  const totalMiles = officialMiles;

  // Reduce coordinate count for runtime perf (keep ~500 max — already close)
  const targetCount = Math.min(500, snapped.length);
  let outCoords = snapped;
  let outDists = dists;
  let outEles = eles;
  if (snapped.length > targetCount) {
    const stride = Math.ceil(snapped.length / targetCount);
    outCoords = []; outDists = []; outEles = [];
    for (let i = 0; i < snapped.length; i += stride) {
      outCoords.push(snapped[i]);
      outDists.push(dists[i]);
      outEles.push(eles[i]);
    }
    if (outCoords[outCoords.length - 1] !== snapped[snapped.length - 1]) {
      outCoords.push(snapped[snapped.length - 1]);
      outDists.push(dists[dists.length - 1]);
      outEles.push(eles[eles.length - 1]);
    }
  }

  const geojson = {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: { name: slug },
      geometry: { type: 'LineString', coordinates: outCoords },
    }],
  };

  // Sample profile to ~150 points
  const profMax = 150;
  let profile;
  if (outCoords.length <= profMax) {
    profile = outCoords.map((_, i) => ({
      d: +outDists[i].toFixed(4),
      e: Math.round(metersToFeet(outEles[i]) * 10) / 10,
    }));
  } else {
    const stride = Math.ceil(outCoords.length / profMax);
    profile = [];
    for (let i = 0; i < outCoords.length; i += stride) {
      profile.push({
        d: +outDists[i].toFixed(4),
        e: Math.round(metersToFeet(outEles[i]) * 10) / 10,
      });
    }
    if (profile[profile.length - 1].d < outDists[outDists.length - 1]) {
      profile.push({
        d: +outDists[outDists.length - 1].toFixed(4),
        e: Math.round(metersToFeet(outEles[outEles.length - 1]) * 10) / 10,
      });
    }
  }

  fs.writeFileSync(path.join(OUT_DIR, `${slug}.geojson`), JSON.stringify(geojson));
  fs.writeFileSync(path.join(OUT_DIR, `${slug}-profile.json`), JSON.stringify(profile));
  console.log(`  Wrote ${slug}.geojson (${outCoords.length} coords) and ${slug}-profile.json (${profile.length} pts)`);

  // For waypoints: derive mile from ORIGINAL GPX cumulative distance (preserves
  // out-and-back two-pass distinction), then rescale to official miles. Also
  // snap each waypoint's display location to the nearest snapped (road-aligned)
  // coordinate so the marker sits on the route line rather than offset.
  const wptsWithMiles = wpts.map(w => {
    let bestOrigIdx = 0, bestOrigD = Infinity;
    for (let i = 0; i < trkpts.length; i++) {
      const d = dist(w, trkpts[i]);
      if (d < bestOrigD) { bestOrigD = d; bestOrigIdx = i; }
    }
    let bestSnapIdx = 0, bestSnapD = Infinity;
    for (let i = 0; i < outCoords.length; i++) {
      const d = dist(w, { lng: outCoords[i][0], lat: outCoords[i][1] });
      if (d < bestSnapD) { bestSnapD = d; bestSnapIdx = i; }
    }
    return {
      lat: outCoords[bestSnapIdx][1],
      lng: outCoords[bestSnapIdx][0],
      name: w.name,
      cmt: w.cmt,
      mile: +(origDists[bestOrigIdx] * origScale).toFixed(2),
    };
  });

  return {
    slug,
    totalMiles: +totalMiles.toFixed(2),
    gain: Math.round(gain),
    coordsCount: outCoords.length,
    profileCount: profile.length,
    wpts: wptsWithMiles,
  };
}

(async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const sprint = await processRace('tinman_sprint.gpx', 'sprint');
  const olympic = await processRace('tinman_olympic.gpx', 'olympic');
  const tinman = await processRace('tinman_half.gpx', 'tinman');

  // Aid stations from Tinman half-iron run waypoints
  const seen = new Map();
  for (const w of tinman.wpts) {
    const key = w.cmt || w.name;
    if (!seen.has(key)) {
      seen.set(key, { name: w.name, cmt: w.cmt, miles: [], lng: w.lng, lat: w.lat });
    }
    seen.get(key).miles.push(w.mile);
  }
  const aidStations = Array.from(seen.values()).map(s => ({
    name: s.cmt.replace(/^Aid Station( at the | at | )/i, '').replace(/^Aid Station\s*/i, '') || s.name,
    miles: s.miles,
    lng: s.lng,
    lat: s.lat,
  }));

  fs.writeFileSync(path.join(OUT_DIR, 'aid-stations.json'), JSON.stringify(aidStations, null, 2));
  console.log('\nAid stations:');
  aidStations.forEach(a => console.log(`  ${a.name} - miles ${a.miles.join(', ')}`));

  console.log('\nSummary:');
  console.log(`  Sprint:  ${sprint.totalMiles} mi, ${sprint.gain} ft gain (${sprint.coordsCount} coords)`);
  console.log(`  Olympic: ${olympic.totalMiles} mi, ${olympic.gain} ft gain (${olympic.coordsCount} coords)`);
  console.log(`  Tinman:  ${tinman.totalMiles} mi, ${tinman.gain} ft gain (${tinman.coordsCount} coords)`);
})().catch(err => { console.error(err); process.exit(1); });
