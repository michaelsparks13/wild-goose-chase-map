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
