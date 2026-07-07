// Geometry builders for the AR course model: terrain grid + plinth walls,
// course tube, aid-station pins, lead-pack marker, and animation keyframes.
// All outputs are plain typed arrays consumed by glb.js.
// Model space: x east, y up, z south; units are meters * scale (scale chosen
// so the model is tabletop-sized and 1 glTF unit = 1 real-world meter in AR).

const { tileYToLat, lngLatToTile, localProjector } = require('./geo');

// Samples the DEM over the bbox on a mercator-uniform grid and returns the
// terrain surface mesh plus helpers used by every other builder.
function buildTerrain({ bbox, raster, cols = 192, exaggeration = 1.6, scale }) {
  const proj = localProjector(bbox);
  const rows = Math.max(
    2,
    Math.min(512, Math.round((cols * proj.depthM) / proj.widthM))
  );

  // Row latitudes are uniform in mercator y so UVs map linearly onto the
  // texture, which is cropped in mercator pixel space.
  const yTop = lngLatToTile(bbox.west, bbox.north, raster.zoom).y;
  const yBot = lngLatToTile(bbox.west, bbox.south, raster.zoom).y;
  const rowLats = new Array(rows);
  for (let r = 0; r < rows; r++) {
    rowLats[r] = tileYToLat(yTop + ((yBot - yTop) * r) / (rows - 1), raster.zoom);
  }
  const colLngs = new Array(cols);
  for (let c = 0; c < cols; c++) {
    colLngs[c] = bbox.west + ((bbox.east - bbox.west) * c) / (cols - 1);
  }

  // Two passes: sample elevations first to find the floor, then build verts.
  const elev = new Float32Array(rows * cols);
  let minElev = Infinity, maxElev = -Infinity;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const e = raster.sample(colLngs[c], rowLats[r]);
      elev[r * cols + c] = e;
      if (e < minElev) minElev = e;
      if (e > maxElev) maxElev = e;
    }
  }

  const positions = new Float32Array(rows * cols * 3);
  const uvs = new Float32Array(rows * cols * 2);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const p = proj.project([colLngs[c], rowLats[r]]);
      positions[i * 3] = p.x * scale;
      positions[i * 3 + 1] = (elev[i] - minElev) * exaggeration * scale;
      positions[i * 3 + 2] = p.z * scale;
      uvs[i * 2] = c / (cols - 1);
      uvs[i * 2 + 1] = r / (rows - 1);
    }
  }

  // Normals from central differences on the height field.
  const normals = new Float32Array(rows * cols * 3);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const cL = Math.max(c - 1, 0), cR = Math.min(c + 1, cols - 1);
      const rU = Math.max(r - 1, 0), rD = Math.min(r + 1, rows - 1);
      const dx =
        (positions[(r * cols + cR) * 3 + 1] - positions[(r * cols + cL) * 3 + 1]) /
        (positions[(r * cols + cR) * 3] - positions[(r * cols + cL) * 3]);
      const dz =
        (positions[(rD * cols + c) * 3 + 1] - positions[(rU * cols + c) * 3 + 1]) /
        (positions[(rD * cols + c) * 3 + 2] - positions[(rU * cols + c) * 3 + 2]);
      const len = Math.hypot(dx, 1, dz);
      normals[i * 3] = -dx / len;
      normals[i * 3 + 1] = 1 / len;
      normals[i * 3 + 2] = -dz / len;
    }
  }

  const indices = new (rows * cols > 65535 ? Uint32Array : Uint16Array)(
    (rows - 1) * (cols - 1) * 6
  );
  let k = 0;
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      const b = a + 1;
      const d = a + cols;
      const e = d + 1;
      // Counter-clockwise when viewed from +y (x east, z south).
      indices[k++] = a; indices[k++] = d; indices[k++] = b;
      indices[k++] = b; indices[k++] = d; indices[k++] = e;
    }
  }

  const reliefModel = (maxElev - minElev) * exaggeration * scale;

  // Height of the terrain surface (model units) at a lng/lat.
  function heightAt(lng, lat) {
    return (raster.sample(lng, lat) - minElev) * exaggeration * scale;
  }

  return {
    surface: { positions, normals, uvs, indices },
    rows, cols, rowLats, colLngs,
    minElev, maxElev, reliefModel,
    proj, scale, exaggeration,
    heightAt,
  };
}

