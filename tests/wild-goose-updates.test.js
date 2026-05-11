// wild-goose-updates.test.js — build-output assertions for the redesigned
// Wild Goose page. The OLD UI (view-tabs, single race-card grid, generic
// loop-toggle row, "S" start marker, Inter font) is gone — the new UI is
// the editorial chrome: dir-race-tabs distance picker, assembly chip
// strip, within-loop cue list, single Squatch HQ aid card, no-aid
// safety strip, and the simulator relocated into its own essentials
// section. These tests fix that contract so we catch regressions.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const html = readFileSync(resolve(__dirname, '../dist/maps/wild-goose/index.html'), 'utf-8');

describe('wild-goose editorial chrome', () => {
  describe('top bar + scope', () => {
    it('renders the editorial top bar', () => {
      expect(html).toContain('class="top-bar"');
      expect(html).toContain('class="race-mark"');
      expect(html).toContain('Wild Goose Trail Festival');
    });
    it('shows the multi-day festival date in the race-day strip', () => {
      expect(html).toContain('Fri-Sun, Sep 18-20, 2026');
    });
    it('points at Sassquad as the host site', () => {
      expect(html).toMatch(/href="https:\/\/www\.sassquadtrailrunning\.com\/wildgoose"/);
    });
    it('shows the run-only scope note', () => {
      expect(html).toContain('class="scope-note"');
      expect(html).toContain('Course only');
    });
  });

  describe('distance picker (dir-race-tabs)', () => {
    it('exposes all six 2026 distances and drops the legacy 30k and "all"', () => {
      // The six loop-based distances. Kids 1M is non-loop and not a tab.
      for (const dist of ['10K', 'Half Marathon', '50K', '50 Miler', '100K', '100 Miler']) {
        expect(html).toContain('>' + dist + '<');
      }
      // Old distances purged
      expect(html).not.toMatch(/data-race="30k"/);
      expect(html).not.toMatch(/data-race="all"/);
    });
    it('default selected tab is the headline distance (50K)', () => {
      expect(html).toMatch(/data-race="50k"[^>]*aria-selected="true"/);
    });
    it('selectRace is wired on each tab', () => {
      expect(html).toMatch(/onclick="selectRace\('10k'\)"/);
      expect(html).toMatch(/onclick="selectRace\('100m'\)"/);
    });
  });

  describe('loop assembly chip strip + within-loop cue list', () => {
    it('renders the assembly strip container', () => {
      expect(html).toContain('id="assemblyStrip"');
      expect(html).toContain('class="assembly-strip"');
    });
    it('renders the currently-viewing indicator', () => {
      expect(html).toContain('id="assemblyNowLabel"');
      expect(html).toContain('class="assembly-now"');
    });
    it('renders the within-loop cue list container', () => {
      expect(html).toContain('id="loopCueList"');
      expect(html).toContain('class="loop-cue-list"');
    });
    it('inlines LOOP_CUES with terrain awareness from the theme', () => {
      expect(html).toContain('LOOP_CUES');
      // A signature phrase from the Pink loop's boardwalk hazard cue
      expect(html).toContain('Trekking poles fold');
    });
  });

  describe('Squatch HQ aid card + no-aid safety strip', () => {
    it('shows the Squatch HQ aid card prominently, NOT as a one-row table', () => {
      expect(html).toContain('class="hq-aid-card"');
      expect(html).toContain('>Squatch HQ<');
      expect(html).toContain("The festival's only aid station");
    });
    it('shows the no-aid-on-course safety strip', () => {
      expect(html).toContain('class="no-aid-strip"');
      expect(html).toContain('No aid on course.');
    });
    it('aid card lists hours, medical, crew, pacers, Jackalope Tent', () => {
      const card = html.slice(html.indexOf('class="hq-aid-card"'), html.indexOf('class="no-aid-strip"'));
      expect(card).toMatch(/Hours/i);
      expect(card).toMatch(/Medical/i);
      expect(card).toMatch(/Crew/i);
      expect(card).toMatch(/Pacers/i);
      expect(card).toMatch(/Jackalope Tent/i);
    });
  });

  describe('type stack (Sassquad: Bangers + Barlow)', () => {
    it('imports Bangers + Barlow + JetBrains Mono', () => {
      expect(html).toContain('family=Bangers');
      expect(html).toContain('family=Barlow');
      expect(html).toContain('family=JetBrains+Mono');
    });
    it('does not import any forbidden fonts', () => {
      expect(html).not.toMatch(/family=Inter[:&]/);
      expect(html).not.toMatch(/family=Roboto[:&]/);
      expect(html).not.toMatch(/family=Space\+Grotesk[:&]/);
      expect(html).not.toMatch(/family=Poppins[:&]/);
      expect(html).not.toMatch(/family=Arial[:&]/);
    });
    it('font-family CSS variables reference the Sassquad-matched display + body stacks', () => {
      expect(html).toContain('--font-display');
      expect(html).toContain("'Bangers'");
      expect(html).toContain("'Barlow'");
    });
  });

  describe('palette (Sassquad-extracted Wix tokens, v4 near-neutral white + dark forest)', () => {
    it('uses near-neutral off-white paper, not pure white or khaki', () => {
      expect(html).toContain('--paper: #fbfaf5');
      expect(html).not.toMatch(/--paper:\s*#fff(?:fff)?(?:;|\s)/i);
      expect(html).not.toContain('--paper: #f4eee0'); // khaki retired
      expect(html).not.toContain('--paper: #faf7ed'); // cream retired
    });
    it('uses Sassquad dark forest (Wix --color_25) as race-brand', () => {
      expect(html).toContain('--race-brand: #353F1E');
      expect(html).not.toContain('--race-brand: #6A7E3D'); // washed olive retired
      expect(html).not.toContain('--race-brand: #4F5F2D'); // mid olive retired
    });
    it('exposes Sassquad chartreuse (Wix --color_22) as accent token', () => {
      expect(html).toContain('--accent-chartreuse: #D4FC79');
    });
    it('uses trail-blaze pink + blue for loops', () => {
      expect(html).toContain('#E7338C'); // pink
      expect(html).toContain('#1E66D0'); // blue
    });
  });

  describe('marker + cue-column + width contracts (v3 design review)', () => {
    it('CSS sizes .hq-marker and .turn-marker to non-zero dimensions', () => {
      expect(html).toMatch(/\.hq-marker\s*\{[^}]*width:\s*32px/);
      expect(html).toMatch(/\.hq-marker\s*\{[^}]*height:\s*32px/);
      expect(html).toMatch(/\.turn-marker\s*\{[^}]*width:\s*24px/);
      expect(html).toMatch(/\.turn-marker\s*\{[^}]*height:\s*24px/);
    });
    it('override.js reorders directions-section to be first in cue column', () => {
      expect(html).toContain('function reorderCueColumn(');
      expect(html).toContain('h1.visually-hidden');
    });
    it('essentials sections cap at 720px max-width', () => {
      expect(html).toMatch(/main\s*>\s*section\.essentials[\s\S]{0,80}max-width:\s*720px/);
    });
  });

  describe('v4 design review contracts', () => {
    it('removes the MapLibre NavigationControl from the main map', () => {
      // The weather radar mini-map keeps its own NavigationControl
      // (different map instance); only the main `map.addControl` call
      // is removed.
      expect(html).not.toMatch(/\bmap\.addControl\s*\(\s*new\s+maplibregl\.NavigationControl/);
    });
    it('implements toggleAid bound to the HQ marker', () => {
      expect(html).toContain('function toggleAid(');
      expect(html).toContain('hqMarker.addTo(map)');
      expect(html).toContain('hqMarker.remove()');
    });
    it('implements toggleStreetview (replaces toggleTurns)', () => {
      expect(html).toContain('function toggleStreetview(');
      // back-compat alias still defined
      expect(html).toContain('function toggleTurns()');
    });
    it('hides the editorial template duplicate map controls', () => {
      expect(html).toMatch(/\.race-wild-goose\s+\.course__map\s*>\s*\.map-controls\s*\{[^}]*display:\s*none/);
    });
    it('sim panel + visual get min-width:0 to stop grid overflow', () => {
      expect(html).toMatch(/\.race-wild-goose\s+\.sim-panel[,\s\S]{0,60}\.race-wild-goose\s+\.sim-visual\s*\{[^}]*min-width:\s*0/);
    });
    it('assembly chips no longer render CW/CCW direction pills', () => {
      expect(html).not.toContain('class="assembly-chip__dir"');
    });
  });

  describe('park trails layer (preserved from prior implementation)', () => {
    it('trail line layer has dashed line-dasharray', () => {
      const layerStart = html.indexOf("id: 'course-trails-line'");
      expect(layerStart).toBeGreaterThan(0);
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
    it('trail line width scales to zoom 20', () => {
      const layerStart = html.indexOf("id: 'course-trails-line'");
      const layerEnd = html.indexOf('});', layerStart);
      const layerBlock = html.substring(layerStart, layerEnd);
      expect(layerBlock).toContain('20, 8');
    });
  });

  describe('3D terrain toggle (preserved)', () => {
    it('has a 3D toggle button', () => {
      expect(html).toContain('id="terrainBtn"');
      expect(html).toContain('toggle3D()');
    });
    it('terrain is not enabled on load', () => {
      const loadStart = html.indexOf("map.on('load'");
      const loadEnd = html.indexOf('function toggle3D');
      const loadBlock = html.substring(loadStart, loadEnd);
      expect(loadBlock).toContain("map.addSource('terrain-dem'");
      expect(loadBlock).not.toContain('map.setTerrain(');
    });
  });

  describe('simulator (behavior preserved; visual reskin)', () => {
    it('still has 1x / 2x / 4x playback speeds (no other rates)', () => {
      expect(html).toMatch(/setSpeed\(1,\s*this\)/);
      expect(html).toMatch(/setSpeed\(2,\s*this\)/);
      expect(html).toMatch(/setSpeed\(4,\s*this\)/);
      expect(html).not.toMatch(/setSpeed\(10,/);
      expect(html).not.toMatch(/setSpeed\(100,/);
    });
    it('has goal-time input + scrub track + loop tracker', () => {
      expect(html).toContain('id="goalHrs"');
      expect(html).toContain('id="goalMins"');
      expect(html).toContain('id="scrubTrack"');
      expect(html).toContain('id="loopTracker"');
    });
    it('has the simulator render functions intact', () => {
      expect(html).toContain('function renderSim(');
      expect(html).toContain('function renderCourseMap(');
      expect(html).toContain('function renderSimTerrain(');
      expect(html).toContain('function renderLoopTracker(');
    });
    it('relocateSimulator moves #simView into an essentials section', () => {
      expect(html).toContain('function relocateSimulator(');
      expect(html).toContain('essentialsSimulator');
    });
  });

  describe('legacy chrome removed', () => {
    it('removes the view-tab switcher (editorial layout has no tabs)', () => {
      expect(html).not.toMatch(/<button[^>]*class="view-tab"/);
      expect(html).not.toMatch(/data-view="map"\s+class="view-tab/);
    });
    it('removes the white-page-default backgrounds', () => {
      expect(html).not.toMatch(/--bg:\s*#ffffff/);
      expect(html).not.toMatch(/--bg-card:\s*#ffffff/);
    });
    it('drops the legacy "Select Race Distance" cards-section header', () => {
      expect(html).not.toMatch(/<h3[^>]*>Select Race Distance<\/h3>/);
    });
  });

  describe('weather placement (per new-map-prompt f6048cf)', () => {
    it('weather panel is staged but hidden in the cue column (relocated at runtime to essentials)', () => {
      // The cueHtml emits the panel inside a <div hidden id="weatherPanelStaging">
      // so override.js can lift it into an essentialsWeather section. The
      // panel must not render as a visible sticky side panel in the cue
      // column the way it did pre-redesign.
      expect(html).toContain('id="weatherPanelStaging"');
      expect(html).toMatch(/<div hidden id="weatherPanelStaging"/);
    });
    it('override.js relocates the weather panel into an essentials section', () => {
      expect(html).toContain('function relocateWeatherPanel(');
      expect(html).toContain('essentialsWeather');
    });
    it('override.js hides the duplicated default aid table', () => {
      expect(html).toContain('function hideDefaultAidTable(');
    });
  });

  describe('footer (editorial studio credit)', () => {
    it('contains the False Summit Studio cartography credit', () => {
      // The editorial template wires the FSS credit through .page-footer
      // and the .studio-credit utility link; the cards-shaped "Race map
      // created by..." footer from the legacy shell is intentionally
      // gone with the editorial chrome.
      expect(html).toContain('Cartography by');
      expect(html).toContain('False Summit Studio');
    });
    it('links to falsesummitstudio.com', () => {
      expect(html).toContain('href="https://falsesummitstudio.com"');
    });
  });
});
