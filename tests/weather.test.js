import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const wildGooseHtml = readFileSync(resolve(__dirname, '../dist/maps/wild-goose/index.html'), 'utf-8');
const escarpmentHtml = readFileSync(resolve(__dirname, '../dist/maps/escarpment/index.html'), 'utf-8');

describe('Weather Intelligence', () => {

  describe('WBGT calculation', () => {
    // Inline the WBGT function for unit testing
    function estimateWBGT(tempF, rhPct, solarRadWm2, windMph) {
      var tempC = (tempF - 32) * 5 / 9;
      var windMs = windMph * 0.44704;
      var Tw = tempC * Math.atan(0.151977 * Math.sqrt(rhPct + 8.313659))
        + Math.atan(tempC + rhPct) - Math.atan(rhPct - 1.676331)
        + 0.00391838 * Math.pow(rhPct, 1.5) * Math.atan(0.023101 * rhPct) - 4.686035;
      var Tg = 1.01 * tempC + 2.17 * (solarRadWm2 / 1000) - 0.28 * windMs + 3.2;
      var wbgtC = 0.7 * Tw + 0.2 * Tg + 0.1 * tempC;
      return Math.round((wbgtC * 9 / 5 + 32) * 10) / 10;
    }

    function getWBGTRisk(wbgtF) {
      if (wbgtF < 65) return { risk: 'low', riskColor: '#4CAF50', riskLabel: 'Low' };
      if (wbgtF < 73) return { risk: 'moderate', riskColor: '#F9A825', riskLabel: 'Moderate' };
      if (wbgtF <= 82) return { risk: 'high', riskColor: '#FF9800', riskLabel: 'High' };
      return { risk: 'extreme', riskColor: '#f44336', riskLabel: 'Extreme' };
    }

    it('returns reasonable WBGT for hot humid conditions', () => {
      const wbgt = estimateWBGT(90, 80, 500, 5);
      expect(wbgt).toBeGreaterThan(75);
      expect(wbgt).toBeLessThan(100);
    });

    it('returns lower WBGT for cool dry conditions', () => {
      const wbgt = estimateWBGT(60, 40, 300, 10);
      expect(wbgt).toBeLessThan(65);
    });

    it('risk level is Low for WBGT under 65', () => {
      expect(getWBGTRisk(60)).toEqual({ risk: 'low', riskColor: '#4CAF50', riskLabel: 'Low' });
    });

    it('risk level is Moderate for WBGT 65-73', () => {
      expect(getWBGTRisk(70)).toEqual({ risk: 'moderate', riskColor: '#F9A825', riskLabel: 'Moderate' });
    });

    it('risk level is High for WBGT 73-82', () => {
      expect(getWBGTRisk(78)).toEqual({ risk: 'high', riskColor: '#FF9800', riskLabel: 'High' });
    });

    it('risk level is Extreme for WBGT over 82', () => {
      expect(getWBGTRisk(85)).toEqual({ risk: 'extreme', riskColor: '#f44336', riskLabel: 'Extreme' });
    });
  });

  describe('weather.json generation', () => {
    it('weather.json exists for wild-goose', () => {
      const weatherPath = resolve(__dirname, '../src/maps/wild-goose/data/weather.json');
      expect(existsSync(weatherPath)).toBe(true);
    });

    it('weather.json has required fields', () => {
      const weather = JSON.parse(readFileSync(resolve(__dirname, '../src/maps/wild-goose/data/weather.json'), 'utf-8'));
      expect(weather.fetchedAt).toBeTruthy();
      expect(weather.raceDate).toBe('2026-09-01');
      expect(weather.historical).toBeTruthy();
      expect(weather.historical.temperature.avgHighF).toBeGreaterThan(0);
      expect(weather.wbgt).toBeTruthy();
      expect(weather.wbgt.estimated).toBeGreaterThan(0);
      expect(weather.riskSummary).toBeTruthy();
      expect(weather.exposure).toBeInstanceOf(Array);
      expect(weather.exposure.length).toBeGreaterThan(0);
      expect(weather.narrative).toBeTruthy();
    });
  });

  describe('Wild Goose built HTML - weather cards', () => {
    it('contains weather section HTML', () => {
      expect(wildGooseHtml).toContain('class="weather-section"');
    });

    it('contains 4 weather cards', () => {
      const cardMatches = wildGooseHtml.match(/class="weather-card"/g);
      expect(cardMatches).toHaveLength(4);
    });

    it('contains Heat Risk card', () => {
      expect(wildGooseHtml).toContain('Heat Risk');
    });

    it('contains Storm Risk card', () => {
      expect(wildGooseHtml).toContain('Storm Risk');
    });

    it('contains Air Quality card', () => {
      expect(wildGooseHtml).toContain('Air Quality');
    });

    it('contains Wind card', () => {
      expect(wildGooseHtml).toContain('>Wind</div>');
    });

    it('contains risk dots with color styling', () => {
      expect(wildGooseHtml).toContain('class="risk-dot"');
    });
  });

  describe('Wild Goose built HTML - weather data inlined', () => {
    it('CONFIG.weather is defined in JS', () => {
      expect(wildGooseHtml).toContain('CONFIG = { weather:');
    });

    it('drawExposureZones function is present', () => {
      expect(wildGooseHtml).toContain('function drawExposureZones');
    });

    it('exposure zones call is in override.js profile drawing', () => {
      expect(wildGooseHtml).toContain('drawExposureZones(ctx, expPad');
    });
  });

  describe('Wild Goose built HTML - exposure legend', () => {
    it('contains exposure legend', () => {
      expect(wildGooseHtml).toContain('class="exposure-legend"');
    });

    it('legend has Exposed, Partial, and Shaded labels', () => {
      expect(wildGooseHtml).toContain('Exposed');
      expect(wildGooseHtml).toContain('Partial');
      expect(wildGooseHtml).toContain('Shaded');
    });
  });

  describe('Wild Goose built HTML - weather narrative', () => {
    it('contains weather narrative section', () => {
      expect(wildGooseHtml).toContain('class="weather-narrative"');
    });

    it('narrative mentions WBGT', () => {
      expect(wildGooseHtml).toContain('WBGT');
    });

    it('narrative is within a Race Day Weather heading', () => {
      expect(wildGooseHtml).toContain('Race Day Weather');
    });
  });

  describe('Escarpment built HTML - no weather (backward compat)', () => {
    it('does not contain weather section HTML', () => {
      expect(escarpmentHtml).not.toContain('class="weather-section"');
    });

    it('does not contain weather card elements', () => {
      expect(escarpmentHtml).not.toMatch(/<div class="weather-card"/);
    });

    it('does not contain weather narrative', () => {
      expect(escarpmentHtml).not.toContain('class="weather-narrative"');
    });

    it('weather CSS is included (harmless shared styles)', () => {
      expect(escarpmentHtml).toContain('.weather-card');
    });
  });

  describe('weather.css inclusion', () => {
    it('weather card styles are in Wild Goose build', () => {
      expect(wildGooseHtml).toContain('.weather-grid');
      expect(wildGooseHtml).toContain('.weather-card .risk-dot');
    });

    it('exposure legend styles are in Wild Goose build', () => {
      expect(wildGooseHtml).toContain('.exposure-legend');
      expect(wildGooseHtml).toContain('.swatch-exposed');
    });
  });
});
