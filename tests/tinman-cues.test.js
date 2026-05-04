import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, join } from 'path';

const builder = require('../scripts/build-tinman-steps.js');
const dataDir = resolve(__dirname, '../src/maps/tupper-lake-tinman/data');

describe('build-tinman-steps geometry helpers', () => {
  it('distM returns 0 for identical points', () => {
    expect(builder.distM({ lat: 44.23, lng: -74.46 }, { lat: 44.23, lng: -74.46 })).toBe(0);
  });

  it('distM is symmetric and ~111km per degree of latitude', () => {
    const a = { lat: 44.23, lng: -74.46 };
    const b = { lat: 45.23, lng: -74.46 };
    const d = builder.distM(a, b);
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
    expect(builder.distM(b, a)).toBeCloseTo(d, -1);
  });

  it('bearing is 0 for due-north travel', () => {
    const a = { lat: 44.0, lng: -74.0 };
    const b = { lat: 44.1, lng: -74.0 };
    expect(builder.bearing(a, b)).toBeCloseTo(0, 0);
  });

  it('bearing is 90 for due-east travel', () => {
    const a = { lat: 44.0, lng: -74.0 };
    const b = { lat: 44.0, lng: -73.9 };
    expect(builder.bearing(a, b)).toBeCloseTo(90, 0);
  });

  it('bearingDelta normalizes to [-180, 180]', () => {
    expect(builder.bearingDelta(0, 90)).toBe(90);   // right turn
    expect(builder.bearingDelta(0, 270)).toBe(-90); // left turn (shorter way)
    expect(builder.bearingDelta(350, 10)).toBe(20); // wrap-around right
    expect(builder.bearingDelta(10, 350)).toBe(-20); // wrap-around left
  });
});

describe('classifyTurn', () => {
  it('treats <15° as straight (continue)', () => {
    expect(builder.classifyTurn(10).modifier).toBe('straight');
    expect(builder.classifyTurn(-10).modifier).toBe('straight');
  });
  it('15-35° is slight', () => {
    expect(builder.classifyTurn(20).modifier).toBe('slight right');
    expect(builder.classifyTurn(-25).modifier).toBe('slight left');
  });
  it('35-100° is plain left/right', () => {
    expect(builder.classifyTurn(45).modifier).toBe('right');
    expect(builder.classifyTurn(-90).modifier).toBe('left');
  });
  it('100-150° is sharp', () => {
    expect(builder.classifyTurn(120).modifier).toBe('sharp right');
    expect(builder.classifyTurn(-130).modifier).toBe('sharp left');
  });
  it('≥150° is uturn', () => {
    expect(builder.classifyTurn(170).modifier).toBe('uturn');
    expect(builder.classifyTurn(-180).modifier).toBe('uturn');
  });
});

describe('cumulativeDistances', () => {
  it('starts at 0', () => {
    const c = [[-74, 44], [-74, 44.001], [-74, 44.002]];
    const d = builder.cumulativeDistances(c);
    expect(d[0]).toBe(0);
  });
  it('is monotonic non-decreasing', () => {
    const c = [[-74, 44], [-74, 44.001], [-74, 44.002], [-74, 44.0015]];
    const d = builder.cumulativeDistances(c);
    for (let i = 1; i < d.length; i++) expect(d[i]).toBeGreaterThanOrEqual(d[i - 1]);
  });
});

describe('pointAtDistanceFromIndex', () => {
  // Synthetic polyline: 4 points 100m apart along constant longitude
  const coords = [
    [-74.0, 44.0],
    [-74.0, 44.0009], // ~100m N
    [-74.0, 44.0018],
    [-74.0, 44.0027],
  ];
  const dists = builder.cumulativeDistances(coords);
  it('returns the start coord when delta puts us before [0]', () => {
    const p = builder.pointAtDistanceFromIndex(coords, dists, 1, -1000);
    expect(p[0]).toBeCloseTo(-74.0, 3);
    expect(p[1]).toBeCloseTo(44.0, 3);
  });
  it('returns the end coord when delta runs past the polyline', () => {
    const p = builder.pointAtDistanceFromIndex(coords, dists, 1, 1000);
    expect(p[1]).toBeCloseTo(44.0027, 3);
  });
  it('interpolates between vertices', () => {
    // From index 1 (~100m), going forward 50m → halfway between 1 and 2
    const p = builder.pointAtDistanceFromIndex(coords, dists, 1, 50);
    expect(p[1]).toBeGreaterThan(44.0009);
    expect(p[1]).toBeLessThan(44.0018);
  });
});

