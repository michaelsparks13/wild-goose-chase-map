Prompt for New Maps
Save this to start new projects:


Build an interactive race map for: [RACE URL]

Follow the workflow in CLAUDE.md. Create the map in /maps/[race-name]/
and add it to the landing page index.html when complete.

Race type: [road / trail / multi-loop / point-to-point]

GPX available: [Yes / No / Unknown]
If yes, note where: [e.g., "Download button on race page", "Strava route link", etc.]

IMPORTANT: Visit the race organizer's website and match the map's UI to their
branding — colors, fonts, and visual style. The map should look like a natural
extension of their site. Ensure the course line has high contrast against the
basemap — if the brand color is green or similar to terrain, use a dark/black
course line with the brand color as an outer glow (see "Course Line Contrast"
in CLAUDE.md). Trail labels must stay visible at all zoom levels. Add mile
markers to the interactive map using Mapbox-native layers (see "Adding Mile
Markers" in CLAUDE.md). Check the race website for aid station info and add
them if available (see "Adding Aid Stations" in CLAUDE.md).

After build completion, start a local server (npx serve -l 3000) so I can test.
