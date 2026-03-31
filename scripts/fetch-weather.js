#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

// --- CLI argument ---
const slug = process.argv[2];
if (!slug) {
  console.error('Usage: node scripts/fetch-weather.js <map-slug>');
  process.exit(1);
}

const mapDir = path.join(__dirname, '..', 'src', 'maps', slug);
if (!fs.existsSync(mapDir)) {
  console.error(`Map directory not found: ${mapDir}`);
  process.exit(1);
}

// --- Load config to get coordinates and race metadata ---
delete require.cache[require.resolve(path.join(mapDir, 'config.js'))];
const config = require(path.join(mapDir, 'config.js'));

const [lng, lat] = config.mapCenter;
console.log(`Fetching weather for ${config.raceName} at [${lat}, ${lng}]`);

// --- Race date config (per-map overrides) ---
const RACE_DATES = {
  'wild-goose': { month: 9, day: 1 },      // September 1
  'escarpment': { month: 7, day: 26 },      // Late July
  'sleeping-giant': { month: 10, day: 12 }, // Mid October
  'golden-leaf': { month: 9, day: 27 },     // Late September
  'manitous-revenge': { month: 7, day: 19 },// Mid July
};
const raceDate = RACE_DATES[slug] || { month: 9, day: 1 };

// --- Exposure segments (hardcoded per-map, require course knowledge) ---
const EXPOSURE_DATA = {
  'wild-goose': [
    { startMile: 0, endMile: 1.2, type: 'partial', label: 'SQUATCH HQ to trailhead' },
    { startMile: 1.2, endMile: 3.8, type: 'shaded', label: 'Pink Loop forest canopy' },
    { startMile: 3.8, endMile: 5.0, type: 'exposed', label: 'Wawayanda Ridge powerline cut' },
    { startMile: 5.0, endMile: 7.75, type: 'shaded', label: 'Pink Loop return woods' },
    { startMile: 7.75, endMile: 10.5, type: 'shaded', label: 'Blue Loop lakeside trail' },
    { startMile: 10.5, endMile: 11.8, type: 'exposed', label: 'Blue Loop fire road' },
    { startMile: 11.8, endMile: 13.75, type: 'shaded', label: 'Blue Loop return to HQ' },
    { startMile: 13.75, endMile: 15.5, type: 'shaded', label: 'Checkered Loop woods' },
    { startMile: 15.5, endMile: 16.8, type: 'partial', label: 'Checkered Loop meadow' },
    { startMile: 16.8, endMile: 18.5, type: 'shaded', label: 'Checkered Loop return' },
  ],
};

// --- WBGT calculation (Stull 2011 wet bulb approximation) ---
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

// --- Stats helpers ---
function avg(arr) { return arr.reduce((s, v) => s + v, 0) / arr.length; }
function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil(sorted.length * p / 100) - 1;
  return sorted[Math.max(0, idx)];
}

// --- HTTP GET (returns Promise<string>) ---
function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        res.resume();
        return;
      }
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// --- Build date range for ±14 days around race date across multiple years ---
function buildDateRange(raceMonth, raceDay, yearsBack) {
  const currentYear = new Date().getFullYear();
  const startYear = currentYear - yearsBack;
  // NASA POWER wants YYYYMMDD format, single continuous range
  const startDate = `${startYear}0101`;
  const endDate = `${currentYear}1231`;
  return { startDate, endDate, startYear, currentYear };
}

function isInWindow(dateStr, raceMonth, raceDay, windowDays) {
  // dateStr format: YYYYMMDD
  const month = parseInt(dateStr.substring(4, 6));
  const day = parseInt(dateStr.substring(6, 8));
  // Simple day-of-year comparison
  const raceDoy = raceMonth * 30.44 + raceDay;
  const dateDoy = month * 30.44 + day;
  return Math.abs(dateDoy - raceDoy) <= windowDays;
}

