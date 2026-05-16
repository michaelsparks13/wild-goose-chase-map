import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const dataPath = resolve(__dirname, '../src/maps/gran-fondo-badlands/data/streetview.json');
const distHtmlPath = resolve(__dirname, '../dist/maps/gran-fondo-badlands/index.html');
const embedHtmlPath = resolve(__dirname, '../dist/embed/gran-fondo-badlands/index.html');

describe('gran-fondo-badlands streetview.json schema', () => {
  it('exists', () => {
    expect(existsSync(dataPath)).toBe(true);
  });

  it('contains 8 POI entries', () => {
    const data = JSON.parse(readFileSync(dataPath, 'utf-8'));
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(8);
  });

  it('each entry has required fields with correct types', () => {
    const data = JSON.parse(readFileSync(dataPath, 'utf-8'));
    data.forEach((entry, i) => {
      expect(typeof entry.name, `entry ${i} name`).toBe('string');
      expect(typeof entry.kilometer, `entry ${i} kilometer`).toBe('number');
      expect(Array.isArray(entry.coords), `entry ${i} coords`).toBe(true);
      expect(entry.coords).toHaveLength(2);
      expect(typeof entry.coords[0]).toBe('number');
      expect(typeof entry.coords[1]).toBe('number');
      expect(typeof entry.pano, `entry ${i} pano`).toBe('string');
      expect(entry.pano.length).toBeGreaterThan(0);
      expect(typeof entry.yaw, `entry ${i} yaw`).toBe('number');
      expect(typeof entry.pitch, `entry ${i} pitch`).toBe('number');
    });
  });

  it('kilometer values are sorted ascending', () => {
    const data = JSON.parse(readFileSync(dataPath, 'utf-8'));
    const kms = data.map((e) => e.kilometer);
    const sorted = [...kms].sort((a, b) => a - b);
    expect(kms).toEqual(sorted);
  });

  it('coordinates fall within the Drumheller / Red Deer River valley bbox', () => {
    const data = JSON.parse(readFileSync(dataPath, 'utf-8'));
    data.forEach((entry, i) => {
      const [lng, lat] = entry.coords;
      expect(lng, `entry ${i} lng`).toBeGreaterThan(-113);
      expect(lng, `entry ${i} lng`).toBeLessThan(-112);
      expect(lat, `entry ${i} lat`).toBeGreaterThan(51.2);
      expect(lat, `entry ${i} lat`).toBeLessThan(51.6);
    });
  });
});

