// pocantico-hills.js — RaceTheme for the Pocantico Hills Marathon &
// Half Marathon, the 26.2/13.1-mi single-loop foot races held on the
// carriage roads of Rockefeller State Park Preserve, Sleepy Hollow, NY.
// Saturday, November 7, 2026.
//
// Two distances (Marathon 26.2 mi, Half Marathon 13.1 mi). Each is its
// own complete loop GPX — no shared spine assembly, like Gran Fondo
// Badlands. They share start/finish at Rockwood Hall and a nested aid
// spine; the Marathon hits all 8 stations, the Half hits 4.
//
// Palette extracted from pocanticohillsmarathon.com via Playwright MCP
// (the host runs on the7 / WordPress, not Wix — so the7's `--the7-*`
// design tokens were the canonical source). Race-day uniforms aside,
// the brand IS ochre + deep olive + cream substrate: `#c19434` is the
// "Register Now" button, `#34421e` is the menu / footer / page-title
// color, and `#f7f7f7` is the body background. Display copy is
// Noticia Text uppercase; body is Lato 400/700. Both fonts are
// free Google Fonts, no analog substitution needed.
//
// Voice register is `archival` — the course runs past the foundations
// of the William Rockefeller mansion at Rockwood Hall, across the
// carriage roads John D. Rockefeller Jr. laid out in the 1890s-1910s,
// and beside historic stone walls, sparkling rivers, and lakes.
// History + landscape, told plainly. No promotional language.

// Stocked-items strings are kept generic ("full spread"); the host
// race's full aid list (broth, boiled potatoes, salt, brined snacks,
// PB&J, fruit, chips, candy, electrolyte, Coke) lives in editorial
// copy below.