// Plinth: walls from the terrain rim down to a flat base, plus a bottom slab.
// Flat-shaded via duplicated vertices; separate untextured primitive.
function buildPlinth(terrain, { depthRatio = 0.12 } = {}) {
  const { surface, rows, cols } = terrain;
  const pos = surface.positions;
  // fround so the value survives Float32Array storage exactly.
  const baseY = Math.fround(-Math.max(terrain.reliefModel * depthRatio, 0.004));

  const positions = [];
  const normals = [];
  const indices = [];

  function rimVertex(r, c) {
    const i = (r * cols + c) * 3;
    return [pos[i], pos[i + 1], pos[i + 2]];
  }

  // Each edge is a strip of quads with a constant outward normal.
  function addWall(rimPts, normal) {
    for (let i = 0; i < rimPts.length - 1; i++) {
      const a = rimPts[i], b = rimPts[i + 1];
      const v0 = positions.length / 3;
      positions.push(
        a[0], a[1], a[2],
        b[0], b[1], b[2],
        b[0], baseY, b[2],
        a[0], baseY, a[2]
      );
      for (let n = 0; n < 4; n++) normals.push(normal[0], normal[1], normal[2]);
      indices.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3);
    }
  }

  const north = [], south = [], west = [], east = [];
  for (let c = 0; c < cols; c++) {
    north.push(rimVertex(0, c));
    south.push(rimVertex(rows - 1, c));
  }
  for (let r = 0; r < rows; r++) {
    west.push(rimVertex(r, 0));
    east.push(rimVertex(r, cols - 1));
  }
  addWall(north, [0, 0, -1]);
  addWall(south.slice().reverse(), [0, 0, 1]);
  addWall(west.slice().reverse(), [-1, 0, 0]);
  addWall(east, [1, 0, 0]);

  // Bottom slab (viewed from below, so wind clockwise from above).
  const nw = rimVertex(0, 0), ne = rimVertex(0, cols - 1);
  const sw = rimVertex(rows - 1, 0), se = rimVertex(rows - 1, cols - 1);
  const v0 = positions.length / 3;
  positions.push(
    nw[0], baseY, nw[2],
    ne[0], baseY, ne[2],
    se[0], baseY, se[2],
    sw[0], baseY, sw[2]
  );
  for (let n = 0; n < 4; n++) normals.push(0, -1, 0);
  indices.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3);

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new (positions.length / 3 > 65535 ? Uint32Array : Uint16Array)(indices),
    baseY,
  };
}

// Resamples the course at a fixed real-world step and drapes it on the DEM.
// Returns model-space points plus cumulative miles for animation reuse.
function resampleCourse({ coords, cumMiles, terrain, stepMeters = 60, lift = 1.5 }) {
  const totalMiles = cumMiles[cumMiles.length - 1];
  const stepMiles = stepMeters / 1609.34;
  const n = Math.max(2, Math.ceil(totalMiles / stepMiles) + 1);
  const points = [];
  const miles = [];
  const liftModel = lift * terrain.scale * terrain.exaggeration;
  for (let i = 0; i < n; i++) {
    const mile = (totalMiles * i) / (n - 1);
    // Inline coordAtMile-style interpolation (binary search).
    let lo = 0, hi = cumMiles.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (cumMiles[mid] <= mile) lo = mid;
      else hi = mid;
    }
    const span = cumMiles[hi] - cumMiles[lo];
    const t = span > 0 ? (mile - cumMiles[lo]) / span : 0;
    const lng = coords[lo][0] + (coords[hi][0] - coords[lo][0]) * t;
    const lat = coords[lo][1] + (coords[hi][1] - coords[lo][1]) * t;
    const p = terrain.proj.project([lng, lat]);
    points.push([
      p.x * terrain.scale,
      terrain.heightAt(lng, lat) + liftModel,
      p.z * terrain.scale,
    ]);
    miles.push(mile);
  }
  return { points, miles, totalMiles };
}

// Low-poly tube along a polyline using fixed-up frames (courses are never
// vertical, so cross(up, tangent) is always well-conditioned).
function buildTube(points, radius, segments = 6) {
  const n = points.length;
  const positions = new Float32Array(n * segments * 3);
  const normals = new Float32Array(n * segments * 3);
  const rings = [];

  for (let i = 0; i < n; i++) {
    const prev = points[Math.max(i - 1, 0)];
    const next = points[Math.min(i + 1, n - 1)];
    let tx = next[0] - prev[0], ty = next[1] - prev[1], tz = next[2] - prev[2];
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl; ty /= tl; tz /= tl;
    // side = normalize(cross(up, tangent)); up = (0,1,0)
    let sx = tz, sy = 0, sz = -tx;
    const sl = Math.hypot(sx, sy, sz) || 1;
    sx /= sl; sz /= sl;
    // binormal = cross(tangent, side)
    const bx = ty * sz - tz * sy;
    const by = tz * sx - tx * sz;
    const bz = tx * sy - ty * sx;

    for (let s = 0; s < segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const nx = sx * ca + bx * sa;
      const ny = sy * ca + by * sa;
      const nz = sz * ca + bz * sa;
      const vi = (i * segments + s) * 3;
      positions[vi] = points[i][0] + nx * radius;
      positions[vi + 1] = points[i][1] + ny * radius;
      positions[vi + 2] = points[i][2] + nz * radius;
      normals[vi] = nx; normals[vi + 1] = ny; normals[vi + 2] = nz;
    }
    rings.push(i * segments);
  }

  const quadCount = (n - 1) * segments;
  const IndexArray = n * segments > 65535 ? Uint32Array : Uint16Array;
  const indices = new IndexArray(quadCount * 6);
  let k = 0;
  for (let i = 0; i < n - 1; i++) {
    for (let s = 0; s < segments; s++) {
      const a = rings[i] + s;
      const b = rings[i] + ((s + 1) % segments);
      const c = rings[i + 1] + s;
      const d = rings[i + 1] + ((s + 1) % segments);
      indices[k++] = a; indices[k++] = b; indices[k++] = c;
      indices[k++] = b; indices[k++] = d; indices[k++] = c;
    }
  }
  return { positions, normals, indices };
}

