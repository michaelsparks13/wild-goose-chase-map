// One-off: dissolve the Wild Goose @ Ringwood park-trails overlay so it matches
// the structure every other FSS map uses (wild-goose, sleeping-giant,
// escarpment): ONE feature per trail name, contiguous segments stitched into
// long polylines, emitted as a MultiLineString (or LineString when a single
// part), carrying the trail's dominant blaze.
//
// The source file was raw, un-dissolved OSM ways — 348 features, median 171 m —
// far too short for MapLibre to place line-following labels until ~z15. After
// dissolving, named trails are long enough to label at the overview zoom, like
// the other maps. Coordinates and elevation (if any) are preserved verbatim.
//
//   node scripts/dissolve-ringwood-trails.js
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../src/maps/wild-goose-ringwood/data/trails.geojson');
const fc = JSON.parse(fs.readFileSync(file, 'utf8'));

const key = pt => pt[0].toFixed(6) + ',' + pt[1].toFixed(6);

// Group raw LineString segments by name (the empty-name connectors form their
// own group so the visible network is unchanged — they just carry no label).
const groups = new Map();
for (const f of fc.features) {
  if (f.geometry.type !== 'LineString') continue;
  const name = f.properties.name || '';
  if (!groups.has(name)) groups.set(name, { coords: [], blazes: [] });
  const g = groups.get(name);
  g.coords.push(f.geometry.coordinates.slice());
  g.blazes.push(f.properties.blaze || null);
}

// Stitch segments whose endpoints coincide into maximal polylines.
function stitch(segs) {
  segs = segs.map(c => c.slice());
  let merged = true;
  while (merged) {
    merged = false;
    outer:
    for (let i = 0; i < segs.length; i++) {
      for (let j = i + 1; j < segs.length; j++) {
        const a = segs[i], b = segs[j];
        if (key(a[a.length - 1]) === key(b[0]))                 { segs[i] = a.concat(b.slice(1)); }
        else if (key(a[a.length - 1]) === key(b[b.length - 1])) { segs[i] = a.concat(b.slice().reverse().slice(1)); }
        else if (key(a[0]) === key(b[b.length - 1]))            { segs[i] = b.concat(a.slice(1)); }
        else if (key(a[0]) === key(b[0]))                       { segs[i] = a.slice().reverse().concat(b.slice(1)); }
        else continue;
        segs.splice(j, 1); merged = true; break outer;
      }
    }
  }
  return segs;
}

// Dominant non-null blaze for a trail (ties resolved by first seen).
function dominantBlaze(blazes) {
  const counts = new Map();
  for (const b of blazes) { if (b) counts.set(b, (counts.get(b) || 0) + 1); }
  let best = null, bestN = 0;
  for (const [b, n] of counts) { if (n > bestN) { best = b; bestN = n; } }
  return best;
}

const out = [];
for (const [name, g] of groups) {
  const parts = stitch(g.coords);
  const blaze = dominantBlaze(g.blazes);
  const geometry = parts.length === 1
    ? { type: 'LineString', coordinates: parts[0] }
    : { type: 'MultiLineString', coordinates: parts };
  out.push({ type: 'Feature', properties: { name, blaze }, geometry });
}

// Stable order: named trails first (alphabetical), unnamed connectors last.
out.sort((a, b) => {
  const an = a.properties.name, bn = b.properties.name;
  if (!an && bn) return 1;
  if (an && !bn) return -1;
  return an.localeCompare(bn);
});

const result = { type: 'FeatureCollection', features: out };
fs.writeFileSync(file, JSON.stringify(result));
const named = out.filter(f => f.properties.name).length;
console.log(`Dissolved ${fc.features.length} → ${out.length} features (${named} named, ${out.length - named} unnamed groups)`);
