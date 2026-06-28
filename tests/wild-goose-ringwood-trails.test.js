// wild-goose-ringwood-trails.test.js — guards the park-trails overlay data
// structure. The overlay was originally shipped as raw, un-dissolved OSM ways
// (348 features, median ~171 m), which are too short for MapLibre to place
// line-following labels until ~z15 — so trail names never appeared at the
// overview zoom. Every other FSS map (wild-goose, sleeping-giant, escarpment)
// dissolves trails to ONE feature per name with long stitched geometry. This
// test pins Ringwood to that same structure so the regression can't return.

import { describe, it, expect } from 'vitest';
import fs from 'fs';

// vitest runs with cwd at the project root; read the geojson as a file rather
// than require() (esbuild would try to parse .geojson as JS).
const fc = JSON.parse(fs.readFileSync('src/maps/wild-goose-ringwood/data/trails.geojson', 'utf8'));

function lengthMeters(coords) {
  const R = 6371000;
  let t = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1], b = coords[i];
    const la1 = a[1] * Math.PI / 180, la2 = b[1] * Math.PI / 180;
    const dla = (b[1] - a[1]) * Math.PI / 180, dlo = (b[0] - a[0]) * Math.PI / 180;
    const h = Math.sin(dla / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dlo / 2) ** 2;
    t += 2 * R * Math.asin(Math.sqrt(h));
  }
  return t;
}
function featureLength(f) {
  const g = f.geometry;
  const parts = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
  return parts.reduce((s, p) => s + lengthMeters(p), 0);
}

describe('wild-goose @ ringwood — park trails are dissolved by name', () => {
  it('is a FeatureCollection of Line/MultiLineString features', () => {
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features.length).toBeGreaterThan(0);
    for (const f of fc.features) {
      expect(['LineString', 'MultiLineString']).toContain(f.geometry.type);
    }
  });

  it('is dissolved — far fewer features than the raw OSM dump (≤ 150, was 348)', () => {
    expect(fc.features.length).toBeLessThanOrEqual(150);
  });

  it('has one feature per trail name (no duplicate named features)', () => {
    const named = fc.features.map(f => f.properties.name).filter(Boolean);
    expect(new Set(named).size).toBe(named.length);
  });

  it('named trails are long enough to host labels (median ≥ 400 m)', () => {
    const lens = fc.features
      .filter(f => f.properties.name)
      .map(featureLength)
      .sort((a, b) => a - b);
    const median = lens[Math.floor(lens.length / 2)];
    expect(median).toBeGreaterThanOrEqual(400);
  });

  it('every feature carries name + blaze properties', () => {
    for (const f of fc.features) {
      expect(f.properties).toHaveProperty('name');
      expect(f.properties).toHaveProperty('blaze');
    }
  });
});