// --- Main ---
async function main() {
  const windowDays = 14;
  const yearsBack = 15;
  const { startDate, endDate, startYear, currentYear } = buildDateRange(raceDate.month, raceDate.day, yearsBack);

  const params = [
    `start=${startDate}`,
    `end=${endDate}`,
    `latitude=${lat}`,
    `longitude=${lng}`,
    `community=RE`,
    `parameters=T2M_MAX,T2M_MIN,RH2M,WS2M,ALLSKY_SFC_SW_DWN`,
    `format=JSON`,
  ].join('&');

  const url = `https://power.larc.nasa.gov/api/temporal/daily/point?${params}`;
  console.log('Fetching NASA POWER data...');
  console.log(`Date range: ${startDate} to ${endDate}`);

  const raw = await httpGet(url);
  const data = JSON.parse(raw);

  if (!data.properties || !data.properties.parameter) {
    console.error('Unexpected API response:', JSON.stringify(data).slice(0, 500));
    process.exit(1);
  }

  const parameters = data.properties.parameter;

  // Filter to ±14 day window around race date across all years
  const dates = Object.keys(parameters.T2M_MAX).filter(d => isInWindow(d, raceDate.month, raceDate.day, windowDays));
  console.log(`Found ${dates.length} data points within ±${windowDays} day window`);

  // Collect valid values (NASA POWER uses -999 for missing)
  const tmax = [], tmin = [], rh = [], wind = [], solar = [];
  for (const d of dates) {
    const tmaxC = parameters.T2M_MAX[d];
    const tminC = parameters.T2M_MIN[d];
    const rhVal = parameters.RH2M[d];
    const windVal = parameters.WS2M[d];
    const solarVal = parameters.ALLSKY_SFC_SW_DWN[d];

    if (tmaxC > -999) tmax.push(tmaxC * 9 / 5 + 32);  // C to F
    if (tminC > -999) tmin.push(tminC * 9 / 5 + 32);
    if (rhVal > -999) rh.push(rhVal);
    if (windVal > -999) wind.push(windVal * 2.237);     // m/s to mph
    if (solarVal > -999) solar.push(solarVal);          // kWh/m²/day
  }

  console.log(`Valid data points: temp=${tmax.length}, humidity=${rh.length}, wind=${wind.length}, solar=${solar.length}`);

  // Compute statistics
  const avgHighF = Math.round(avg(tmax));
  const avgLowF = Math.round(avg(tmin));
  const recordHighF = Math.round(Math.max(...tmax));
  const p90HighF = Math.round(percentile(tmax, 90));
  const avgRH = Math.round(avg(rh));
  const p90RH = Math.round(percentile(rh, 90));
  const avgWind = Math.round(avg(wind) * 10) / 10;
  const p90Wind = Math.round(percentile(wind, 90) * 10) / 10;
  const avgSolar = Math.round(avg(solar) * 10) / 10;

  // Convert solar from kWh/m²/day to W/m² (average over daylight hours ~10h)
  const solarWm2 = avgSolar * 1000 / 10;

  // WBGT
  const wbgtAvg = estimateWBGT(avgHighF, avgRH, solarWm2, avgWind);
  const wbgtP90 = estimateWBGT(p90HighF, p90RH, solarWm2 * 1.15, avgWind * 0.5);
  const wbgtRisk = getWBGTRisk(wbgtAvg);

  // Precipitation probability estimate (from humidity + solar patterns)
  const highHumidityDays = rh.filter(v => v > 85).length;
  const precipProbPct = Math.round((highHumidityDays / rh.length) * 100);

  // Date window label
  const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const windowStart = new Date(2024, raceDate.month - 1, raceDate.day - windowDays);
  const windowEnd = new Date(2024, raceDate.month - 1, raceDate.day + windowDays);
  const dateWindow = `${monthNames[windowStart.getMonth() + 1]} ${windowStart.getDate()} – ${monthNames[windowEnd.getMonth() + 1]} ${windowEnd.getDate()}`;
  const raceDateStr = `2026-${String(raceDate.month).padStart(2, '0')}-${String(raceDate.day).padStart(2, '0')}`;

  // Storm and AQI estimates (Phase 3 will add real data)
  const storms = {
    thunderstormDaysPerMonth: 3.8,
    lightningEventsPerYear: 1.5,
    flashFloodEventsPerYear: 0.2,
    source: 'estimated',
  };
  const aqi = {
    avgAQI: 38,
    p90AQI: 72,
    smokeRiskPct: 10,
    source: 'estimated',
  };

  // Risk summary
  const windRiskLevel = p90Wind > 20 ? 'high' : p90Wind > 12 ? 'moderate' : 'low';
  const windRiskLabel = windRiskLevel === 'high' ? 'Strong' : windRiskLevel === 'moderate' ? 'Moderate' : 'Light';
  const windRiskColor = windRiskLevel === 'high' ? '#FF9800' : windRiskLevel === 'moderate' ? '#F9A825' : '#4CAF50';

  const riskSummary = {
    heat: { level: wbgtRisk.risk, label: wbgtRisk.riskLabel, color: wbgtRisk.riskColor, detail: `WBGT ${wbgtAvg}\u00B0F` },
    storm: { level: 'low', label: 'Low', color: '#4CAF50', detail: `${storms.thunderstormDaysPerMonth} days/mo` },
    air: { level: 'low', label: 'Good', color: '#4CAF50', detail: `Avg AQI ${aqi.avgAQI}` },
    wind: { level: windRiskLevel, label: windRiskLabel, color: windRiskColor, detail: `${avgWind}\u2013${p90Wind} mph` },
  };

  // Generate narrative
  const seasonLabel = raceDate.month >= 6 && raceDate.month <= 8 ? 'summer'
    : raceDate.month >= 9 && raceDate.month <= 11 ? 'fall' : 'spring';
  const monthLabel = monthNames[raceDate.month];

  const exposureSegments = EXPOSURE_DATA[slug] || [];
  const exposedMiles = exposureSegments
    .filter(s => s.type === 'exposed')
    .reduce((sum, s) => sum + (s.endMile - s.startMile), 0);
  const exposedLabels = exposureSegments
    .filter(s => s.type === 'exposed')
    .map(s => s.label);

  let narrative = `Expect highs around ${avgHighF}\u00B0F (90th percentile: ${p90HighF}\u00B0F) with `;
  narrative += avgRH > 65 ? `elevated humidity (${avgRH}%)` : `moderate humidity (${avgRH}%)`;
  narrative += ` typical of late-${seasonLabel} ${config.mapCenter[1] > 40 ? 'NJ' : 'the region'}. `;

  if (wbgtRisk.risk === 'high' || wbgtRisk.risk === 'extreme') {
    narrative += `WBGT heat risk is ${wbgtRisk.riskLabel.toLowerCase()} at ${wbgtAvg}\u00B0F \u2014 the combination of warmth and humidity demands proactive hydration and cooling. `;
  } else if (wbgtRisk.risk === 'moderate') {
    narrative += `WBGT heat risk is moderate at ${wbgtAvg}\u00B0F \u2014 stay on top of hydration. `;
  }

  if (exposedMiles > 0) {
    narrative += `Most of the course runs through dense forest canopy, but ${exposedLabels.join(' and ')} (${exposedMiles.toFixed(1)} mi exposed) will feel significantly hotter. `;
  }

  narrative += `Thunderstorm probability is moderate with ${storms.thunderstormDaysPerMonth} storm days per month historically \u2014 carry a lightweight rain layer. `;
  narrative += `Air quality is historically good (avg AQI ${aqi.avgAQI}) with ${aqi.smokeRiskPct}% chance of elevated smoke. `;
  narrative += `Wind is generally ${windRiskLabel.toLowerCase()} (${avgWind} mph avg) with the forest providing shelter on most sections.`;

  // Build output
  const weather = {
    fetchedAt: new Date().toISOString(),
    raceDate: raceDateStr,
    dateWindow,
    dataYears: yearsBack,
    nearestStation: {
      name: 'NASA POWER grid point',
      distanceMi: 0,
    },
    historical: {
      temperature: { avgHighF, avgLowF, recordHighF, p90HighF },
      humidity: { avgPct: avgRH, p90Pct: p90RH },
      precipitation: {
        probPct: precipProbPct,
        avgInches: 0.16,
        p90Inches: 0.90,
        source: 'estimated',
      },
      wind: { avgMph: avgWind, p90Mph: p90Wind },
      solarRadiation: { avgKwhM2Day: avgSolar },
    },
    wbgt: {
      estimated: wbgtAvg,
      p90: wbgtP90,
      ...wbgtRisk,
    },
    storms,
    aqi,
    exposure: exposureSegments,
    riskSummary,
    narrative,
  };

  // Write output
  const outPath = path.join(mapDir, 'data', 'weather.json');
  fs.writeFileSync(outPath, JSON.stringify(weather, null, 2));
  console.log(`\nWeather data written to: ${outPath}`);
  console.log(`\nSummary:`);
  console.log(`  Avg High: ${avgHighF}°F | Avg Low: ${avgLowF}°F | Record: ${recordHighF}°F`);
  console.log(`  Humidity: ${avgRH}% avg | ${p90RH}% p90`);
  console.log(`  Wind: ${avgWind} mph avg | ${p90Wind} mph p90`);
  console.log(`  Solar: ${avgSolar} kWh/m²/day`);
  console.log(`  WBGT: ${wbgtAvg}°F (${wbgtRisk.riskLabel}) | p90: ${wbgtP90}°F`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
