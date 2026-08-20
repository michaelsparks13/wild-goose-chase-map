import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * `static/` is a verbatim passthrough into `dist/`, for self-contained pages
 * built by a sibling pipeline rather than by this template system. These tests
 * guard the contract: the page reaches the site, its provenance note does not,
 * and it stays self-contained once it is there.
 */
const DIST = resolve(__dirname, '../dist');
const LEADVILLE = resolve(DIST, 'leadville-2026/index.html');

describe('static/ passthrough', () => {
  it('publishes the Leadville 2026 page at /leadville-2026/', () => {
    expect(existsSync(LEADVILLE)).toBe(true);
  });

  /**
   * vitest reads dist/ but never builds it, so a stale dist/ silently validates
   * bytes nobody is shipping — a failure introduced upstream can pass here for
   * a whole round. Compare the published copy against its source and fail loud
   * instead. If this fails, run `node build.js`.
   */
  it('dist carries the current static/ source, not a stale build', () => {
    const source = resolve(__dirname, '../static/leadville-2026/index.html');
    expect(readFileSync(LEADVILLE, 'utf-8')).toBe(readFileSync(source, 'utf-8'));
  });

  it('does not publish the internal provenance README', () => {
    expect(existsSync(resolve(DIST, 'leadville-2026/README.md'))).toBe(false);
  });

  it('is linked from the landing page portfolio', () => {
    const landing = readFileSync(resolve(DIST, 'index.html'), 'utf-8');
    expect(landing).toContain('leadville-2026/index.html');
    expect(landing).toContain('Leadville Trail 100 Run');
  });
});

describe('Leadville 2026 page', () => {
  const html = existsSync(LEADVILLE) ? readFileSync(LEADVILLE, 'utf-8') : '';

  it('loads MapLibre from cdnjs and nothing else externally', () => {
    const srcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
    expect(srcs).toHaveLength(1);
    expect(srcs[0]).toMatch(/^https:\/\/cdnjs\.cloudflare\.com\//);
    expect(html).not.toMatch(/unpkg\.com|jsdelivr\.net/);
  });

  it('inlines its data — nothing is fetched at runtime', () => {
    // The page's own code never fetches: every course, cue and advisory is
    // inlined, so nothing loads from a sibling file. Its basemap streams from
    // the studio's PMTiles archive, and the vendored protocol handler prepended
    // to the bundle is range requests by definition — that library is the one
    // place `fetch` is allowed, so it is cut out before the check.
    const vendorStart = html.indexOf('// ===== core/vendor/');
    expect(vendorStart).toBeGreaterThan(-1);
    const vendorEnd = html.indexOf('// ===== core/', vendorStart + 1);
    const ours = html.slice(0, vendorStart) + html.slice(vendorEnd === -1 ? html.length : vendorEnd);
    expect(ours).not.toMatch(/\bfetch\s*\(/);
    expect(html).not.toContain('type="module"');
  });

  it('carries the 2026 course, the twelve stops, the cue sheet and the conflicts', () => {
    expect(html).toContain('ridewithgps.com/routes/56633050');
    expect(html).toContain('Carter Summit');
    expect(html).toContain('Turquoise Lake Dam');
    expect(html).toContain('15.8');
    expect(html).toContain('Turn by turn');
    // Now rendered on the card of each stop it affects, not in a panel.
    expect(html).toContain('Conflicting official information');
    expect(html).not.toContain('See the conflict');
    expect(html).toContain('leadvilleraceseries.com');
  });

  it('publishes the official elevation figure and does not argue with it', () => {
    // LEADVILLE_RULES.md section 2, as revised: LRS owns the course, so LRS's
    // figure is the one that ships. Our own measurement stays in the inlined
    // advisory data as provenance, but no code path renders it any more.
    expect(html).toContain('13,552');
    expect(html).not.toMatch(/ADV\.measurement|ADVISORIES\.measurement/);
  });

  it('lets a runner pinch-zoom the page', () => {
    const meta = html.match(/<meta name="viewport" content="([^"]+)"/)[1];
    expect(meta).not.toMatch(/user-scalable\s*=\s*no/);
    expect(meta).not.toMatch(/maximum-scale/);
  });
});
