// editorial-theme.test.js — v2 schema + build-output assertions for the
// athlete-first race page. Treats the theme as a contract: required
// fields must be present, palette tokens must not be pure white, the
// type stack must avoid the brief's forbidden families, and the chrome
// must read as an athlete tool (map dominates, cues co-visible) rather
// than a studio showcase.
//
// File name is retained from v1 for build/CI compatibility; assertions
// are the v2 athlete-first contract.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const tinmanTheme = require('../src/themes/tupper-lake-tinman.js');
const builtHtml = readFileSync(
  resolve(__dirname, '../dist/maps/tupper-lake-tinman/index.html'),
  'utf-8',
);

describe('RaceTheme schema (v2 — athlete-first, race-branded)', () => {
  it('has the required identity fields including hostUrl', () => {
    expect(tinmanTheme.identity.name).toBe('Tupper Lake Tinman');
    expect(tinmanTheme.identity.shortName).toBe('Tinman');
    expect(tinmanTheme.identity.hostOrg).toBe('Adirondack Sports Council');
    expect(tinmanTheme.identity.hostUrl).toMatch(/^https:\/\/.+tupperlaketinman/);
  });

  it('palette is race-branded, not invented from geography', () => {
    // Yellow + black + cream — not lake-blue / conifer-green / sunrise-amber
    expect(tinmanTheme.palette.raceBrand.toLowerCase()).toMatch(/^#f[5-9]c|^#ffc/);
    expect(tinmanTheme.palette.raceInk.toLowerCase()).toMatch(/^#1[0-9a-f]/);
    expect(tinmanTheme.palette.paper.toLowerCase()).not.toBe('#ffffff');
    // No "lake blue" — the cool / Adirondack-romantic invented tokens of v1 are gone.
    expect(JSON.stringify(tinmanTheme.palette)).not.toMatch(/Adirondack lake|sunrise hit|conifer/);
  });

  it('type stack avoids the brief\'s forbidden families', () => {
    const stacks = [tinmanTheme.type.display, tinmanTheme.type.body, tinmanTheme.type.micro,
                    tinmanTheme.type.displayStack, tinmanTheme.type.bodyStack, tinmanTheme.type.microStack];
    const forbidden = ['Inter', 'Roboto Mono', 'Roboto,', 'Arial', 'Space Grotesk', 'Poppins'];
    for (const f of stacks) {
      for (const ban of forbidden) {
        // 'Roboto Slab' is allowed; 'Roboto,' (sans) is not. Match precise tokens.
        if (ban === 'Roboto,' && /Roboto Slab/i.test(f)) continue;
        expect(f).not.toContain(ban);
      }
    }
  });

  it('raceFormat declares run-only distances with brand-driven colors', () => {
    expect(tinmanTheme.raceFormat.discipline).toBe('triathlon');
    expect(tinmanTheme.raceFormat.hasSwim).toBe(true);
    expect(tinmanTheme.raceFormat.hasTransitions).toBe(true);
    expect(tinmanTheme.raceFormat.distances).toHaveLength(3);
    const ids = tinmanTheme.raceFormat.distances.map(d => d.id).sort();
    expect(ids).toEqual(['olympic', 'sprint', 'tinman']);
    for (const d of tinmanTheme.raceFormat.distances) {
      expect(typeof d.runMiles).toBe('number');
      expect(typeof d.runGainFt).toBe('number');
      expect(d.runStartWindow).toMatch(/AM|PM/);
    }
  });

  it('raceDay carries gun, sunrise, sunset, run-start windows', () => {
    expect(tinmanTheme.raceDay.date).toBe('2026-06-27');
    expect(tinmanTheme.raceDay.gunTime).toBeTruthy();
    expect(tinmanTheme.raceDay.sunrise).toBeTruthy();
    expect(tinmanTheme.raceDay.sunset).toBeTruthy();
  });

  it('aid stations are RUN-leg only, with miles and stocks', () => {
    expect(tinmanTheme.aidStations.length).toBeGreaterThanOrEqual(6);
    for (const a of tinmanTheme.aidStations) {
      expect(a.mile).toBeLessThan(14); // run leg ≤ 13.1mi
      expect(a.stocked).toBeTruthy();
    }
  });

  it('logistics has parking + packet pickup + a host-guide URL', () => {
    expect(tinmanTheme.logistics.parking).toBeTruthy();
    expect(tinmanTheme.logistics.packetPickup).toBeTruthy();
    expect(tinmanTheme.logistics.hostGuideUrl).toMatch(/^https:\/\//);
  });

  it('cartographer notes are RUN-only — no swim/bike commentary', () => {
    expect(tinmanTheme.cartographerNotes.length).toBeGreaterThan(120);
    expect(tinmanTheme.cartographerNotes).not.toMatch(/swim leg|bike leg|cycling|cyclists/i);
  });

  it('does NOT declare a scopeNote field (removed sitewide · May 2026)', () => {
    // Scope is now carried by the top-bar host-race link + cartographer's
    // notes. The standalone scope-note band was eating high-value real
    // estate directly above the cue sheet.
    expect('scopeNote' in tinmanTheme).toBe(false);
  });

  it('cross-links point at known map slugs (3–5 entries)', () => {
    const known = new Set(['escarpment', 'manitous-revenge', 'sleeping-giant', 'wild-goose', 'golden-leaf', 'javelina-jundred']);
    expect(tinmanTheme.crossLinks.length).toBeGreaterThanOrEqual(3);
    expect(tinmanTheme.crossLinks.length).toBeLessThanOrEqual(5);
    for (const l of tinmanTheme.crossLinks) {
      expect(known.has(l.slug)).toBe(true);
    }
  });
});

describe('Athlete-first chrome in dist/maps/tupper-lake-tinman/index.html', () => {
  it('renders the thin top bar with race mark + race-day strip + studio credit', () => {
    expect(builtHtml).toContain('class="top-bar"');
    expect(builtHtml).toContain('class="race-mark"');
    expect(builtHtml).toContain('class="race-mark__name"');
    expect(builtHtml).toContain('Tupper Lake Tinman');
    expect(builtHtml).toContain('class="race-day-strip"');
    expect(builtHtml).toContain('Sat, Jun 27, 2026');
    expect(builtHtml).toContain('Gun 8:00 AM');
    expect(builtHtml).toContain('id="raceCountdown"');
    expect(builtHtml).toContain('data-race-date="2026-06-27"');
    expect(builtHtml).toContain('class="studio-credit"');
  });

  it('exiles studio-portfolio language from the chrome (no atelier, no commission-as-CTA)', () => {
    expect(builtHtml).not.toContain('Atelier of cartographic works');
    expect(builtHtml).not.toContain('Notes from the drafting table');
    expect(builtHtml).not.toContain('Take this map home');
    expect(builtHtml).not.toContain('Begin a commission');
  });

  it('renders the course as a sticky-map split (map left, cues right)', () => {
    expect(builtHtml).toContain('class="course"');
    expect(builtHtml).toContain('class="course__map"');
    expect(builtHtml).toContain('class="course__cues"');
    expect(builtHtml).toMatch(/\.course__map\s*\{[^}]*position:\s*sticky/);
  });

  it('does NOT render a .scope-note band (removed sitewide · May 2026)', () => {
    expect(builtHtml).not.toContain('class="scope-note"');
    expect(builtHtml).not.toContain('class="scope-note__link"');
  });

  it('relabels the start marker as RUN START, not BIKE FINISH / RUN START', () => {
    expect(builtHtml).toContain('>RUN START<');
    expect(builtHtml).not.toContain('BIKE FINISH / RUN START');
  });

  it('does not render swim/bike scope leaks anywhere visible', () => {
    // No disciplines triptych, no swim/bike legs in the chrome
    expect(builtHtml).not.toMatch(/<span class="disciplines__label">Swim<\/span>/);
    expect(builtHtml).not.toMatch(/<span class="disciplines__label">Bike<\/span>/);
    // No 1.2mi or 56mi swim/bike facts in the chrome data strip
    expect(builtHtml).not.toMatch(/Tinman swim/);
    expect(builtHtml).not.toMatch(/Tinman bike/);
  });

  it('renders the race-day essentials grid (run-start windows, sunrise, sunset)', () => {
    expect(builtHtml).toContain('id="essentialsDay"');
    expect(builtHtml).toContain('Sunrise');
    expect(builtHtml).toContain('5:09 AM');
    expect(builtHtml).toContain('Sunset');
    expect(builtHtml).toContain('Sprint run starts');
    expect(builtHtml).toContain('Tinman run starts');
    expect(builtHtml).toContain('after T2');
  });

  it('renders the aid station table from the theme', () => {
    expect(builtHtml).toContain('class="aid-table"');
    expect(builtHtml).toContain('Park Street');
    expect(builtHtml).toContain('Wild Center');
    expect(builtHtml).toContain('Little Wolf Pond Turn');
  });

  it('renders the logistics block (parking, pickup, host guide)', () => {
    expect(builtHtml).toContain('id="essentialsLogistics"');
    expect(builtHtml).toContain('Parking');
    expect(builtHtml).toContain('Packet pickup');
    expect(builtHtml).toContain('Full athlete guide on tupperlaketinman.com');
  });

  it('renders the downloads grid (print, GPX, pocket, embed)', () => {
    expect(builtHtml).toContain('id="essentialsDownloads"');
    expect(builtHtml).toContain('Print PDF cue sheet');
    expect(builtHtml).toContain('GPX / GeoJSON');
    expect(builtHtml).toContain('Pocket map');
    expect(builtHtml).toContain('Embed');
  });

  it('renders a quiet footer credit', () => {
    expect(builtHtml).toContain('class="page-footer"');
    expect(builtHtml).toContain('Cartography by');
    expect(builtHtml).toContain('falsesummitstudio.com');
  });

  it('omits the cartographer-note and cross-link sections', () => {
    // Removed in feature_tinman_polish — the editorial layout no longer
    // includes "From the cartographer" or "Other race maps from the studio"
    // sections, per design feedback.
    expect(builtHtml).not.toContain('id="essentialsNotes"');
    expect(builtHtml).not.toContain('From the cartographer');
    expect(builtHtml).not.toContain('class="cross-grid"');
  });

  it('imports the v2 race-branded type stack and avoids the v1 archival serif', () => {
    expect(builtHtml).toContain('Roboto+Slab');
    expect(builtHtml).toContain('Source+Serif+4');
    expect(builtHtml).toContain('JetBrains+Mono');
    // v1's archival display face is gone
    expect(builtHtml).not.toMatch(/family=Fraunces[:&]/);
    expect(builtHtml).not.toMatch(/family=Spectral[:&]/);
  });

  it('does not import any forbidden fonts', () => {
    expect(builtHtml).not.toMatch(/family=Inter[:&]/);
    expect(builtHtml).not.toMatch(/family=Space\+Grotesk[:&]/);
    expect(builtHtml).not.toMatch(/family=Poppins[:&]/);
    expect(builtHtml).not.toMatch(/family=Oswald[:&]/);
    expect(builtHtml).not.toMatch(/family=Arial[:&]/);
  });

  it('uses race-brand CSS variables, not invented Adirondack tokens', () => {
    expect(builtHtml).toContain('--race-brand: #F5C518');
    expect(builtHtml).toContain('--paper: #f6f1e7');
    expect(builtHtml).toContain('--ink: #1a1a1a');
  });

  it('does not reintroduce v1 editorial chrome (masthead, gallery, course-strip, etc.)', () => {
    expect(builtHtml).not.toContain('class="masthead"');
    expect(builtHtml).not.toContain('class="map-room"');
    expect(builtHtml).not.toContain('class="course-strip"');
    expect(builtHtml).not.toContain('class="field-notes"');
    expect(builtHtml).not.toContain('class="acquisition__shelf"');
    expect(builtHtml).not.toContain('class="contact-sheet__grid"');
    expect(builtHtml).not.toContain('class="colophon"');
  });

  it('does not contain forbidden CMS section headers', () => {
    expect(builtHtml).not.toMatch(/<h[2-3][^>]*>\s*Race Information/);
    expect(builtHtml).not.toMatch(/<h[2-3][^>]*>\s*About the Run Course/);
    expect(builtHtml).not.toMatch(/<h[2-3][^>]*>\s*Course Details/);
  });

  it('CSP frame-ancestors is set at the HTTP layer (netlify.toml), not via meta', () => {
    // Meta-CSP is silently ignored by browsers and produced a console error.
    expect(builtHtml).not.toMatch(/<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]+frame-ancestors/);
    const netlify = readFileSync(resolve(__dirname, '../netlify.toml'), 'utf-8');
    expect(netlify).toMatch(/for\s*=\s*"\/maps\/\*"[\s\S]+frame-ancestors/);
  });
});
