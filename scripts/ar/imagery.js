// Satellite diffuse-texture builder for the AR course model pipeline.
// Stitches Esri World Imagery tiles covering the bbox, crops to the exact
// bbox in mercator pixel space (so mesh UVs map linearly), re-encodes as JPEG.

const jpeg = require('jpeg-js');
const { TILE_SIZE, lngLatToTile } = require('./geo');
const { fetchWithRetry, mapLimit } = require('./dem');

const IMAGERY_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

// Lowest zoom at which the bbox spans at least targetPx pixels on its long axis.
function pickImageryZoom(bbox, { targetPx = 2048, maxZoom = 16 } = {}) {
  for (let z = 1; z <= maxZoom; z++) {
    const nw = lngLatToTile(bbox.west, bbox.north, z);
    const se = lngLatToTile(bbox.east, bbox.south, z);
    const spanPx = Math.max(se.x - nw.x, se.y - nw.y) * TILE_SIZE;
    if (spanPx >= targetPx) return z;
  }
  return maxZoom;
}

// Bilinear-resamples an RGBA image to a new size.
function resizeRGBA(src, srcW, srcH, dstW, dstH) {
  const dst = Buffer.alloc(dstW * dstH * 4);
  for (let y = 0; y < dstH; y++) {
    const sy = Math.min((y / (dstH - 1)) * (srcH - 1), srcH - 1.001);
    const y0 = Math.floor(sy), fy = sy - y0;
    for (let x = 0; x < dstW; x++) {
      const sx = Math.min((x / (dstW - 1)) * (srcW - 1), srcW - 1.001);
      const x0 = Math.floor(sx), fx = sx - x0;
      const i00 = (y0 * srcW + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + srcW * 4;
      const i11 = i01 + 4;
      const di = (y * dstW + x) * 4;
      for (let c = 0; c < 3; c++) {
        dst[di + c] =
          src[i00 + c] * (1 - fx) * (1 - fy) +
          src[i10 + c] * fx * (1 - fy) +
          src[i01 + c] * (1 - fx) * fy +
          src[i11 + c] * fx * fy;
      }
      dst[di + 3] = 255;
    }
  }
  return dst;
}

// Fetches + stitches imagery tiles, crops to bbox, scales to maxPx on the
// long axis, and encodes JPEG. Returns { width, height, jpeg }.
async function buildDiffuseTexture(bbox, { maxPx = 2048, quality = 70, log = () => {} } = {}) {
  const z = pickImageryZoom(bbox, { targetPx: maxPx });
  const nw = lngLatToTile(bbox.west, bbox.north, z);
  const se = lngLatToTile(bbox.east, bbox.south, z);
  const minTX = Math.floor(nw.x), minTY = Math.floor(nw.y);
  const maxTX = Math.floor(se.x), maxTY = Math.floor(se.y);
  const tilesX = maxTX - minTX + 1;
  const tilesY = maxTY - minTY + 1;
  const stitchedW = tilesX * TILE_SIZE;
  const stitchedH = tilesY * TILE_SIZE;
  const stitched = Buffer.alloc(stitchedW * stitchedH * 4);

  const jobs = [];
  for (let ty = minTY; ty <= maxTY; ty++) {
    for (let tx = minTX; tx <= maxTX; tx++) jobs.push({ tx, ty });
  }
  log(`Imagery: fetching ${jobs.length} satellite tiles at z${z}`);

  await mapLimit(jobs, 8, async ({ tx, ty }) => {
    const url = IMAGERY_URL.replace('{z}', z).replace('{y}', ty).replace('{x}', tx);
    const img = jpeg.decode(await fetchWithRetry(url), { useTArray: true, maxMemoryUsageInMB: 64 });
    const ox = (tx - minTX) * TILE_SIZE;
    const oy = (ty - minTY) * TILE_SIZE;
    for (let row = 0; row < img.height; row++) {
      const srcStart = row * img.width * 4;
      const dstStart = ((oy + row) * stitchedW + ox) * 4;
      stitched.set(img.data.subarray(srcStart, srcStart + img.width * 4), dstStart);
    }
  });

  // Crop to the exact bbox in pixel space.
  const cropX = Math.round((nw.x - minTX) * TILE_SIZE);
  const cropY = Math.round((nw.y - minTY) * TILE_SIZE);
  const cropW = Math.round((se.x - nw.x) * TILE_SIZE);
  const cropH = Math.round((se.y - nw.y) * TILE_SIZE);
  const cropped = Buffer.alloc(cropW * cropH * 4);
  for (let row = 0; row < cropH; row++) {
    const srcStart = ((cropY + row) * stitchedW + cropX) * 4;
    cropped.set(stitched.subarray(srcStart, srcStart + cropW * 4), row * cropW * 4);
  }

  // Scale so the long axis is exactly maxPx (JPEG likes multiples of 16 less
  // than exactness here; keep aspect ratio).
  const scale = maxPx / Math.max(cropW, cropH);
  const outW = Math.max(16, Math.round(cropW * scale));
  const outH = Math.max(16, Math.round(cropH * scale));
  const scaled = scale === 1 ? cropped : resizeRGBA(cropped, cropW, cropH, outW, outH);

  const encoded = jpeg.encode({ data: scaled, width: outW, height: outH }, quality);
  log(`Imagery: ${outW}x${outH} JPEG, ${(encoded.data.length / 1024).toFixed(0)} KB`);
  return { width: outW, height: outH, jpeg: encoded.data, zoom: z };
}

// Re-encodes an existing texture at a smaller size/quality (budget loop —
// avoids re-fetching tiles).
function shrinkTexture(texture, maxPx, quality) {
  const img = jpeg.decode(texture.jpeg, { useTArray: true, maxMemoryUsageInMB: 64 });
  const scale = maxPx / Math.max(img.width, img.height);
  const outW = Math.max(16, Math.round(img.width * scale));
  const outH = Math.max(16, Math.round(img.height * scale));
  const scaled = scale >= 1 ? img.data : resizeRGBA(img.data, img.width, img.height, outW, outH);
  const encoded = jpeg.encode(
    { data: scaled, width: scale >= 1 ? img.width : outW, height: scale >= 1 ? img.height : outH },
    quality
  );
  return { width: outW, height: outH, jpeg: encoded.data, zoom: texture.zoom };
}

module.exports = { pickImageryZoom, resizeRGBA, buildDiffuseTexture, shrinkTexture, IMAGERY_URL };