// UV sphere centered at origin.
function buildSphere(radius, widthSeg = 8, heightSeg = 6) {
  const positions = [];
  const normals = [];
  const indices = [];
  for (let y = 0; y <= heightSeg; y++) {
    const v = y / heightSeg;
    const phi = v * Math.PI;
    for (let x = 0; x <= widthSeg; x++) {
      const u = x / widthSeg;
      const theta = u * Math.PI * 2;
      const nx = Math.sin(phi) * Math.cos(theta);
      const ny = Math.cos(phi);
      const nz = Math.sin(phi) * Math.sin(theta);
      positions.push(nx * radius, ny * radius, nz * radius);
      normals.push(nx, ny, nz);
    }
  }
  const stride = widthSeg + 1;
  for (let y = 0; y < heightSeg; y++) {
    for (let x = 0; x < widthSeg; x++) {
      const a = y * stride + x;
      const b = a + stride;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices),
  };
}

// Open cylinder (no caps) from y=0 to y=height.
function buildCylinder(radius, height, segments = 6) {
  const positions = [];
  const normals = [];
  const indices = [];
  for (let s = 0; s <= segments; s++) {
    const a = (s / segments) * Math.PI * 2;
    const nx = Math.cos(a), nz = Math.sin(a);
    positions.push(nx * radius, 0, nz * radius, nx * radius, height, nz * radius);
    normals.push(nx, 0, nz, nx, 0, nz);
  }
  for (let s = 0; s < segments; s++) {
    const a = s * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices),
  };
}

// Merges primitives (positions/normals/indices) into one, applying per-part
// translation offsets.
function mergeParts(parts) {
  let vCount = 0, iCount = 0;
  for (const { geom } of parts) {
    vCount += geom.positions.length / 3;
    iCount += geom.indices.length;
  }
  const positions = new Float32Array(vCount * 3);
  const normals = new Float32Array(vCount * 3);
  const IndexArray = vCount > 65535 ? Uint32Array : Uint16Array;
  const indices = new IndexArray(iCount);
  let vOff = 0, iOff = 0;
  for (const { geom, offset = [0, 0, 0] } of parts) {
    const nV = geom.positions.length / 3;
    for (let i = 0; i < nV; i++) {
      positions[(vOff + i) * 3] = geom.positions[i * 3] + offset[0];
      positions[(vOff + i) * 3 + 1] = geom.positions[i * 3 + 1] + offset[1];
      positions[(vOff + i) * 3 + 2] = geom.positions[i * 3 + 2] + offset[2];
    }
    normals.set(geom.normals, vOff * 3);
    for (let i = 0; i < geom.indices.length; i++) {
      indices[iOff + i] = geom.indices[i] + vOff;
    }
    vOff += nV;
    iOff += geom.indices.length;
  }
  return { positions, normals, indices };
}

// Aid-station pin: pole + ball head, origin at ground level.
function buildPin({ poleHeight, poleRadius, headRadius }) {
  return mergeParts([
    { geom: buildCylinder(poleRadius, poleHeight, 6) },
    { geom: buildSphere(headRadius, 10, 7), offset: [0, poleHeight + headRadius * 0.6, 0] },
  ]);
}

// Keyframes for the lead-pack node: times spread over `duration` seconds
// proportional to distance covered (constant pace).
function buildLeadPackKeyframes(course, duration = 45) {
  const { points, miles, totalMiles } = course;
  const times = new Float32Array(points.length);
  const values = new Float32Array(points.length * 3);
  for (let i = 0; i < points.length; i++) {
    times[i] = (miles[i] / totalMiles) * duration;
    values[i * 3] = points[i][0];
    values[i * 3 + 1] = points[i][1];
    values[i * 3 + 2] = points[i][2];
  }
  return { times, values, duration };
}

module.exports = {
  buildTerrain,
  buildPlinth,
  resampleCourse,
  buildTube,
  buildSphere,
  buildCylinder,
  buildPin,
  mergeParts,
  buildLeadPackKeyframes,
};
