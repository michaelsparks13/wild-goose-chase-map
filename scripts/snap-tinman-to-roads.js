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

// Render an OSRM maneuver into a runner-friendly instruction string.
function describeStep(step, isFirst, isLast) {
  const m = step.maneuver || {};
  const type = m.type || '';
  const modifier = m.modifier || '';
  const name = (step.name || step.ref || '').trim();
  const onRoad = name ? ` onto ${name}` : '';
  const continueOn = name ? ` on ${name}` : '';

  if (isFirst || type === 'depart') {
    const dir = bearingToCompass(m.bearing_after);
    return `Head ${dir}${continueOn}`;
  }
  if (isLast || type === 'arrive') {
    return `Arrive at finish${name ? ` on ${name}` : ''}`;
  }
  if (modifier === 'uturn' || type === 'continue' && modifier === 'uturn') {
    return `Make a U-turn${continueOn}`;
  }
  if (type === 'turn') {
    return `Turn ${modifier}${onRoad}`;
  }
  if (type === 'continue') {
    return `Continue${modifier && modifier !== 'straight' ? ` ${modifier}` : ''}${continueOn}`;
  }
  if (type === 'merge') return `Merge${modifier ? ` ${modifier}` : ''}${onRoad}`;
  if (type === 'fork') return `Keep ${modifier || 'straight'}${onRoad}`;
  if (type === 'end of road') return `Turn ${modifier || 'right'}${onRoad}`;
  if (type === 'roundabout' || type === 'rotary') return `Take the roundabout${onRoad}`;
  // Fallback: capitalize the type
  const verb = type.replace(/^./, c => c.toUpperCase());
  return `${verb}${modifier ? ` ${modifier}` : ''}${onRoad}`;
}

