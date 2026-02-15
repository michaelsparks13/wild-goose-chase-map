import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const maps = [
  { name: 'sleeping-giant', path: '../maps/sleeping-giant/index.html' },
  { name: 'shawangunk-ridge', path: '../maps/shawangunk-ridge/index.html' },
  { name: 'wild-goose', path: '../maps/wild-goose/index.html' },
];

maps.forEach(({ name, path }) => {
  describe(`${name} hillshade style migration`, () => {
    const html = readFileSync(resolve(__dirname, path), 'utf-8');

    it('has hillshade-dem source in BASEMAP_STYLE sources', () => {
      // The hillshade-dem source should appear inside the BASEMAP_STYLE sources block
      const styleStart = html.indexOf('BASEMAP_STYLE');
      const styleEnd = html.indexOf('};', styleStart);
      const styleBlock = html.substring(styleStart, styleEnd);
      expect(styleBlock).toContain("'hillshade-dem':");
      expect(styleBlock).toContain("type: 'raster-dem'");
    });

    it('has hillshade layer in BASEMAP_STYLE layers array', () => {
      const styleStart = html.indexOf('BASEMAP_STYLE');
      const styleEnd = html.indexOf('};', styleStart);
      const styleBlock = html.substring(styleStart, styleEnd);
      // layers should use spread syntax
      expect(styleBlock).toContain('layers: [...basemaps.layers(');
      // hillshade layer definition should be in the style block
      expect(styleBlock).toContain("id: 'hillshade'");
      expect(styleBlock).toContain("source: 'hillshade-dem'");
      expect(styleBlock).toContain("'hillshade-exaggeration': 0.3");
    });

    it('does not add hillshade source in map.on load callback', () => {
      expect(html).not.toContain("map.addSource('hillshade-dem'");
    });

    it('does not add hillshade layer in map.on load callback', () => {
      // There should be no addLayer call with hillshade id
      expect(html).not.toMatch(/map\.addLayer\(\{[\s\S]*?id:\s*'hillshade'/);
    });

    it('still uses terrarium encoding', () => {
      expect(html).toContain("encoding: 'terrarium'");
    });

    it('hillshade paint properties are correct', () => {
      expect(html).toContain("'hillshade-shadow-color': '#5a5a5a'");
      expect(html).toContain("'hillshade-highlight-color': '#ffffff'");
      expect(html).toContain("'hillshade-accent-color': '#4a8f29'");
    });
  });
});

// Wild-goose specific: terrain-dem source should still be added in load callback
describe('wild-goose terrain-dem preserved in load callback', () => {
  const html = readFileSync(resolve(__dirname, '../maps/wild-goose/index.html'), 'utf-8');

  it('still adds terrain-dem source in map.on load', () => {
    expect(html).toContain("map.addSource('terrain-dem'");
  });

  it('still sets terrain in map.on load', () => {
    expect(html).toContain("map.setTerrain(");
  });

  it('still sets sky in map.on load', () => {
    expect(html).toContain("map.setSky(");
  });
});
