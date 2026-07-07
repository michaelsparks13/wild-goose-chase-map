// Geographic + slippy-tile math for the AR course model pipeline.
// Pure functions, no I/O — unit tested in tests/ar-pipeline.test.js.

const TILE_SIZE = 256;
const EARTH_RADIUS_MI = 3958.8;
const METERS_PER_DEG_LAT = 111320;

// Fractional slippy tile coordinates for a lng/lat at zoom z.
function lngLatToTile(lng, lat, z) {
  const n = Math.pow(2, z);
  const latRad = (lat * Math.PI) / 180;
  return {
    x: ((lng + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  };
}

// Longitude of a fractional tile x at zoom z.
function tileXToLng(x, z) {
  return (x / Math.pow(2, z)) * 360 - 180;
}

// Latitude of a fractional tile y at zoom z.
function tileYToLat(y, z) {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

// Bounding box of a coordinate list, padded by padRatio of the larger span.
function computeBBox(coords, padRatio = 0.15) {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const [lng, lat] of coords) {
    if (lng < west) west = lng;
    if (lng > east) east = lng;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }
  const latMid = (south + north) / 2;
  const lngSpanM = (east - west) * METERS_PER_DEG_LAT * Math.cos((latMid * Math.PI) / 180);
  const latSpanM = (north - south) * METERS_PER_DEG_LAT;
  const padM = Math.max(lngSpanM, latSpanM) * padRatio;
  const padLat = padM / METERS_PER_DEG_LAT;
  const padLng = padM / (METERS_PER_DEG_LAT * Math.cos((latMid * Math.PI) / 180));
  return {
    west: west - padLng,
    south: south - padLat,
    east: east + padLng,
    north: north + padLat,
  };
}

// Highest zoom whose tile coverage of the bbox stays within maxTiles per axis.
function pickZoom(bbox, { maxTiles = 8, maxZoom = 14 } = {}) {
  for (let z = maxZoom; z >= 1; z--) {
    const a = lngLatToTile(bbox.west, bbox.north, z);
    const b = lngLatToTile(bbox.east, bbox.south, z);
    const spanX = Math.floor(b.x) - Math.floor(a.x) + 1;
    const spanY = Math.floor(b.y) - Math.floor(a.y) + 1;
    if (spanX <= maxTiles && spanY <= maxTiles) return z;
  }
  return 1;
}

// Integer tile range covering the bbox at zoom z.
function tileRangeForBBox(bbox, z) {
  const nw = lngLatToTile(bbox.west, bbox.north, z);
  const se = lngLatToTile(bbox.east, bbox.south, z);
  return {
    minX: Math.floor(nw.x),
    minY: Math.floor(nw.y),
    maxX: Math.floor(se.x),
    maxY: Math.floor(se.y),
  };
}

function haversineMiles([lng1, lat1], [lng2, lat2]) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.sqrt(a));
}

// Cumulative distance in miles at each coordinate.
function cumulativeMiles(coords) {
  const out = new Array(coords.length);
  out[0] = 0;
  for (let i = 1; i < coords.length; i++) {
    out[i] = out[i - 1] + haversineMiles(coords[i - 1], coords[i]);
  }
  return out;
}

// Interpolated [lng, lat] at a given mile along the course.
function coordAtMile(coords, cumMiles, mile) {
  const total = cumMiles[cumMiles.length - 1];
  const target = Math.min(Math.max(mile, 0), total);
  let lo = 0, hi = cumMiles.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (cumMiles[mid] <= target) lo = mid;
    else hi = mid;
  }
  const span = cumMiles[hi] - cumMiles[lo];
  const t = span > 0 ? (target - cumMiles[lo]) / span : 0;
  return [
    coords[lo][0] + (coords[hi][0] - coords[lo][0]) * t,
    coords[lo][1] + (coords[hi][1] - coords[lo][1]) * t,
  ];
}

// Projects lng/lat into local meters centered on the bbox: x east, z south
// (three.js convention: y-up, north faces -z). Returns sizes too.
function localProjector(bbox) {
  const latMid = (bbox.south + bbox.north) / 2;
  const lngMid = (bbox.west + bbox.east) / 2;
  const mPerLng = METERS_PER_DEG_LAT * Math.cos((latMid * Math.PI) / 180);
  const widthM = (bbox.east - bbox.west) * mPerLng;
  const depthM = (bbox.north - bbox.south) * METERS_PER_DEG_LAT;
  return {
    widthM,
    depthM,
    project([lng, lat]) {
      return {
        x: (lng - lngMid) * mPerLng,
        z: (latMid - lat) * METERS_PER_DEG_LAT,
      };
    },
  };
}

module.exports = {
  TILE_SIZE,
  METERS_PER_DEG_LAT,
  lngLatToTile,
  tileXToLng,
  tileYToLat,
  computeBBox,
  pickZoom,
  tileRangeForBBox,
  haversineMiles,
  cumulativeMiles,
  coordAtMile,
  localProjector,
};
