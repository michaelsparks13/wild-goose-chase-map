/**
 * Process CalTopo data for Manitou's Revenge map
 * - Downsamples 53K track points to ~1500 using distance-based sampling
 * - Extracts and smooths elevation data
 * - Outputs coords.json and elevations.json
 */
const fs = require('fs');
const path = require('path');

const INPUT = path.join(__dirname, '../tmp-caltopo.json');
const OUT_DIR = path.join(__dirname, '../src/maps/manitous-revenge/data');

// Load CalTopo response
const raw = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
const features = raw.result.state.features;

// Find the track (LineString)
const track = features.find(f => f.geometry.type === 'LineString');
if (!track) { console.error('No track found'); process.exit(1); }

const rawCoords = track.geometry.coordinates; // [lng, lat, ele_m, timestamp_ms]
console.log(`Raw track points: ${rawCoords.length}`);

// Haversine distance in miles
function haversine(c1, c2) {
  const R = 3958.8; // Earth radius in miles
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(c2[1] - c1[1]);
  const dLon = toRad(c2[0] - c1[0]);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(c1[1])) * Math.cos(toRad(c2[1])) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Distance-based sampling: keep a point every ~0.033 miles (~175 ft)
// This gives ~1600 points for 53 miles
const TARGET_SPACING = 0.033;
const sampled = [rawCoords[0]];
let accumDist = 0;

for (let i = 1; i < rawCoords.length; i++) {
  accumDist += haversine(rawCoords[i-1], rawCoords[i]);
  if (accumDist >= TARGET_SPACING) {
    sampled.push(rawCoords[i]);
    accumDist = 0;
  }
}
// Always include the last point
if (sampled[sampled.length - 1] !== rawCoords[rawCoords.length - 1]) {
  sampled.push(rawCoords[rawCoords.length - 1]);
}

console.log(`Sampled points: ${sampled.length}`);

// Extract coords [lng, lat] rounded to 5 decimal places
const coords = sampled.map(c => [
  Math.round(c[0] * 100000) / 100000,
  Math.round(c[1] * 100000) / 100000
]);

// Extract elevations in feet, with 3-point smoothing to reduce GPS noise
const rawEle = sampled.map(c => c[2] * 3.28084); // meters to feet
const elevations = rawEle.map((ele, i) => {
  if (i === 0 || i === rawEle.length - 1) return Math.round(ele);
  return Math.round((rawEle[i-1] + ele + rawEle[i+1]) / 3);
});

// Calculate total distance and elevation gain for verification
let totalDist = 0;
let totalGain = 0;
for (let i = 1; i < coords.length; i++) {
  totalDist += haversine(coords[i-1], coords[i]);
  const gain = elevations[i] - elevations[i-1];
  if (gain > 0) totalGain += gain;
}

console.log(`Total distance: ${totalDist.toFixed(1)} miles`);
console.log(`Total elevation gain: ${Math.round(totalGain)} ft`);
console.log(`Start elevation: ${elevations[0]} ft`);
console.log(`End elevation: ${elevations[elevations.length-1]} ft`);
console.log(`Max elevation: ${Math.max(...elevations)} ft`);
console.log(`Min elevation: ${Math.min(...elevations)} ft`);
console.log(`Start: [${coords[0]}]`);
console.log(`End: [${coords[coords.length-1]}]`);

// Write output files
fs.writeFileSync(path.join(OUT_DIR, 'coords.json'), JSON.stringify(coords));
fs.writeFileSync(path.join(OUT_DIR, 'elevations.json'), JSON.stringify(elevations));

console.log(`\nWrote coords.json (${(fs.statSync(path.join(OUT_DIR, 'coords.json')).size / 1024).toFixed(1)} KB)`);
console.log(`Wrote elevations.json (${(fs.statSync(path.join(OUT_DIR, 'elevations.json')).size / 1024).toFixed(1)} KB)`);

// Also extract aid station markers from CalTopo data
const markers = features.filter(f => f.geometry.type === 'Point');
console.log(`\nCalTopo markers (${markers.length}):`);
markers.forEach(m => {
  const [lng, lat] = m.geometry.coordinates;
  console.log(`  ${m.properties.title}: [${lng.toFixed(5)}, ${lat.toFixed(5)}]`);
});
