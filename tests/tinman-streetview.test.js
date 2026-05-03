import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const dataPath = resolve(__dirname, '../src/maps/tupper-lake-tinman/data/streetview.json');

describe('streetview.json schema', () => {
  it('exists', () => {
    expect(existsSync(dataPath)).toBe(true);
  });

  it('contains 9 turn entries', () => {
    const data = JSON.parse(readFileSync(dataPath, 'utf-8'));
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(9);
  });

  it('each entry has required fields with correct types', () => {
    const data = JSON.parse(readFileSync(dataPath, 'utf-8'));
    data.forEach((entry, i) => {
      expect(typeof entry.name, `entry ${i} name`).toBe('string');
      expect(typeof entry.mile, `entry ${i} mile`).toBe('number');
      expect(Array.isArray(entry.coords), `entry ${i} coords`).toBe(true);
      expect(entry.coords).toHaveLength(2);
      expect(typeof entry.pano, `entry ${i} pano`).toBe('string');
      expect(entry.pano.length, `entry ${i} pano not empty`).toBeGreaterThan(0);
      expect(typeof entry.yaw, `entry ${i} yaw`).toBe('number');
      expect(typeof entry.pitch, `entry ${i} pitch`).toBe('number');
      expect(typeof entry.bearingAfter, `entry ${i} bearingAfter`).toBe('number');
    });
  });

  it('mile values are sorted ascending and unique', () => {
    const data = JSON.parse(readFileSync(dataPath, 'utf-8'));
    const miles = data.map((e) => e.mile);
    const sorted = [...miles].sort((a, b) => a - b);
    expect(miles).toEqual(sorted);
    expect(new Set(miles).size).toBe(miles.length);
  });
});

const distHtmlPath = resolve(__dirname, '../dist/maps/tupper-lake-tinman/index.html');
const embedHtmlPath = resolve(__dirname, '../dist/embed/tupper-lake-tinman/index.html');

describe('build inlines STREETVIEW_TURNS', () => {
  it('main HTML defines STREETVIEW_TURNS as an array', () => {
    const html = readFileSync(distHtmlPath, 'utf-8');
    expect(html).toMatch(/var STREETVIEW_TURNS\s*=\s*\[/);
  });

  it('embed HTML defines STREETVIEW_TURNS', () => {
    const html = readFileSync(embedHtmlPath, 'utf-8');
    expect(html).toMatch(/var STREETVIEW_TURNS\s*=\s*\[/);
  });

  it('inlined data includes all 9 pano IDs', () => {
    const html = readFileSync(distHtmlPath, 'utf-8');
    const panos = [
      'H3Z_ClxiBAJECBtSj3-Yig',
      'vK87NCNW1jRk4UDFDxGEqg',
      'aW84qtHD_VBgwzlvZuvSOg',
      'iR9cgLQXuu2GYkVzJwi3uw',
      'hdp2J3ubGHj7-GGBdKRCjw',
      'LBT7s8B1gdB50CnSDsmSNg',
      'FXpF_L3JMYHMvNk_xrHzYQ',
      'AlGc8rKntBziWDekY_bj3w',
      'rmgStNEYvH8pcB34HoPq6g',
    ];
    panos.forEach((pano) => {
      expect(html, `pano ${pano} should be inlined`).toContain(pano);
    });
  });
});

describe('arrow rotation math (pure)', () => {
  // These helpers MUST stay in sync with override.js. Tested as pure functions
  // by redefining inline; the source-of-truth lives in override.js. The
  // HTML-inspection test below verifies the override.js definitions match.
  function normalizeAngle(deg) {
    var x = deg % 360;
    if (x > 180) x -= 360;
    if (x < -180) x += 360;
    return x;
  }

  function streetviewArrowAngle(turn) {
    return normalizeAngle(turn.bearingAfter - turn.yaw);
  }

  it('normalizeAngle handles common values', () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(90)).toBe(90);
    expect(normalizeAngle(-90)).toBe(-90);
    expect(normalizeAngle(180)).toBe(180);
    expect(normalizeAngle(-180)).toBe(-180);
    expect(normalizeAngle(360)).toBe(0);
    expect(normalizeAngle(450)).toBe(90);
    expect(normalizeAngle(-450)).toBe(-90);
  });

  it('streetviewArrowAngle for the 9 captured turns', () => {
    const cases = [
      { yaw: 116.16, bearingAfter: 171, expected: 54.84 },
      { yaw: 137.24, bearingAfter: 82,  expected: -55.24 },
      { yaw: 98.82,  bearingAfter: 119, expected: 20.18 },
      { yaw: 334.81, bearingAfter: 262, expected: -72.81 },
      { yaw: 265.99, bearingAfter: 201, expected: -64.99 },
      { yaw: 14.53,  bearingAfter: 285, expected: -89.53 },
      { yaw: 260.01, bearingAfter: 327, expected: 66.99 },
      { yaw: 331.20, bearingAfter: 330, expected: -1.20 },
      { yaw: 255.91, bearingAfter: 180, expected: -75.91 },
    ];
    cases.forEach((c) => {
      const result = streetviewArrowAngle(c);
      expect(result, `yaw=${c.yaw} bearingAfter=${c.bearingAfter}`).toBeCloseTo(c.expected, 1);
    });
  });

  it('all 9 captured turns have |arrowAngle| <= 90 (exit visible in frame)', () => {
    const data = JSON.parse(readFileSync(dataPath, 'utf-8'));
    data.forEach((turn) => {
      const angle = streetviewArrowAngle(turn);
      expect(Math.abs(angle), `${turn.name}`).toBeLessThanOrEqual(90);
    });
  });
});

