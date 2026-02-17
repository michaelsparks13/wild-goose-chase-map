import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const html = readFileSync(resolve(__dirname, '../dist/maps/wild-goose/index.html'), 'utf-8');

describe('wild-goose map updates', () => {
  describe('Park Trails button', () => {
    it('button text says "Park Trails" not "Trails"', () => {
      expect(html).toContain('Park Trails</button>');
      expect(html).not.toMatch(/onclick="toggleTrails\(\)">[^<]*(?<!Park )Trails<\/button>/);
    });
  });

  describe('Park Trails layer rendering', () => {
    it('trail line layer has dashed line-dasharray', () => {
      // Find the course-trails-line layer definition
      const layerStart = html.indexOf("id: 'course-trails-line'");
      const layerEnd = html.indexOf('});', layerStart);
      const layerBlock = html.substring(layerStart, layerEnd);
      expect(layerBlock).toContain("'line-dasharray': [2, 3]");
    });

    it('trail line layer uses butt line-cap for clean dashes', () => {
      const layerStart = html.indexOf("id: 'course-trails-line'");
      const layerEnd = html.indexOf('});', layerStart);
      const layerBlock = html.substring(layerStart, layerEnd);
      expect(layerBlock).toContain("'line-cap': 'butt'");
    });

    it('trail line layer does NOT use beforeId (renders on top)', () => {
      // The addLayer call for course-trails-line should not pass a second argument
      const layerStart = html.indexOf("id: 'course-trails-line'");
      const layerEnd = html.indexOf('});', layerStart) + 3;
      const afterClose = html.substring(layerEnd, layerEnd + 30);
      // Should NOT have , 'pink-outline' or similar beforeId after the closing
      expect(afterClose).not.toMatch(/^\s*,\s*'/);
    });

    it('trail line width scales to zoom 20', () => {
      const layerStart = html.indexOf("id: 'course-trails-line'");
      const layerEnd = html.indexOf('});', layerStart);
      const layerBlock = html.substring(layerStart, layerEnd);
      expect(layerBlock).toContain('20, 8');
    });

    it('trail label text-size scales to zoom 20', () => {
      const layerStart = html.indexOf("id: 'course-trails-label'");
      const layerEnd = html.indexOf('});', layerStart);
      const layerBlock = html.substring(layerStart, layerEnd);
      expect(layerBlock).toContain('20, 18');
    });
  });

  describe('footer', () => {
    it('contains False Summit Studio credit', () => {
      expect(html).toContain('Race map created by');
      expect(html).toContain('False Summit Studio');
    });

    it('links to falsesummitstudio.com', () => {
      expect(html).toContain('href="https://falsesummitstudio.com"');
    });
  });

  describe('3D terrain toggle', () => {
    it('has a 3D toggle button', () => {
      expect(html).toContain('id="terrainBtn"');
      expect(html).toContain('toggle3D()');
    });

    it('has a toggle3D function', () => {
      expect(html).toContain('function toggle3D()');
    });

    it('terrain is not enabled on load (toggled via button)', () => {
      // terrain-dem source is added on load, but setTerrain should only be in toggle3D
      const loadStart = html.indexOf("map.on('load'");
      const loadEnd = html.indexOf('function toggle3D');
      const loadBlock = html.substring(loadStart, loadEnd);
      // Source should be added
      expect(loadBlock).toContain("map.addSource('terrain-dem'");
      // But setTerrain should NOT be called in the load handler
      expect(loadBlock).not.toContain('map.setTerrain(');
    });

    it('toggle3D enables and disables terrain', () => {
      const fnStart = html.indexOf('function toggle3D()');
      const fnEnd = html.indexOf('}', html.indexOf('map.easeTo({ pitch: 0', fnStart));
      const fnBlock = html.substring(fnStart, fnEnd);
      expect(fnBlock).toContain("map.setTerrain({ source: 'terrain-dem'");
      expect(fnBlock).toContain('map.setTerrain(null)');
    });

    it('has terrain3D state variable', () => {
      expect(html).toContain('var terrain3D = false');
    });
  });

  describe('Simulator button active state', () => {
    it('view-tab buttons have data-view attributes', () => {
      expect(html).toContain('data-view="map"');
      expect(html).toContain('data-view="sim"');
    });

    it('switchView uses dataset.view for active class', () => {
      expect(html).toContain('t.dataset.view === view');
    });

    it('does not use textContent for view matching', () => {
      expect(html).not.toContain("t.textContent.toLowerCase() === view");
    });
  });

  describe('Simulator course map', () => {
    it('has a courseMapCanvas element', () => {
      expect(html).toContain('id="courseMapCanvas"');
    });

    it('has a course-map-wrap container', () => {
      expect(html).toContain('class="course-map-wrap"');
    });

    it('has renderCourseMap function', () => {
      expect(html).toContain('function renderCourseMap(');
    });

    it('renderCourseMap draws all loop traces', () => {
      const fnStart = html.indexOf('function renderCourseMap(');
      const fnEnd = html.indexOf('\nfunction renderSimTerrain(');
      const fnBlock = html.substring(fnStart, fnEnd);
      expect(fnBlock).toContain("'pink', 'blue', 'checkered'");
    });

    it('renderCourseMap draws runner dot with glow', () => {
      const fnStart = html.indexOf('function renderCourseMap(');
      const fnEnd = html.indexOf('\nfunction renderSimTerrain(');
      const fnBlock = html.substring(fnStart, fnEnd);
      expect(fnBlock).toContain('createRadialGradient');
      expect(fnBlock).toContain('Runner dot');
    });

    it('renderCourseMap draws start marker', () => {
      const fnStart = html.indexOf('function renderCourseMap(');
      const fnEnd = html.indexOf('\nfunction renderSimTerrain(');
      const fnBlock = html.substring(fnStart, fnEnd);
      expect(fnBlock).toContain('Start marker');
      expect(fnBlock).toContain("fillText('S'");
    });

    it('renderCourseMap draws mile markers with collision suppression', () => {
      const fnStart = html.indexOf('function renderCourseMap(');
      const fnEnd = html.indexOf('\nfunction renderSimTerrain(');
      const fnBlock = html.substring(fnStart, fnEnd);
      expect(fnBlock).toContain('Mile markers');
      expect(fnBlock).toContain('priority');
      expect(fnBlock).toContain('collision');
      expect(fnBlock).toContain('placed');
    });

    it('renderSim calls renderCourseMap', () => {
      const fnStart = html.indexOf('function renderSim()');
      const fnEnd = html.indexOf('\nfunction renderLoopTracker(');
      const fnBlock = html.substring(fnStart, fnEnd);
      expect(fnBlock).toContain('renderCourseMap(dist)');
    });

    it('has loopCoordDistances pre-computed for all loops', () => {
      expect(html).toContain('loopCoordDistances');
      expect(html).toContain("loopCoordDistances[id] = dists");
    });

    it('has getSimCoordAtDist helper function', () => {
      expect(html).toContain('function getSimCoordAtDist(');
    });

    it('courseMapCanvas has proper CSS height', () => {
      expect(html).toContain('#courseMapCanvas { width: 100%; height: 260px;');
    });
  });
});
