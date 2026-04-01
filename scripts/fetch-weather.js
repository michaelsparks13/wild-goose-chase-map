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
  'wild-goose': { month: 9, day: 19 },
  'escarpment': { month: 7, day: 26 },
  'sleeping-giant': { month: 10, day: 12 },
  'golden-leaf': { month: 9, day: 27 },
  'manitous-revenge': { month: 7, day: 19 },
};
const raceDate = RACE_DATES[slug] || { month: 9, day: 1 };

// --- Heat Stress Index calculation (Stull 2011 wet bulb approximation) ---
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

// --- Stats helpers ---
function avg(arr) { return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0; }
function percentile(arr, p) {
  if (!arr.length) return 0;
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

// --- Date helpers ---
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getTargetDays(raceMonth, raceDay, windowDays) {
  const days = [];
  for (let offset = -windowDays; offset <= windowDays; offset++) {
    const d = new Date(2026, raceMonth - 1, raceDay + offset);
    days.push({
      month: d.getMonth() + 1,
      day: d.getDate(),
      date: `2026-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      dayLabel: DAY_NAMES[d.getDay()],
      isRaceDay: offset === 0,
    });
  }
  return days;
}

function matchesCalendarDay(dateStr, targetMonth, targetDay) {
  const month = parseInt(dateStr.substring(4, 6));
  const day = parseInt(dateStr.substring(6, 8));
  return month === targetMonth && day === targetDay;
}

// --- Main ---
async function main() {
  const windowDays = 3;
  const yearsBack = 15;
  const currentYear = new Date().getFullYear();
  const startYear = currentYear - yearsBack;
  const startDate = `${startYear}0101`;
  const endDate = `${currentYear}1231`;

  const targetDays = getTargetDays(raceDate.month, raceDate.day, windowDays);
  console.log(`Race date: ${raceDate.month}/${raceDate.day}, window: ±${windowDays} days (${targetDays.length} days)`);

  // --- NASA POWER API (historical temp, humidity, wind, solar) ---
  const nasaParams = [
    `start=${startDate}`,
    `end=${endDate}`,
    `latitude=${lat}`,
    `longitude=${lng}`,
    `community=RE`,
    `parameters=T2M_MAX,T2M_MIN,RH2M,WS2M,ALLSKY_SFC_SW_DWN`,
    `format=JSON`,
  ].join('&');

  const nasaUrl = `https://power.larc.nasa.gov/api/temporal/daily/point?${nasaParams}`;
  console.log('Fetching NASA POWER data...');

  const nasaRaw = await httpGet(nasaUrl);
  const nasaData = JSON.parse(nasaRaw);

  if (!nasaData.properties || !nasaData.properties.parameter) {
    console.error('Unexpected NASA API response:', JSON.stringify(nasaData).slice(0, 500));
    process.exit(1);
  }

  const params = nasaData.properties.parameter;

  // --- Open-Meteo Archive API (historical precipitation) ---
  console.log('Fetching Open-Meteo precipitation data...');
  const precipByDay = {};

  // Fetch precipitation for each year individually to get per-calendar-day data
  const firstTarget = targetDays[0];
  const lastTarget = targetDays[targetDays.length - 1];
  const omStartMM = String(firstTarget.month).padStart(2, '0');
  const omStartDD = String(firstTarget.day).padStart(2, '0');
  const omEndMM = String(lastTarget.month).padStart(2, '0');
  const omEndDD = String(lastTarget.day).padStart(2, '0');

  for (let yr = startYear; yr <= currentYear - 1; yr++) {
    const omStart = `${yr}-${omStartMM}-${omStartDD}`;
    const omEnd = `${yr}-${omEndMM}-${omEndDD}`;
    const omUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${omStart}&end_date=${omEnd}&daily=precipitation_sum&timezone=auto`;
    try {
      const omRaw = await httpGet(omUrl);
      const omData = JSON.parse(omRaw);
      if (omData.daily && omData.daily.time) {
        for (let i = 0; i < omData.daily.time.length; i++) {
          const dateStr = omData.daily.time[i]; // YYYY-MM-DD
          const mmdd = dateStr.substring(5); // MM-DD
          if (!precipByDay[mmdd]) precipByDay[mmdd] = [];
          const val = omData.daily.precipitation_sum[i];
          if (val !== null) precipByDay[mmdd].push(val);
        }
      }
    } catch (e) {
      console.warn(`  Precip fetch failed for ${yr}: ${e.message}`);
    }
  }

  // --- Open-Meteo Air Quality API (recent years AQI) ---
  console.log('Fetching Open-Meteo air quality data...');
  const aqiByDay = {};

  // Air quality historical data is limited — fetch last 2 years
  for (let yr = currentYear - 2; yr <= currentYear - 1; yr++) {
    const aqStart = `${yr}-${omStartMM}-${omStartDD}`;
    const aqEnd = `${yr}-${omEndMM}-${omEndDD}`;
    const aqUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&hourly=us_aqi&start_date=${aqStart}&end_date=${aqEnd}&timezone=auto`;
    try {
      const aqRaw = await httpGet(aqUrl);
      const aqData = JSON.parse(aqRaw);
      if (aqData.hourly && aqData.hourly.time) {
        // Group hourly AQI into daily averages
        const dailyAqi = {};
        for (let i = 0; i < aqData.hourly.time.length; i++) {
          const dateStr = aqData.hourly.time[i].substring(0, 10);
          const val = aqData.hourly.us_aqi[i];
          if (val !== null && val !== undefined) {
            if (!dailyAqi[dateStr]) dailyAqi[dateStr] = [];
            dailyAqi[dateStr].push(val);
          }
        }
        for (const [dateStr, values] of Object.entries(dailyAqi)) {
          const mmdd = dateStr.substring(5);
          if (!aqiByDay[mmdd]) aqiByDay[mmdd] = [];
          aqiByDay[mmdd].push(Math.round(avg(values)));
        }
      }
    } catch (e) {
      console.warn(`  AQI fetch failed for ${yr}: ${e.message}`);
    }
  }

  // --- Compute per-day historical averages ---
  console.log('Computing per-day averages...');
  const allDates = Object.keys(params.T2M_MAX);
  const avgSolarGlobal = avg(
    targetDays.flatMap(td =>
      allDates
        .filter(d => matchesCalendarDay(d, td.month, td.day))
        .map(d => params.ALLSKY_SFC_SW_DWN[d])
        .filter(v => v > -999)
    )
  );
  const solarWm2 = avgSolarGlobal * 1000 / 10;

  const dailyAverages = targetDays.map(td => {
    // NASA POWER data for this calendar day across all years
    const dayDates = allDates.filter(d => matchesCalendarDay(d, td.month, td.day));

    const tmax = [], tmin = [], rh = [], wind = [], solar = [];
    for (const d of dayDates) {
      if (params.T2M_MAX[d] > -999) tmax.push(params.T2M_MAX[d] * 9 / 5 + 32);
      if (params.T2M_MIN[d] > -999) tmin.push(params.T2M_MIN[d] * 9 / 5 + 32);
      if (params.RH2M[d] > -999) rh.push(params.RH2M[d]);
      if (params.WS2M[d] > -999) wind.push(params.WS2M[d] * 2.237);
      if (params.ALLSKY_SFC_SW_DWN[d] > -999) solar.push(params.ALLSKY_SFC_SW_DWN[d]);
    }

    const avgHighF = Math.round(avg(tmax));
    const avgLowF = Math.round(avg(tmin));
    const avgRH = Math.round(avg(rh));
    const avgWind = Math.round(avg(wind) * 10) / 10;

    // Precipitation from Open-Meteo
    const mmdd = `${String(td.month).padStart(2, '0')}-${String(td.day).padStart(2, '0')}`;
    const precipValues = precipByDay[mmdd] || [];
    const precipProbPct = precipValues.length
      ? Math.round((precipValues.filter(v => v > 2.54).length / precipValues.length) * 100) // >0.1 inches (2.54mm)
      : 0;

    // AQI from Open-Meteo
    const aqiValues = aqiByDay[mmdd] || [];
    const avgAQI = aqiValues.length ? Math.round(avg(aqiValues)) : null;

    // Heat stress index
    const hs = estimateHeatStress(avgHighF, avgRH, solarWm2, avgWind);
    const hsRisk = getHeatStressRisk(hs);

    return {
      date: td.date,
      dayLabel: td.dayLabel,
      isRaceDay: td.isRaceDay,
      temperature: { avgHighF, avgLowF },
      humidity: { avgPct: avgRH },
      wind: { avgMph: avgWind },
      precipProbPct,
      aqi: avgAQI !== null ? { avgAQI } : null,
      heatStress: { estimated: hs, ...hsRisk },
    };
  });

  // --- Race day summary (for overview risk cards) ---
  const raceDayData = dailyAverages.find(d => d.isRaceDay);

  // Compute aggregate storm risk from precipitation probability
  const avgPrecipProb = Math.round(avg(dailyAverages.map(d => d.precipProbPct)));
  const stormRiskLevel = avgPrecipProb > 40 ? 'high' : avgPrecipProb > 20 ? 'moderate' : 'low';
  const stormRiskLabel = stormRiskLevel === 'high' ? 'High' : stormRiskLevel === 'moderate' ? 'Moderate' : 'Low';
  const stormRiskColor = stormRiskLevel === 'high' ? '#FF9800' : stormRiskLevel === 'moderate' ? '#F9A825' : '#4CAF50';

  // Wind risk
  const windRiskLevel = raceDayData.wind.avgMph > 20 ? 'high' : raceDayData.wind.avgMph > 12 ? 'moderate' : 'low';
  const windRiskLabel = windRiskLevel === 'high' ? 'Strong' : windRiskLevel === 'moderate' ? 'Moderate' : 'Light';
  const windRiskColor = windRiskLevel === 'high' ? '#FF9800' : windRiskLevel === 'moderate' ? '#F9A825' : '#4CAF50';

  // AQI risk
  const raceDayAqi = raceDayData.aqi ? raceDayData.aqi.avgAQI : null;
  const aqiRiskLevel = raceDayAqi === null ? 'unknown' : raceDayAqi > 100 ? 'high' : raceDayAqi > 50 ? 'moderate' : 'low';
  const aqiRiskLabel = raceDayAqi === null ? 'N/A' : aqiRiskLevel === 'high' ? 'Unhealthy' : aqiRiskLevel === 'moderate' ? 'Moderate' : 'Good';
  const aqiRiskColor = aqiRiskLevel === 'high' ? '#FF9800' : aqiRiskLevel === 'moderate' ? '#F9A825' : '#4CAF50';

  const riskSummary = {
    heat: {
      level: raceDayData.heatStress.risk,
      label: raceDayData.heatStress.riskLabel,
      color: raceDayData.heatStress.riskColor,
      detail: `${raceDayData.heatStress.estimated}\u00B0F heat stress`,
    },
    storm: {
      level: stormRiskLevel,
      label: stormRiskLabel,
      color: stormRiskColor,
      detail: `${raceDayData.precipProbPct}% rain chance`,
    },
    air: {
      level: aqiRiskLevel,
      label: aqiRiskLabel,
      color: aqiRiskColor,
      detail: raceDayAqi !== null ? `Avg AQI ${raceDayAqi}` : 'Data limited',
    },
    wind: {
      level: windRiskLevel,
      label: windRiskLabel,
      color: windRiskColor,
      detail: `${raceDayData.wind.avgMph} mph avg`,
    },
  };

  const raceDateStr = `2026-${String(raceDate.month).padStart(2, '0')}-${String(raceDate.day).padStart(2, '0')}`;

  // Build output
  const weather = {
    fetchedAt: new Date().toISOString(),
    raceDate: raceDateStr,
    dataYears: yearsBack,
    location: { lat, lng },
    riskSummary,
    heatStress: {
      estimated: raceDayData.heatStress.estimated,
      risk: raceDayData.heatStress.risk,
      riskColor: raceDayData.heatStress.riskColor,
      riskLabel: raceDayData.heatStress.riskLabel,
    },
    dailyAverages,
  };

  // Write output
  const dataDir = path.join(mapDir, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const outPath = path.join(dataDir, 'weather.json');
  fs.writeFileSync(outPath, JSON.stringify(weather, null, 2));
  console.log(`\nWeather data written to: ${outPath}`);
  console.log(`\nRace Day Summary (${raceDateStr}):`);
  console.log(`  Avg High: ${raceDayData.temperature.avgHighF}\u00B0F | Avg Low: ${raceDayData.temperature.avgLowF}\u00B0F`);
  console.log(`  Humidity: ${raceDayData.humidity.avgPct}%`);
  console.log(`  Wind: ${raceDayData.wind.avgMph} mph`);
  console.log(`  Precip: ${raceDayData.precipProbPct}% chance`);
  console.log(`  AQI: ${raceDayAqi !== null ? raceDayAqi : 'N/A'}`);
  console.log(`  Heat Stress: ${raceDayData.heatStress.estimated}\u00B0F (${raceDayData.heatStress.riskLabel})`);
  console.log(`\nDaily Averages:`);
  dailyAverages.forEach(d => {
    console.log(`  ${d.dayLabel} ${d.date}${d.isRaceDay ? ' [RACE DAY]' : ''}: ${d.temperature.avgHighF}/${d.temperature.avgLowF}\u00B0F, ${d.precipProbPct}% rain, ${d.wind.avgMph}mph`);
  });
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
