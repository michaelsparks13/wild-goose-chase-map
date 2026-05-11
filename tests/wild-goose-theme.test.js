// wild-goose-theme.test.js — schema + content contract for the new
// loop-based extension to RaceTheme. Validates the theme is internally
// consistent (loop assemblies sum to declared distance miles) and that
// race-brand palette + trail-party type stack hold.

import { describe, it, expect } from 'vitest';

const theme = require('../src/themes/wild-goose.js');

describe('wild-goose theme — identity + scope', () => {
  it('has the required identity fields', () => {
    expect(theme.identity.name).toBe('Wild Goose Trail Festival');
    expect(theme.identity.shortName).toBe('Wild Goose');
    expect(theme.identity.hostOrg).toBe('Sassquad Trail Running');
    expect(theme.identity.hostUrl).toMatch(/^https:\/\/.*sassquadtrailrunning/);
  });
  it('scope note routes to host for festival logistics + kids course', () => {
    expect(theme.scopeNote.toLowerCase()).toMatch(/course only/);
    expect(theme.scopeNote.toLowerCase()).toMatch(/sassquad|host|festival|kids/);
  });
});

describe('wild-goose theme — palette (extracted from Sassquad Wix tokens)', () => {
  it('paper is cream-white (barely tinted), not pure white or khaki', () => {
    // v3: paper moved from #f4eee0 (khaki) to #faf7ed (cream-white) so
    // the substrate reads as clean paper, not light brown.
    expect(theme.palette.paper.toLowerCase()).not.toBe('#ffffff');
    expect(theme.palette.paper.toLowerCase()).toBe('#faf7ed');
  });
  it('race-brand is deeper Sassquad olive (between Wix color_24 and color_25)', () => {
    // v3: bumped from #6A7E3D (light olive) to #4F5F2D so the brand
    // accent reads against the dark top bar without going muddy.
    expect(theme.palette.raceBrand).toBe('#4F5F2D');
  });
  it('accent is Sassquad chartreuse (Wix --color_22)', () => {
    expect(theme.palette.accent).toBe('#D4FC79');
  });
  it('darkForest is Sassquad dark forest (Wix --color_25)', () => {
    expect(theme.palette.darkForest).toBe('#353F1E');
  });
  it('aidStation is Sassquad golden yellow (Wix --color_28)', () => {
    expect(theme.palette.aidStation).toBe('#FDD80D');
  });
  it('ink is warm near-black', () => {
    expect(theme.palette.raceInk.toLowerCase()).toMatch(/^#1[0-9a-f]/);
  });
  it('hazard color is distinct from loop colors', () => {
    const loopColors = theme.raceFormat.loops.map(l => l.color.toLowerCase());
    expect(loopColors).not.toContain(theme.palette.hazard.toLowerCase());
  });
});

describe('wild-goose theme — type stack (Sassquad-extracted: Bangers + Barlow)', () => {
  it('uses Bangers + Barlow + JetBrains Mono', () => {
    // Bangers is Sassquad's actual h1/h2/h3 font (Wix orig_bangers_regular).
    // Barlow is the closest open analog to Sassquad's DIN Next W01 body.
    expect(theme.type.display).toBe('Bangers');
    expect(theme.type.body).toBe('Barlow');
    expect(theme.type.micro).toBe('JetBrains Mono');
  });
  it('avoids the brief\'s forbidden families across all stacks', () => {
    const stacks = [theme.type.display, theme.type.body, theme.type.micro,
                    theme.type.displayStack, theme.type.bodyStack, theme.type.microStack];
    const forbidden = ['Inter', 'Roboto,', 'Arial,', 'Space Grotesk', 'Poppins'];
    for (const f of stacks) {
      for (const ban of forbidden) {
        expect(f).not.toContain(ban);
      }
    }
  });
  it('exposes a Google Fonts href that loads all three families', () => {
    expect(theme.type.googleFontsHref).toMatch(/family=Bangers/);
    expect(theme.type.googleFontsHref).toMatch(/family=Barlow/);
    expect(theme.type.googleFontsHref).toMatch(/family=JetBrains\+Mono/);
  });
});

describe('wild-goose theme — loop-based raceFormat', () => {
  it('declares three named loops with blaze colors', () => {
    const ids = theme.raceFormat.loops.map(l => l.id).sort();
    expect(ids).toEqual(['blue', 'checkered', 'pink']);
    const byId = Object.fromEntries(theme.raceFormat.loops.map(l => [l.id, l]));
    expect(byId.pink.color).toBe('#E7338C');
    expect(byId.blue.color).toBe('#1E66D0');
    expect(byId.checkered.pattern).toBe('checkered');
  });
  it('every loop has miles, gain, defaultDirection', () => {
    for (const l of theme.raceFormat.loops) {
      expect(typeof l.miles).toBe('number');
      expect(typeof l.elevationGain).toBe('number');
      expect(['CW', 'CCW']).toContain(l.defaultDirection);
    }
  });
  it('each loop carries terrain-aware cues (not flat turn-by-turn)', () => {
    for (const l of theme.raceFormat.loops) {
      expect(l.cues.length).toBeGreaterThan(0);
      for (const c of l.cues) {
        expect(['surface', 'hazard', 'landmark', 'water']).toContain(c.kind);
        expect(c.text.length).toBeGreaterThan(0);
      }
    }
  });
  it('Pink loop calls out the wood-plank boardwalks + non-ADA hazard', () => {
    const pink = theme.raceFormat.loops.find(l => l.id === 'pink');
    const hazardText = pink.cues.filter(c => c.kind === 'hazard').map(c => c.text).join(' | ');
    expect(hazardText).toMatch(/boardwalk|plank/i);
    expect(hazardText.toLowerCase()).toMatch(/single-file|narrow|pole/);
  });
});

describe('wild-goose theme — distances + assemblies', () => {
  const byId = Object.fromEntries(theme.raceFormat.loops.map(l => [l.id, l]));
  it('exposes the 2026 race distances (no 30K, no "all")', () => {
    const ids = theme.raceFormat.distances.map(d => d.id);
    expect(ids).toContain('10k');
    expect(ids).toContain('half');
    expect(ids).toContain('50k');
    expect(ids).toContain('50m');
    expect(ids).toContain('100k');
    expect(ids).toContain('100m');
    expect(ids).not.toContain('30k');
    expect(ids).not.toContain('all');
  });
  it('every distance assembly references valid loop ids only', () => {
    const validIds = new Set(theme.raceFormat.loops.map(l => l.id));
    for (const d of theme.raceFormat.distances) {
      expect(d.assembly).toBeTruthy();
      for (const step of d.assembly) {
        expect(validIds.has(step.loopId)).toBe(true);
        expect(['CW', 'CCW']).toContain(step.direction);
      }
    }
  });
  it('every distance assembly sum-of-miles is within 2% of declared runMiles', () => {
    for (const d of theme.raceFormat.distances) {
      const sum = d.assembly.reduce((s, step) => s + byId[step.loopId].miles, 0);
      const drift = Math.abs(sum - d.runMiles) / d.runMiles;
      expect(drift).toBeLessThan(0.02);
    }
  });
  it('every distance has a brand-distinct color', () => {
    const colors = theme.raceFormat.distances.map(d => d.color.toLowerCase());
    expect(new Set(colors).size).toBe(colors.length);
  });
  it('100M / 100K / 50M / 50K declare ultra-grade cutoffs', () => {
    const byDistId = Object.fromEntries(theme.raceFormat.distances.map(d => [d.id, d]));
    expect(byDistId['100m'].cutoff).toBe('36h');
    expect(byDistId['100k'].cutoff).toBe('36h');
    expect(byDistId['50m'].cutoff).toBe('36h');
    expect(byDistId['50k'].cutoff).toBe('12h');
  });
});

describe('wild-goose theme — aid + logistics + race day', () => {
  it('aid stations is the SINGLE Squatch HQ entry', () => {
    expect(theme.aidStations).toHaveLength(1);
    expect(theme.aidStations[0].name).toBe('Squatch HQ');
    expect(theme.aidStations[0].mile).toBe(0);
    expect(theme.aidStations[0].stocked.toLowerCase()).toMatch(/water|skratch/);
    expect(theme.aidStations[0].stocked.toLowerCase()).toMatch(/medical|emt|aed/);
  });
  it('logistics surfaces the $5 cash park fee and camping note', () => {
    expect(theme.logistics.parking.toLowerCase()).toMatch(/\$5.*cash|cash.*\$5/);
    expect(theme.logistics.shuttle.toLowerCase()).toMatch(/camping/);
  });
  it('race day is September 2026, multi-day window', () => {
    expect(theme.raceDay.date).toMatch(/^2026-09/);
    expect(theme.raceDay.displayDate).toMatch(/Sep 18.*20|18-20.*Sep/i);
  });
});

describe('wild-goose theme — cartographer notes (run-only, trail-festival)', () => {
  it('mentions the technical sections, boardwalks, and ADA constraint', () => {
    const notes = theme.cartographerNotes;
    expect(notes.length).toBeGreaterThan(150);
    expect(notes.toLowerCase()).toMatch(/boardwalk|plank/);
    expect(notes.toLowerCase()).toMatch(/wheelchair|adaptive|accessible/);
    expect(notes.toLowerCase()).toMatch(/bear|snake|wildlife/);
  });
  it('does not pretend to map the Kids 1M course', () => {
    expect(theme.cartographerNotes.toLowerCase()).toMatch(/kids.*not mapped|kids.*separate|kids.*non-loop/);
  });
});

describe('wild-goose theme — cross-links', () => {
  it('points at 3–5 other studio maps', () => {
    expect(theme.crossLinks.length).toBeGreaterThanOrEqual(3);
    expect(theme.crossLinks.length).toBeLessThanOrEqual(5);
  });
  it('cross-links target only built map slugs', () => {
    const known = new Set([
      'tupper-lake-tinman', 'escarpment', 'manitous-revenge',
      'sleeping-giant', 'golden-leaf', 'javelina-jundred',
    ]);
    for (const l of theme.crossLinks) {
      expect(known.has(l.slug)).toBe(true);
    }
  });
});
