# False Summit Studio — Race Map Page Build Spec

A reusable prompt for building any interactive race map page at `/maps/[slug]/`. Produces consistent quality across the False Summit catalog while letting each race express its own identity.

---

## How to use this prompt

1. Fill out the **Race Profile** (Section A) for the race you're building
2. Paste this entire document — prompt + filled-in profile — into Claude Code
3. If a page already exists at `/maps/[slug]/`, Claude Code refactors it in place; if not, it builds from scratch

## Reference implementations (look at both before designing)

- **`/maps/tupper-lake-tinman/`** — point-to-point pattern (triathlon, run-only scope, multiple aid stations, single continuous route)
- **`/maps/wild-goose/`** — loop-based pattern (trail festival, three named loops, distances assembled from loop sequences, single aid station)

These are the two structural patterns. Every new race is one or the other (or a small variation). Inherit architecture from the closest match.

---

## Step 0 — Load the design skill

If available at `/mnt/skills/public/frontend-design/SKILL.md`, load it. Either way, the rules in Step 10 (Anti-patterns) are the canonical False Summit constraints.

---

## SECTION A — Race Profile (fill this in per race)

```yaml
race:
  slug: ''                          # URL slug, e.g. 'tupper-lake-tinman'

  identity:
    name: ''                        # 'Tupper Lake Tinman'
    shortName: ''                   # 'Tinman' — for nav, mobile, breadcrumbs
    tagline: ''                     # race's own voice, in quotes if a quote
    hostOrg: ''
    hostUrl: ''                     # the race's own site
    establishedYear: null           # optional; for heritage races
    sourceLogoUrl: ''               # for palette extraction

  location:
    region: ''                      # human: 'Adirondack Park, Tupper Lake, NY'
    startLat: 0
    startLng: 0

  dates:
    raceDate: ''                    # ISO 'YYYY-MM-DD'; range allowed for festivals
    isFestival: false               # if true, surface multi-day schedule
    schedule: []                    # for festivals: [{ day, events: [] }]

  scope:                            # CRITICAL — what's mapped, what isn't
    mapped: []                      # ['run'] | ['gravel-route'] | ['swim','bike','run']
    excluded: []                    # things the race has that this page doesn't cover
    scopeNote: ''                   # the user-facing alert, e.g. "Run course only. For swim and bike, see official race site."

  format:
    type: ''                        # 'point-to-point' | 'out-and-back' | 'single-loop' | 'multi-loop-assembly'
    discipline: ''                  # 'road-run' | 'trail-run' | 'gravel' | 'road-cycle' | 'triathlon-run-only' | etc.

  distances: []
    # Point-to-point / single-route example:
    # - id: 'tinman'
    #   label: 'Tinman 13.1 mi'
    #   miles: 13.1
    #   elevationGain: 407
    #   startWindow: '11:30 AM – 12:45 PM'   # window OR single time
    #   startNote: 'after T2'                # optional context
    #   cutoff: null
    #   gpxUrl: ''
    #
    # Multi-loop assembly example:
    # - id: '100m'
    #   label: '100M · 36h'
    #   miles: 100
    #   elevationGain: 11239
    #   cutoff: '36h'
    #   loopSequence:                        # only for multi-loop-assembly
    #     - { loop: 'pink', direction: 'CW' }
    #     - { loop: 'pink', direction: 'CCW' }
    #     # ...
    #   gpxUrl: ''

  loops: []                         # ONLY for loop-based formats
    # - id: 'checkered'
    #   displayName: 'Checkered'
    #   miles: 4.75
    #   elevationGain: 0
    #   color: ''                   # extracted from race brand
    #   visualStyle: 'checkered-pattern'   # 'solid' | 'dashed' | 'checkered-pattern'
    #   surfaceMix: []              # [{ surface: 'singletrack', pct: 60 }, ...]
    #   hazards: []
    #   defaultDirection: 'CW'
    #   gpxUrl: ''

  aidStations:
    layout: ''                      # 'single' | 'multiple'
    stations: []
      # - mile: 1.4
      #   name: 'Park Street'
      #   stocks: ['Water', 'Powerade', 'gels']
      #   cutoff: null
      #   crewAccess: false
    onCourseNote: ''                # for 'single' aid layouts: "No aid on course..."

  brand:                            # extract from host race; do not invent
    primary: ''                     # race's signature color (hex)
    ink: ''                         # near-black text color
    paper: ''                       # warm background, never pure white
    routeColor: ''                  # course line on map
    loopColors: {}                  # optional: { checkered: '...', blue: '...', pink: '...' }

  typography:
    voice: ''                       # 'archival' | 'editorial' | 'field-guide' | 'topographic-technical' | 'trail-party'
    display: ''                     # display font (small wordmark only)
    body: ''                        # workhorse body
    micro: ''                       # mono for distances/times/elevations

  hazards:
    wildlife: []                    # ['black bears', 'snakes']
    technical: []                   # ['rocks', 'roots', 'boardwalks']
    environmental: []               # ['heat exposure', 'no shade', 'lightning risk']

  cartographerNotes:
    paragraphs: []                  # pre-written, OR
    coverTopics: []                 # topics for Claude Code to write from host-race source material

  charityPartner: null              # optional
    # name: ''
    # description: ''
    # donateUrl: ''

  weather:
    enabled: true                   # if false, no weather UI rendered anywhere
    topBarLive: true                # compact current-conditions strip in top bar
    forecastInEssentials: true      # rich forecast block inside race-day essentials
    # Data is fetched at build time from NASA POWER + Open-Meteo (no API keys).
    # Prereq: `dates.raceDate` set AND `location.startLat`/`startLng` populated
    # AND race slug listed in RACE_DATES in scripts/fetch-weather.js.
    # See Step 13.

  options:
    keepSimulator: true
    simulatorBehavior: 'inherit-existing'   # 'inherit-existing' | 'tinman-default'
    embedMode: true
    pocketMap: true
```

