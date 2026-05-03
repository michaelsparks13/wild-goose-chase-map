# `src/themes/` — per-race editorial themes

Every race map page on falsesummitstudio.com is composed of two layers:

1. **The interactive map**, defined in `src/maps/<slug>/config.js` (course
   data, course colors, simulator wiring, weather panel).
2. **The editorial chrome around it** — masthead, course data strip, field
   notes, acquisition shelf, contact sheet, colophon — defined here.

The schema is `race-theme.ts`. Each concrete theme is a CommonJS module
that mirrors that interface 1:1 (the build is zero-deps Node, no TS step).

## Adding the next race in three moves

1. **Drop a theme file**: `src/themes/<slug>.js`. Copy
   `tupper-lake-tinman.js` and edit it down. Things to set:
   - `slug` (must match the `src/maps/<slug>/` directory)
   - `voice` — one of `archival | field-guide | editorial | topographic-technical | trail-party`
   - `heroTreatment` — `gallery-frame` for heritage events,
     `unfurl` for point-to-point, `split-with-elevation` for alpine,
     `parallax-portfolio` for portfolio pieces
   - `texture` — `paper-grain | topo-lines | aerial-noise | clean`
   - `palette.{paper,ink,accent,warm,cool}` — pull these from the map
     itself, not from the organiser's website. None may be `#ffffff`.
   - `type.{display,body,micro}` + `googleFontsHref` — pick fonts that
     match `voice`. Forbidden: Inter, Roboto, Arial, Space Grotesk,
     Poppins, system-ui defaults. The schema test will fail if you use
     them.
   - `courseData[]` — 6–10 entries. Mono labels, serif numerals.
   - `disciplines[]` — only for triathlons / multi-discipline events.
   - `fieldNotes` — 2–3 sentences in the studio's voice. What made *this*
     map a specific job? The hard call, the unusual constraint.
   - `acquisition.{print,digital,commission}` — omit any block that
     doesn't apply.
   - `crossLinks[]` — 3 to 5 other built map slugs.
   - `wordmark` — only if the race has its own short tagline; treated
     typographically, not as a CTA.
   - `mapCaption` — museum-plate caption beneath the map.

2. **Wire the theme into the map config**:
   ```js
   // src/maps/<slug>/config.js
   const theme = require('../../themes/<slug>.js');
   module.exports = {
     slug: theme.slug,
     theme,
     // ... existing config (mapCenter, courseCoords, mapViewHtml, etc.)
   };
   ```
   When `config.theme` is set, `build.js` automatically:
   - swaps `shell.html` for `race-shell.html` (the editorial template)
   - injects the theme's CSS variables (`--paper`, `--ink`, `--accent`,
     `--warm`, `--cool`, `--font-display`, `--font-body`, `--font-micro`)
     onto `:root`
   - links the Google Fonts URL from `theme.type.googleFontsHref`
   - loads `editorial.css` after the legacy chrome CSS so it overrides
   - renders the masthead, course strip, field notes, acquisition shelf,
     contact sheet, and colophon from theme content

3. **Run `node build.js` and add tests.** The schema test
   (`tests/editorial-theme.test.js`) hard-codes the Tinman fixture; copy
   the assertions into a new `tests/<slug>-theme.test.js` and the e2e
   block into `tests/<slug>.e2e.js`.

## What you get for free

- A studio-mark / utility nav (Pocket Map, Embed, Commission)
- A masthead with optional `<em>`-accented proper noun and italic wordmark
- The map gallery-framed with corner brackets and a museum plate caption
- A typographic disciplines triptych (when `disciplines[]` is set)
- A 4-column course data strip (mono labels, serif numerals)
- Drop-cap field notes in the studio's voice
- Print / digital / commission acquisition shelf
- Numbered contact-sheet of related maps
- Colophon naming the type stack the page was set in

## What you must NOT do

- Add new "About" / "Course Details" / "Race Information" headers; the
  brief forbids them and the editorial test will fail.
- Use `#ffffff` in any palette token; the page substrate is paper.
- Set the gallery-frame border-radius above 8 px or shadow-stack the map.
- Pick Inter, Roboto, Arial, Space Grotesk, or Poppins. The schema test
  blocks all five.
- Render the map smaller than 800 px wide on desktop. The e2e test
  enforces this.

## Voice → font direction

| voice | display flavor | body flavor | fits |
|---|---|---|---|
| `archival` | warm transitional serif (Fraunces, Recoleta, GT Sectra, PP Editorial Old) | humanist serif (Spectral, Source Serif, Tinos) | heritage events, 30+ year races |
| `field-guide` | utilitarian slab or workhorse serif | reading serif | trail races in working landscapes |
| `editorial` | high-contrast didone or Caslon revival | refined transitional | flagship races, profile pieces |
| `topographic-technical` | geometric mono (Pitch, JetBrains Mono, Space Mono) | lining sans (Söhne, Neue Haas Grotesk) | technical mountain / alpine |
| `trail-party` | friendly slab or hand-lettering | sturdy sans | community ultras, festival format |

Tupper Lake Tinman is the worked example for `archival`. Read its theme
(`tupper-lake-tinman.js`) before doing the next one.
