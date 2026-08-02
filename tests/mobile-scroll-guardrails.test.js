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
