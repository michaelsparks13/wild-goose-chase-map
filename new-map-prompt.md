Prompt for New Maps
Save this to start new projects:


Build an interactive race map for: [RACE URL]

Follow the workflow in CLAUDE.md. Create the map in src/maps/[race-name]/
using the build system (see "Adding a New Map" in CLAUDE.md).

Race type: [road / trail / multi-loop / point-to-point]

GPX available: [Yes / No / Unknown]
If yes, note where: [e.g., "Download button on race page", "Strava route link", etc.]

IMPORTANT: Visit the race organizer's website and match the map's UI to their
branding — colors, fonts, and visual style. The map should look like a natural
extension of their site. Ensure the course line has high contrast against the
basemap — if the brand color is green or similar to terrain, use a dark/black
course line with the brand color as an outer glow (see "Course Line Contrast"
in CLAUDE.md). Trail labels must stay visible at all zoom levels. Add mile
markers to the interactive map using MapLibre-native layers (see "Adding Mile
Markers" in CLAUDE.md). Check the race website for aid station info and add
them if available (see "Adding Aid Stations" in CLAUDE.md). Check for cutoff
times and add them to both aid station popups and the simulator (see "Adding
Cutoff Times" in CLAUDE.md).

## WEATHER INTELLIGENCE

After creating the map config, generate weather data:

1. Add race date to `RACE_DATES` in `scripts/fetch-weather.js`:
   ```javascript
   const RACE_DATES = {
     'wild-goose': { month: 9, day: 19 },
     'escarpment': { month: 7, day: 26 },
     '[new-race]': { month: M, day: D },
   };
   ```

2. Run `node scripts/fetch-weather.js [race-name]` to generate weather data.
   This fetches 15 years of historical averages from NASA POWER and Open-Meteo
   (no API keys needed) and creates `src/maps/[race-name]/data/weather.json`.

3. Load weather data in config.js:
   ```javascript
   const weatherData = fs.existsSync(path.join(__dirname, 'data/weather.json'))
     ? loadJSON('data/weather.json') : null;
   
   module.exports = {
     // ... other config fields
     weather: weatherData,
   };
   ```

4. Build with `node build.js` — the weather panel automatically appears.

### Prerequisites
- `config.js` must export `mapCenter` as `[lng, lat]` (used for API coordinate queries)
- Race date must be listed in `RACE_DATES` in `scripts/fetch-weather.js`

### What the fetch script does
- Queries **NASA POWER** for 15 years of daily temp, humidity, wind, solar radiation
- Queries **Open-Meteo Archive** for historical daily precipitation
- Queries **Open-Meteo Air Quality** for US AQI (last 2 years)
- Computes **Heat Stress Index** using Stull 2011 wet bulb approximation
- Generates risk summary cards for heat, storm, air quality, wind
- Produces 7-day historical averages (race day ±3 days)
- Writes `src/maps/[race-name]/data/weather.json`

### What the weather panel shows (automatically)
- **Risk summary cards**: Heat Stress, Storm Risk, Air Quality, Wind — each with colored border-top accent, tinted icon badge (thermometer/lightning/sun/wind SVGs), and risk-colored label. Uses shadows for depth, not borders.
- **Daily averages strip**: Scrollable 7-day gap-separated rounded cards with high/low temps, 40px weather icons, precipitation probability; race day highlighted with primary-colored ring
- **Current conditions**: Hero card with gradient background, 2.4rem temperature, pulsing green "live" dot, 52px weather icon. Fade-in animation on load.
- **Radar mini-map**: 200px height, 12px radius, shadow-bounded MapLibre map with desaturated OSM base, RainViewer radar overlay, course location dot, 100px color legend
- **Heat Stress explainer**: What the Heat Stress Index means for runners, with primary-colored accent bar on title

### Layout behavior
- **Desktop (≥ 1024px)**: Side-by-side with map via flex row + 8px gap. Panel is 340px (380px on ≥1440px) with `bg-alt` background. Map container uses `bg-card` background so map/stats/profile sit on a unified white surface distinct from the grey panel and page background.
- **Mobile (< 1024px)**: Panel above map, collapsed by default (tap header to expand). Hero temp drops to 2rem on small screens.
- Maps without weather data render normally — `weather-ui.js` is a no-op when `CONFIG.weather` is absent

### CSS variable requirements
**IMPORTANT:** `--bg`, `--bg-card`, and `--bg-alt` must be three distinct colors:
- `--bg`: page/panel chrome (white `#ffffff` for light themes)
- `--bg-card`: card surfaces, map container, stats, profile (white `#ffffff` for light)
- `--bg-alt`: recessed background, weather panel body, page shell (grey `#f2f2f2` for light)
If `--bg-card` and `--bg-alt` are the same, the white container disappears against the page background.

### weather.json schema
```json
{
  "fetchedAt": "ISO timestamp",
  "raceDate": "YYYY-MM-DD",
  "dataYears": 15,
  "location": { "lat": number, "lng": number },
  "riskSummary": {
    "heat|storm|air|wind": {
      "level": "low|moderate|high|extreme",
      "label": "display label",
      "color": "#hex",
      "detail": "descriptive text"
    }
  },
  "heatStress": {
    "estimated": number,
    "risk": "low|moderate|high|extreme",
    "riskColor": "#hex",
    "riskLabel": "display label"
  },
  "dailyAverages": [
    {
      "date": "YYYY-MM-DD",
      "dayLabel": "Mon",
      "isRaceDay": boolean,
      "temperature": { "avgHighF": number, "avgLowF": number },
      "humidity": { "avgPct": number },
      "wind": { "avgMph": number },
      "precipProbPct": number,
      "aqi": { "avgAQI": number },
      "heatStress": { "estimated": number, "risk": "...", "riskColor": "...", "riskLabel": "..." }
    }
  ]
}
```

### Risk level thresholds
| Metric | Low | Moderate | High | Extreme |
|--------|-----|----------|------|---------|
| Heat Stress (°F) | < 65 | 65–73 | 73–82 | > 82 |
| Color | #4CAF50 | #F9A825 | #FF9800 | #f44336 |
| Storm (precip %) | ≤ 20% | 21–40% | > 40% | — |
| Wind (mph) | ≤ 12 | 12–20 | > 20 | — |
| AQI | ≤ 50 | 51–100 | > 100 | — |

### Verification
After build, confirm:
- Risk cards render with colored border-top accents and tinted icon badges
- Daily strip shows 7 gap-separated rounded cards with race day ring highlight
- Current conditions hero card loads with gradient background, large temp, and pulsing live dot
- Radar mini-map displays with shadow edge (no border), 200px height, course location dot
- Map, stats, profile, and course description sit on a unified white (`bg-card`) surface
- Weather panel has grey (`bg-alt`) background distinct from the white map container
- 8px gap visible between map and weather panel on desktop
- Panel collapses/expands on mobile
- Panel sits side-by-side on desktop
- `npx vitest run` passes weather tests

After build completion, start the dev server (node dev.js) so I can test.