The profile is the **contract**. If a field is empty, the corresponding UI element is omitted — don't fabricate values to fill empty fields.

---

## SECTION B — How to build (the prompt itself)

### Step 1 — Audit (if the page already exists)

Before any code, write a 5-bullet honest audit of the current `/maps/[slug]/` page using these lenses:

1. Does the map dominate, or is it buried under typography/chrome?
2. Is the cue sheet co-visible with the map, with active-segment sync?
3. Does the palette match the race's actual brand, or is it invented?
4. Is the scope clear (what's mapped, what isn't)?
5. Is the simulator preserved (if `options.keepSimulator: true`)?

Put the audit in your response before any code.

### Step 2 — Universal architecture (every race map page)

Inherit the Tinman reference implementation. Required elements, top to bottom:

**Top bar (thin)**
- Race wordmark (small, ~24px) with link to host race site
- Race identity strip: "Est. YYYY · Location" if heritage; just location otherwise
- Race-day strip on the right: date · start time · live conditions widget (current temp · short condition · wind, fetched at runtime via `weather-ui.js`; omitted if `race.weather.enabled: false` or `topBarLive: false`) · countdown
- False Summit cartography credit at far edge (~12px caps)
- Embed link · Pocket map link

**Map (the hero)**
- Full content width, ~70vh tall desktop, ~50vh mobile
- **MapLibre GL JS only** — do not substitute Mapbox, Leaflet, Google Maps
- Course route in `brand.routeColor`; loop routes (if loop-based) in their respective `loopColors`
- Aid stations as named pins
- Start/finish clearly distinguished
- No frame, no drop shadow, no "matted gallery" treatment
- Floating overlay controls top-right: distance toggles · aid station visibility · Street View · 3D toggle

**Scope alert (if `scope.scopeNote` is non-empty)**
A small, dignified strip near the top of the cue sheet:
> ▴ {scope.scopeNote} [Host race site →]

**Cue sheet — split-view sticky map**

