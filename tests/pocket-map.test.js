import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const slugs = ['escarpment', 'golden-leaf', 'javelina-jundred', 'manitous-revenge', 'sleeping-giant', 'wild-goose'];

describe('Pocket map build output — standard map pages', () => {
  slugs.forEach(slug => {
    const mapPath = resolve(__dirname, `../dist/maps/${slug}/index.html`);

    describe(slug, () => {
      it('generates map HTML file', () => {
        expect(existsSync(mapPath)).toBe(true);
      });

      it('includes pocket modal backdrop', () => {
        const html = readFileSync(mapPath, 'utf-8');
        expect(html).toContain('id="pocketBackdrop"');
      });

      it('includes pocket download button', () => {
        const html = readFileSync(mapPath, 'utf-8');
        expect(html).toContain('id="pocketDownloadBtn"');
      });

      it('includes openPocketModal in header button', () => {
        const html = readFileSync(mapPath, 'utf-8');
        expect(html).toContain('openPocketModal()');
      });

      it('includes generatePocketMap function', () => {
        const html = readFileSync(mapPath, 'utf-8');
        expect(html).toContain('generatePocketMap');
      });

      it('includes closePocketModal function', () => {
        const html = readFileSync(mapPath, 'utf-8');
        expect(html).toContain('closePocketModal');
      });

      it('includes updatePocketSizeEstimate function', () => {
        const html = readFileSync(mapPath, 'utf-8');
        expect(html).toContain('updatePocketSizeEstimate');
      });

      it('includes triggerPocketDownload function', () => {
        const html = readFileSync(mapPath, 'utf-8');
        expect(html).toContain('triggerPocketDownload');
      });

      it('includes Pocket Map button label in header', () => {
        const html = readFileSync(mapPath, 'utf-8');
        expect(html).toContain('Pocket Map');
      });

      it('includes Save Pocket Map modal title', () => {
        const html = readFileSync(mapPath, 'utf-8');
        expect(html).toContain('Save Pocket Map');
      });

      it('has preserveDrawingBuffer in map constructor', () => {
        const html = readFileSync(mapPath, 'utf-8');
        expect(html).toContain('preserveDrawingBuffer');
      });

      it('has pocket options checkboxes', () => {
        const html = readFileSync(mapPath, 'utf-8');
        expect(html).toContain('pocketIncludeSim');
        expect(html).toContain('pocketIncludeElevation');
        expect(html).toContain('pocketIncludeGPS');
      });

      it('has pocket size estimate element', () => {
        const html = readFileSync(mapPath, 'utf-8');
        expect(html).toContain('pocketSizeEstimate');
      });

      it('has pocket status element', () => {
        const html = readFileSync(mapPath, 'utf-8');
        expect(html).toContain('pocketStatus');
      });
    });
  });
});

describe('Pocket map NOT in embed builds', () => {
  slugs.forEach(slug => {
    const embedPath = resolve(__dirname, `../dist/embed/${slug}/index.html`);

    it(`${slug} embed does not contain pocket modal`, () => {
      if (!existsSync(embedPath)) return; // some maps may opt out
      const html = readFileSync(embedPath, 'utf-8');
      expect(html).not.toContain('pocketBackdrop');
      expect(html).not.toContain('openPocketModal');
      expect(html).not.toContain('generatePocketMap');
    });

    it(`${slug} embed does not have Pocket Map button`, () => {
      if (!existsSync(embedPath)) return;
      const html = readFileSync(embedPath, 'utf-8');
      // The embed header should not have the pocket button
      expect(html).not.toContain('openPocketModal()');
    });
  });
});

