#!/usr/bin/env node
// GPX to JSON converter for race maps
// Usage: node gpx-convert.js <input.gpx> <target_points> [output.json]

const fs = require('fs');

const inputFile = process.argv[2];
const targetPoints = parseInt(process.argv[3]) || 400;
const outputFile = process.argv[4];

if (!inputFile) {
  console.error('Usage: node gpx-convert.js <input.gpx> [target_points] [output.json]');
  process.exit(1);
}

const gpx = fs.readFileSync(inputFile, 'utf-8');

// Parse track points
const coords = [];
const elevations = [];
const regex = /<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>\s*<ele>([^<]+)<\/ele>/g;
let match;
while ((match = regex.exec(gpx)) !== null) {
  const lat = parseFloat(match[1]);
  const lon = parseFloat(match[2]);
  const ele = parseFloat(match[3]);
  coords.push([lon, lat]);
  elevations.push(ele);
}

console.log(`Parsed ${coords.length} track points`);

// Calculate total distance in miles
function haversine(c1, c2) {
  const R = 3958.8; // Earth radius in miles
  const dLat = (c2[1] - c1[1]) * Math.PI / 180;
  const dLon = (c2[0] - c1[0]) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(c1[1]*Math.PI/180) * Math.cos(c2[1]*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

let totalDist = 0;
const distances = [0];
for (let i = 1; i < coords.length; i++) {
  totalDist += haversine(coords[i-1], coords[i]);
  distances.push(totalDist);
}

// Calculate elevation gain
let elevGain = 0;
for (let i = 1; i < elevations.length; i++) {
  const diff = elevations[i] - elevations[i-1];
  if (diff > 0) elevGain += diff;
}
const elevGainFt = Math.round(elevGain * 3.28084);

// Find bounding box
let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
for (const [lon, lat] of coords) {
  if (lat < minLat) minLat = lat;
  if (lat > maxLat) maxLat = lat;
  if (lon < minLon) minLon = lon;
  if (lon > maxLon) maxLon = lon;
}

// Downsample using distance-based uniform sampling
const step = totalDist / (targetPoints - 1);
const sampledCoords = [coords[0]];
const sampledElevations = [elevations[0]];
let nextTarget = step;
let distIdx = 1;

for (let i = 1; i < coords.length; i++) {
  if (distances[i] >= nextTarget) {
    sampledCoords.push(coords[i]);
    sampledElevations.push(elevations[i]);
    nextTarget += step;
  }
}
// Always include last point
if (sampledCoords[sampledCoords.length-1] !== coords[coords.length-1]) {
  sampledCoords.push(coords[coords.length-1]);
  sampledElevations.push(elevations[elevations.length-1]);
}

console.log(`Downsampled to ${sampledCoords.length} points`);
console.log(`Total distance: ${totalDist.toFixed(1)} miles`);
console.log(`Elevation gain: ${elevGainFt} ft`);
console.log(`Bounds: [${minLon.toFixed(4)}, ${minLat.toFixed(4)}] to [${maxLon.toFixed(4)}, ${maxLat.toFixed(4)}]`);
console.log(`Center: [${((minLon+maxLon)/2).toFixed(4)}, ${((minLat+maxLat)/2).toFixed(4)}]`);

// Format coordinates for JS embedding
const coordStr = sampledCoords.map(c => `[${c[0].toFixed(5)}, ${c[1].toFixed(5)}]`).join(',\n  ');
const eleStr = sampledElevations.map(e => Math.round(e)).join(', ');

const result = {
  totalMiles: parseFloat(totalDist.toFixed(1)),
  elevGainFt,
  elevGainM: Math.round(elevGain),
  maxEleFt: Math.round(Math.max(...sampledElevations) * 3.28084),
  minEleFt: Math.round(Math.min(...sampledElevations) * 3.28084),
  maxEleM: Math.round(Math.max(...sampledElevations)),
  minEleM: Math.round(Math.min(...sampledElevations)),
  center: [parseFloat(((minLon+maxLon)/2).toFixed(5)), parseFloat(((minLat+maxLat)/2).toFixed(5))],
  startCoord: sampledCoords[0],
  endCoord: sampledCoords[sampledCoords.length-1],
  numPoints: sampledCoords.length,
  coords: `[\n  ${coordStr}\n]`,
  elevations: `[\n  ${eleStr}\n]`
};

if (outputFile) {
  fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
  console.log(`Saved to ${outputFile}`);
} else {
  console.log('\n// COURSE_COORDS:');
  console.log(`const COURSE_COORDS = ${result.coords};`);
  console.log('\n// ELEVATIONS (meters):');
  console.log(`const ELEVATIONS = ${result.elevations};`);
}