Desktop:
- Left column ~55%: the map, sticky, stays in view as right column scrolls
- Right column ~45%: scrollable cue sheet
- Hovering a cue highlights its segment on the map and pans/zooms smoothly (~400ms)
- Clicking a cue locks the highlight
- Active cue = the one whose segment is centered in the map; auto-syncs as user scrolls

Mobile:
- Map sticky at top ~45vh
- Cue sheet scrolls below
- Tapping a cue pans the sticky map

**Cue sheet structure branches on `format.type`** (see Step 3 below)

**Elevation profile** — interactive, hover syncs to map location and cue sheet. One profile per distance if multi-distance.

**Aid stations section** (see Step 5 below — branches on `aidStations.layout`)

**Race-day essentials** (see Step 6 below — branches on `dates.isFestival`)

**Cartographer's notes** — see Step 9

**Take-the-map-with-you quad**
- Print PDF cue sheet (foldable, printer-friendly, no map graphic needed)
- GPX / GeoJSON download (per distance)
- Pocket Map (lightweight offline file with optional simulator, elevation, GPS dot)
- Embed snippet modal (see Step 8)

**Charity partner mention** (if `charityPartner` is non-null) — one line, well-typeset, above the FSS footer

**Footer**
> Cartography by [False Summit Studio] · [view other race maps] · [commission a map]
>
> Race information sourced from [hostUrl]. For official rules, registration, and race-day discretion: defer to the host race.

### Step 3 — Cue sheet structure (branches on `format.type`)

**For `point-to-point` / `out-and-back` / `single-loop`:**

Flat turn-by-turn list. Rows show:
- Cumulative distance · turn arrow icon · instruction · segment distance · elevation delta if notable · surface if it changes

Aid stations, water sources, hazards, and surface changes are inline rows in the cue sheet, visually distinguished from turn instructions. Each row is clickable/hoverable to sync the map.

**For `multi-loop-assembly`:**

Two-level structure:

*Level 1 — Distance assembly view (top, always visible when a distance is selected)*

Horizontal chip strip showing loops in order with direction arrows:

```
Your 100K = [Pink CW] → [Pink CCW] → [Blue CW] → [Pink CW] → ... 
Total: ~62 mi · 6,476 ft · cutoff 36h
```

Each chip is clickable. Clicking:
- Highlights that loop trace on the map
- Scrolls Level 2 to that loop
- Updates "Currently viewing: Loop N of M" indicator

*Level 2 — Within-loop cue sheet (below the chip strip)*

For the selected loop, **trail-appropriate cues** — not street-name turn-by-turn:
- Trailhead direction (CW/CCW)
- Notable terrain transitions (singletrack → boardwalk → doublewide)
- Hazard markers (technical descent, bridge transition, exposed roots)
- Water sources on course
- Loop landmarks (lake views, ridge points)

Sample row:
```
[icon] 1.2 mi  Boardwalk crossing — wood plank, narrow,
                 single-file. Trekking poles fold here.
```

**Cardinal rule:** never produce a flat 1,200-row turn-by-turn for an ultra distance. Loop-level + within-loop terrain awareness only.

### Step 4 — Distance toggles on the map

Map overlay control (top-right) shows toggles for the distances in `race.distances[]`. Each toggle:
- Labels with mileage: "Sprint 3.1 mi" not just "Sprint"
- Selecting a distance swaps the cue sheet (point-to-point) OR updates the loop assembly chip strip (multi-loop)
- Default to the longest/flagship distance for the race

If the race has many distances (Wild Goose has 8), group them sensibly — ultra distances grouped, sub-marathon distances grouped, kids separate.

### Step 5 — Aid station section (branches on `aidStations.layout`)

**For `aidStations.layout: 'multiple'`:**

A table with columns:
- Mile · Station name · Stocked items · Cutoff (if any) · Crew access (if any)

For multi-distance races, include a note about pass numbers: which stations each distance hits and how many times.

**For `aidStations.layout: 'single'`:**