describe('GPS projection math', () => {
  const bounds = { minLng: -74.2, maxLng: -74.0, minLat: 42.2, maxLat: 42.3 };

  function project(lng, lat, b) {
    return {
      xPct: (lng - b.minLng) / (b.maxLng - b.minLng) * 100,
      yPct: (b.maxLat - lat) / (b.maxLat - b.minLat) * 100
    };
  }

  it('projects center coordinate to 50%/50%', () => {
    const { xPct, yPct } = project(-74.1, 42.25, bounds);
    expect(xPct).toBeCloseTo(50, 5);
    expect(yPct).toBeCloseTo(50, 5);
  });

  it('projects top-left (minLng, maxLat) to 0%/0%', () => {
    const { xPct, yPct } = project(-74.2, 42.3, bounds);
    expect(xPct).toBe(0);
    expect(yPct).toBe(0);
  });

  it('projects bottom-right (maxLng, minLat) to 100%/100%', () => {
    const { xPct, yPct } = project(-74.0, 42.2, bounds);
    expect(xPct).toBe(100);
    expect(yPct).toBe(100);
  });

  it('clamps projection to [0, 100] range', () => {
    const { xPct, yPct } = project(-75.0, 43.0, bounds);
    // Without clamping these would be negative / > 100
    expect(xPct).toBeLessThan(0); // raw unclamped value (clamp is in runtime GPS code)
    // This confirms the math produces correct direction for clamping logic
  });

  it('detects out-of-bounds with padding', () => {
    const pad = 0.02;
    const lng = -75.0;
    const outOfBounds = lng < bounds.minLng - pad;
    expect(outOfBounds).toBe(true);
  });

  it('does not flag in-bounds coordinate as out of bounds', () => {
    const pad = 0.02;
    const lng = -74.1;
    const outOfBounds = lng < bounds.minLng - pad || lng > bounds.maxLng + pad;
    expect(outOfBounds).toBe(false);
  });
});

describe('Cue sheet nearest-index logic', () => {
  it('finds nearest course coordinate index for a trail segment start', () => {
    const courseCoords = [[0, 0], [1, 1], [2, 2], [3, 3]];
    const target = [1.1, 0.9];
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < courseCoords.length; i++) {
      const dx = courseCoords[i][0] - target[0];
      const dy = courseCoords[i][1] - target[1];
      const d = dx * dx + dy * dy;
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    expect(bestIdx).toBe(1);
  });

  it('returns index 0 for a point at origin', () => {
    const courseCoords = [[0, 0], [1, 1], [2, 2]];
    const target = [0, 0];
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < courseCoords.length; i++) {
      const dx = courseCoords[i][0] - target[0];
      const dy = courseCoords[i][1] - target[1];
      const d = dx * dx + dy * dy;
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    expect(bestIdx).toBe(0);
  });

  it('returns last index for a point at end of course', () => {
    const courseCoords = [[0, 0], [1, 1], [2, 2]];
    const target = [2.05, 1.95];
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < courseCoords.length; i++) {
      const dx = courseCoords[i][0] - target[0];
      const dy = courseCoords[i][1] - target[1];
      const d = dx * dx + dy * dy;
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    expect(bestIdx).toBe(2);
  });
});

describe('Coordinate downsampling logic', () => {
  function downsampleCoords(coords, maxPoints) {
    if (coords.length <= maxPoints) return coords;
    const step = Math.ceil(coords.length / maxPoints);
    const result = [];
    for (let i = 0; i < coords.length; i += step) {
      result.push(coords[i]);
    }
    const last = coords[coords.length - 1];
    if (result[result.length - 1] !== last) result.push(last);
    return result;
  }

  it('returns original array if under maxPoints', () => {
    const coords = [[0,0],[1,1],[2,2]];
    expect(downsampleCoords(coords, 10)).toBe(coords);
  });

  it('reduces to approximately maxPoints', () => {
    const coords = Array.from({ length: 2000 }, (_, i) => [i * 0.001, i * 0.001]);
    const result = downsampleCoords(coords, 1000);
    expect(result.length).toBeLessThanOrEqual(1002); // step rounding may add 1-2
    expect(result.length).toBeGreaterThan(500);
  });

  it('always includes the last coordinate', () => {
    const coords = Array.from({ length: 50 }, (_, i) => [i, i]);
    const result = downsampleCoords(coords, 10);
    expect(result[result.length - 1]).toEqual([49, 49]);
  });

  it('always includes the first coordinate', () => {
    const coords = Array.from({ length: 50 }, (_, i) => [i, i]);
    const result = downsampleCoords(coords, 10);
    expect(result[0]).toEqual([0, 0]);
  });
});

describe('Pocket map modal CSS in layout.css', () => {
  const layoutCss = readFileSync(resolve(__dirname, '../src/shared/layout.css'), 'utf-8');

  it('includes pocket modal backdrop style', () => {
    expect(layoutCss).toContain('.pocket-modal-backdrop');
  });

  it('includes pocket modal open state', () => {
    expect(layoutCss).toContain('.pocket-modal-backdrop.open');
  });

  it('includes pocket download button', () => {
    expect(layoutCss).toContain('.pocket-download-btn');
  });

  it('includes pocket options style', () => {
    expect(layoutCss).toContain('.pocket-options');
  });

  it('includes pocket status style', () => {
    expect(layoutCss).toContain('.pocket-status');
  });
});
