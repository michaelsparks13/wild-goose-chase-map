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

WEATHER: After creating the map config, run `node scripts/fetch-weather.js [race-name]`
to generate weather intelligence data. This fetches 15-year historical averages
from NASA POWER and Open-Meteo (no API keys needed) and creates
src/maps/[race-name]/data/weather.json. The weather panel will automatically
appear beside the map on desktop and above it on mobile. It shows:
- Risk summary cards (heat stress, storm, air quality, wind)
- 7-day historical averages for race date ±3 days
- Live current conditions from Open-Meteo
- Radar overlay toggle on the map (via RainViewer)

Prerequisites: config.js must export mapCenter ([lng, lat]) and the race date
must be listed in RACE_DATES in scripts/fetch-weather.js.

After build completion, start the dev server (node dev.js) so I can test.