describe('applyNameFixes', () => {
  it('returns null for falsy input', () => {
    expect(builder.applyNameFixes(null)).toBe(null);
    expect(builder.applyNameFixes('')).toBe(null);
  });
  it('rewrites OWD Lane → Old Wawbeek Road', () => {
    expect(builder.applyNameFixes('OWD Lane')).toBe('Old Wawbeek Road');
  });
  it('passes through other names unchanged', () => {
    expect(builder.applyNameFixes('Demars Boulevard')).toBe('Demars Boulevard');
  });
});

describe('fallbackName', () => {
  it('returns Park Street for the high school start area', () => {
    expect(builder.fallbackName(-74.4647, 44.2300)).toBe('Park Street');
  });
  it('returns null for points outside any fallback radius', () => {
    expect(builder.fallbackName(-71.0, 40.0)).toBe(null);
  });
});

describe('Generated step files', () => {
  for (const slug of ['sprint', 'olympic', 'tinman']) {
    describe(`${slug}-steps.json`, () => {
      const steps = JSON.parse(readFileSync(join(dataDir, `${slug}-steps.json`), 'utf-8'));

      it('has at least depart + arrive bookends', () => {
        expect(steps.length).toBeGreaterThanOrEqual(2);
        expect(steps[0].type).toBe('depart');
        expect(steps[steps.length - 1].type).toBe('arrive');
      });

      it('mile values are non-decreasing and bounded by official length', () => {
        const officialMiles = { sprint: 3.1, olympic: 6.2, tinman: 13.1 }[slug];
        for (let i = 1; i < steps.length; i++) {
          expect(steps[i].mile).toBeGreaterThanOrEqual(steps[i - 1].mile);
        }
        // Final step's mile should match the official total within 1%
        expect(Math.abs(steps[steps.length - 1].mile - officialMiles)).toBeLessThan(0.05);
      });

      it('starts on Park Street with a southerly bearing', () => {
        expect(steps[0].name).toBe('Park Street');
        expect(steps[0].bearingAfter).toBeGreaterThan(135);
        expect(steps[0].bearingAfter).toBeLessThan(225);
      });

      it('every non-arrive step has location coords', () => {
        for (const s of steps) {
          if (s.type === 'arrive') continue;
          expect(Array.isArray(s.location)).toBe(true);
          expect(s.location.length).toBe(2);
        }
      });

      it('contains no consecutive same-name turns within 0.1 mi', () => {
        for (let i = 1; i < steps.length; i++) {
          const a = steps[i - 1], b = steps[i];
          if (a.name && b.name && a.name === b.name && b.modifier !== 'uturn' && a.modifier !== 'uturn') {
            const gap = b.mile - a.mile;
            expect(gap, `consecutive ${a.name} steps ${a.n}→${b.n} are ${gap.toFixed(2)} mi apart`).toBeGreaterThanOrEqual(0.1);
          }
        }
      });
    });
  }

  it('Olympic includes the Dugal Road U-turn near mile 3.2', () => {
    const steps = JSON.parse(readFileSync(join(dataDir, 'olympic-steps.json'), 'utf-8'));
    const dugal = steps.find(s => s.name === 'Dugal Road' && s.modifier === 'uturn');
    expect(dugal).toBeDefined();
    expect(dugal.mile).toBeGreaterThan(2.8);
    expect(dugal.mile).toBeLessThan(3.5);
  });

  it('Tinman includes the North Little Wolf Road U-turn near the far end of the course', () => {
    const steps = JSON.parse(readFileSync(join(dataDir, 'tinman-steps.json'), 'utf-8'));
    const wolfPond = steps.find(s => s.name === 'North Little Wolf Road' && s.modifier === 'uturn');
    expect(wolfPond).toBeDefined();
    // The Wolf Pond turnaround sits in the back half of the course. Bounds
    // are wide because the GPX has chunk-boundary noise that affects how
    // mile-rescaling distributes the cue position — the cue is correctly
    // identified and on the right road, the absolute mile drifts ±0.7mi.
    expect(wolfPond.mile).toBeGreaterThan(8.0);
    expect(wolfPond.mile).toBeLessThan(9.5);
  });

  it('Sprint includes a U-turn on East Park Street near the halfway point', () => {
    const steps = JSON.parse(readFileSync(join(dataDir, 'sprint-steps.json'), 'utf-8'));
    const turnaround = steps.find(s => s.modifier === 'uturn' && s.name === 'East Park Street');
    expect(turnaround).toBeDefined();
    expect(turnaround.mile).toBeGreaterThan(1.4);
    expect(turnaround.mile).toBeLessThan(1.8);
  });
});