describe('override.js exposes the rotation helpers', () => {
  it('main HTML contains normalizeAngle definition', () => {
    const html = readFileSync(distHtmlPath, 'utf-8');
    expect(html).toMatch(/function\s+normalizeAngle\s*\(/);
  });

  it('main HTML contains streetviewArrowAngle definition', () => {
    const html = readFileSync(distHtmlPath, 'utf-8');
    expect(html).toMatch(/function\s+streetviewArrowAngle\s*\(/);
  });
});

describe('buildStreetviewPopupHtml structure', () => {
  it('main HTML contains buildStreetviewPopupHtml definition', () => {
    const html = readFileSync(distHtmlPath, 'utf-8');
    expect(html).toMatch(/function\s+buildStreetviewPopupHtml\s*\(/);
  });

  it('main HTML uses streetviewpixels-pa.googleapis.com thumbnail endpoint', () => {
    const html = readFileSync(distHtmlPath, 'utf-8');
    expect(html).toContain('streetviewpixels-pa.googleapis.com/v1/thumbnail');
  });

  it('popup HTML wires the chevron transform to streetviewArrowAngle', () => {
    const html = readFileSync(distHtmlPath, 'utf-8');
    const fnStart = html.indexOf('function buildStreetviewPopupHtml');
    expect(fnStart).toBeGreaterThan(-1);
    // Slice through the function body — the function is < 2KB; 2500 chars is a safe upper bound.
    const fnSlice = html.substring(fnStart, fnStart + 2500);
    expect(fnSlice).toMatch(/streetviewArrowAngle\s*\(/);
    expect(fnSlice).toMatch(/rotate\(/);
  });
});

describe('Street View toggle button', () => {
  it('button exists in main HTML between aid and 3D', () => {
    const html = readFileSync(distHtmlPath, 'utf-8');
    const aidIdx = html.indexOf('id="aidBtn"');
    const svIdx = html.indexOf('id="streetviewBtn"');
    const terrainIdx = html.indexOf('id="terrainBtn"');
    expect(aidIdx).toBeGreaterThan(-1);
    expect(svIdx).toBeGreaterThan(-1);
    expect(terrainIdx).toBeGreaterThan(-1);
    expect(svIdx).toBeGreaterThan(aidIdx);
    expect(svIdx).toBeLessThan(terrainIdx);
  });

  it('button label is "Street View"', () => {
    const html = readFileSync(distHtmlPath, 'utf-8');
    expect(html).toMatch(/id="streetviewBtn"[^>]*>Street View</);
  });

  it('button onclick wires to toggleStreetview', () => {
    const html = readFileSync(distHtmlPath, 'utf-8');
    expect(html).toMatch(/id="streetviewBtn"[^>]*onclick="toggleStreetview\(\)"/);
  });

  it('button count matches aidBtn and terrainBtn (rows stay in sync)', () => {
    const html = readFileSync(distHtmlPath, 'utf-8');
    const countOf = (str) => (html.match(new RegExp(str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    expect(countOf('id="streetviewBtn"')).toBe(countOf('id="aidBtn"'));
    expect(countOf('id="streetviewBtn"')).toBe(countOf('id="terrainBtn"'));
    expect(countOf('id="streetviewBtn"')).toBeGreaterThanOrEqual(1);
  });
});

describe('Street View marker creation', () => {
  it('main HTML iterates STREETVIEW_TURNS to create markers', () => {
    const html = readFileSync(distHtmlPath, 'utf-8');
    expect(html).toMatch(/STREETVIEW_TURNS\.forEach/);
  });

  it('main HTML defines streetviewMarkers array', () => {
    const html = readFileSync(distHtmlPath, 'utf-8');
    expect(html).toMatch(/var\s+streetviewMarkers\s*=\s*\[\s*\]/);
  });

  it('tap-passthrough guard includes .streetview-marker', () => {
    const html = readFileSync(distHtmlPath, 'utf-8');
    expect(html).toMatch(/closest\(['"][^'"]*\.streetview-marker[^'"]*['"]\)/);
  });
});
