import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const slugs = ['escarpment', 'golden-leaf', 'gran-fondo-badlands', 'javelina-jundred', 'manitous-revenge', 'sleeping-giant', 'tupper-lake-tinman', 'wild-goose'];

describe('Embed build output', () => {
  slugs.forEach(slug => {
    const embedPath = resolve(__dirname, `../dist/embed/${slug}/index.html`);

    describe(slug, () => {
      it('generates embed HTML file', () => {
        expect(existsSync(embedPath)).toBe(true);
      });

      it('has no page-shell wrapper in HTML structure', () => {
        const html = readFileSync(embedPath, 'utf-8');
        expect(html).not.toContain('class="page-shell"');
      });

      it('has no full site header', () => {
        const html = readFileSync(embedPath, 'utf-8');
        expect(html).not.toContain('class="header"');
      });

      it('has embed-header instead', () => {
        const html = readFileSync(embedPath, 'utf-8');
        expect(html).toContain('class="embed-header"');
      });

      it('has embed-mode body class', () => {
        const html = readFileSync(embedPath, 'utf-8');
        // Body now also carries race-{slug} so the per-race override.css
        // (scoped to .race-{slug}) actually applies inside the iframe.
        expect(html).toMatch(/<body class="embed-mode race-[a-z0-9-]+"/);
      });

      it('body class includes race-{slug} scope', () => {
        const html = readFileSync(embedPath, 'utf-8');
        expect(html).toContain(`race-${slug}"`);
      });

      it('has no footer element', () => {
        const html = readFileSync(embedPath, 'utf-8');
        expect(html).not.toContain('class="footer"');
      });

      it('has powered-by link', () => {
        const html = readFileSync(embedPath, 'utf-8');
        expect(html).toContain('Powered by False Summit Studio');
        expect(html).toContain('href="https://falsesummitstudio.com"');
      });

      it('includes embed.css styles', () => {
        const html = readFileSync(embedPath, 'utf-8');
        expect(html).toContain('.embed-header');
        expect(html).toContain('.powered-by');
        expect(html).toContain('body.embed-mode');
      });

      it('includes embed-params.js with postMessage API', () => {
        const html = readFileSync(embedPath, 'utf-8');
        expect(html).toContain('fss:ready');
        expect(html).toContain('fss:switchView');
        expect(html).toContain('fss:flyTo');
        expect(html).toContain('fss:toggleLayer');
      });

      it('includes MapLibre GL JS', () => {
        const html = readFileSync(embedPath, 'utf-8');
        expect(html).toContain('maplibre-gl');
      });

      it('has view tabs for map and simulator', () => {
        const html = readFileSync(embedPath, 'utf-8');
        expect(html).toContain("switchView('map')");
        expect(html).toContain("switchView('sim')");
      });

      it('includes feature-hiding CSS rules', () => {
        const html = readFileSync(embedPath, 'utf-8');
        expect(html).toContain('data-embed-hide-elevation');
        expect(html).toContain('data-embed-hide-stats');
        expect(html).toContain('data-embed-hide-simulator');
      });
    });
  });
});

describe('Embed vs standard map differences', () => {
  const embedHtml = readFileSync(resolve(__dirname, '../dist/embed/escarpment/index.html'), 'utf-8');
  const mapHtml = readFileSync(resolve(__dirname, '../dist/maps/escarpment/index.html'), 'utf-8');

  it('standard map has page-shell, embed does not', () => {
    expect(mapHtml).toContain('class="page-shell"');
    expect(embedHtml).not.toContain('class="page-shell"');
  });

  it('standard map has full header, embed has compact header', () => {
    expect(mapHtml).toContain('class="header"');
    expect(embedHtml).toContain('class="embed-header"');
    expect(embedHtml).not.toContain('class="header"');
  });

  it('standard map has footer, embed has powered-by', () => {
    expect(mapHtml).toContain('class="footer"');
    expect(embedHtml).not.toContain('class="footer"');
    expect(embedHtml).toContain('class="powered-by"');
  });

  it('embed includes embed.css that standard map does not', () => {
    expect(embedHtml).toContain('body.embed-mode');
    expect(mapHtml).not.toContain('body.embed-mode');
  });

  it('embed includes embed-params.js that standard map does not', () => {
    expect(embedHtml).toContain('fss:ready');
    expect(mapHtml).not.toContain('fss:ready');
  });
});