module.exports = {
  slug: 'pocantico-hills',

  identity: {
    name: 'Pocantico Hills Marathon & Half Marathon',
    shortName: 'Pocantico Hills',
    hostOrg: 'Run Wild, Inc.',
    hostUrl: 'https://pocanticohillsmarathon.com/',
    // The race has been held annually since the early 2010s under Run
    // Wild's stewardship; the host site doesn't publish a definitive
    // first-year, so leave the heritage line off the top bar.
    establishedYear: null,
  },

  // Sampled from pocanticohillsmarathon.com (the7 design tokens).
  // Ochre is the race's signature CTA + accent. Deep olive is the
  // display ink — Rockefeller estate forest at the November race
  // date. Cream is the page substrate (warmer than #fff). Warm grey
  // is body. A muted spring-green accent appears only as a thin
  // underline in the host footer — used sparingly here for the same
  // role (HQ-badge dot, "currently viewing" tag).
  palette: {
    raceBrand:    '#c19434', // ochre — signature CTA, course line, mile-marker stroke
    raceInk:      '#34421e', // deep olive — display copy + chrome
    paper:        '#f7f7f7', // cream page bg (the7 body color)
    paperCard:    '#ffffff', // pure white card surfaces — the7 page bg
    surfaceWarm:  '#ede5d1', // recessed substrate, warmer than paper
    routeColor:   '#34421e', // course line ink (deep olive on cream — high contrast, archival)
    aidStation:   '#b08025', // warmer ochre tint — aid markers + table accent
    hazard:       '#a23b1a', // burnt umber — cutoff strip, no-aid warnings
    accent:       '#7f9c3e', // muted spring green — taken from the host footer outline; quiet pop for active states
    sageQuiet:    '#5f5d57', // warm taupe-grey — the7 base text color, hits WCAG AA against paper + paperCard
    bone:         '#e6dfca', // cream-bone — chip rests, callouts

    // Header-bar accent — a softer wheat that contrasts the dark
    // olive top bar without competing with the ochre primary CTA.
    headerAccent: '#e8c976',

    // Per-distance loop colors — matched to the host's printed static
    // course map (Marathon-Route cloth draft): the marathon route is
    // red, the half-marathon route is yellow. Tuned from the static
    // map's pure #ff0000 / #ffff00 to hold contrast on the cream
    // substrate, the light elevation profile, and chip labels.
    loopMarathon:     '#E4151B', // route red — marathon
    loopHalfMarathon: '#F5C400', // golden yellow — half marathon
  },

  type: {
    // Display: Noticia Text — the host's H1/H2/H3 font. Slab serif
    // with literary warmth, ships free on Google Fonts. Uppercase
    // tracking by default on the host; mirrored here.
    display: 'Noticia Text',
    // Script slot is reused for the editorial-italic flourish in
    // section eyebrows ("Run through history"). Crimson Pro italic
    // is a free Google font with the right transitional warmth.
    script:  'Crimson Pro',
    // Body: Lato — the host's base font, free Google Fonts,
    // humanist sans, holds at body sizes for aid table + cue list.
    body:    'Lato',
    // Micro: JetBrains Mono — quiet mono for distance/time chips.
    // Consistent with Gran Fondo Badlands + Tinman.
    micro:   'JetBrains Mono',
    googleFontsHref:
      'https://fonts.googleapis.com/css2?' +
      'family=Noticia+Text:wght@400;700&' +
      'family=Crimson+Pro:ital,wght@1,400&' +
      'family=Lato:wght@400;700&' +
      'family=JetBrains+Mono:wght@400;500;600&display=swap',
    displayStack: "'Noticia Text', Georgia, 'Times New Roman', serif",
    scriptStack:  "'Crimson Pro', Georgia, serif",
    bodyStack:    "'Lato', -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif",
    microStack:   "'JetBrains Mono', 'IBM Plex Mono', 'SF Mono', Menlo, Consolas, monospace",
  },

  // US race — display every distance in miles. Internal data is in
  // miles already (see scripts/build-pocantico-hills-courses.js).
  displayUnits: 'mi',

  // Per-race subtitles for the editorial Profile / Aid / Day blocks.
  // The defaults reference Tinman triathlon legs — every non-tri race
  // needs its own copy. See [[race-map-editorial-copy-overrides]].
  editorialCopy: {
    profileSub: 'Full course · marathon flagship loop · half marathon shares the first half',
    aidSub:     'Eight stations on a shared spine — the marathon hits all eight, the half hits four. Water + electrolytes throughout; six of eight stations carry a full hot/cold spread including broth, boiled potatoes, salt, brined snacks, PB&J, fruit, chips, and candy.',
    daySub:     'Marathon rolls out at 8:00 AM (walkers 7:00 AM). Half marathon starts at 9:00 AM. Award ceremony for the half at 12:00 noon at Rockwood Hall.',
  },

  raceFormat: {
    discipline: 'trail-run', // carriage-road footrace — no pavement, no cars
    hasSwim: false,
    hasTransitions: false,
    defaultDistanceId: 'marathon',

    // Each distance is its own complete loop GPX (parsed in
    // src/maps/pocantico-hills/data/{slug}.geojson). The "loops"
    // collection mirrors distances 1:1 so the gran-fondo-badlands
    // multi-loop plumbing reuses cleanly without a schema fork.
    // override.js suppresses the assembly chip strip when length ≤ 1.
    loops: [
      {
        id: 'marathon',
        displayName: 'Marathon',
        kilometers: 43.2,
        miles: 26.81,
        // Real values from data/marathon.geojson properties — Open-Meteo
        // DEM via scripts/build-pocantico-hills-courses.js. Rockefeller
        // Preserve sits on the Hudson bluff so the carriage roads roll
        // steeper than the host site's "wide, groomed" copy suggests.
        elevationGain: 2969,
        elevationGainM: 905,
        color: '#E4151B', // route red — matches the host's static course map
        defaultDirection: 'CW',
        cues: [
          { mile: 0.0,  kind: 'landmark', text: 'Roll out from Rockwood Hall — the William Rockefeller mansion foundation sits behind the start arch with sweeping views of the Hudson and Palisades.' },
          { mile: 2.1,  kind: 'water',    text: 'First aid station — water only, at the OCA trail bridge over Route 117.' },
          { mile: 5.5,  kind: 'landmark', text: 'Underpass under Old Sleepy Hollow Rd — full aid station and porta-johns. From here you climb into the Pocantico River watershed.' },
          { mile: 9.5,  kind: 'hazard',   text: 'Cutoff: 11:30 AM at Aid #3, the underpass under Bedford Rd. Miss it and the marathon is over. Half-pace ≈ 16:40/mi to make this point from the gun.' },
          { mile: 12.6, kind: 'water',    text: 'Aid #4 at the FL/RL trail junction — entering the far Pocantico Hills loop.' },
          { mile: 15.1, kind: 'landmark', text: 'Aid #5 back at the FL/RL junction — you have closed the far loop. Swan Lake (22 acres) lies south of this junction.' },
          { mile: 16.9, kind: 'hazard',   text: 'Cutoff: 2:30 PM at Aid #6, second pass under Bedford Rd. Walk-friendly pace from here to the finish.' },
          { mile: 24.1, kind: 'water',    text: 'Last aid — under Route 117 on the Thirteen Bridges Trail. Two miles of carriage road and you are home.' },
          { mile: 26.0, kind: 'landmark', text: 'Final approach to Rockwood Hall — the Hudson opens to the west, the foundation arch comes into view.' },
        ],
      },
      {
        id: 'half-marathon',
        displayName: 'Half Marathon',
        kilometers: 21.4,
        miles: 13.30,
        elevationGain: 1477,
        elevationGainM: 450,
        color: '#F5C400', // golden yellow — matches the host's static course map
        defaultDirection: 'CW',
        cues: [
          { mile: 0.0,  kind: 'landmark', text: 'Roll out from Rockwood Hall at 9:00 AM — the half shares the marathon course out to Old Sleepy Hollow Rd before peeling off back toward the Hudson.' },
          { mile: 2.1,  kind: 'water',    text: 'First aid — water only, at the OCA trail bridge over Route 117.' },
          { mile: 5.5,  kind: 'landmark', text: 'Underpass under Old Sleepy Hollow Rd — full aid + porta-johns. The half turns toward the return spine from here.' },
          { mile: 8.0,  kind: 'water',    text: 'Half-marathon third aid station — under Old Sleepy Hollow Rd on the return, second time through.' },
          { mile: 11.0, kind: 'water',    text: 'Final half-marathon aid station — under Route 117 on the Thirteen Bridges Trail.' },
          { mile: 12.8, kind: 'landmark', text: 'Awards at 12:00 noon under the tent at the mansion foundation site.' },
        ],
      },
    ],

    // Each distance is one loop. assembly arrays stay length-1 so the
    // chip strip is suppressed by override.js and the directions
    // panel reads as a clean per-distance interleaved list.
    distances: [
      {
        id: 'marathon',
        label: 'Marathon 26.2 mi',
        shortLabel: 'Marathon',
        kilometers: 43.2,
        runMiles: 26.81,
        runGainFt: 2969,
        runGainM: 905,
        color: '#E4151B', // route red — matches the host's static course map
        cutoff: '9h',
        startTime: '8:00 AM',
        startWindow: '8:00 AM (walkers 7:00 AM)',
        assembly: [{ loopId: 'marathon', direction: 'CW' }],
        // Indices 0..7 are the eight on-course aid stations; index 8
        // is the explicit Finish entry (Rockwood Hall), which override
        // .js's loop-overlap detection auto-collapses with the start
        // GL symbol so we don't double-render a flag on top of the
        // start pennant.
        aidStations: [0, 1, 2, 3, 4, 5, 6, 7, 8],
      },
      {
        id: 'half-marathon',
        label: 'Half Marathon 13.1 mi',
        shortLabel: 'Half',
        kilometers: 21.4,
        runMiles: 13.30,
        runGainFt: 1477,
        runGainM: 450,
        color: '#F5C400', // golden yellow — matches the host's static course map
        cutoff: null,
        startTime: '9:00 AM',
        startWindow: '9:00 AM',
        assembly: [{ loopId: 'half-marathon', direction: 'CW' }],
        // The half hits the marathon's stations 1, 2, 7, 8
        // (numbering from the host site) plus the shared finish at
        // Rockwood Hall. Indexed into the shared spine: 0, 1, 6, 7, 8.
        aidStations: [0, 1, 6, 7, 8],
      },
    ],
  },

  geography: {
    region: 'Sleepy Hollow, NY · Rockefeller State Park Preserve',
    // Rockwood Hall start/finish — the race-day start arch at the
    // mansion foundation site, not the GPX trkpt[0] (which is at
    // the parking-lot apron ~70 m south). Coords confirmed against
    // the host's race-day photos.
    startLat: 41.11305669614291,
    startLng: -73.86591434370322,
    elevationStory:
      'Rolling carriage roads through Rockefeller State Park Preserve. The marathon climbs and rolls past historic stone walls, charming bridges, grazing livestock, sparkling rivers, lush forests, and lakes — no pavement, no cars. Start and finish at Rockwood Hall with sweeping views of the Hudson River and the Palisades.',
    surface: ['groomed carriage roads (gravel + crushed stone)'],
    waterFeature: 'Hudson River · Pocantico River watershed · Swan Lake',
    weatherStation: 'White Plains Westchester Airport',
  },

  raceDay: {
    date: '2026-11-07',
    displayDate: 'Saturday, November 7, 2026',
    gunTime: '8:00 AM',
    // Sunrise/sunset for Sleepy Hollow on Nov 7 — pre-Daylight-Saving end
    // (DST ends Nov 1, 2026 in the US, so Nov 7 is in EST).
    sunrise: '6:36 AM',
    sunset:  '4:43 PM',
    startTimes: [
      { distance: 'marathon',      time: '8:00 AM · walkers 7:00 AM · 9h cutoff' },
      { distance: 'half-marathon', time: '9:00 AM · no cutoff' },
    ],
    cutoffs: [
      { mile: 9.5,  time: '11:30 AM', label: 'Marathon Mile 9.5 cutoff (Aid #3)' },
      { mile: 16.9, time: '2:30 PM',  label: 'Marathon Mile 16.9 cutoff (Aid #6)' },
      { mile: 26.2, time: '5:00 PM',  label: 'Marathon finish cutoff' },
    ],
  },

  // Aid station spine, in order along the marathon course. The half
  // marathon's `aidStations: [0,1,6,7]` indexes the four it visits.
  // Mile values are the marathon-distance positions; the half's
  // back-half stops sit at different mile readings (8.0, 11.0)
  // because the half is shorter — those positions are computed at
  // runtime from the half's coordinate distances.
  aidStations: [
    {
      name: 'Aid #1 — OCA Trail Bridge over Route 117',
      mile: 2.1,
      kilometer: 3.4,
      stocked: 'Water only',
    },
    {
      name: 'Aid #2 — Underpass · Old Sleepy Hollow Rd',
      mile: 5.5,
      kilometer: 8.9,
      stocked: 'Full aid spread · porta-johns',
    },
    {
      name: 'Aid #3 — Underpass · Bedford Rd (Route 448) · CUTOFF 11:30 AM',
      mile: 9.5,
      kilometer: 15.3,
      stocked: 'Full aid · porta-johns · CUTOFF 11:30 AM',
    },
    {
      name: 'Aid #4 — FL/RL Trail Junction',
      mile: 12.6,
      kilometer: 20.3,
      stocked: 'Full aid spread',
    },
    {
      name: 'Aid #5 — FL/RL Trail Junction (after far loop)',
      mile: 15.1,
      kilometer: 24.3,
      stocked: 'Full aid spread',
    },
    {
      name: 'Aid #6 — Underpass · Bedford Rd · CUTOFF 2:30 PM',
      mile: 16.9,
      kilometer: 27.2,
      stocked: 'Full aid · porta-johns · CUTOFF 2:30 PM',
    },
    {
      name: 'Aid #7 — Underpass · Old Sleepy Hollow Rd (2nd pass)',
      mile: 20.1,
      kilometer: 32.3,
      stocked: 'Full aid spread',
    },
    {
      name: 'Aid #8 — Thirteen Bridges Trail · last aid',
      mile: 24.1,
      kilometer: 38.8,
      stocked: 'Full aid spread',
    },
    {
      // Explicit Finish entry at the end of the aid spine. The mile
      // value is the marathon's total course length; override.js
      // auto-detects that this point is within 50 m of the start
      // (Rockwood Hall is the start AND finish for both distances)
      // and skips rendering an HTML marker, since the start GL
      // symbol layer already represents both.
      name: 'Rockwood Hall · Finish',
      mile: 26.81,
      kilometer: 43.2,
      stocked: 'Race-day finish line · refreshments · gear retrieval',
    },
  ],

  logistics: {
    parking:
      'Phelps Hospital parking deck, 701 N. Broadway, Sleepy Hollow, NY 10591 — the Rockwood Hall start/finish is immediately north of the hospital. Off Route 9.',
    packetPickup:
      'Race-morning pickup from 6:00 AM under the tent at the mansion foundation site at Rockwood Hall. No Friday-evening packet pickup; everything happens Saturday on-site.',
    shuttle:
      'No shuttle — start, finish, and parking are co-located at Rockwood Hall / Phelps Hospital.',
    spectatorTips:
      'Best viewing: the start/finish arch at the Rockwood Hall mansion foundation; the Bedford Rd underpass aid stations (Aid #3 / Aid #6) where the marathon course doubles back; and the Hudson River overlook from the Rockwood Hall lawn. The course is entirely on carriage roads inside the preserve — spectators do not need cars between viewing points, but the underpass aid stations are also accessible by foot from Bedford Rd.',
    hostGuideUrl: 'https://pocanticohillsmarathon.com/',
  },

  cartographerNotes:
    'Both distances start and finish at Rockwood Hall — the foundation of the William Rockefeller mansion, on a bluff over the Hudson. The marathon is a single 26.2-mile loop that touches every corner of the preserve; the half marathon is the same outbound spine for the first 5.5 miles, then peels off and returns by way of the Thirteen Bridges Trail back to Rockwood. Everything is carriage road — no pavement, no cars, no roots. The carriage roads were laid out by John D. Rockefeller Jr. in the 1890s-1910s and are still maintained today by the Friends of the Rockefeller State Park Preserve, who receive a share of race proceeds. Aid is generously stocked at six of the eight stations (full hot/cold spread including broth, boiled potatoes, salt, brined snacks, and PB&J); the first station is water-only. The marathon carries two hard cutoffs — Mile 9.5 by 11:30 AM, Mile 16.9 by 2:30 PM — and a finish cutoff of 5:00 PM. The Mile 9.5 cutoff is the tightest: it requires an average pace of about 21:00/mi from the 8:00 AM gun. Walkers start an hour early at 7:00 AM to keep that math friendly. There is no on-course shade in mid-November because the leaves are down — dress for wind off the Hudson and bring a hat. The carriage roads can be muddy after rain; the surface is groomed gravel and crushed stone, not single-track.',

  crossLinks: [
    { slug: 'tupper-lake-tinman',  name: 'Tupper Lake Tinman 13.1M',   region: 'Tupper Lake · NY' },
    { slug: 'escarpment',          name: 'Escarpment Trail Run 30K',    region: 'Catskill High Peaks · NY' },
    { slug: 'manitous-revenge',    name: "Manitou's Revenge 54M",       region: 'Catskill Devil’s Path · NY' },
    { slug: 'golden-leaf',         name: 'Golden Leaf Half Marathon',   region: 'Aspen · CO' },
    { slug: 'wild-goose',          name: 'Wild Goose Trail Festival',   region: 'Wawayanda · NJ' },
    { slug: 'gran-fondo-badlands', name: 'Gran Fondo Badlands',         region: 'Drumheller · Alberta' },
  ],
};
