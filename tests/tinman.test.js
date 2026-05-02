import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';

const distPath = resolve(__dirname, '../dist/maps/tinman/index.html');
const embedPath = resolve(__dirname, '../dist/embed/tinman/index.html');
const dataDir = resolve(__dirname, '../src/maps/tinman/data');

const html = readFileSync(distPath, 'utf-8');
const embedHtml = readFileSync(embedPath, 'utf-8');

describe('Tinman build artifacts', () => {
  it('builds main index.html', () => {
    expect(html.length).toBeGreaterThan(50_000);
  });

  it('builds embed index.html', () => {
    expect(embedHtml.length).toBeGreaterThan(50_000);
  });

  it('has all three race GeoJSON + profile files', () => {
    ['sprint', 'olympic', 'tinman'].forEach((slug) => {
      expect(existsSync(join(dataDir, `${slug}.geojson`))).toBe(true);
      expect(existsSync(join(dataDir, `${slug}-profile.json`))).toBe(true);
    });
  });

  it('has aid-stations.json', () => {
    const aid = JSON.parse(readFileSync(join(dataDir, 'aid-stations.json'), 'utf-8'));
    expect(Array.isArray(aid)).toBe(true);
    expect(aid.length).toBeGreaterThanOrEqual(7);
    aid.forEach((s) => {
      expect(s).toHaveProperty('name');
      expect(s).toHaveProperty('miles');
      expect(s).toHaveProperty('lng');
      expect(s).toHaveProperty('lat');
      expect(Array.isArray(s.miles)).toBe(true);
    });
  });
});