describe('build inlines STREETVIEW_TURNS', () => {
  it('main HTML defines STREETVIEW_TURNS as an array', () => {
    const html = readFileSync(distHtmlPath, 'utf-8');
    expect(html).toMatch(/var STREETVIEW_TURNS\s*=\s*\[/);
  });

  it('embed HTML defines STREETVIEW_TURNS', () => {
    const html = readFileSync(embedHtmlPath, 'utf-8');
    expect(html).toMatch(/var STREETVIEW_TURNS\s*=\s*\[/);
  });

  it('inlined data includes all 8 pano IDs', () => {
    const html = readFileSync(distHtmlPath, 'utf-8');
    const panos = [
      'Sit6jDAoWQVTWqVMumVUtw',
      'WMqU4g4cpariQUw1QdsaxQ',
      'jjHdSNkBLED5nww9rv8inw',
      'q2XJEjTsALZ4eo_IeF2T8g',
      '8kmi_ZSUSuNOiIKhGkSHhA',
      'J04NsL67JkA8aLJ7cq2v7Q',
      '4Myek4e5TrB9lhEf4UhKbA',
      'IzM7x4pgwXvDkxajxTqi-A',
    ];
    panos.forEach((pano) => {
      expect(html, `pano ${pano} should be inlined`).toContain(pano);
    });
  });
});

describe('Street View runtime wiring', () => {
  it('main HTML defines buildStreetviewPopupHtml', () => {
    const html = readFileSync(distHtmlPath, 'utf-8');
    expect(html).toMatch(/function\s+buildStreetviewPopupHtml\s*\(/);
  });

  it('main HTML defines toggleStreetview', () => {
    const html = readFileSync(distHtmlPath, 'utf-8');
    expect(html).toMatch(/function\s+toggleStreetview\s*\(/);
  });

  it('main HTML defines renderStreetviewMarkers', () => {
    const html = readFileSync(distHtmlPath, 'utf-8');
    expect(html).toMatch(/function\s+renderStreetviewMarkers\s*\(/);
  });

  it('main HTML iterates STREETVIEW_TURNS via forEach to create markers', () => {
    const html = readFileSync(distHtmlPath, 'utf-8');
    expect(html).toMatch(/STREETVIEW_TURNS\.forEach/);
  });

  it('main HTML declares the streetviewMarkers array', () => {
    const html = readFileSync(distHtmlPath, 'utf-8');
    expect(html).toMatch(/var\s+streetviewMarkers\s*=\s*\[\s*\]/);
  });

  it('main HTML uses the Google Street View thumbnail endpoint', () => {
    const html = readFileSync(distHtmlPath, 'utf-8');
    expect(html).toContain('streetviewpixels-pa.googleapis.com/v1/thumbnail');
  });

  it('toggleStreetview flips streetviewOn and re-renders markers', () => {
    const html = readFileSync(distHtmlPath, 'utf-8');
    const fnStart = html.indexOf('function toggleStreetview');
    expect(fnStart).toBeGreaterThan(-1);
    const fnEnd = html.indexOf('\n}', fnStart) + 2;
    const fnSlice = html.substring(fnStart, fnEnd);
    expect(fnSlice).toMatch(/streetviewOn\s*=\s*!\s*streetviewOn/);
    expect(fnSlice).toMatch(/renderStreetviewMarkers\(\)/);
    expect(fnSlice).toMatch(/updateLayersCount\(\)/);
  });
});

describe('Layers popover wiring', () => {
  it('panel includes a Street Views checkbox row', () => {
    const html = readFileSync(distHtmlPath, 'utf-8');
    expect(html).toMatch(/id="layerStreetview"[^>]*onchange="toggleStreetview\(\)"/);
    expect(html).toContain('Street Views');
  });

  it('Street Views row sits between Aid Stations and 3D in the popover', () => {
    const html = readFileSync(distHtmlPath, 'utf-8');
    const aidIdx = html.indexOf('id="layerAid"');
    const svIdx = html.indexOf('id="layerStreetview"');
    const threeDIdx = html.indexOf('id="layer3D"');
    expect(aidIdx).toBeGreaterThan(-1);
    expect(svIdx).toBeGreaterThan(-1);
    expect(threeDIdx).toBeGreaterThan(-1);
    expect(svIdx).toBeGreaterThan(aidIdx);
    expect(svIdx).toBeLessThan(threeDIdx);
  });

  it('updateLayersCount counts the streetviewOn state', () => {
    const html = readFileSync(distHtmlPath, 'utf-8');
    const fnStart = html.indexOf('function updateLayersCount');
    expect(fnStart).toBeGreaterThan(-1);
    const fnEnd = html.indexOf('\n}', fnStart) + 2;
    const fnSlice = html.substring(fnStart, fnEnd);
    expect(fnSlice).toMatch(/if\s*\(\s*streetviewOn\s*\)\s*n\+\+/);
  });
});

describe('Street View styles inlined', () => {
  it('main HTML inlines .streetview-marker styles', () => {
    const html = readFileSync(distHtmlPath, 'utf-8');
    expect(html).toMatch(/\.streetview-marker\s*\{/);
  });

  it('main HTML inlines .streetview-popup-inner styles', () => {
    const html = readFileSync(distHtmlPath, 'utf-8');
    expect(html).toMatch(/\.streetview-popup-inner\s*\{/);
  });

  it('popup content uses --paper background', () => {
    const html = readFileSync(distHtmlPath, 'utf-8');
    expect(html).toMatch(/\.streetview-popup[^{]*\.maplibregl-popup-content[^{]*\{[^}]*var\(--paper\)/s);
  });
});
