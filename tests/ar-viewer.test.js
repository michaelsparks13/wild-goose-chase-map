// Unit tests for the AR viewer: pure helpers, built-page assertions, and
// asset size budgets. Requires `node build.js` first (like weather.test.js).
import { describe, it, expect } from 'vitest';
import { readFileSync, statSync, existsSync } from 'fs';
import { resolve } from 'path';
import { chooseArMode, scrubValueToMile, formatMile } from '../src/ar/ar-capabilities.js';

const AR_SLUGS = ['escarpment', 'golden-leaf'];

describe('AR capability detection', () => {
  it('prefers WebXR when immersive-ar is supported', () => {
    expect(chooseArMode({ xrArSupported: true, canActivateNativeAr: true })).toBe('webxr');
    expect(chooseArMode({ xrArSupported: true, canActivateNativeAr: false })).toBe('webxr');
  });

  it('falls back to Scene Viewer / Quick Look when model-viewer can activate AR', () => {
    expect(chooseArMode({ xrArSupported: false, canActivateNativeAr: true })).toBe('native');
  });

  it('degrades to plain 3D when nothing is available', () => {
    expect(chooseArMode({ xrArSupported: false, canActivateNativeAr: false })).toBe('none');
  });
});

describe('AR scrubber math', () => {
  it('maps scrub values to miles linearly', () => {
    expect(scrubValueToMile(0, 1000, 18.6)).toBe(0);
    expect(scrubValueToMile(500, 1000, 18.6)).toBeCloseTo(9.3, 6);
    expect(scrubValueToMile(1000, 1000, 18.6)).toBeCloseTo(18.6, 6);
  });

  it('clamps out-of-range values', () => {
    expect(scrubValueToMile(-50, 1000, 10)).toBe(0);
    expect(scrubValueToMile(2000, 1000, 10)).toBe(10);
  });

  it('formats miles with one decimal', () => {
    expect(formatMile(0)).toBe('0.0');
    expect(formatMile(9.26)).toBe('9.3');
    expect(formatMile(12)).toBe('12.0');
  });
});

describe.each(AR_SLUGS)('built AR page: %s', (slug) => {
  const htmlPath = resolve(__dirname, `../dist/ar/${slug}/index.html`);
  const metaPath = resolve(__dirname, `../src/maps/${slug}/data/ar/ar-meta.json`);
  const html = readFileSync(htmlPath, 'utf-8');
  const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));

  it('inlines the AR meta and race name', () => {
    expect(html).toContain(meta.raceName);
    expect(html).toContain(`"scaleDenominator":${meta.scaleDenominator}`);
    expect(html).toContain('AR_META');
  });

  it('renders one hotspot per aid station', () => {
    const hotspots = html.match(/slot="hotspot-aid-\d+"/g) || [];
    expect(hotspots).toHaveLength(meta.aidStations.length);
    for (const station of meta.aidStations) {
      expect(html).toContain(`data-position="${station.position.join(' ')}"`);
    }
  });

  it('renders aid ticks at course-proportional positions', () => {
    const ticks = html.match(/class="tick"/g) || [];
    expect(ticks).toHaveLength(meta.aidStations.length);
  });

  it('references self-hosted libraries, not a CDN', () => {
    expect(html).toContain('/ar/lib/model-viewer.min.js');
    expect(html).toContain('/ar/lib/three.module.min.js');
    expect(html).not.toMatch(/src="https?:\/\/(unpkg|cdn|jsdelivr)/);
  });

  it('includes the USDZ source for iOS Quick Look', () => {
    expect(html).toContain('ios-src="./course.usdz"');
    expect(existsSync(resolve(__dirname, `../dist/ar/${slug}/course.usdz`))).toBe(true);
  });

  it('ships copied model assets', () => {
    expect(existsSync(resolve(__dirname, `../dist/ar/${slug}/course.glb`))).toBe(true);
  });

  it('GLB stays within its size budget', () => {
    const size = statSync(resolve(__dirname, `../dist/ar/${slug}/course.glb`)).size;
    expect(size).toBeLessThanOrEqual(meta.budgetMB * 1024 * 1024);
    expect(size).toBe(meta.glbBytes);
  });

  it('meta aid stations carry hotspot anchors above the terrain floor', () => {
    for (const station of meta.aidStations) {
      expect(station.position).toHaveLength(3);
      expect(station.position[1]).toBeGreaterThan(0);
      expect(station.node).toMatch(/^aid-\d+$/);
    }
  });
});

describe('shared AR libs in dist', () => {
  it('copies the viewer runtime libraries once', () => {
    for (const lib of [
      'model-viewer.min.js',
      'three.module.min.js',
      'three.core.min.js',
      'loaders/GLTFLoader.js',
      'utils/BufferGeometryUtils.js',
      'utils/SkeletonUtils.js',
    ]) {
      expect(existsSync(resolve(__dirname, `../dist/ar/lib/${lib}`))).toBe(true);
    }
  });
});