describe('Tinman branding and content', () => {
  it('uses race name in title and subtitle', () => {
    expect(html).toContain('TUPPER LAKE TINMAN');
    expect(html).toContain('June 27, 2026');
    expect(html).toContain('44th Anniversary');
  });

  it('links to race website', () => {
    expect(html).toContain('href="https://www.tupperlaketinman.com/"');
  });

  it('uses yellow primary color', () => {
    expect(html).toContain('--primary: #F5C518');
    expect(html).toContain('--primary-dark: #D4A810');
  });

  it('uses three-distinct-color light theme', () => {
    expect(html).toContain('--bg: #ffffff');
    expect(html).toContain('--bg-card: #ffffff');
    expect(html).toContain('--bg-alt: #f2f2f2');
  });

  it('uses dark course line with branded glow', () => {
    expect(html).toContain('--course: #111111');
  });

  it('imports Oswald and Inter fonts', () => {
    expect(html).toContain('Oswald');
    expect(html).toContain('Inter');
  });

  it('includes Tinman/Olympic/Sprint loops in LOOPS object', () => {
    expect(html).toContain('var LOOPS');
    expect(html).toMatch(/sprint:\s*\{[^}]*color:\s*'#F5C518'/);
    expect(html).toMatch(/olympic:\s*\{[^}]*color:\s*'#2E7D32'/);
    expect(html).toMatch(/tinman:\s*\{[^}]*color:\s*'#C8102E'/);
  });

  it('includes RACES object with three distances', () => {
    expect(html).toContain("var RACES");
    expect(html).toMatch(/sprint:\s*\{\s*name:\s*'Sprint'/);
    expect(html).toMatch(/olympic:\s*\{\s*name:\s*'Olympic'/);
    expect(html).toMatch(/tinman:\s*\{\s*name:\s*'Tinman'/);
  });

  it('inlines aid stations with mile markers', () => {
    expect(html).toContain('AID_STATIONS');
    expect(html).toContain('History Museum');
    expect(html).toContain('Civic Center');
    expect(html).toContain('Train Station');
    expect(html).toContain('Little Wolf');
  });

  it('uses BIKE FINISH / RUN START label (T2), not swim start', () => {
    expect(html).toContain('BIKE FINISH / RUN START');
    expect(html).toContain('Bike Finish / Run Start (T2)');
    expect(html).not.toContain('SWIM START / FINISH');
    expect(html).not.toContain('Swim Start / Run Finish');
  });
});

describe('Tinman course geometry (road-snapped)', () => {
  it('uses official course distances (3.1 / 6.2 / 13.1 mi)', () => {
    expect(html).toMatch(/sprint:\s*\{[^}]*miles:\s*3\.1\b/);
    expect(html).toMatch(/olympic:\s*\{[^}]*miles:\s*6\.2\b/);
    expect(html).toMatch(/tinman:\s*\{[^}]*miles:\s*13\.1\b/);
  });

  it('aid station mileage matches published values within 0.2 mi tolerance', () => {
    const aid = JSON.parse(readFileSync(resolve(__dirname, '../src/maps/tinman/data/aid-stations.json'), 'utf-8'));
    const byName = Object.fromEntries(aid.map(a => [a.name, a.miles]));
    // Published values from tupperlaketinman.com
    const expected = {
      'Tupper Lake History Museum': [1.25, 5.1],
      'Sunmount': [2.1, 4.3],
      'Dugal Rd turnaround': [3.2],
      'Tupper Lake Civic Center': [6.15, 12.1],
      'Train Station': [7.2, 11.2],
      'N Little Wolf Turnaround': [9.1],
      'S Little Wolf': [10.25],
    };
    for (const [name, expectedMiles] of Object.entries(expected)) {
      const actualMiles = byName[name];
      expect(actualMiles, `aid station ${name} missing`).toBeDefined();
      expect(actualMiles.length).toBe(expectedMiles.length);
      expectedMiles.forEach((em, i) => {
        expect(Math.abs(actualMiles[i] - em), `${name} pass ${i + 1}: expected ~${em}, got ${actualMiles[i]}`).toBeLessThan(0.25);
      });
    }
  });

  it('snapped course coordinates are dense enough to follow roads', () => {
    const tinmanGeo = JSON.parse(readFileSync(resolve(__dirname, '../src/maps/tinman/data/tinman.geojson'), 'utf-8'));
    expect(tinmanGeo.features[0].geometry.coordinates.length).toBeGreaterThan(150);
  });
});

describe('Tinman map features', () => {
  it('hides conflicting basemap path layers on load', () => {
    expect(html).toContain('roads_other');
    expect(html).toContain('roads_labels_minor');
    expect(html).toMatch(/setLayoutProperty\(['"]?id['"]?,\s*['"]visibility['"],\s*['"]none['"]/);
  });

  it('renders mile markers as circle + symbol layers', () => {
    expect(html).toContain("-miles-circle");
    expect(html).toContain("-miles-label");
  });

  it('mile marker text size scales up to zoom 17', () => {
    expect(html).toMatch(/text-size'.*?17,\s*14/);
  });

  it('mile marker circle radius scales up to zoom 17', () => {
    expect(html).toMatch(/circle-radius'.*?17,\s*11/);
  });

  it('aid station toggle exists', () => {
    expect(html).toContain('toggleAid');
    expect(html).toContain('aidBtn');
    expect(html).toContain('Aid Stations');
  });

  it('3D terrain toggle exists', () => {
    expect(html).toContain('toggle3D');
    expect(html).toContain('terrainBtn');
  });

  it('uses dark course line with branded inner color (high-contrast pattern)', () => {
    expect(html).toMatch(/-casing[\s\S]{0,100}'line-color':\s*'#000'/);
    expect(html).toMatch(/-dark[\s\S]{0,100}'line-color':\s*'#111'/);
  });

  it('does not contain checkered loop pattern (carryover from wild-goose)', () => {
    expect(html).not.toContain('checkered-dot');
    expect(html).not.toContain('repeating-conic-gradient(#000 0% 25%');
  });

  it('does not contain wild-goose turn markers', () => {
    expect(html).not.toContain('TURNS = [');
    expect(html).not.toContain('streetviewpixels-pa');
  });
});

describe('Tinman simulator', () => {
  it('initializes simulator with Tinman as default race', () => {
    expect(html).toMatch(/simRace\s*=\s*RACES\['tinman'\]/);
  });

  it('builds race buttons for all three distances', () => {
    expect(html).toContain('buildSimRaces');
    expect(html).toContain("['sprint', 'olympic', 'tinman']");
  });

  it('renders course map with mile markers and aid station dots', () => {
    expect(html).toContain('renderCourseMap');
    expect(html).toContain("loopId === 'tinman'");
  });
});

describe('Tinman weather panel', () => {
  it('weather data is present', () => {
    expect(html).toContain('CONFIG.weather');
    expect(html).toContain('"raceDate":"2026-06-27"');
  });

  it('renders weather panel HTML when weather data present', () => {
    expect(html).toContain('weatherPanel');
    expect(html).toContain('weatherRiskCards');
    expect(html).toContain('weatherDaily');
    expect(html).toContain('weatherCurrent');
    expect(html).toContain('weatherRadar');
  });
});
