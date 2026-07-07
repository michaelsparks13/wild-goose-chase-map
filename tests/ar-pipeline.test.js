// Unit tests for the AR course-model pipeline (scripts/ar/*).
import { describe, it, expect } from 'vitest';
import { PNG } from 'pngjs';
import {
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
} from '../scripts/ar/geo.js';
import { decodeTerrarium } from '../scripts/ar/dem.js';
import { resizeRGBA } from '../scripts/ar/imagery.js';
import {
  buildTerrain,
  buildPlinth,
  resampleCourse,
  buildTube,
  buildSphere,
  buildPin,
  buildLeadPackKeyframes,
} from '../scripts/ar/mesh.js';
import { buildGlb, hexToLinearRGB } from '../scripts/ar/glb.js';

// Small course near Windham, NY (escarpment territory).
const COURSE = [
  [-74.19, 42.31],
  [-74.15, 42.29],
  [-74.10, 42.26],
  [-74.04, 42.20],
];

describe('geo: slippy tile math', () => {
  it('round-trips lng/lat through tile coordinates', () => {
    const t = lngLatToTile(-74.1, 42.25, 12);
    expect(tileXToLng(t.x, 12)).toBeCloseTo(-74.1, 6);
    expect(tileYToLat(t.y, 12)).toBeCloseTo(42.25, 6);
  });

  it('maps the origin to the tile grid center', () => {
    const t = lngLatToTile(0, 0, 4);
    expect(t.x).toBeCloseTo(8, 10);
    expect(t.y).toBeCloseTo(8, 10);
  });

  it('computes a padded bbox containing all coords', () => {
    const bbox = computeBBox(COURSE, 0.15);
    expect(bbox.west).toBeLessThan(-74.19);
    expect(bbox.east).toBeGreaterThan(-74.04);
    expect(bbox.south).toBeLessThan(42.2);
    expect(bbox.north).toBeGreaterThan(42.31);
  });

  it('picks the highest zoom that fits the tile budget', () => {
    const bbox = computeBBox(COURSE, 0.15);
    const z = pickZoom(bbox, { maxTiles: 6, maxZoom: 13 });
    expect(z).toBeGreaterThanOrEqual(10);
    expect(z).toBeLessThanOrEqual(13);
    const range = tileRangeForBBox(bbox, z);
    expect(range.maxX - range.minX + 1).toBeLessThanOrEqual(6);
    expect(range.maxY - range.minY + 1).toBeLessThanOrEqual(6);
    // One level deeper must overflow the budget in at least one axis.
    const deeper = tileRangeForBBox(bbox, z + 1);
    const spanX = deeper.maxX - deeper.minX + 1;
    const spanY = deeper.maxY - deeper.minY + 1;
    expect(Math.max(spanX, spanY)).toBeGreaterThan(6);
  });
});

describe('geo: distance helpers', () => {
  it('measures a known distance (1 degree of latitude ≈ 69.05 mi)', () => {
    expect(haversineMiles([-74, 42], [-74, 43])).toBeCloseTo(69.05, 0);
  });

  it('builds a monotonic cumulative-distance array', () => {
    const cum = cumulativeMiles(COURSE);
    expect(cum[0]).toBe(0);
    for (let i = 1; i < cum.length; i++) expect(cum[i]).toBeGreaterThan(cum[i - 1]);
  });

  it('interpolates coordinates at a mile and clamps out-of-range', () => {
    const cum = cumulativeMiles(COURSE);
    expect(coordAtMile(COURSE, cum, 0)).toEqual(COURSE[0]);
    expect(coordAtMile(COURSE, cum, 9999)).toEqual(COURSE[COURSE.length - 1]);
    const mid = coordAtMile(COURSE, cum, cum[cum.length - 1] / 2);
    expect(mid[0]).toBeGreaterThan(-74.19);
    expect(mid[0]).toBeLessThan(-74.04);
  });

  it('projects to local meters with the bbox center at the origin', () => {
    const bbox = { west: -74.2, south: 42.2, east: -74.0, north: 42.32 };
    const { project, widthM, depthM } = localProjector(bbox);
    const center = project([-74.1, 42.26]);
    expect(Math.abs(center.x)).toBeLessThan(1);
    expect(Math.abs(center.z)).toBeLessThan(1);
    // North edge must map to -z (three.js convention).
    expect(project([-74.1, 42.32]).z).toBeLessThan(0);
    expect(widthM).toBeGreaterThan(10000);
    expect(depthM).toBeGreaterThan(10000);
  });
});

describe('dem: terrarium decoding', () => {
  it('decodes elevation from RGB (elev = R*256 + G + B/256 - 32768)', () => {
    const png = new PNG({ width: 2, height: 1 });
    // 500 m → encoded = 33268 = 129*256 + 244
    png.data.set([129, 244, 0, 255], 0);
    // 0 m → encoded = 32768 = 128*256
    png.data.set([128, 0, 128, 255], 4);
    const buf = PNG.sync.write(png);
    const elev = decodeTerrarium(buf);
    expect(elev[0]).toBeCloseTo(500, 5);
    expect(elev[1]).toBeCloseTo(0.5, 5);
  });
});

