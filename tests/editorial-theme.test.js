// editorial-theme.test.js — schema + build-output assertions for the
// per-race RaceTheme system. Treats the theme as a contract: required
// fields must be present, palette tokens must not be pure white, the
// type stack must avoid the brief's forbidden families, and the editorial
// chrome must actually land in the built HTML.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const tinmanTheme = require('../src/themes/tupper-lake-tinman.js');
const builtHtml = readFileSync(
  resolve(__dirname, '../dist/maps/tupper-lake-tinman/index.html'),
  'utf-8',
);

describe('RaceTheme schema (tupper-lake-tinman)', () => {
  it('has the required identity fields', () => {
    expect(tinmanTheme.identity.name).toBe('Tupper Lake Tinman');
    expect(tinmanTheme.identity.tagline).toBe('Race the Adirondacks');
    expect(tinmanTheme.identity.hostOrg).toBe('Adirondack Sports Council');
    expect(tinmanTheme.identity.establishedYear).toBe(1982);
  });

  it('declares region and elevation story (not raw integers)', () => {
    expect(tinmanTheme.geography.region).toMatch(/Adirondack/);
    expect(tinmanTheme.geography.elevationStory.length).toBeGreaterThan(40);
  });

  it('palette has all five required tokens, none of them pure white', () => {
    const { paper, ink, accent, warm, cool } = tinmanTheme.palette;
    for (const c of [paper, ink, accent, warm, cool]) {
      expect(c).toMatch(/^#[0-9a-f]{6}$/i);
      expect(c.toLowerCase()).not.toBe('#ffffff');
    }
  });

  it('type stack avoids the brief\'s forbidden families', () => {
    const { display, body, micro } = tinmanTheme.type;
    const forbidden = ['Inter', 'Roboto', 'Arial', 'Space Grotesk', 'Poppins'];
    for (const f of [display, body, micro]) {
      for (const ban of forbidden) {
        expect(f).not.toContain(ban);
      }
    }
  });

  it('voice + heroTreatment + texture are valid enum values', () => {
    expect(['archival', 'field-guide', 'editorial', 'topographic-technical', 'trail-party'])
      .toContain(tinmanTheme.voice);
    expect(['unfurl', 'gallery-frame', 'split-with-elevation', 'parallax-portfolio'])
      .toContain(tinmanTheme.heroTreatment);
    expect(['paper-grain', 'topo-lines', 'aerial-noise', 'clean'])
      .toContain(tinmanTheme.texture);
  });

  it('course data strip has 8+ entries (target 6–10)', () => {
    expect(tinmanTheme.courseData.length).toBeGreaterThanOrEqual(8);
    for (const d of tinmanTheme.courseData) {
      expect(d.label).toBeTruthy();
      expect(d.value).toBeTruthy();
    }
  });

  it('triathlon disciplines triptych is set with three legs', () => {
    expect(tinmanTheme.disciplines).toHaveLength(3);
    expect(tinmanTheme.disciplines.map(d => d.label)).toEqual(['Swim', 'Bike', 'Run']);
  });

  it('field notes are 2–3 sentences in studio voice', () => {
    const sentences = tinmanTheme.fieldNotes.split(/\.\s+/).filter(Boolean);
    expect(sentences.length).toBeGreaterThanOrEqual(2);
    expect(tinmanTheme.fieldNotes).not.toMatch(/About the |Race Information|Course Details/);
  });

  it('acquisition includes print, digital, and commission options', () => {
    expect(tinmanTheme.acquisition.print).toBeTruthy();
    expect(tinmanTheme.acquisition.digital).toBeTruthy();
    expect(tinmanTheme.acquisition.commission).toBeTruthy();
  });

  it('cross-links are 3–5 entries pointing at known map slugs', () => {
    const known = new Set(['escarpment', 'manitous-revenge', 'sleeping-giant', 'wild-goose', 'golden-leaf', 'javelina-jundred']);
    expect(tinmanTheme.crossLinks.length).toBeGreaterThanOrEqual(3);
    expect(tinmanTheme.crossLinks.length).toBeLessThanOrEqual(5);
    for (const l of tinmanTheme.crossLinks) {
      expect(known.has(l.slug)).toBe(true);
    }
  });
});

describe('Editorial chrome in dist/maps/tupper-lake-tinman/index.html', () => {
  it('mounts the editorial body classes (voice, treatment, texture)', () => {
    expect(builtHtml).toContain('class="race-page voice-archival treatment-gallery-frame texture-paper-grain"');
  });

  it('renders the studio mark', () => {
    expect(builtHtml).toContain('False Summit Studio');
    expect(builtHtml).toContain('Atelier of cartographic works for endurance events');
  });

  it('renders the masthead with italic accent on the proper noun', () => {
    expect(builtHtml).toContain('<h1 class="masthead__name">Tupper Lake<br/><em>Tinman</em></h1>');
  });

  it('renders the wordmark as quoted italic, not a CTA', () => {
    expect(builtHtml).toContain('<p class="masthead__wordmark">Race the Adirondacks</p>');
    expect(builtHtml).not.toMatch(/<button[^>]*>\s*Race the Adirondacks/);
  });

  it('renders host / region / race-day metadata strip', () => {
    expect(builtHtml).toContain('<dt>Host</dt>');
    expect(builtHtml).toContain('Adirondack Sports Council');
    expect(builtHtml).toContain('<dt>Region</dt>');
    expect(builtHtml).toContain('<dt>Race day</dt>');
  });

  it('frames the map in a gallery with corner brackets', () => {
    expect(builtHtml).toContain('class="map-room__corner map-room__corner--tl"');
    expect(builtHtml).toContain('class="map-room__corner map-room__corner--br"');
    expect(builtHtml).toContain('class="map-room__plate"');
    expect(builtHtml).toContain('Plate I');
  });

  it('renders the disciplines triptych', () => {
    expect(builtHtml).toContain('<span class="disciplines__label">Swim</span>');
    expect(builtHtml).toContain('<span class="disciplines__label">Bike</span>');
    expect(builtHtml).toContain('<span class="disciplines__label">Run</span>');
  });

  it('renders the course data strip with theme entries', () => {
    expect(builtHtml).toContain('Field bulletin');
    expect(builtHtml).toContain('Course at a glance');
    expect(builtHtml).toContain('44th running');
    expect(builtHtml).toContain('Triathlete · Best Half-Distance 2026');
  });

  it('renders the field notes with a drop-cap-eligible body', () => {
    expect(builtHtml).toContain('Notes from the drafting table');
    expect(builtHtml).toContain('Forty-four years of the same start line');
    expect(builtHtml).toContain('class="field-notes__sign"');
  });

  it('renders the acquisition shelf (print + digital + commission)', () => {
    expect(builtHtml).toContain('Archival print');
    expect(builtHtml).toContain('Digital download');
    expect(builtHtml).toContain('Commission');
    expect(builtHtml).toContain('Begin a commission');
  });

  it('renders the contact-sheet cross-links with numbered indices', () => {
    expect(builtHtml).toMatch(/No\. 01[\s\S]+Escarpment Trail Run 30K/);
    expect(builtHtml).toMatch(/No\. 04[\s\S]+Wild Goose/);
  });

  it('renders the colophon naming the type stack', () => {
    expect(builtHtml).toContain('Set in Fraunces, Spectral, and JetBrains Mono');
  });

  it('does not contain any forbidden CMS section headers', () => {
    expect(builtHtml).not.toMatch(/<h[2-3][^>]*>\s*Race Information/);
    expect(builtHtml).not.toMatch(/<h[2-3][^>]*>\s*Course Details/);
    expect(builtHtml).not.toMatch(/<h[2-3][^>]*>\s*Features/);
    expect(builtHtml).not.toMatch(/<h[2-3][^>]*>\s*About the Run Course/);
    expect(builtHtml).not.toMatch(/<h[2-3][^>]*>\s*Select Race Distance/);
  });

  it('links cross-references to the right map slugs', () => {
    expect(builtHtml).toContain('href="/maps/escarpment/"');
    expect(builtHtml).toContain('href="/maps/wild-goose/"');
    expect(builtHtml).toContain('href="/maps/sleeping-giant/"');
  });

  it('the gallery frame uses a small, intentional border-radius (≤ 8px)', () => {
    // editorial.css declares the .map-room__plate radius as 2px
    expect(builtHtml).toMatch(/\.map-room__plate\s*\{[^}]*border-radius:\s*2px/);
  });

  it('does not drop-shadow the map frame', () => {
    // Shadows are forbidden under the map. Only inset hairlines are allowed.
    const plateBlock = builtHtml.match(/\.map-room__plate\s*\{[^}]*\}/);
    expect(plateBlock).toBeTruthy();
    expect(plateBlock[0]).not.toMatch(/box-shadow:\s*0\s+\d+px/);
  });
});
