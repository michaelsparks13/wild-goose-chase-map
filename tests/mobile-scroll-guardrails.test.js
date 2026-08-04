// mobile-scroll-guardrails.test.js — build-level guards against the
// mobile scroll-trap class of bug (customer report, Aug 2026).
//
// Two things made the Wild Goose page nearly unscrollable in iPhone
// Safari, and both are easy to reintroduce when adding a new map:
//
//   1. A MapLibre map without `cooperativeGestures` captures every
//      one-finger drag on touch devices, so the page can't scroll
//      wherever the canvas is.
//   2. A `position: sticky` map container on mobile pins a ~50vh map
//      while the cue list scrolls behind it — the map never leaves the
//      frame until the whole course section has passed.
//
// These tests fail the build if either pattern comes back.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');

function builtPages(dir) {
  const base = path.join(ROOT, 'dist', dir);
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base)
    .map((slug) => path.join(base, slug, 'index.html'))
    .filter((p) => fs.existsSync(p));
}

describe('every MapLibre constructor opts into cooperative gestures', () => {
  const pages = [...builtPages('maps'), ...builtPages('embed')];

  it('found built map pages (run node build.js first)', () => {
    expect(pages.length).toBeGreaterThan(0);
  });

  for (const page of pages) {
    const rel = path.relative(ROOT, page);
    it(`${rel}: constructor count matches cooperativeGestures count`, () => {
      const html = fs.readFileSync(page, 'utf8');
      const constructors = (html.match(/new maplibregl\.Map\(/g) || []).length;
      const gestures = (html.match(/cooperativeGestures:/g) || []).length;
      expect(constructors).toBeGreaterThan(0);
      // Every constructor — main map, radar mini-map, any future one —
      // must pass the option. A new constructor without it breaks here.
      expect(gestures).toBe(constructors);
    });
  }
});

describe('editorial mobile layout keeps the map in normal flow', () => {
  const css = fs.readFileSync(path.join(ROOT, 'src/shared/editorial.css'), 'utf8');

  // Collect the bodies of all max-width media queries (the mobile side).
  function maxWidthBlocks(source) {
    const blocks = [];
    const re = /@media[^{]*max-width[^{]*\{/g;
    let m;
    while ((m = re.exec(source)) !== null) {
      let depth = 1;
      let i = re.lastIndex;
      while (i < source.length && depth > 0) {
        if (source[i] === '{') depth++;
        if (source[i] === '}') depth--;
        i++;
      }
      blocks.push(source.slice(re.lastIndex, i - 1));
    }
    return blocks;
  }

  it('no mobile media block makes .course__map sticky', () => {
    for (const block of maxWidthBlocks(css)) {
      if (!block.includes('.course__map')) continue;
      expect(block).not.toMatch(/position:\s*sticky/);
    }
  });

  it('the canvas-fill rule zeroes min-height so per-race sheets cannot overhang', () => {
    // Per-race sheets set min-height on .map-wrap for the legacy layout;
    // without this override the canvas overflows the 50vh mobile
    // container and paints over the distance tabs.
    const rule = css.match(/\.course__map \.map-wrap,[^{]*\{[^}]*\}/);
    expect(rule).toBeTruthy();
    expect(rule[0]).toMatch(/min-height:\s*0\s*!important/);
  });
});

// The map column is the containing block for every layer inside it —
// .map-wrap, #mapView, .view, #map and MapLibre's own canvas are all
// `position: absolute; inset: 0`. Un-position the column and those boxes
// resolve against the initial containing block instead: the canvas lands
// at the document origin at viewport size and paints straight over the
// cue sheet. A `prefers-reduced-motion` rule did exactly that on every
// editorial race for three months (customer report, Aug 2026), and no
// test could see it because nothing exercised that media query.
describe('.course__map never stops being a containing block', () => {
  // Scan EVERY stylesheet that ships, not just editorial.css: a per-race
  // override.css can reintroduce the identical defect (and per-race
  // sheets already carry their own prefers-reduced-motion blocks), so a
  // guard scoped to the shared sheet alone would not see it.
  const sheets = [
    path.join(ROOT, 'src/shared/editorial.css'),
    ...fs.readdirSync(path.join(ROOT, 'src/maps'))
      .map((slug) => path.join(ROOT, 'src/maps', slug, 'override.css'))
      .filter((p) => fs.existsSync(p)),
  ];
  const css = sheets.map((p) => fs.readFileSync(p, 'utf8')).join('\n');
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');

  it('scans the shared sheet plus every per-race override', () => {
    expect(sheets.length).toBeGreaterThan(5);
  });

  // Every declaration block in the sheet, paired with its selector.
  // editorial.css nests at most one level (rules inside media queries),
  // so a brace-balanced innermost match is sufficient here.
  function declarationBlocks(source) {
    const out = [];
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(source)) !== null) {
      out.push({ selector: m[1].trim(), body: m[2] });
    }
    return out;
  }

  // The bodies of every @media block whose prelude matches `pattern`.
  function atRuleBodies(source, pattern) {
    const bodies = [];
    const re = /@media([^{]*)\{/g;
    let m;
    while ((m = re.exec(source)) !== null) {
      if (!pattern.test(m[1])) continue;
      let depth = 1;
      let i = re.lastIndex;
      while (i < source.length && depth > 0) {
        if (source[i] === '{') depth++;
        if (source[i] === '}') depth--;
        i++;
      }
      bodies.push(source.slice(re.lastIndex, i - 1));
    }
    return bodies;
  }

  const courseMapBlocks = declarationBlocks(bare)
    .filter((b) => /(^|[\s,])\.course__map\s*(,|$)/.test(b.selector));

  it('finds the .course__map rules (guards the extractor itself)', () => {
    expect(courseMapBlocks.length).toBeGreaterThanOrEqual(3);
  });

  it('no rule anywhere un-positions the map column', () => {
    for (const { selector, body } of courseMapBlocks) {
      expect(
        body,
        `"${selector}" makes the map column static — its absolutely ` +
        'positioned canvas would escape to the document origin',
      ).not.toMatch(/position:\s*static/);
    }
  });

  it('no rule anywhere collapses the map column to an auto height', () => {
    // `height: auto` leaves the column at its min-height on mobile and
    // stretches it to an empty full-row grid item on desktop.
    for (const { selector, body } of courseMapBlocks) {
      expect(body, `"${selector}" drops the map column's explicit height`)
        .not.toMatch(/height:\s*auto/);
    }
  });

  it('the map column isolates its stacking context and clips overflow', () => {
    const base = courseMapBlocks.find((b) => b.selector === '.course__map');
    expect(base).toBeTruthy();
    // MapLibre's cooperative-gesture screen sits at z-index 99999. Without
    // its own stacking context the map column lets that paint over the
    // sticky top bar once the page-load fade (which used to supply one) is
    // suppressed for reduced motion.
    expect(base.body).toMatch(/isolation:\s*isolate/);
    // `clip`, not `hidden` — the column must not become a scroll container.
    expect(base.body).toMatch(/overflow:\s*clip/);
  });

  it('the reduced-motion block only suppresses animation', () => {
    const bodies = atRuleBodies(bare, /prefers-reduced-motion/);
    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) {
      expect(body, 'reduced motion must not restyle the map column')
        .not.toMatch(/\.course__map/);
      for (const { body: decls } of declarationBlocks(body)) {
        const props = decls.split(';')
          .map((d) => d.split(':')[0].trim())
          .filter(Boolean);
        for (const prop of props) {
          expect(['animation', 'animation-name', 'transition', 'scroll-behavior'])
            .toContain(prop);
        }
      }
    }
  });

  it('the reduced-motion reset repeats the selectors that set the animation', () => {
    // Media queries add no specificity of their own, so a `.race-page > *`
    // catch-all (0,1,0) silently loses to the (0,2,0) rule that applies
    // the reveal — the preference had no effect at all.
    const setter = bare.match(/((?:\.race-page > \.[\w-]+,?\s*)+)\{\s*animation:\s*raceFadeIn[^}]*\}/);
    expect(setter, 'could not find the raceFadeIn rule').toBeTruthy();
    const selectors = setter[1].split(',').map((s) => s.trim()).filter(Boolean);
    expect(selectors.length).toBeGreaterThan(1);

    const reduceBody = atRuleBodies(bare, /prefers-reduced-motion/).join('\n');
    for (const selector of selectors) {
      expect(reduceBody, `reduced motion never cancels the reveal on "${selector}"`)
        .toContain(selector);
    }
  });
});