describe('imagery: resize', () => {
  it('bilinear-resizes preserving solid colors', () => {
    const src = Buffer.alloc(4 * 4 * 4);
    for (let i = 0; i < 16; i++) src.set([200, 100, 50, 255], i * 4);
    const dst = resizeRGBA(src, 4, 4, 2, 2);
    expect(dst.length).toBe(2 * 2 * 4);
    expect(dst[0]).toBe(200);
    expect(dst[1]).toBe(100);
    expect(dst[2]).toBe(50);
    expect(dst[3]).toBe(255);
  });
});

// A raster stub: elevation is a smooth function of lng/lat, no network.
function fakeRaster(zoom = 12) {
  return {
    zoom,
    sample(lng, lat) {
      return 300 + Math.sin(lng * 40) * 80 + Math.cos(lat * 40) * 60;
    },
  };
}

function terrainFixture(cols = 16) {
  const bbox = computeBBox(COURSE, 0.15);
  const projScale = localProjector(bbox);
  const scale = 0.42 / Math.max(projScale.widthM, projScale.depthM);
  return buildTerrain({ bbox, raster: fakeRaster(), cols, exaggeration: 1.6, scale });
}

describe('mesh: terrain', () => {
  it('builds a grid with consistent buffer sizes and finite values', () => {
    const t = terrainFixture(16);
    const nVerts = t.rows * t.cols;
    expect(t.surface.positions.length).toBe(nVerts * 3);
    expect(t.surface.normals.length).toBe(nVerts * 3);
    expect(t.surface.uvs.length).toBe(nVerts * 2);
    expect(t.surface.indices.length).toBe((t.rows - 1) * (t.cols - 1) * 6);
    for (const v of t.surface.positions) expect(Number.isFinite(v)).toBe(true);
    for (const v of t.surface.normals) expect(Number.isFinite(v)).toBe(true);
  });

  it('keeps the model within the tabletop target size', () => {
    const t = terrainFixture(16);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, minY = Infinity;
    for (let i = 0; i < t.surface.positions.length; i += 3) {
      minX = Math.min(minX, t.surface.positions[i]);
      maxX = Math.max(maxX, t.surface.positions[i]);
      minY = Math.min(minY, t.surface.positions[i + 1]);
      minZ = Math.min(minZ, t.surface.positions[i + 2]);
      maxZ = Math.max(maxZ, t.surface.positions[i + 2]);
    }
    expect(Math.max(maxX - minX, maxZ - minZ)).toBeCloseTo(0.42, 2);
    expect(minY).toBeGreaterThanOrEqual(0); // floor sits at y=0
  });

  it('normals are unit length and point generally up', () => {
    const t = terrainFixture(16);
    for (let i = 0; i < t.surface.normals.length; i += 3) {
      const len = Math.hypot(
        t.surface.normals[i],
        t.surface.normals[i + 1],
        t.surface.normals[i + 2]
      );
      expect(len).toBeCloseTo(1, 4);
      expect(t.surface.normals[i + 1]).toBeGreaterThan(0);
    }
  });

  it('heightAt tracks the terrain relief range', () => {
    const t = terrainFixture(16);
    const h = t.heightAt(-74.1, 42.26);
    // heightAt samples the raster continuously, so between grid nodes it can
    // slightly exceed the grid-derived relief — allow 10% headroom.
    expect(h).toBeGreaterThanOrEqual(-t.reliefModel * 0.1);
    expect(h).toBeLessThanOrEqual(t.reliefModel * 1.1);
  });
});

describe('mesh: plinth', () => {
  it('walls reach a flat base below y=0', () => {
    const t = terrainFixture(12);
    const p = buildPlinth(t);
    expect(p.baseY).toBeLessThan(0);
    let sawBase = false;
    for (let i = 1; i < p.positions.length; i += 3) {
      if (p.positions[i] === p.baseY) sawBase = true;
      expect(p.positions[i]).toBeGreaterThanOrEqual(p.baseY);
    }
    expect(sawBase).toBe(true);
    expect(p.indices.length % 3).toBe(0);
  });
});

