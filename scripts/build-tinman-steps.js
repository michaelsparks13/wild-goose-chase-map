#!/usr/bin/env node
'use strict';

// Build accurate turn-by-turn cue lists for the Tupper Lake Tinman run courses.
//
// Pipeline:
//   1. Parse GPX → trkpts
//   2. Map-match to OSM roads via OSRM /match (chunks of 8 with overlap of 4)
//   3. Walk the snapped polyline; detect turns from local heading deltas
//   4. For each turn, query OSRM /nearest at points before & after to learn the
//      OSM way names; classify left / right / U-turn from signed bearing delta
//   5. Detect course turnarounds (distance-from-start local maxima)
//   6. Collapse chunk-boundary phantom-loop artifacts (consecutive turns at
//      effectively the same coordinate that net to a near-zero heading change)
//   7. Rescale cumulative distance to the official mileage so cues line up with
//      published mile markers
//   8. Emit clean steps to {slug}-steps.json
//
// Run: node scripts/build-tinman-steps.js
// Requires network access to router.project-osrm.org.

const fs = require('fs');
const path = require('path');
const https = require('https');

const GPX_DIR = '/Users/Sparks/Documents/false-summit-studio/tinman/gpx';
const OUT_DIR = path.join(__dirname, '..', 'src', 'maps', 'tupper-lake-tinman', 'data');

const OSRM_HOST = 'router.project-osrm.org';
const OSRM_PROFILE = 'driving';

// OSRM /match in chunks of 10 with overlap of 2 — same as snap-tinman-to-roads.js,
// which already produces a road-snapped polyline that renders correctly.
// We then run Douglas-Peucker on the result to flatten chunk-boundary
// micro-zigzags before turn detection.
const CHUNK = 10;
const OVERLAP = 2;
const RADIUS = 40;
const DP_TOLERANCE_M = 8; // simplification tolerance for turn detection only

const OFFICIAL_MILES = { sprint: 3.1, olympic: 6.2, tinman: 13.1 };

// Hand-curated road-name fixes for the Tupper Lake area. Some local roads have
// no `name=*` tag in OSM, or they have an alternate/colloquial name the race
// course description uses; this map applies after OSM/OSRM resolution. Any key
// matched verbatim against the resolved `name` (or null/empty) is replaced.
const NAME_FIXES = {
  // OSRM/OSM occasionally returns "OWD Lane" for the dead-end stub of the
  // Old Wawbeek Road / Demars Blvd junction. Locals call it Old Wawbeek Road.
  'OWD Lane': 'Old Wawbeek Road',
};

