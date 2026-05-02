#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

const GPX_DIR = '/Users/Sparks/Documents/false-summit-studio/tinman/gpx';
const OUT_DIR = path.join(__dirname, '..', 'src', 'maps', 'tinman', 'data');

function parseGpx(filename) {
  const xml = fs.readFileSync(path.join(GPX_DIR, filename), 'utf8');
  const trkpts = [];
  const trkRe = /<trkpt\s+lat="([\-\d\.]+)"\s+lon="([\-\d\.]+)">[\s\S]*?<ele>([\d\.]+)<\/ele>[\s\S]*?<\/trkpt>/g;
  for (const m of xml.matchAll(trkRe)) {
    trkpts.push({
      lat: parseFloat(m[1]),
      lng: parseFloat(m[2]),
      ele: parseFloat(m[3]),
    });
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

function simplify(pts, maxPts) {
  if (pts.length <= maxPts) return pts;
  const stride = Math.ceil(pts.length / maxPts);
  const out = [];
  for (let i = 0; i < pts.length; i += stride) out.push(pts[i]);
  if (out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]);
  return out;
}

function smoothEle(pts, window) {
  const n = pts.length;
  const eleSm = new Array(n);
  const half = Math.floor(window / 2);
  for (let i = 0; i < n; i++) {
    let sum = 0, count = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(n - 1, i + half); j++) {
      sum += pts[j].ele;
      count++;
    }
    eleSm[i] = sum / count;
  }
  return eleSm;
}

function processRace(filename, slug) {
  const { trkpts, wpts } = parseGpx(filename);
  console.log(`${slug}: ${trkpts.length} trackpoints, ${wpts.length} waypoints`);

  const dists = [0];
  for (let i = 1; i < trkpts.length; i++) {
    dists.push(dists[i - 1] + dist(trkpts[i - 1], trkpts[i]));
  }
  const totalMiles = dists[dists.length - 1];
  console.log(`  Total: ${totalMiles.toFixed(2)} miles`);

  const smEle = smoothEle(trkpts, 7);

  let gain = 0;
  for (let i = 1; i < smEle.length; i++) {
    const dEle = metersToFeet(smEle[i]) - metersToFeet(smEle[i - 1]);
    if (dEle > 0) gain += dEle;
  }
  console.log(`  Gain: ${Math.round(gain)} ft`);

  const simplified = simplify(trkpts.map((p, i) => ({ ...p, d: dists[i], eleSm: smEle[i] })), 500);

  const geojson = {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: { name: slug },
      geometry: {
        type: 'LineString',
        coordinates: simplified.map(p => [p.lng, p.lat]),
      },
    }],
  };

  const profilePts = simplify(trkpts.map((p, i) => ({ d: dists[i], e: metersToFeet(smEle[i]) })), 150);
  const profile = profilePts.map(p => ({ d: +p.d.toFixed(4), e: Math.round(p.e * 10) / 10 }));

  fs.writeFileSync(path.join(OUT_DIR, `${slug}.geojson`), JSON.stringify(geojson));
  fs.writeFileSync(path.join(OUT_DIR, `${slug}-profile.json`), JSON.stringify(profile));
  console.log(`  Wrote ${slug}.geojson and ${slug}-profile.json`);

  const wptsWithMiles = wpts.map(w => {
    let bestIdx = 0, bestD = Infinity;
    for (let i = 0; i < trkpts.length; i++) {
      const d = dist(w, trkpts[i]);
      if (d < bestD) { bestD = d; bestIdx = i; }
    }
    return { ...w, mile: +dists[bestIdx].toFixed(2) };
  });

  return {
    slug,
    totalMiles: +totalMiles.toFixed(2),
    gain: Math.round(gain),
    coordsCount: simplified.length,
    profileCount: profile.length,
    wpts: wptsWithMiles,
  };
}

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const sprint = processRace('tinman_sprint.gpx', 'sprint');
const olympic = processRace('tinman_olympic.gpx', 'olympic');
const tinman = processRace('tinman_half.gpx', 'tinman');

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
console.log('\nAid stations (Tinman half-iron run):');
aidStations.forEach(a => console.log(`  ${a.name} - miles ${a.miles.join(', ')}`));

console.log('\nSummary:');
console.log(`  Sprint:  ${sprint.totalMiles} mi, ${sprint.gain} ft gain`);
console.log(`  Olympic: ${olympic.totalMiles} mi, ${olympic.gain} ft gain`);
console.log(`  Tinman:  ${tinman.totalMiles} mi, ${tinman.gain} ft gain`);
