import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const html = readFileSync(resolve(__dirname, '../maps/escarpment/index.html'), 'utf-8');

describe('Escarpment map fixes', () => {
  it('links to correct race website (escarpmenttrail.com)', () => {
    expect(html).toContain('href="https://escarpmenttrail.com"');
    expect(html).not.toContain('escarpmenttrailrun.com');
  });

  it('does not reference "Windham Mountain Running Club"', () => {
    expect(html).not.toContain('Windham Mountain Running Club');
  });

  it('uses light theme colors', () => {
    expect(html).toContain("--bg: #ffffff");
    expect(html).toContain("--bg-card: #f7f7f7");
    expect(html).not.toContain("--bg: #1a1a2e");
  });

  it('inlines TRAILS_DATA instead of using fetch', () => {
    expect(html).toContain('const TRAILS_DATA =');
    expect(html).not.toContain("fetch('data/trails.geojson')");
    expect(html).not.toContain('fetch("data/trails.geojson")');
  });

  it('trail lines render on top (no beforeId)', () => {
    // The addLayer for park-trails-line should NOT have a beforeId parameter
    const trailLayerMatch = html.match(/id:\s*'park-trails-line'[\s\S]*?\}\);/);
    expect(trailLayerMatch).toBeTruthy();
    // Should not contain beforeId in the trail layer call
    const trailSection = html.substring(
      html.indexOf("id: 'park-trails-line'"),
      html.indexOf("id: 'park-trails-label'")
    );
    expect(trailSection).not.toContain('beforeId');
  });

  it('trail lines use dash array', () => {
    expect(html).toContain("'line-dasharray': [2, 3]");
  });

  it('trail line width scales to zoom 20', () => {
    expect(html).toMatch(/line-width.*20,\s*8/);
  });

  it('trail label text-size scales to zoom 20', () => {
    expect(html).toMatch(/text-size.*20,\s*16/);
  });

  it('trail labels have no minzoom', () => {
    const labelSection = html.substring(
      html.indexOf("id: 'park-trails-label'"),
      html.indexOf("id: 'park-trails-label'") + 500
    );
    expect(labelSection).not.toContain('minzoom');
  });

  it('has basemap cleanup for POI icons', () => {
    expect(html).toContain("layer.id.startsWith('poi-')");
  });

  it('has basemap cleanup for trail/path layers', () => {
    expect(html).toContain('BASEMAP_TRAIL_LAYERS');
    expect(html).toContain('road-path-trail');
  });

  it('does not have course click popup', () => {
    expect(html).not.toContain("map.on('click', 'course-line'");
  });

  it('has mile markers on the interactive map', () => {
    expect(html).toContain("'mile-markers'");
    expect(html).toContain('mile-markers-circle');
    expect(html).toContain('mile-markers-label');
  });

  it('mile markers toggle with course visibility', () => {
    const start = html.indexOf('function toggleCourse()');
    const end = html.indexOf('function toggle3D()');
    const toggleFn = html.substring(start, end);
    expect(toggleFn).toContain('mile-markers-circle');
    expect(toggleFn).toContain('mile-markers-label');
  });

  it('button says "Park Trails" not "Trails"', () => {
    expect(html).toContain('>Park Trails</button>');
    // Ensure no standalone "Trails" button (trailBtn should say Park Trails)
    expect(html).not.toMatch(/id="trailBtn">Trails</);
  });

  it('shows 6-hour cutoff in stats', () => {
    expect(html).toContain('6 hrs');
    expect(html).toContain('Cutoff');
  });

  it('uses line-cap butt for trail dashes', () => {
    const trailSection = html.substring(
      html.indexOf("id: 'park-trails-line'"),
      html.indexOf("id: 'park-trails-label'")
    );
    expect(trailSection).toContain("'line-cap': 'butt'");
  });

  it('has 7 aid stations defined', () => {
    expect(html).toContain('const AID_STATIONS =');
    const stations = ['Windham Peak', 'Acra', 'Base of Blackhead', 'Top of Blackhead',
      "Dutcher's Notch", 'Stoppel Point', 'North Point'];
    stations.forEach(name => {
      expect(html).toContain(name);
    });
  });

  it('has Aid Stations toggle button', () => {
    expect(html).toContain('id="aidBtn"');
    expect(html).toContain('>Aid Stations</button>');
  });

  it('has toggleAidStations function', () => {
    expect(html).toContain('function toggleAidStations()');
  });

  it('wires aidBtn to toggleAidStations', () => {
    expect(html).toContain("getElementById('aidBtn').onclick = toggleAidStations");
  });
});