A **single-station card** at the top of the aid section. Required content:
- Station name and location
- Open hours
- What's stocked
- Medical coverage / AED / first-aid
- Crew access
- Pacer access (if applicable)
- Quiet space / special accommodations

Then a **prominent strip beneath** the card, styled as a soft warning (unmissable, not alarming):

> ⚠ **No aid on course.** {race.aidStations.onCourseNote}

This is the one place the studio voice can be slightly urgent — it's a real safety consideration. **Do not** render a single-station race as a one-row table; tables imply there are more stations.

### Step 6 — Race-day essentials (branches on `dates.isFestival`)

**For single-day races (`isFestival: false`):**

Order:
1. Start times per distance (window or single time + `startNote` if rolling)
2. Cutoffs by distance (alongside start times: "you have until X" not just "starts at Y")
3. Sunrise/sunset
4. **Weather forecast** (see below — when `race.weather.enabled: true` and `forecastInEssentials: true`)
5. Parking / packet pickup / spectator tips
6. Pacers and crew (if applicable)
7. Park fees / access notes

**For festivals (`isFestival: true`):**

Order:
1. Multi-day schedule overview (Friday programming → Saturday/Sunday waves → awards)
2. Start times per distance (often staggered across days)
3. Cutoffs by distance + average pace required for cutoff (for ultras, surface the math)
4. Sunrise/sunset for each festival day; **headlamp windows** for night running
5. **Weather forecast** (see below)
6. Pacers, crew, camping logistics
7. Park fees / access notes

For any distance over a marathon, surface average pace required to make cutoff. Athletes preparing for these distances want to see that math.

**Weather forecast (subsection within race-day essentials):**

When `race.weather.enabled: true` and weather data has been generated (see Step 13), this block renders inside race-day essentials — full content width, not a sticky side panel. Components, in order:

1. **Risk summary cards** — 4-card grid (heat stress · storm · air quality · wind). Each card: colored `border-top` accent in the risk color, 28×28 tinted icon badge with category SVG (thermometer · lightning · sun · wind), risk-level label, one-line detail. Shadows for depth, not borders. Header splits "Expected Conditions" (muted) from "Race Day {date}" (primary).
2. **Daily averages strip** — horizontal gap-separated rounded cards covering race day ±3 days. Each card: date · high/low temp (slash-separated) · 40px weather icon keyed off precip % · condition label · precip probability. Race day card gets a 2px primary-colored ring and badge.
3. **Current conditions** — live, fetched at runtime via `weather-ui.js`. Hero card with `linear-gradient(135deg, bg-card, bg-alt)` background, 2.4rem temp with separate unit styling, pulsing green "live" dot in section title, 52px WMO icon, feels-like · humidity · wind. Fade-in on load. Re-fetches every 10 minutes.
4. **Radar mini-map** — embedded MapLibre raster map (200px tall, 12px corner radius). Desaturated OSM base (saturation -0.6, brightness 0.65), RainViewer tile overlay at 0.7 opacity, course location red dot, zoom controls, 100px color legend. Shadow-bounded, no border.
5. **Heat stress explainer** — short static text describing what the Heat Stress Index means for runners. Title gets a primary-colored accent bar (`::before` pseudo-element).

Framing rule: every numeric value in this block is a **15-year historical average**, not a forecast or prediction. Headings and copy must make that explicit ("Expected Conditions", "Average for late September", etc.). Current conditions is the one exception — it's live and labeled as such.

### Step 7 — Palette and typography

