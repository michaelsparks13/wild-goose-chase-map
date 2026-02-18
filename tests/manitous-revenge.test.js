import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const html = readFileSync(resolve(__dirname, '../dist/maps/manitous-revenge/index.html'), 'utf-8');

describe("Manitou's Revenge map", () => {
  // Branding & Theme
  it('links to correct race website', () => {
    expect(html).toContain('href="https://www.manitousrevengeultra.com"');
  });

  it('displays race name in header', () => {
    expect(html).toContain("Manitou's Revenge");
  });

  it('uses dark theme background', () => {
    expect(html).toContain('--bg: #0a0a0a;');
  });

  it('uses Oswald heading font', () => {
    expect(html).toContain('Oswald');
  });

  it('has dark theme color meta tag', () => {
    expect(html).toContain('content="#000000"');
  });

  // Course data inlining
  it('inlines course coordinates (no fetch)', () => {
    expect(html).not.toMatch(/fetch\s*\(/);
    expect(html).toContain('CONFIG.courseCoords');
  });

  it('inlines trail data', () => {
    expect(html).toContain('CONFIG.trailsData');
  });

  it('has correct total miles', () => {
    expect(html).toContain('"totalMiles":53.2');
  });

  it('has correct total elevation gain', () => {
    expect(html).toContain('"totalGain":15000');
  });

  // Point-to-point course
  it('has separate start and finish coordinates', () => {
    expect(html).toContain('"startCoords"');
    expect(html).toContain('"finishCoords"');
    expect(html).not.toContain('"finishCoords":null');
  });

  it('shows Windham to Phoenicia in info badge', () => {
    expect(html).toContain('Windham');
    expect(html).toContain('Phoenicia');
  });

  // Map layers
  it('trail lines render on top (no beforeId)', () => {
    const trailSection = html.substring(
      html.indexOf("id: 'park-trails-line'"),
      html.indexOf("id: 'park-trails-label'")
    );
    expect(trailSection).not.toContain('beforeId');
  });

  it('trail labels scale to zoom 20', () => {
    expect(html).toContain("20, 16");
  });

  it('trail lines scale to zoom 20', () => {
    expect(html).toContain("20, 8");
  });

  it('uses terrarium encoding for terrain tiles', () => {
    expect(html).toContain("encoding: 'terrarium'");
  });

  it('uses MapLibre GL JS', () => {
    expect(html).toContain('maplibre-gl');
  });

  it('uses PMTiles protocol', () => {
    expect(html).toContain('pmtiles');
  });

  // Toggle buttons
  it('has Course toggle button', () => {
    expect(html).toContain('id="courseBtn"');
  });

  it('has Park Trails toggle button', () => {
    expect(html).toContain('>Park Trails<');
  });

  it('has Aid Stations toggle button', () => {
    expect(html).toContain('id="aidBtn"');
    expect(html).toContain('>Aid Stations<');
  });

  it('has 3D toggle button', () => {
    expect(html).toContain('id="terrainBtn"');
  });

  // Aid stations
  it('defines all 9 aid stations in config', () => {
    expect(html).toContain('"name":"Big Hollow Rd"');
    expect(html).toContain('"name":"Dutchers Notch"');
    expect(html).toContain('"name":"North/South Lake"');
    expect(html).toContain('"name":"Palenville"');
    expect(html).toContain('"name":"Platte Clove"');
    expect(html).toContain('"name":"Mink Hollow"');
    expect(html).toContain('"name":"Silver Hollow Notch"');
    expect(html).toContain('"name":"Willow"');
    expect(html).toContain('"name":"Plank Rd (Rte 40)"');
  });

  // Mile markers
  it('has mile marker layers', () => {
    expect(html).toContain("'mile-markers-circle'");
    expect(html).toContain("'mile-markers-label'");
  });

  // Stats
  it('shows 53.2 miles in stats', () => {
    expect(html).toContain('>53.2<');
  });

  it('shows 23 hour time limit in stats', () => {
    expect(html).toContain('23 hrs');
  });

  it('shows point-to-point course type', () => {
    expect(html).toContain('Point-to-Point');
  });

  it('shows 15,000+ elevation gain in stats', () => {
    expect(html).toContain('15,000+');
  });

  // Trail blaze colors
  it('supports teal blaze color in trail match expression', () => {
    expect(html).toContain("'teal'");
  });

  // Basemap cleanup
  it('hides basemap trail layers', () => {
    expect(html).toContain("'roads_other'");
    expect(html).toContain("'roads_bridges_other'");
  });

  // Simulator defaults
  it('has 5:00 AM race start', () => {
    expect(html).toContain('"raceStartHour":5');
    expect(html).toContain('5:00 AM');
  });

  // Course description
  it('has course description section', () => {
    expect(html).toContain('Long Path');
    expect(html).toContain('Catskill Mountains');
  });

  // Footer
  it('has footer with race website link', () => {
    expect(html).toContain('manitousrevengeultra.com');
  });
});
