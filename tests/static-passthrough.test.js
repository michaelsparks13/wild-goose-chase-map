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
    expect(html).not.toMatch(/\bfetch\s*\(/);
    expect(html).not.toContain('type="module"');
  });

  it('carries the 2026 course, the twelve stops, the cue sheet and the conflicts', () => {
    expect(html).toContain('ridewithgps.com/routes/56633050');
    expect(html).toContain('Carter Summit');
    expect(html).toContain('Turquoise Lake Dam');
    expect(html).toContain('15.8');
    expect(html).toContain('Turn by turn');
    expect(html).toContain('Conflicting official information');
    expect(html).toContain('leadvilleraceseries.com');
  });

  it('surfaces the elevation-gain delta rather than picking a number', () => {
    expect(html).toContain('14,992');
    expect(html).toContain('13,552');
  });

  it('lets a runner pinch-zoom the page', () => {
    const meta = html.match(/<meta name="viewport" content="([^"]+)"/)[1];
    expect(meta).not.toMatch(/user-scalable\s*=\s*no/);
    expect(meta).not.toMatch(/maximum-scale/);
  });
});