// Manual labels for road segments where OSM has no `name` tag but the runner
// needs context to navigate. Each entry: { lng, lat, radiusM, name }. Applies
// when name resolution returns no name AND the turn point is within `radiusM`.
// All coordinates verified against /tmp/tupper-roads.json way geometries.
const NAMED_FALLBACKS = [
  // High school start: tarmac driveway south to Park Street
  { lng: -74.4647, lat: 44.2300, radiusM: 60, name: 'Park Street' },
  // The unnamed paved service loop that connects Park Street to the back of
  // the high school's parking area, shared by the Sprint, Olympic, and
  // Tinman runs as the final approach to the finish line.
  { lng: -74.46513, lat: 44.22806, radiusM: 60, name: 'high school driveway' },
  { lng: -74.46543, lat: 44.22809, radiusM: 60, name: 'high school driveway' },
  // The first turn out of Park Street is onto an unnamed residential
  // connector (OSM way 20077060) that nominatim and the local Tupper Lake
  // street layout identify as Martin Street. The way itself has no `name`
  // tag in OSM, so we apply this fallback explicitly. ~90m radius covers
  // both ends of this short connector.
  { lng: -74.46591, lat: 44.22530, radiusM: 90, name: 'Martin Street' },
  { lng: -74.46632, lat: 44.22561, radiusM: 90, name: 'Martin Street' },
  // Service-road detour off Demars Boulevard at 94 Demars Blvd (Tupper Lake
  // Sunmount/OPWDD office). Used by the Tinman half mid-course as an
  // out-and-back. Both unnamed paved service ways: OSM 1382972362 and
  // 1382972364. Reverse-geocodes to 94 Demars Blvd, Faust.
  { lng: -74.46442, lat: 44.23459, radiusM: 80, name: '94 Demars Blvd driveway' },
  { lng: -74.46401, lat: 44.23400, radiusM: 80, name: '94 Demars Blvd driveway' },
  // The unnamed residential cut-through behind the Adirondack Park Preserve
  // area (OSM way 20079370 with TIGER name_base "Adirondack Park"). Sits
  // between Pine Street and Cedar Street near Tinman mile 7.
  { lng: -74.47561, lat: 44.24067, radiusM: 60, name: 'Adirondack Park Avenue' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Geometry helpers

function deg2rad(d) { return d * Math.PI / 180; }

// Distance in meters between two {lng, lat} points (haversine)
function distM(p1, p2) {
  const R = 6371000;
  const lat1 = deg2rad(p1.lat), lat2 = deg2rad(p2.lat);
  const dlat = lat2 - lat1;
  const dlng = deg2rad(p2.lng - p1.lng);
  const a = Math.sin(dlat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dlng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Initial bearing in degrees (0..360, north=0) from p1 → p2
function bearing(p1, p2) {
  const lat1 = deg2rad(p1.lat), lat2 = deg2rad(p2.lat);
  const dlng = deg2rad(p2.lng - p1.lng);
  const y = Math.sin(dlng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dlng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

// Signed bearing delta in [-180, 180]: b2 - b1, with sign convention
//   positive = right turn (clockwise), negative = left turn (counter-clockwise).
function bearingDelta(b1, b2) {
  let d = (b2 - b1 + 540) % 360 - 180;
  if (d === -180) d = 180;
  return d;
}

// Cumulative distance array along a coordinate list (each pair adds meters).
function cumulativeDistances(coords) {
  const d = [0];
  for (let i = 1; i < coords.length; i++) {
    const a = { lng: coords[i - 1][0], lat: coords[i - 1][1] };
    const b = { lng: coords[i][0], lat: coords[i][1] };
    d.push(d[i - 1] + distM(a, b));
  }
  return d;
}

// Bearing at index i, computed over a small forward window (~20m) so per-point
// GPS jitter doesn't dominate the heading reading.
function bearingAt(coords, dists, i, windowM) {
  const w = windowM == null ? 20 : windowM;
  let j = i;
  while (j + 1 < coords.length && dists[j] - dists[i] < w) j++;
  if (j === i) j = Math.min(coords.length - 1, i + 1);
  const a = { lng: coords[i][0], lat: coords[i][1] };
  const b = { lng: coords[j][0], lat: coords[j][1] };
  return bearing(a, b);
}

// Bearing entering index i, computed over a backward window (~20m).
function bearingApproach(coords, dists, i, windowM) {
  const w = windowM == null ? 20 : windowM;
  let j = i;
  while (j > 0 && dists[i] - dists[j] < w) j--;
  if (j === i) j = Math.max(0, i - 1);
  const a = { lng: coords[j][0], lat: coords[j][1] };
  const b = { lng: coords[i][0], lat: coords[i][1] };
  return bearing(a, b);
}

// ─────────────────────────────────────────────────────────────────────────────
// GPX I/O

function parseGpx(filename) {
  const xml = fs.readFileSync(path.join(GPX_DIR, filename), 'utf8');
  const trkpts = [];
  const trkRe = /<trkpt\s+lat="([\-\d\.]+)"\s+lon="([\-\d\.]+)">[\s\S]*?<ele>([\d\.]+)<\/ele>[\s\S]*?<\/trkpt>/g;
  for (const m of xml.matchAll(trkRe)) {
    trkpts.push({ lat: parseFloat(m[1]), lng: parseFloat(m[2]), ele: parseFloat(m[3]) });
  }
  return trkpts;
}

function simplify(pts, maxPts) {
  if (pts.length <= maxPts) return pts;
  const stride = Math.ceil(pts.length / maxPts);
  const out = [];
  for (let i = 0; i < pts.length; i += stride) out.push(pts[i]);
  if (out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP

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

async function withRetry(fn, label) {
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try { return await fn(); } catch (e) {
      lastErr = e;
      console.warn(`  ${label} attempt ${attempt} failed: ${e.message}`);
      if (attempt === 4) throw lastErr;
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OSRM

async function matchChunk(chunk) {
  const coordStr = chunk.map(p => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
  const radiusStr = chunk.map(() => RADIUS).join(';');
  const url = `https://${OSRM_HOST}/match/v1/${OSRM_PROFILE}/${coordStr}` +
    `?geometries=geojson&overview=full&radiuses=${radiusStr}` +
    `&gaps=ignore&tidy=true&steps=true`;
  return withRetry(async () => {
    const data = await httpGet(url);
    if (data.code !== 'Ok' || !data.matchings || !data.matchings.length) {
      throw new Error(`OSRM /match returned ${data.code}: ${data.message || ''}`);
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
  }, 'match');
}

// Stitch a new chunk onto the running polyline by finding the index in the
// new chunk whose coordinate is closest to the running polyline's tail.
// Append everything past that index. This avoids the backward-jump zigzags
// produced by naively dropping a fixed number of coords at each seam — when
// OSRM re-snaps the overlap region, its output may start slightly behind
// where the previous chunk ended, and a fixed slice can keep those "behind"
// points and create phantom U-turns.
function stitchAppend(prev, next) {
  if (prev.length === 0) return next.slice();
  if (next.length === 0) return [];
  const tail = prev[prev.length - 1];
  let bestIdx = 0, bestD = Infinity;
  // Search the entire chunk; chunks are small (≤30 coords typical) so the
  // O(n) cost is negligible compared to the round-trip latency we already pay.
  for (let i = 0; i < next.length; i++) {
    const d = distM({ lng: tail[0], lat: tail[1] }, { lng: next[i][0], lat: next[i][1] });
    if (d < bestD) { bestD = d; bestIdx = i; }
  }
  return next.slice(bestIdx + 1);
}

async function snapTrack(trkpts) {
  const inputCount = Math.min(trkpts.length, 250);
  const simplified = simplify(trkpts, inputCount);
  console.log(`  Simplified ${trkpts.length} → ${simplified.length} input points`);
  const allMatched = [];
  const allSteps = [];
  for (let i = 0; i < simplified.length; i += (CHUNK - OVERLAP)) {
    const end = Math.min(i + CHUNK, simplified.length);
    const chunk = simplified.slice(i, end);
    if (chunk.length < 2) break;
    const isLast = (end >= simplified.length);
    const { coords, steps } = await matchChunk(chunk);
    if (allMatched.length === 0) {
      for (const c of coords) allMatched.push(c);
    } else {
      const tail = stitchAppend(allMatched, coords);
      for (const c of tail) allMatched.push(c);
    }
    for (const step of steps) allSteps.push(step);
    if (isLast) break;
    await new Promise(r => setTimeout(r, 250));
  }
  return { coords: allMatched, steps: allSteps };
}

// Remove zigzag pairs: any vertex B in (A, B, C) where dist(A, C) is very small
// compared to dist(A, B) + dist(B, C) is a backward jump (chunk-boundary
// artifact where OSRM re-snapped the overlap region to a slightly different
// position before snapping back). We iterate until stable so multi-vertex
// zigzag clumps collapse fully.
function removeZigzags(coords, maxRatio, maxLoopM) {
  if (coords.length < 3) return coords.slice();
  let work = coords.slice();
  for (let pass = 0; pass < 8; pass++) {
    const out = [work[0]];
    let changed = false;
    for (let i = 1; i < work.length - 1; i++) {
      const A = out[out.length - 1];
      const B = work[i];
      const C = work[i + 1];
      const ab = distM({ lng: A[0], lat: A[1] }, { lng: B[0], lat: B[1] });
      const bc = distM({ lng: B[0], lat: B[1] }, { lng: C[0], lat: C[1] });
      const ac = distM({ lng: A[0], lat: A[1] }, { lng: C[0], lat: C[1] });
      const tripLen = ab + bc;
      // True forward step: AC ≈ AB + BC (B is between A and C). Zigzag: AC much
      // smaller than AB + BC because B is out of line. Tighten the threshold by
      // bounding the loop size, otherwise legitimate sharp turns get flattened.
      if (tripLen > 0 && ac / tripLen < maxRatio && tripLen < maxLoopM) {
        // Drop B
        changed = true;
        continue;
      }
      out.push(B);
    }
    out.push(work[work.length - 1]);
    work = out;
    if (!changed) break;
  }
  return work;
}

// Douglas-Peucker polyline simplification with tolerance in meters.
// Removes vertices whose perpendicular distance from the segment between
// their neighbors is below `tolM`. This eliminates chunk-boundary zigzags
// (sub-10m amplitude) while preserving real corners (>>10m amplitude).
function douglasPeucker(coords, tolM) {
  if (coords.length < 3) return coords.slice();
  // Convert to local meters for distance math (haversine is overkill for DP).
  const lat0 = coords[0][1] * Math.PI / 180;
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos(lat0);
  function toM(c) { return [c[0] * mPerDegLng, c[1] * mPerDegLat]; }
  const pts = coords.map(toM);

  function perpDist(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) {
      const ex = p[0] - a[0], ey = p[1] - a[1];
      return Math.sqrt(ex * ex + ey * ey);
    }
    const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
    const tx = a[0] + t * dx, ty = a[1] + t * dy;
    const ex = p[0] - tx, ey = p[1] - ty;
    return Math.sqrt(ex * ex + ey * ey);
  }

  const keep = new Array(coords.length).fill(false);
  keep[0] = true;
  keep[coords.length - 1] = true;
  const stack = [[0, coords.length - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop();
    let maxD = 0, maxI = -1;
    for (let i = lo + 1; i < hi; i++) {
      const d = perpDist(pts[i], pts[lo], pts[hi]);
      if (d > maxD) { maxD = d; maxI = i; }
    }
    if (maxD > tolM && maxI !== -1) {
      keep[maxI] = true;
      stack.push([lo, maxI]);
      stack.push([maxI, hi]);
    }
  }
  return coords.filter((_, i) => keep[i]);
}

// OSM way-network cache. Loaded lazily from data/osm-roads.json — committed
// alongside the source data. Refresh with `scripts/fetch-tupper-roads.js`.
let osmWays = null;
function loadOsmWays() {
  if (osmWays) return osmWays;
  const file = path.join(OUT_DIR, 'osm-roads.json');
  if (!fs.existsSync(file)) { osmWays = []; return osmWays; }
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  osmWays = (j.elements || []).filter(e => e.geometry && e.geometry.length >= 2);
  // Normalize geometry field name (Overpass uses `lon`, we use `lng`)
  for (const w of osmWays) for (const g of w.geometry) g.lng = g.lon;
  return osmWays;
}

// Local distance from point to a polyline segment, in meters. Equirectangular
// approximation — accurate to <1% over Tupper Lake's tiny lat span.
function distPointToSegment(p, a, b) {
  const m = (a.lat + b.lat) / 2 * Math.PI / 180;
  const mPerDegLat = 111320, mPerDegLng = 111320 * Math.cos(m);
  const px = p.lng * mPerDegLng, py = p.lat * mPerDegLat;
  const ax = a.lng * mPerDegLng, ay = a.lat * mPerDegLat;
  const bx = b.lng * mPerDegLng, by = b.lat * mPerDegLat;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function distPointToWay(p, way) {
  let best = Infinity;
  for (let i = 1; i < way.geometry.length; i++) {
    const d = distPointToSegment(p, way.geometry[i - 1], way.geometry[i]);
    if (d < best) best = d;
  }
  return best;
}

// Resolve the OSM road name at a point (lng, lat). Prefer named ways within
// `nearM` meters, even if there's a closer unnamed way — at most intersections
// the named through-road and the unnamed driveway/service-road both touch the
// same point, and OSRM's /nearest can pick the wrong one. Falls back to the
// closest unnamed way's name (which is just the highway type) only when no
// named candidate exists nearby.
function osmRoadNameAt(lng, lat, nearM) {
  const ways = loadOsmWays();
  if (!ways.length) return null;
  const p = { lng, lat };
  let bestNamed = null, bestNamedD = nearM;
  let bestAny = null, bestAnyD = Infinity;
  for (const w of ways) {
    const d = distPointToWay(p, w);
    if (d < bestAnyD) { bestAnyD = d; bestAny = w; }
    if (w.tags && w.tags.name && d < bestNamedD) {
      bestNamedD = d; bestNamed = w;
    }
  }
  if (bestNamed) return bestNamed.tags.name.trim();
  if (bestAny && bestAnyD < 3 && bestAny.tags && bestAny.tags.name) {
    return bestAny.tags.name.trim();
  }
  return null;
}

// Optional /nearest fallback for points outside the OSM bbox cache.
async function nearestRoadName(lng, lat) {
  const url = `https://${OSRM_HOST}/nearest/v1/${OSRM_PROFILE}/${lng.toFixed(6)},${lat.toFixed(6)}?number=1`;
  try {
    const data = await httpGet(url);
    if (data.code !== 'Ok' || !data.waypoints || !data.waypoints.length) return null;
    const name = (data.waypoints[0].name || '').trim();
    return name || null;
  } catch (e) {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Turn detection

// Walk the snapped polyline and emit candidate turn points. A candidate is an
// index i where the smoothed bearing change between approach (back ~20m) and
// departure (forward ~20m) exceeds `minDegrees`. We then collapse adjacent
// candidates within `mergeWindowM` into a single turn at the index of the
// largest delta.
function detectTurnsFromPolyline(coords, dists, minDegrees, mergeWindowM) {
  const turns = [];
  for (let i = 1; i < coords.length - 1; i++) {
    const bIn = bearingApproach(coords, dists, i, 25);
    const bOut = bearingAt(coords, dists, i, 25);
    const delta = bearingDelta(bIn, bOut);
    if (Math.abs(delta) >= minDegrees) {
      turns.push({ idx: i, delta, bIn, bOut, distM: dists[i] });
    }
  }
  // Merge adjacent turns within mergeWindowM, keeping the one with max |delta|.
  const merged = [];
  for (const t of turns) {
    if (merged.length && (t.distM - merged[merged.length - 1].distM) < mergeWindowM) {
      const prev = merged[merged.length - 1];
      if (Math.abs(t.delta) > Math.abs(prev.delta)) {
        merged[merged.length - 1] = t;
      }
    } else {
      merged.push(t);
    }
  }
  return merged;
}

function classifyTurn(deltaDeg) {
  const a = Math.abs(deltaDeg);
  if (a >= 150) return { type: 'continue', modifier: 'uturn' };
  if (a >= 100) return { type: 'turn', modifier: deltaDeg > 0 ? 'sharp right' : 'sharp left' };
  if (a >= 35) return { type: 'turn', modifier: deltaDeg > 0 ? 'right' : 'left' };
  if (a >= 15) return { type: 'turn', modifier: deltaDeg > 0 ? 'slight right' : 'slight left' };
  return { type: 'continue', modifier: 'straight' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Road-name resolution
//
// For each turn, we want:
//   - prevName: the road the runner is leaving (segment before the turn)
//   - nextName: the road the runner enters (segment after the turn)
//
// Source priority:
//   1. OSRM /match step name (when the turn aligns with an OSRM maneuver)
//   2. OSRM /nearest at a point ~30m before / ~30m after the turn
//   3. NAMED_FALLBACKS by coordinate proximity
//   4. null (rendered as "the road" / no street name)

function findOsrmStepNamesAround(rawSteps, lng, lat, maxDistM) {
  // Scan rawSteps for the closest step.maneuver.location to (lng,lat). The step
  // name is the road being ENTERED at that maneuver (OSRM convention). The road
  // being LEFT is the previous step's name.
  let bestIdx = -1, bestD = Infinity;
  for (let i = 0; i < rawSteps.length; i++) {
    const loc = rawSteps[i].maneuver && rawSteps[i].maneuver.location;
    if (!loc) continue;
    const d = distM({ lng, lat }, { lng: loc[0], lat: loc[1] });
    if (d < bestD) { bestD = d; bestIdx = i; }
  }
  if (bestIdx < 0 || bestD > maxDistM) return { prev: null, next: null };
  const next = (rawSteps[bestIdx].name || '').trim() || null;
  let prev = null;
  for (let j = bestIdx - 1; j >= 0; j--) {
    const n = (rawSteps[j].name || '').trim();
    if (n) { prev = n; break; }
  }
  return { prev, next };
}

function applyNameFixes(name) {
  if (!name) return null;
  if (NAME_FIXES[name]) return NAME_FIXES[name];
  return name;
}

function fallbackName(lng, lat) {
  for (const f of NAMED_FALLBACKS) {
    if (distM({ lng, lat }, { lng: f.lng, lat: f.lat }) <= f.radiusM) return f.name;
  }
  return null;
}

// Sample road names at multiple offsets along the path and return the most
// commonly reported named road. Falls back to whatever single-point lookup
// returns if no named road wins at any sample. Used when a turn opens onto an
// unnamed connector that quickly merges into a named through-road — picking
// the connector's empty name there is a worse cue than reporting the named
// road the runner actually spends the next ~100m on.
function dominantRoadName(coords, dists, idx, offsets) {
  const names = new Map();
  for (const off of offsets) {
    const p = pointAtDistanceFromIndex(coords, dists, idx, off);
    if (!p) continue;
    const fb = fallbackName(p[0], p[1]);
    // 60m search radius: at intersections the named through-road may be
    // tagged on a parallel way 30-60m away while the immediate point is on
    // an unnamed driveway/connector. Prefer the nearby named road over the
    // generic unnamed one.
    const n = fb || osmRoadNameAt(p[0], p[1], 60);
    if (!n) continue;
    names.set(n, (names.get(n) || 0) + 1);
  }
  if (!names.size) return null;
  let bestName = null, bestCount = 0;
  for (const [name, count] of names) {
    if (count > bestCount) { bestCount = count; bestName = name; }
  }
  return bestName;
}

async function resolveTurnNames(turn, coords, dists, rawSteps) {
  const here = { lng: coords[turn.idx][0], lat: coords[turn.idx][1] };

  // Sample the approach (back) and exit (forward) at multiple distances so the
  // resolver doesn't get stuck on a 50m unnamed connector when the runner
  // really is on a named through-road for the rest of the segment.
  let prevName = dominantRoadName(coords, dists, turn.idx, [-30, -60, -100]);
  let nextName = dominantRoadName(coords, dists, turn.idx, [30, 60, 100]);

  // Fall back to the single-point lookup at the closer offset, then to OSRM.
  if (!prevName) {
    const back = pointAtDistanceFromIndex(coords, dists, turn.idx, -30) || coords[turn.idx];
    prevName = fallbackName(back[0], back[1]) || osmRoadNameAt(back[0], back[1], 25);
  }
  if (!nextName) {
    const fwd = pointAtDistanceFromIndex(coords, dists, turn.idx, 30) || coords[turn.idx];
    nextName = fallbackName(fwd[0], fwd[1]) || osmRoadNameAt(fwd[0], fwd[1], 25);
  }
  if (!prevName || !nextName) {
    const osrm = findOsrmStepNamesAround(rawSteps, here.lng, here.lat, 25);
    if (!prevName) prevName = osrm.prev;
    if (!nextName) nextName = osrm.next;
  }
  if (!prevName) {
    const back = pointAtDistanceFromIndex(coords, dists, turn.idx, -30);
    prevName = back ? await nearestRoadName(back[0], back[1]) : null;
  }
  if (!nextName) {
    const fwd = pointAtDistanceFromIndex(coords, dists, turn.idx, 30);
    nextName = fwd ? await nearestRoadName(fwd[0], fwd[1]) : null;
  }

  return { prevName: applyNameFixes(prevName), nextName: applyNameFixes(nextName) };
}

function pointAtDistanceFromIndex(coords, dists, idx, deltaM) {
  const target = dists[idx] + deltaM;
  if (target <= dists[0]) return coords[0];
  if (target >= dists[dists.length - 1]) return coords[coords.length - 1];
  // Binary search
  let lo = 0, hi = dists.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (dists[mid] < target) lo = mid; else hi = mid;
  }
  // Interpolate
  const span = dists[hi] - dists[lo] || 1;
  const t = (target - dists[lo]) / span;
  const lng = coords[lo][0] + (coords[hi][0] - coords[lo][0]) * t;
  const lat = coords[lo][1] + (coords[hi][1] - coords[lo][1]) * t;
  return [lng, lat];
}

// ─────────────────────────────────────────────────────────────────────────────
// Instruction phrasing

function phrasingFor(modifier) {
  switch (modifier) {
    case 'uturn': return 'Make a U-turn';
    case 'sharp left': return 'Turn sharp left';
    case 'sharp right': return 'Turn sharp right';
    case 'slight left': return 'Bear left';
    case 'slight right': return 'Bear right';
    case 'left': return 'Turn left';
    case 'right': return 'Turn right';
    default: return 'Continue straight';
  }
}

function bearingToCompass(deg) {
  const dirs = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
  return dirs[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

function buildInstruction(step, isFirst, isLast) {
  const onto = step.nextName ? ` onto ${step.nextName}` : '';
  const along = step.nextName ? ` on ${step.nextName}` : '';

  if (isFirst) {
    const dir = bearingToCompass(step.bearingAfter);
    return `Head ${dir}${along}`;
  }
  if (isLast) {
    return 'Arrive at the finish';
  }
  if (step.modifier === 'uturn') {
    return `Make a U-turn${along}`;
  }
  if (step.kind === 'continue-straight') {
    if (step.nextName && step.prevName && step.nextName !== step.prevName) {
      return `Continue straight; road becomes ${step.nextName}`;
    }
    return null; // skip — nothing actionable
  }
  return `${phrasingFor(step.modifier)}${onto}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline per race

async function processRace(filename, slug) {
  console.log(`\n=== ${slug} (${filename}) ===`);
  const trkpts = parseGpx(filename);
  console.log(`  GPX: ${trkpts.length} trkpts`);

  const officialMiles = OFFICIAL_MILES[slug];

  // Reconstruct the unsplit, road-snapped polyline from the rendered geojson
  // (produced by snap-tinman-to-roads.js). The geojson features are emitted
  // with ±2 coords of phase-boundary overlap padding, so concatenating them
  // naively creates a zigzag at every turnaround. Strip that padding first.
  const renderedFile = path.join(OUT_DIR, `${slug}.geojson`);
  let rawCoords = [];
  if (fs.existsSync(renderedFile)) {
    const g = JSON.parse(fs.readFileSync(renderedFile, 'utf8'));
    const features = (g.features || []).slice().sort((a, b) =>
      (a.properties.segIdx || 0) - (b.properties.segIdx || 0));
    for (let i = 0; i < features.length; i++) {
      const c = features[i].geometry.coordinates;
      const isFirst = i === 0;
      const isLast = i === features.length - 1;
      // Drop the overlap pads added by snap-tinman-to-roads.js. See the
      // padStart/padEnd block in that script: every middle feature has 2
      // pad coords on each side; the first feature has none at the head;
      // the last has none at the tail.
      const start = isFirst ? 0 : 2;
      const end = isLast ? c.length : c.length - 2;
      for (let k = start; k < end; k++) rawCoords.push(c[k]);
    }
  }
  if (rawCoords.length < 2) {
    // Geojson missing or too short — fall back to chunked OSRM /match.
    console.log('  Rendered geojson missing or too short; running OSRM /match instead');
    const r = await snapTrack(trkpts);
    rawCoords = r.coords;
  }
  // Capture rawSteps from a fresh /match for OSRM step-name lookup support.
  // (The rendered geojson doesn't carry maneuver info.)
  const rawSteps = (await snapTrack(trkpts)).steps;

  if (process.env.DEBUG_SNAP) {
    fs.writeFileSync(`/tmp/${slug}-raw-snapped.json`, JSON.stringify(rawCoords, null, 2));
    console.log(`  DEBUG wrote /tmp/${slug}-raw-snapped.json`);
  }
  // 1. Drop adjacent duplicate coords (sub-meter same-position points).
  const deduped = [];
  for (const c of rawCoords) {
    const last = deduped[deduped.length - 1];
    if (last && distM({ lng: last[0], lat: last[1] }, { lng: c[0], lat: c[1] }) < 1) continue;
    deduped.push(c);
  }
  // 2. Remove zigzag triplets where the midpoint is a backward jump
  //    (AC / (AB + BC) < 0.3 means the triplet folds back on itself).
  const dezigzagged = removeZigzags(deduped, 0.3, 600);
  // 3. Douglas-Peucker at 8m tolerance to flatten sub-corner wobble while
  //    preserving real turns.
  const coords = douglasPeucker(dezigzagged, DP_TOLERANCE_M);
  const dists = cumulativeDistances(coords);
  const totalRawM = dists[dists.length - 1];
  console.log(`  Polyline: ${rawCoords.length} (rendered) → ${deduped.length} dedup → ${dezigzagged.length} no-zigzag → ${coords.length} DP, ${(totalRawM / 1609.344).toFixed(2)} mi`);

  // Detect turns from the snapped polyline (ignoring OSRM's per-chunk maneuvers)
  const candidates = detectTurnsFromPolyline(coords, dists, 25, 25);
  console.log(`  Candidate turns: ${candidates.length}`);

  // Resolve names for each turn, classify, and skip near-zero-net merges.
  const resolved = [];
  for (const t of candidates) {
    const cls = classifyTurn(t.delta);
    const { prevName, nextName } = await resolveTurnNames(t, coords, dists, rawSteps);
    resolved.push({
      idx: t.idx,
      distM: t.distM,
      coord: coords[t.idx],
      delta: t.delta,
      bearingBefore: t.bIn,
      bearingAfter: t.bOut,
      type: cls.type,
      modifier: cls.modifier,
      prevName,
      nextName,
    });
  }

  // Cluster turns into intersection groups: turns within MERGE_DIST_M of each
  // other are the same physical intersection (split across multiple polyline
  // vertices by chunk-boundary noise). For each group, compute the *net* heading
  // change (approach of the first → exit of the last) and re-classify. This
  // collapses chunk-boundary triplets (right + left + right ≈ straight) into a
  // single turn or none, while preserving real adjacent intersections that are
  // >MERGE_DIST_M apart.
  const MERGE_DIST_M = 70; // ~0.04 mi; tighter than typical block spacing in Tupper Lake
  const groups = [];
  for (const t of resolved) {
    const last = groups[groups.length - 1];
    if (last && (t.distM - last[last.length - 1].distM) < MERGE_DIST_M) {
      last.push(t);
    } else {
      groups.push([t]);
    }
  }
  const collapsed = [];
  for (const g of groups) {
    const first = g[0];
    const last = g[g.length - 1];
    const netDelta = bearingDelta(first.bearingBefore, last.bearingAfter);
    const cls = classifyTurn(netDelta);
    if (cls.modifier === 'straight') continue; // group net-zero — drop entirely

    // Use the group member with the largest |delta| as the representative
    // (best estimate of the true intersection coords + names).
    let rep = first;
    for (const t of g) {
      if (Math.abs(t.delta) > Math.abs(rep.delta)) rep = t;
    }
    collapsed.push({
      idx: rep.idx,
      distM: rep.distM,
      coord: rep.coord,
      delta: netDelta,
      bearingBefore: first.bearingBefore,
      bearingAfter: last.bearingAfter,
      type: cls.type,
      modifier: cls.modifier,
      prevName: rep.prevName,
      nextName: rep.nextName,
    });
  }
  console.log(`  Merged ${resolved.length} candidates into ${collapsed.length} intersections`);

  // Same-road bend filter: drop cues where the runner stays on the same road
  // through the maneuver (gentle bend in the road, not a navigation turn).
  // Importantly we DO NOT modify the previous cue's bearings — each retained
  // cue keeps the bearing change from its own intersection so its modifier
  // stays correct.
  const SAME_ROAD_KEEP_DEG = 100;
  const onRoad = [];
  for (const c of collapsed) {
    const sameRoad = c.nextName && c.prevName && c.nextName === c.prevName;
    if (sameRoad && Math.abs(c.delta) < SAME_ROAD_KEEP_DEG && c.modifier !== 'uturn') {
      continue;
    }
    onRoad.push(c);
  }

  // Same-name back-to-back collapse: consecutive cues with the same nextName
  // within 0.1 mi are chunk-boundary duplicates of the same maneuver. Keep
  // the first (with its original bearings + modifier) and drop the rest.
  const SAME_NAME_MERGE_M = 160; // ~0.1 mi
  const dedupedByName = [];
  for (const c of onRoad) {
    const last = dedupedByName[dedupedByName.length - 1];
    if (last && last.nextName && c.nextName && last.nextName === c.nextName &&
        (c.distM - last.distM) < SAME_NAME_MERGE_M && c.modifier !== 'uturn' && last.modifier !== 'uturn') {
      continue;
    }
    dedupedByName.push(c);
  }

  // Drop "exit the parking lot" pseudo-cues: any cue whose next road is the
  // high school driveway is just the runner leaving the start area. Real
  // navigation begins at the next cue.
  const filteredCues = dedupedByName.filter(c =>
    c.nextName !== 'high school driveway' && c.prevName !== 'high school driveway');

  console.log(`  After bend + same-name merge + driveway filter: ${filteredCues.length} cues`);

  // Add synthetic depart and arrive bookends. Depart bearing = first ~25m
  // forward bearing. Arrive uses the final bearing.
  const departBearing = bearingAt(coords, dists, 0, 25);
  const arriveBearing = bearingAt(coords, dists, coords.length - 2, 25);
  // Resolve start road name. Sample 25m forward of the start (not at the
  // start itself), since the start often sits on a parking lot service road.
  let startName = null;
  {
    const fwd = pointAtDistanceFromIndex(coords, dists, 0, 25) || coords[0];
    startName = fallbackName(fwd[0], fwd[1])
      || osmRoadNameAt(fwd[0], fwd[1], 25);
    if (!startName) {
      const stepNames = findOsrmStepNamesAround(rawSteps, coords[0][0], coords[0][1], 25);
      startName = stepNames.next || stepNames.prev;
    }
    if (!startName) startName = await nearestRoadName(fwd[0], fwd[1]);
    startName = applyNameFixes(startName);
  }

  const allSteps = [];
  allSteps.push({
    n: 1,
    type: 'depart',
    modifier: null,
    distM: 0,
    coord: coords[0],
    bearingBefore: 0,
    bearingAfter: departBearing,
    prevName: null,
    nextName: startName,
  });
  for (const r of filteredCues) {
    allSteps.push({
      n: 0, // numbered later
      type: r.type,
      modifier: r.modifier,
      distM: r.distM,
      coord: r.coord,
      bearingBefore: r.bearingBefore,
      bearingAfter: r.bearingAfter,
      prevName: r.prevName,
      nextName: r.nextName,
    });
  }
  allSteps.push({
    n: 0,
    type: 'arrive',
    modifier: null,
    distM: dists[dists.length - 1],
    coord: coords[coords.length - 1],
    bearingBefore: arriveBearing,
    bearingAfter: 0,
    prevName: filteredCues.length ? filteredCues[filteredCues.length - 1].nextName : startName,
    nextName: null,
  });

  // Build instruction strings, drop continue-straight no-ops, renumber.
  const milesScale = officialMiles / (totalRawM / 1609.344);
  const final = [];
  for (let i = 0; i < allSteps.length; i++) {
    const s = allSteps[i];
    const isFirst = i === 0;
    const isLast = i === allSteps.length - 1;
    const text = buildInstruction(
      Object.assign({}, s, { kind: s.type === 'continue' && s.modifier !== 'uturn' ? 'continue-straight' : 'turn' }),
      isFirst, isLast
    );
    if (text == null) continue; // skip non-actionable
    final.push(Object.assign({}, s, { instruction: text }));
  }

  // Rescale mileage to official total
  for (const s of final) {
    s.mileRaw = +(s.distM / 1609.344).toFixed(4);
    s.mile = +((s.distM / 1609.344) * milesScale).toFixed(2);
  }

  // Compute distMi (leg distance to next step), in official miles
  for (let i = 0; i < final.length; i++) {
    const next = final[i + 1];
    final[i].distMi = next ? +Math.max(0, next.mile - final[i].mile).toFixed(2) : 0;
  }

  // Snap each step's location to the rendered geojson polyline so that the
  // saved coords match the line the runner sees on the map. The OSRM-derived
  // polyline that drove turn detection is generated independently from the
  // course's rendered geojson (which comes from snap-tinman-to-roads.js); they
  // align to within a few meters most places, but at chunk seams or points
  // where OSRM picked a different parallel way, they can diverge by hundreds
  // of feet. A runtime snap also happens in override.js — this build-time
  // snap reduces the gap between authored and rendered coords for tests and
  // for any consumer that reads the file directly.
  const renderedCoords = (function () {
    try {
      const file = path.join(OUT_DIR, `${slug}.geojson`);
      const g = JSON.parse(fs.readFileSync(file, 'utf8'));
      const all = [];
      for (const f of (g.features || [])) {
        for (const c of (f.geometry && f.geometry.coordinates) || []) all.push(c);
      }
      return all;
    } catch (e) {
      return [];
    }
  })();
  function snapToRendered(target) {
    if (!renderedCoords.length) return target;
    let bestIdx = 0, bestD = Infinity;
    for (let i = 0; i < renderedCoords.length; i++) {
      const d = distM(
        { lng: target[0], lat: target[1] },
        { lng: renderedCoords[i][0], lat: renderedCoords[i][1] }
      );
      if (d < bestD) { bestD = d; bestIdx = i; }
    }
    return renderedCoords[bestIdx];
  }

  // Renumber + emit final structure
  const out = final.map((s, i) => ({
    n: i + 1,
    instruction: s.instruction,
    name: s.nextName || null,
    type: s.type,
    modifier: s.modifier || (s.type === 'turn' ? 'right' : null),
    mile: s.mile,
    distMi: s.distMi,
    location: snapToRendered(s.coord),
    bearingAfter: Math.round(s.bearingAfter),
    bearingBefore: Math.round(s.bearingBefore),
  }));

  fs.writeFileSync(path.join(OUT_DIR, `${slug}-steps.json`), JSON.stringify(out, null, 2));
  console.log(`  Wrote ${slug}-steps.json: ${out.length} steps`);
  // Concise preview
  for (const s of out) {
    console.log(`    [${s.n}] ${s.mile.toFixed(2)}mi  ${s.instruction}`);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main

if (require.main === module) {
  // Optional: pass slug name(s) on the command line to limit which races
  // are rebuilt. Default is all three.
  const argv = process.argv.slice(2);
  const wanted = argv.length ? new Set(argv) : new Set(['sprint', 'olympic', 'tinman']);
  const jobs = [
    { gpx: 'tinman_sprint.gpx', slug: 'sprint' },
    { gpx: 'tinman_olympic.gpx', slug: 'olympic' },
    { gpx: 'tinman_half.gpx', slug: 'tinman' },
  ].filter(j => wanted.has(j.slug));
  (async function main() {
    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
    for (const j of jobs) await processRace(j.gpx, j.slug);
  })().catch(err => { console.error(err); process.exit(1); });
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports for unit tests
module.exports = {
  distM,
  bearing,
  bearingDelta,
  cumulativeDistances,
  bearingAt,
  bearingApproach,
  classifyTurn,
  detectTurnsFromPolyline,
  pointAtDistanceFromIndex,
  bearingToCompass,
  applyNameFixes,
  fallbackName,
  NAME_FIXES,
  NAMED_FALLBACKS,
};