describe('mesh: course + tube + animation', () => {
  it('resamples the course monotonically over the terrain', () => {
    const t = terrainFixture(16);
    const cum = cumulativeMiles(COURSE);
    const course = resampleCourse({ coords: COURSE, cumMiles: cum, terrain: t, stepMeters: 200 });
    expect(course.points.length).toBeGreaterThan(10);
    expect(course.miles[0]).toBe(0);
    expect(course.miles[course.miles.length - 1]).toBeCloseTo(course.totalMiles, 6);
    for (const [x, y, z] of course.points) {
      expect(Number.isFinite(x + y + z)).toBe(true);
      expect(y).toBeGreaterThan(0); // lifted above the surface
    }
  });

  it('builds a closed-ring tube with matching buffers', () => {
    const t = terrainFixture(16);
    const cum = cumulativeMiles(COURSE);
    const course = resampleCourse({ coords: COURSE, cumMiles: cum, terrain: t, stepMeters: 400 });
    const tube = buildTube(course.points, 0.002, 6);
    const n = course.points.length;
    expect(tube.positions.length).toBe(n * 6 * 3);
    expect(tube.indices.length).toBe((n - 1) * 6 * 6);
    const maxIndex = Math.max(...tube.indices);
    expect(maxIndex).toBeLessThan(tube.positions.length / 3);
  });

  it('spreads keyframes across the duration proportional to distance', () => {
    const t = terrainFixture(16);
    const cum = cumulativeMiles(COURSE);
    const course = resampleCourse({ coords: COURSE, cumMiles: cum, terrain: t, stepMeters: 400 });
    const kf = buildLeadPackKeyframes(course, 45);
    expect(kf.times[0]).toBe(0);
    expect(kf.times[kf.times.length - 1]).toBeCloseTo(45, 6);
    expect(kf.values.length).toBe(kf.times.length * 3);
    for (let i = 1; i < kf.times.length; i++) {
      expect(kf.times[i]).toBeGreaterThan(kf.times[i - 1]);
    }
  });
});

describe('mesh: primitives', () => {
  it('sphere vertices sit on the radius', () => {
    const s = buildSphere(0.01, 8, 6);
    for (let i = 0; i < s.positions.length; i += 3) {
      const r = Math.hypot(s.positions[i], s.positions[i + 1], s.positions[i + 2]);
      expect(r).toBeCloseTo(0.01, 6);
    }
  });

  it('pin merges pole and head with valid indices', () => {
    const pin = buildPin({ poleHeight: 0.025, poleRadius: 0.0007, headRadius: 0.005 });
    expect(pin.positions.length).toBe(pin.normals.length);
    const maxIndex = Math.max(...pin.indices);
    expect(maxIndex).toBeLessThan(pin.positions.length / 3);
    // Head must rise above the pole.
    let maxY = -Infinity;
    for (let i = 1; i < pin.positions.length; i += 3) maxY = Math.max(maxY, pin.positions[i]);
    expect(maxY).toBeGreaterThan(0.025);
  });
});

describe('glb: color + assembly', () => {
  it('converts sRGB hex to linear', () => {
    expect(hexToLinearRGB('#ffffff')).toEqual([1, 1, 1]);
    const mid = hexToLinearRGB('#808080');
    expect(mid[0]).toBeCloseTo(0.2158, 3);
  });

  it('assembles a valid GLB with named nodes and an animation', async () => {
    const t = terrainFixture(12);
    const cum = cumulativeMiles(COURSE);
    const course = resampleCourse({ coords: COURSE, cumMiles: cum, terrain: t, stepMeters: 400 });
    const tube = buildTube(course.points, 0.002, 6);
    const pinGeom = buildPin({ poleHeight: 0.025, poleRadius: 0.0007, headRadius: 0.005 });
    const kf = buildLeadPackKeyframes(course, 45);

    // 2x2 gray JPEG via jpeg-js
    const jpeg = await import('jpeg-js');
    const px = Buffer.alloc(2 * 2 * 4, 128);
    const tex = jpeg.encode({ data: px, width: 2, height: 2 }, 80);

    const glb = await buildGlb({
      terrainGeom: t.surface,
      plinthGeom: buildPlinth(t),
      tubeGeom: tube,
      pins: [
        { geom: pinGeom, translation: [0.01, 0.02, 0.01] },
        { geom: pinGeom, translation: [-0.01, 0.01, -0.02] },
      ],
      leadPackGeom: buildSphere(0.005, 8, 6),
      keyframes: kf,
      texture: { jpeg: tex.data, width: 2, height: 2 },
      colors: { course: '#2E7D32', plinth: '#2b2723', pin: '#ffffff', leadPack: '#ffd54a' },
    });

    // GLB magic bytes: 'glTF'
    expect(glb[0]).toBe(0x67);
    expect(glb[1]).toBe(0x6c);
    expect(glb[2]).toBe(0x54);
    expect(glb[3]).toBe(0x46);

    const { NodeIO } = await import('@gltf-transform/core');
    const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
    const doc = await io.readBinary(glb);
    const names = doc.getRoot().listNodes().map((n) => n.getName());
    expect(names).toContain('terrain');
    expect(names).toContain('course');
    expect(names).toContain('aid-0');
    expect(names).toContain('aid-1');
    expect(names).toContain('lead-pack');
    expect(doc.getRoot().listAnimations()).toHaveLength(1);
    expect(doc.getRoot().listTextures()).toHaveLength(1);
  });
});
