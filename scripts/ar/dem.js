// Terrarium DEM tile fetch + decode for the AR course model pipeline.
// Tiles: https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png
// Elevation (m) = R * 256 + G + B / 256 - 32768

const { PNG } = require('pngjs');
const { TILE_SIZE, lngLatToTile, tileRangeForBBox } = require('./geo');

const TERRARIUM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

// Decodes a terrarium PNG buffer into a Float32Array of elevations in meters.
function decodeTerrarium(pngBuffer) {
  const png = PNG.sync.read(pngBuffer);
  const out = new Float32Array(png.width * png.height);
  for (let i = 0; i < out.length; i++) {
    const p = i * 4;
    out[i] = png.data[p] * 256 + png.data[p + 1] + png.data[p + 2] / 256 - 32768;
  }
  return out;
}

async function fetchWithRetry(url, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw lastErr;
}

// Runs tasks with bounded concurrency, preserving order of results.
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// Fetches all terrarium tiles covering bbox at zoom z and assembles a single
// elevation raster. Returns { widthPx, heightPx, data, sample(lng, lat) }.
async function buildHeightRaster(bbox, z, { log = () => {} } = {}) {
  const range = tileRangeForBBox(bbox, z);
  const tilesX = range.maxX - range.minX + 1;
  const tilesY = range.maxY - range.minY + 1;
  const widthPx = tilesX * TILE_SIZE;
  const heightPx = tilesY * TILE_SIZE;
  const data = new Float32Array(widthPx * heightPx);

  const jobs = [];
  for (let ty = range.minY; ty <= range.maxY; ty++) {
    for (let tx = range.minX; tx <= range.maxX; tx++) {
      jobs.push({ tx, ty });
    }
  }
  log(`DEM: fetching ${jobs.length} terrarium tiles at z${z}`);

  await mapLimit(jobs, 8, async ({ tx, ty }) => {
    const url = TERRARIUM_URL.replace('{z}', z).replace('{x}', tx).replace('{y}', ty);
    const elev = decodeTerrarium(await fetchWithRetry(url));
    const ox = (tx - range.minX) * TILE_SIZE;
    const oy = (ty - range.minY) * TILE_SIZE;
    for (let row = 0; row < TILE_SIZE; row++) {
      const src = row * TILE_SIZE;
      const dst = (oy + row) * widthPx + ox;
      data.set(elev.subarray(src, src + TILE_SIZE), dst);
    }
  });

  // Bilinear elevation sample at a lng/lat, in meters.
  function sample(lng, lat) {
    const t = lngLatToTile(lng, lat, z);
    const px = Math.min(Math.max((t.x - range.minX) * TILE_SIZE - 0.5, 0), widthPx - 1.001);
    const py = Math.min(Math.max((t.y - range.minY) * TILE_SIZE - 0.5, 0), heightPx - 1.001);
    const x0 = Math.floor(px), y0 = Math.floor(py);
    const fx = px - x0, fy = py - y0;
    const i00 = data[y0 * widthPx + x0];
    const i10 = data[y0 * widthPx + x0 + 1];
    const i01 = data[(y0 + 1) * widthPx + x0];
    const i11 = data[(y0 + 1) * widthPx + x0 + 1];
    return (
      i00 * (1 - fx) * (1 - fy) +
      i10 * fx * (1 - fy) +
      i01 * (1 - fx) * fy +
      i11 * fx * fy
    );
  }

  return { widthPx, heightPx, data, range, zoom: z, sample };
}

module.exports = { decodeTerrarium, buildHeightRaster, fetchWithRetry, mapLimit, TERRARIUM_URL };
