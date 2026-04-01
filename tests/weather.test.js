import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const wildGooseHtml = readFileSync(resolve(__dirname, '../dist/maps/wild-goose/index.html'), 'utf-8');
const escarpmentHtml = readFileSync(resolve(__dirname, '../dist/maps/escarpment/index.html'), 'utf-8');

describe('Weather Intelligence', () => {

  describe('Heat Stress Index calculation', () => {
    // Inline the heat stress function for unit testing
    function estimateHeatStress(tempF, rhPct, solarRadWm2, windMph) {
      var tempC = (tempF - 32) * 5 / 9;
      var windMs = windMph * 0.44704;
      var Tw = tempC * Math.atan(0.151977 * Math.sqrt(rhPct + 8.313659))
        + Math.atan(tempC + rhPct) - Math.atan(rhPct - 1.676331)
        + 0.00391838 * Math.pow(rhPct, 1.5) * Math.atan(0.023101 * rhPct) - 4.686035;
      var Tg = 1.01 * tempC + 2.17 * (solarRadWm2 / 1000) - 0.28 * windMs + 3.2;
      var wbgtC = 0.7 * Tw + 0.2 * Tg + 0.1 * tempC;
      return Math.round((wbgtC * 9 / 5 + 32) * 10) / 10;
    }

    function getHeatStressRisk(heatStressF) {
      if (heatStressF < 65) return { risk: 'low', riskColor: '#4CAF50', riskLabel: 'Low' };
      if (heatStressF < 73) return { risk: 'moderate', riskColor: '#F9A825', riskLabel: 'Moderate' };
      if (heatStressF <= 82) return { risk: 'high', riskColor: '#FF9800', riskLabel: 'High' };
      return { risk: 'extreme', riskColor: '#f44336', riskLabel: 'Extreme' };
    }

    it('returns reasonable value for hot humid conditions', () => {
      const hs = estimateHeatStress(90, 80, 500, 5);
      expect(hs).toBeGreaterThan(75);
      expect(hs).toBeLessThan(100);
    });

    it('returns lower value for cool dry conditions', () => {
      const hs = estimateHeatStress(60, 40, 300, 10);
      expect(hs).toBeLessThan(65);
    });

    it('risk level is Low under 65', () => {
      expect(getHeatStressRisk(60)).toEqual({ risk: 'low', riskColor: '#4CAF50', riskLabel: 'Low' });
    });

    it('risk level is Moderate for 65-73', () => {
      expect(getHeatStressRisk(70)).toEqual({ risk: 'moderate', riskColor: '#F9A825', riskLabel: 'Moderate' });
    });

    it('risk level is High for 73-82', () => {
      expect(getHeatStressRisk(78)).toEqual({ risk: 'high', riskColor: '#FF9800', riskLabel: 'High' });
    });

    it('risk level is Extreme over 82', () => {
      expect(getHeatStressRisk(85)).toEqual({ risk: 'extreme', riskColor: '#f44336', riskLabel: 'Extreme' });
    });
  });

  describe('weather.json structure', () => {
    it('weather.json exists for wild-goose', () => {
      const weatherPath = resolve(__dirname, '../src/maps/wild-goose/data/weather.json');
      expect(existsSync(weatherPath)).toBe(true);
    });

    it('has required top-level fields', () => {
      const weather = JSON.parse(readFileSync(resolve(__dirname, '../src/maps/wild-goose/data/weather.json'), 'utf-8'));
      expect(weather.fetchedAt).toBeTruthy();
      expect(weather.raceDate).toBe('2026-09-19');
      expect(weather.dataYears).toBe(15);
      expect(weather.location).toBeTruthy();
      expect(weather.location.lat).toBeGreaterThan(0);
      expect(weather.riskSummary).toBeTruthy();
      expect(weather.heatStress).toBeTruthy();
      expect(weather.heatStress.estimated).toBeGreaterThan(0);
    });

    it('has dailyAverages with 7 entries', () => {
      const weather = JSON.parse(readFileSync(resolve(__dirname, '../src/maps/wild-goose/data/weather.json'), 'utf-8'));
      expect(weather.dailyAverages).toBeInstanceOf(Array);
      expect(weather.dailyAverages).toHaveLength(7);
    });

    it('has exactly one race day entry', () => {
      const weather = JSON.parse(readFileSync(resolve(__dirname, '../src/maps/wild-goose/data/weather.json'), 'utf-8'));
      const raceDays = weather.dailyAverages.filter(d => d.isRaceDay);
      expect(raceDays).toHaveLength(1);
      expect(raceDays[0].date).toBe('2026-09-19');
    });

    it('each daily average has required fields', () => {
      const weather = JSON.parse(readFileSync(resolve(__dirname, '../src/maps/wild-goose/data/weather.json'), 'utf-8'));
      for (const d of weather.dailyAverages) {
        expect(d.date).toBeTruthy();
        expect(d.dayLabel).toBeTruthy();
        expect(typeof d.isRaceDay).toBe('boolean');
        expect(d.temperature.avgHighF).toBeGreaterThan(0);
        expect(d.temperature.avgLowF).toBeGreaterThan(0);
        expect(d.humidity.avgPct).toBeGreaterThan(0);
        expect(typeof d.wind.avgMph).toBe('number');
        expect(typeof d.precipProbPct).toBe('number');
        expect(d.heatStress.estimated).toBeGreaterThan(0);
      }
    });

    it('does NOT contain deprecated fields', () => {
      const weather = JSON.parse(readFileSync(resolve(__dirname, '../src/maps/wild-goose/data/weather.json'), 'utf-8'));
      expect(weather.exposure).toBeUndefined();
      expect(weather.narrative).toBeUndefined();
      expect(weather.wbgt).toBeUndefined();
      expect(weather.historical).toBeUndefined();
    });

    it('uses real data (no estimated source markers)', () => {
      const raw = readFileSync(resolve(__dirname, '../src/maps/wild-goose/data/weather.json'), 'utf-8');
      expect(raw).not.toContain('"source": "estimated"');
    });
  });

  describe('Wild Goose built HTML - weather panel', () => {
    it('contains weather panel', () => {
      expect(wildGooseHtml).toContain('id="weatherPanel"');
    });

    it('contains weather panel header', () => {
      expect(wildGooseHtml).toContain('Weather Intelligence');
    });

    it('contains weather risk cards container', () => {
      expect(wildGooseHtml).toContain('id="weatherRiskCards"');
    });

    it('contains weather daily container', () => {
      expect(wildGooseHtml).toContain('id="weatherDaily"');
    });

    it('contains weather current conditions container', () => {
      expect(wildGooseHtml).toContain('id="weatherCurrent"');
    });

    it('contains map-weather-layout wrapper', () => {
      expect(wildGooseHtml).toContain('class="map-weather-layout"');
    });

    it('contains map-main wrapper', () => {
      expect(wildGooseHtml).toContain('class="map-main"');
    });
  });

  describe('Wild Goose built HTML - weather data and JS', () => {
    it('CONFIG.weather is defined in JS', () => {
      expect(wildGooseHtml).toContain('weather:');
      expect(wildGooseHtml).toContain('"dailyAverages"');
    });

    it('contains runtime weather fetch code', () => {
      expect(wildGooseHtml).toContain('fetchCurrentWeather');
    });

    it('contains radar integration', () => {
      expect(wildGooseHtml).toContain('rainviewer');
    });

    it('contains Heat Stress Index explainer', () => {
      expect(wildGooseHtml).toContain('Heat Stress Index');
    });

    it('does NOT contain WBGT anywhere', () => {
      expect(wildGooseHtml).not.toContain('WBGT');
    });

    it('does NOT contain drawExposureZones', () => {
      expect(wildGooseHtml).not.toContain('drawExposureZones');
    });

    it('does NOT contain exposure legend', () => {
      expect(wildGooseHtml).not.toContain('exposure-legend');
    });

    it('does NOT contain Race Day Weather heading', () => {
      expect(wildGooseHtml).not.toContain('Race Day Weather');
    });
  });

  describe('Escarpment built HTML - no weather (backward compat)', () => {
    it('does not contain weather panel', () => {
      expect(escarpmentHtml).not.toContain('id="weatherPanel"');
    });

    it('does not contain weather risk cards', () => {
      expect(escarpmentHtml).not.toContain('id="weatherRiskCards"');
    });

    it('still contains map-weather-layout wrapper', () => {
      expect(escarpmentHtml).toContain('class="map-weather-layout"');
    });

    it('still contains map-main wrapper', () => {
      expect(escarpmentHtml).toContain('class="map-main"');
    });

    it('weather CSS is included (harmless shared styles)', () => {
      expect(escarpmentHtml).toContain('.weather-panel');
    });

    it('weather-ui.js guard prevents execution', () => {
      expect(escarpmentHtml).toContain('if (typeof CONFIG');
    });
  });

  describe('weather.css - layout rules', () => {
    it('contains side-by-side layout styles', () => {
      expect(wildGooseHtml).toContain('.map-weather-layout');
      expect(wildGooseHtml).toContain('.weather-panel');
    });

    it('contains daily strip styles', () => {
      expect(wildGooseHtml).toContain('.weather-daily-strip');
      expect(wildGooseHtml).toContain('.weather-day-card');
    });

    it('contains current conditions styles', () => {
      expect(wildGooseHtml).toContain('.weather-current-section');
    });

    it('contains risk card styles', () => {
      expect(wildGooseHtml).toContain('.weather-risk-row');
      expect(wildGooseHtml).toContain('.weather-risk-card');
    });
  });
});