function bearingToCompass(deg) {
  if (typeof deg !== 'number') return 'forward';
  const dirs = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
  return dirs[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

function buildSteps(rawSteps, snappedCoords, snappedDists, officialMiles) {
  if (!rawSteps.length || !snappedCoords.length) return [];

  // 1) Drop intermediate depart/arrive maneuvers — OSRM emits one per leg, but we
  //    want a single overall start and finish. Keep the very first depart and very
  //    last arrive, drop everything else of those types.
  let firstDepartIdx = -1, lastArriveIdx = -1;
  for (let i = 0; i < rawSteps.length; i++) {
    const t = rawSteps[i].maneuver && rawSteps[i].maneuver.type;
    if (t === 'depart' && firstDepartIdx === -1) firstDepartIdx = i;
    if (t === 'arrive') lastArriveIdx = i;
  }
  const trimmed = rawSteps.filter((s, i) => {
    const t = s.maneuver && s.maneuver.type;
    if (t === 'depart' && i !== firstDepartIdx) return false;
    if (t === 'arrive' && i !== lastArriveIdx) return false;
    return true;
  });

  // 2) Describe each kept step. Keep bearing_after (the heading the runner
  // takes after the maneuver) so the UI can render rotated direction arrows
  // at each intersection.
  const described = trimmed.map((step, i) => {
    const isFirst = i === 0;
    const isLast = i === trimmed.length - 1;
    const m = step.maneuver || {};
    return {
      name: (step.name || '').trim(),
      type: m.type || '',
      modifier: m.modifier || '',
      location: m.location,
      bearingAfter: typeof m.bearing_after === 'number' ? m.bearing_after : null,
      bearingBefore: typeof m.bearing_before === 'number' ? m.bearing_before : null,
      distM: step.distance || 0,
      instruction: describeStep(step, isFirst, isLast),
    };
  });

  // 3) Merge consecutive steps with the same street name when the maneuver is a
  //    plain "continue" / "new name" / unnamed segment — these are just OSRM
  //    splitting one road into multiple internal legs.
  const merged = [];
  for (const s of described) {
    const last = merged[merged.length - 1];
    const isContinuation = ['continue', 'new name', 'notification', ''].includes(s.type) && s.modifier !== 'uturn';
    if (last && isContinuation && last.name === s.name) {
      last.distM += s.distM;
      continue;
    }
    // Also collapse runs of unnamed continues into the previous step.
    if (last && !s.name && isContinuation) {
      last.distM += s.distM;
      continue;
    }
    merged.push({ ...s });
  }

  // 3) Compute cumulative mile from step distances. Snapping each step's location
  //    to the nearest snapped coord doesn't work for out-and-back routes since
  //    the same lat/lng appears twice along the path. Instead, accumulate the
  //    OSRM-reported step distances and rescale to the official total miles so
  //    the running total tracks the published course length.
  const totalRawMi = merged.reduce((s, x) => s + x.distM / 1609.344, 0);
  const milesScale = totalRawMi > 0 ? officialMiles / totalRawMi : 1;
  let cumMi = 0;
  for (const s of merged) {
    s.mile = +cumMi.toFixed(2);
    cumMi += (s.distM / 1609.344) * milesScale;
  }

  return merged.map((s, idx) => ({
    n: idx + 1,
    instruction: s.instruction,
    name: s.name || null,
    type: s.type,
    modifier: s.modifier || null,
    mile: s.mile,
    distMi: +((s.distM / 1609.344) * milesScale).toFixed(2),
    location: s.location || null,
    bearingAfter: s.bearingAfter,
    bearingBefore: s.bearingBefore,
  }));
}

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
  const url = `https://${OSRM_HOST}/match/v1/${OSRM_PROFILE}/${coordStr}?geometries=geojson&overview=full&radiuses=${radiusStr}&gaps=ignore&tidy=true&steps=true`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const data = await httpGet(url);
      if (data.code !== 'Ok' || !data.matchings || !data.matchings.length) {
        throw new Error(`OSRM returned ${data.code}: ${data.message || ''}`);
      }
      const allCoords = [];
      const allSteps = [];
      for (const m of data.matchings) {
        for (const c of m.geometry.coordinates) allCoords.push(c);
        for (const leg of (m.legs || [])) {
          for (const step of (leg.steps || [])) allSteps.push(step);
        }
      }
      return { coords: allCoords, steps: allSteps };
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
  const allSteps = [];
  for (let i = 0; i < simplified.length; i += (CHUNK - OVERLAP)) {
    const end = Math.min(i + CHUNK, simplified.length);
    const chunk = simplified.slice(i, end);
    if (chunk.length < 2) break;
    const isFirst = (i === 0);
    const isLast = (end >= simplified.length);
    console.log(`  Matching chunk ${i}..${end} (${chunk.length} pts)...`);
    const { coords, steps } = await matchChunk(chunk);
    if (allMatched.length && coords.length) {
      coords.splice(0, Math.min(3, coords.length));
    }
    for (const c of coords) allMatched.push(c);
    // Collect all raw steps; cross-chunk depart/arrive cleanup happens later.
    for (const step of steps) allSteps.push(step);
    if (isLast) break;
    await new Promise(r => setTimeout(r, 250));
  }
  return { coords: allMatched, steps: allSteps };
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

  const { coords: snapped, steps: rawSteps } = await snapTrack(trkpts);
  console.log(`  Snapped to ${snapped.length} road-aligned coordinates, ${rawSteps.length} raw steps`);

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

  // Phase detection: classify each coord as 'out' (heading away from start) or
  // 'back' (heading toward start) by tracking distance-from-start. Smooth the
  // distance signal first to avoid noise-induced phase flapping. Turnarounds
  // are the local maxima where phase transitions out → back.
  const startCoord = { lng: outCoords[0][0], lat: outCoords[0][1] };
  const distFromStartRaw = outCoords.map(c => dist(startCoord, { lng: c[0], lat: c[1] }));
  const distFromStart = smoothEle(distFromStartRaw, 7); // reuse moving-average helper
  const phases = new Array(outCoords.length).fill('out');
  for (let i = 1; i < outCoords.length; i++) {
    phases[i] = distFromStart[i] >= distFromStart[i - 1] ? 'out' : 'back';
  }
  // Suppress runs shorter than minRun coords — these are GPS jitter, not real
  // phase transitions. Sweeping 3 passes converges quickly.
  const minRun = 6;
  for (let pass = 0; pass < 3; pass++) {
    let i = 0;
    while (i < phases.length) {
      let j = i;
      while (j < phases.length && phases[j] === phases[i]) j++;
      const runLen = j - i;
      if (runLen < minRun && i > 0 && j < phases.length) {
        const fillWith = phases[i - 1];
        for (let k = i; k < j; k++) phases[k] = fillWith;
      }
      i = j;
    }
  }

  // First pass: find canonical phase-run boundaries (no overlap).
  const runs = [];
  {
    let runStart = 0;
    for (let i = 1; i <= outCoords.length; i++) {
      if (i === outCoords.length || phases[i] !== phases[runStart]) {
        runs.push({ start: runStart, end: i, phase: phases[runStart] });
        runStart = i;
      }
    }
  }

  // Second pass: emit one LineString feature per run, padded with 2 overlap
  // coordinates on each side. The padding bridges the visual seam that
  // line-offset would otherwise create at phase transitions.
  const features = runs
    .map((r, idx) => {
      const padStart = Math.max(0, r.start - (idx === 0 ? 0 : 2));
      const padEnd = Math.min(outCoords.length, r.end + (idx === runs.length - 1 ? 0 : 2));
      const segCoords = outCoords.slice(padStart, padEnd);
      if (segCoords.length < 2) return null;
      return {
        type: 'Feature',
        properties: { name: slug, phase: r.phase, segIdx: idx },
        geometry: { type: 'LineString', coordinates: segCoords },
      };
    })
    .filter(Boolean);

  // Detect turnaround locations for user-visible markers. We need both:
  //   (a) MAJOR turnarounds at distance-from-start local maxima (Dugal,
  //       N. Little Wolf) — these are the published course turnarounds
  //   (b) MINOR U-turns the runner must execute mid-course (Chemical Street
  //       dead-end, town-loop reversals, finish-area U-turns) — OSRM's
  //       /match endpoint exposes these as `uturn` modifiers in the step
  //       maneuvers, so we trust those directly.
  const globalMaxDist = Math.max.apply(null, distFromStart);
  const majorThreshold = globalMaxDist * 0.92;
  const peakWindow = Math.max(15, Math.floor(outCoords.length * 0.1));
  const majorPeaks = [];
  for (let i = peakWindow; i < outCoords.length - peakWindow; i++) {
    const d = distFromStart[i];
    if (d < majorThreshold) continue;
    let isPeak = true;
    for (let j = i - peakWindow; j <= i + peakWindow; j++) {
      if (distFromStart[j] > d) { isPeak = false; break; }
    }
    if (isPeak) {
      majorPeaks.push({
        kind: 'major',
        lng: outCoords[i][0],
        lat: outCoords[i][1],
        mile: +outDists[i].toFixed(2),
      });
    }
  }

  // Mid-course U-turns from OSRM steps. We look at `rawSteps` (pre-merge) so
  // every uturn is captured even if the merged turn list collapsed it.
  const uturnSpots = [];
  let cumStepDistMi = 0;
  let firstDepartIdxRS = rawSteps.findIndex(s => s.maneuver && s.maneuver.type === 'depart');
  for (let i = 0; i < rawSteps.length; i++) {
    const m = rawSteps[i].maneuver || {};
    if (m.modifier === 'uturn' && m.location) {
      uturnSpots.push({
        kind: 'minor',
        lng: m.location[0],
        lat: m.location[1],
        // Approximate mile via cumulative step distance, rescaled to official.
        mile: 0,
      });
    }
  }
  // Re-derive mile for each uturn by snapping to nearest snapped coord, then
  // using outDists at that index. (Cumulative step distances are unreliable
  // because of chunking artifacts.)
  for (const t of uturnSpots) {
    let bestIdx = 0, bestD = Infinity;
    for (let i = 0; i < outCoords.length; i++) {
      const dx = outCoords[i][0] - t.lng;
      const dy = outCoords[i][1] - t.lat;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; bestIdx = i; }
    }
    t.mile = +outDists[bestIdx].toFixed(2);
  }

  const allCandidates = majorPeaks.concat(uturnSpots).sort((a, b) => a.mile - b.mile);
  const dedupedTurns = [];
  for (const t of allCandidates) {
    // Ignore artifacts at the very start (GPS jitter at T2) and within 0.5 mi
    // of the finish (the runner is just finishing, not navigating — the small
    // GPS-loop u-turns near T2 should not become turnaround markers).
    if (t.mile < 0.2 || t.mile > officialMiles - 0.5) continue;
    if (!dedupedTurns.length || (t.mile - dedupedTurns[dedupedTurns.length - 1].mile) > 0.4) {
      dedupedTurns.push({ lng: t.lng, lat: t.lat, mile: t.mile, kind: t.kind });
    }
  }
  console.log(`  Phases: ${features.length} segments, ${dedupedTurns.length} turnarounds at miles ${dedupedTurns.map(t => t.mile).join(', ')}`);

  const geojson = {
    type: 'FeatureCollection',
    features: features,
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
  fs.writeFileSync(path.join(OUT_DIR, `${slug}-turnarounds.json`), JSON.stringify(dedupedTurns, null, 2));
  console.log(`  Wrote ${slug}.geojson (${features.length} features) and ${slug}-profile.json (${profile.length} pts)`);

  // Build clean turn-by-turn steps: drop OSRM "depart"/"arrive", merge consecutive
  // segments that share a street name, label u-turns explicitly, and project each
  // step's start point onto the snapped path to derive a cumulative mile value.
  const cleanSteps = buildSteps(rawSteps, outCoords, outDists, officialMiles);
  fs.writeFileSync(path.join(OUT_DIR, `${slug}-steps.json`), JSON.stringify(cleanSteps, null, 2));
  console.log(`  Wrote ${slug}-steps.json (${cleanSteps.length} turn-by-turn steps)`);

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