**Palette extraction (always from the race's actual brand; never invent):**

1. Visit `race.identity.hostUrl` and inspect their logo, hero imagery, and signage
2. Sample colors from the brand assets — do not eyeball
3. Populate `race.brand.primary`, `ink`, `paper`, `routeColor`
4. For loop-based races, sample loop colors from the race's actual trail-blaze conventions

Do not invent "regional" palettes (no "Adirondack lake blue + conifer green" just because the race is in the Adirondacks). The race's identity is the race's brand, not the landscape.

**Typography — voice mapping:**

Five voice registers. The race profile picks one; the prompt picks fonts accordingly.

| voice | display | body | micro | fits |
|---|---|---|---|---|
| **archival** | warm transitional serif (Caponi, GT Sectra, PP Editorial Old, Recoleta) | humanist serif (Source Serif, Spectral, Tinos) | quiet mono (JetBrains Mono, IBM Plex Mono) | heritage events, 30+ year races |
| **editorial** | high-contrast didone / Caslon revival | refined transitional | quiet mono | flagship races, profile pieces |
| **field-guide** | utilitarian slab or workhorse serif | reading serif | mono | trail races in working landscapes |
| **topographic-technical** | geometric mono (Pitch, JetBrains Mono, Space Mono) | lining sans (Söhne, Neue Haas Grotesk) | mono | technical mountain/alpine races |
| **trail-party** | friendly slab or hand-lettering | sturdy sans | mono | community ultras, festival-format |

Source from Pangram Pangram, Klim, Grilli, Production Type, Or Type, or Google Fonts' deeper catalog (Fraunces, DM Serif Display, Crimson Pro, Newsreader, Tinos). **Never** Inter, Roboto, Arial, system-ui, Space Grotesk, or Poppins.

Race wordmark stays small (~24–28px). Drop any temptation to set the race name at hero size; the map is the hero.

### Step 8 — Embed mode and Pocket Map

**Embed mode** — respect `?embed=1` URL param AND `window.self !== window.top` fallback:
- Top race-day strip compacts to one line (date · start time · countdown only)
- Studio credit stays visible in the footer — do NOT remove it; it's how race directors find False Summit
- Footer compacts to one line: "Cartography by False Summit Studio · falsesummitstudio.com"
- Outbound links get `target="_blank"`
- Page background goes transparent so it inherits host site's section background
- Permissive `Content-Security-Policy: frame-ancestors *` and no `X-Frame-Options` restrictions

**Embed snippet modal** — opened from the "EMBED" link in the top bar. Shows copy-paste code and toggleable options:
- Compact (map only)
- Hide simulator
- Dark theme

```html
<iframe src="https://falsesummitstudio.com/maps/{slug}/?embed=1"
        width="100%" height="900" style="border:0;" loading="lazy"
        title="{race name} — Course Map"></iframe>
```

**Pocket Map** — downloadable offline file (lightweight, ~500KB):
- Map snapshot, aid stations, cue sheet
- Optional inclusions: race simulator, elevation profile, GPS tracking dot
- For race-day use on the road or off the grid (no cell service)
- Surfaced in a modal opened from "Pocket map" in the top bar

### Step 9 — Cartographer's notes (the one place studio voice appears in body copy)

Two short paragraphs, ~80–100 words total. The voice is informational, trail-precise, slightly understated — the cartographer telling an athlete what the map can't show on its own.

**If `cartographerNotes.paragraphs` is filled in**, use that copy verbatim.

**If `cartographerNotes.coverTopics` is filled in instead**, draft from the host race's course descriptions, athlete reports, and the topics listed. **Do not invent**. Do not opine on training, fueling, or general athletic advice — that's the host race's job. Stick to what the map can't show: surface mix, technical sections, exposure, terrain hazards, where multi-distance courses diverge, where spectators can see runners more than once.

### Step 10 — Anti-patterns (refuse these)

**Layout / hierarchy:**
- Race name as a 100px+ wordmark hero
- Studio identity prominent at the top
- Map smaller than 60vh on desktop or below the fold
- Tab switcher between "The Map" and supplementary views eating hero space
- Tagline used as a decorative pull-quote
- Frame/matte/gallery treatment around the map

**Palette / typography:**
- Tailwind default neutrals (slate/zinc/gray) + blue-500
- Pure white (#ffffff) backgrounds anywhere
- Inter, Roboto, Arial, system-ui, Space Grotesk, Poppins for any element
- Purple-on-white gradients
- Decorative palette unrelated to the race's actual brand
- Inventing "regional" colors instead of extracting from race brand

**UX:**
- Cue sheet without map co-visible
- Cue sheet auto-panning the map on scroll (only on hover or click)
- Distance shown only in miles or only in km — show both with a persistent toggle
- Critical info (start time, cutoffs) hidden behind tabs
- No print version
- No GPX download
- Map that doesn't work without JavaScript (offer a static fallback)
- Generic icon sets used unmodified (Heroicons, Feather, Lucide)
- Drop shadows under cards
- One-fade-in-per-element scroll animation choreography
- "You might also like" carousel
- Section headers labeled "Race Information," "Course Details," "About"

**Race-format-specific:**
- Single-aid race rendered as a one-row table (use a card + safety strip instead)
- "No aid on course" buried as a footnote
- Multi-loop race with one undifferentiated polyline (use loop colors + names)
- 1,200-row flat turn-by-turn for an ultra distance (use loop-level + within-loop cues)
- T1/T2 transitions rendered when scope is run-only (label "Run Start" instead)

**Voice:**
- Imitating the host race's brand voice in cartographer's notes (use their proper nouns; don't try to write like them)
- Promotional language anywhere on the page (this is an athlete tool, not a sales page)
- Inventing race details the host race didn't publish

**Weather:**
- Weather rendered as a 340px sticky side panel beside the map — that pattern was the pre-redesign default and it competes with the map for hero space. Weather lives in (a) the top-bar live conditions widget and (b) the rich forecast block inside race-day essentials. The map stays full content width.
- Presenting 15-year historical averages as predictions or forecasts. Frame as "expected conditions" / "average for race week"; only the live current-conditions card may be labeled as live.
- Fabricating weather data for races where `race.weather.enabled: false` or `weather.json` has not been generated. If data is missing, omit the UI — never invent placeholder values.
- Treating `weather-ui.js` as a hard dependency. It's gated on `CONFIG.weather`; maps without weather data must render normally.

**Technical:**
- Swapping MapLibre GL JS for Mapbox / Leaflet / Google Maps "because it's easier"
- Modifying simulator behavior when `options.simulatorBehavior: 'inherit-existing'` — reskin only
- Inventing playback speeds — confirm 1x/2x/4x

### Step 11 — Simulator

If `options.keepSimulator: true`:

**For `options.simulatorBehavior: 'inherit-existing'`** (refactoring an existing page):
- Preserve existing simulator behavior entirely
- Update only visual treatment to match the rest of the redesigned page
- Confirm playback speeds at 1x / 2x / 4x; do not invent new rates
- If the simulator has format-specific limitations (e.g., doesn't yet support loop-based playback for a multi-loop race), flag in commit notes as separate follow-up — do not fix here

**For `options.simulatorBehavior: 'tinman-default'`** (new build or full reskin):
- Goal-time input (per distance)
- Pace display
- Mile / elevation / gain / grade / % complete readouts
- Segment progress bar (label clearly if anything is unmodeled, e.g., "Run-segment progress (swim + bike not modeled)")
- Play / pause controls
- Playback speeds: 1x / 2x / 4x

The simulator's purpose: help athletes mentally rehearse pacing, plan crew handoffs, and understand the magnitude of the effort.

### Step 12 — Charity partner mention (if applicable)

If `charityPartner` is non-null, include one line above the FSS footer:

> {race.identity.name} is partnered with **{charityPartner.name}**, {charityPartner.description}. [Donate →]({charityPartner.donateUrl})

Don't dramatize. One line, well-typeset.

### Step 13 — Weather data pipeline

The weather feature is opt-in per race via `race.weather.enabled`. When enabled, it depends on a build-time data fetch and a runtime renderer. The pipeline already exists in the repo — do not rebuild it; wire the new race into it.

**Build-time fetch (one command per race, run once and re-run when stale):**

1. Add the race to `RACE_DATES` in [`scripts/fetch-weather.js`](scripts/fetch-weather.js):
   ```javascript
   const RACE_DATES = {
     'wild-goose': { month: 9, day: 19 },
     'tupper-lake-tinman': { month: 6, day: 28 },
     '<slug>': { month: M, day: D },
   };
   ```
2. Confirm `config.js` exports `mapCenter: [lng, lat]` populated from `race.location.startLng`/`startLat`. The fetch script reads `mapCenter` for the API coordinate.
3. Run `node scripts/fetch-weather.js <slug>`. The script queries NASA POWER (15 years of temp · humidity · wind · solar radiation), Open-Meteo Archive (15 years of precip), and Open-Meteo Air Quality (2 years of US AQI), computes the Stull 2011 wet-bulb heat stress index, derives risk levels, and writes `src/maps/<slug>/data/weather.json`.
4. Inline the data in `src/maps/<slug>/config.js`:
   ```javascript
   const weatherData = fs.existsSync(path.join(__dirname, 'data/weather.json'))
     ? loadJSON('data/weather.json') : null;
   module.exports = { /* ... */ weather: weatherData };
   ```
5. `node build.js` — `buildConfigData()` inlines `CONFIG.weather` into the generated HTML and `buildWeatherHtml()` expands the `{{WEATHER_HTML}}` placeholder in `map-view.html`.

**Runtime renderer:**

`src/shared/weather-ui.js` is an IIFE gated on `CONFIG.weather`. When data is present it renders the five forecast components (Step 6 — risk cards · daily strip · current conditions · radar · explainer). When data is absent it no-ops, so maps without weather render normally. For `skipSharedJs: true` maps (e.g. wild-goose), `build.js` injects `weather-ui.js` separately into the override JS block.

**Risk-level thresholds and colors** (source of truth: `scripts/fetch-weather.js`):

| Metric | Low | Moderate | High | Extreme |
|---|---|---|---|---|
| Heat Stress (°F) | < 65 | 65–73 | 73–82 | > 82 |
| Storm (precip %) | ≤ 20 | 21–40 | > 40 | — |
| Wind (mph) | ≤ 12 | 12–20 | > 20 | — |
| AQI | ≤ 50 | 51–100 | > 100 | — |
| Color | `#4CAF50` | `#F9A825` | `#FF9800` | `#f44336` |

**CSS variable requirement** (carried over from the old layout — still applies because the forecast block uses these tokens):

- `--bg` — page/panel chrome (e.g. `#ffffff` light themes)
- `--bg-card` — card surfaces (e.g. `#ffffff`)
- `--bg-alt` — recessed surfaces (e.g. `#f2f2f2`)

`--bg-card` and `--bg-alt` must be distinct, otherwise the current-conditions gradient collapses.

**weather.json schema** — see "Weather Intelligence Panel" in CLAUDE.md for the full schema. Do not edit `weather.json` by hand; re-run the fetch script if values drift.

**When to re-fetch:** before each commission delivery, and whenever the race date moves. Otherwise the data is stable.

---

## SECTION C — Deliverables

1. The 5-bullet audit (in your response, before code) — only if the page already exists
2. Filled `themes/{slug}.ts` with the race profile turned into config (or, in the current build system, `src/maps/{slug}/config.js`)
3. Refactored or new `<RaceMapPage>` component supporting the race's `format.type`
4. If the race introduces a new format pattern (something neither point-to-point nor multi-loop-assembly covers), propose the architectural addition cleanly rather than forcing a fit
5. When `race.weather.enabled: true`: race added to `RACE_DATES`, `weather.json` generated by `node scripts/fetch-weather.js <slug>`, weather loaded in config, forecast renders inside race-day essentials (not as a side panel), live conditions widget in top bar
6. Working `/maps/{slug}/` route — locally previewable
7. Embed mode tested at `/maps/{slug}/?embed=1`
8. Pocket Map download functional
9. Commit note summarizing: (a) what's inherited from the reference implementations, (b) what's race-specific, (c) any schema additions to the shared `raceTheme` type if needed, (d) weather data refresh date

Make design calls and ship them. When in doubt about a race-specific detail, default to **what the host race already publishes on their site** — they know their race. Use their proper nouns, their stated cutoffs, their language for landmarks.
