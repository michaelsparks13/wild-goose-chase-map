// adirondack-marathon.js — RaceTheme for the Adirondack Marathon &
// Half Marathon, the 26.2/13.1-mi road races run on a single loop around
// Schroon Lake in the southeastern Adirondacks, NY. Sunday, September 27,
// 2026 — the 30th annual, presented by the Adirondack Sports Council.
//
// Two distances. The marathon is one full clockwise loop of the lake on
// paved roads (one half-mile gravel stretch in mile 3). The half marathon
// is the marathon's exact back half: it starts at the Hamlet of Adirondack
// (the marathon's 13.1-mile marker) and finishes with it at the Schroon
// Public Beach. Both courses share the same road geometry from the hamlet
// south and back up Route 9 — so the half is a sub-path of the marathon,
// not an independent loop.
//
// Course geometry is reconstructed from OpenStreetMap road centerlines via
// OSRM (see adk_marathon_gpx/build_adk_gpx_overpass.py) and is faithful to
// the real roads; the OSRM road distance runs slightly long (26.8 / 14.3
// mi) versus the USATF-certified 26.2 / 13.1 — the displayed distance is
// the measured course, consistent with the rest of the catalog.
//
// Palette extracted from adirondackmarathon.org (Squarespace) via the
// Playwright MCP browser: the site is a dark navy theme — body #081728,
// slate-blue #13364A on CTAs/links, a brighter wave-blue #1D7AA1 accent,
// white type. That navy + lake-blue pairing IS the brand (it echoes the
// ADK logo's navy ring + blue waves). Display type is League Gothic (the
// site's H1/H2/H3 condensed gothic, free on Google Fonts); body is
// omnes-pro (Adobe/proprietary) — substituted with Mulish, a close
// geometric-humanist analog on Google Fonts. The pine green and autumn
// rust are seasonal accents: late-September foliage around the lake, and
// the green ring of the ADK summit logo.

module.exports = {
  slug: 'adirondack-marathon',

  identity: {
    name: 'Adirondack Marathon & Half Marathon',
    shortName: 'Adirondack Marathon',
    hostOrg: 'Adirondack Sports Council',
    hostUrl: 'https://www.adirondackmarathon.org/',
    // 30th annual in 2026 → first run in 1997.
    establishedYear: 1997,
  },

  // Sampled from adirondackmarathon.org. Navy + lake-blue is the brand;
  // pine green + autumn rust are the seasonal accents (the race is a
  // late-September lake loop under turning foliage). Paper is a cool
  // light slate rather than warm cream, to sit under the cool navy ink.
  palette: {
    raceBrand:    '#1D7AA1', // wave-blue — signature accent, mile-marker stroke, CTA
    raceInk:      '#0E2438', // deep navy — display copy + chrome
    paper:        '#eef1f2', // cool light slate page bg (not pure white)
    paperCard:    '#ffffff', // pure white card surfaces
    surfaceWarm:  '#dde4e7', // recessed cool grey-blue substrate
    routeColor:   '#13364A', // marathon course line — deep slate-blue on light, high contrast
    aidStation:   '#2E7D46', // pine green — aid markers/table accent, distinct from both routes
    hazard:       '#A8331A', // burnt rust — cutoff strip, course-close warnings
    accent:       '#1D7AA1', // wave-blue — active states, HQ-badge dot, "currently viewing" tag
    sageQuiet:    '#566370', // cool slate-grey — muted text, hits WCAG AA on paper + paperCard
    bone:         '#dde2e4', // cool bone — chip rests, callouts

    // Header-bar accent — a lighter wave-blue that reads on the dark navy
    // top bar without competing with the primary brand blue.
    headerAccent: '#5BA3C4',

    // Per-distance loop colors. Marathon carries the deep slate-blue of
    // the brand; the half carries an autumn rust so the two read apart on
    // the chip strip, the profile fill, and (where shown together) the map.
    loopMarathon:     '#13364A', // deep slate-blue — marathon
    loopHalfMarathon: '#C4561E', // autumn rust — half marathon
  },

  type: {
    // Display: League Gothic — the host's H1/H2/H3 face. Condensed gothic,
    // athletic, uppercase; free on Google Fonts, exact match to the site.
    display: 'League Gothic',
    // Script slot — editorial italic for section eyebrows. Crimson Pro
    // italic, a free transitional serif (consistent with the catalog).
    script:  'Crimson Pro',
    // Body: Mulish — geometric-humanist sans, the closest free Google
    // Fonts analog to the host's proprietary omnes-pro.
    body:    'Mulish',
    // Micro: JetBrains Mono — quiet mono for distance/time chips.
    micro:   'JetBrains Mono',
    googleFontsHref:
      'https://fonts.googleapis.com/css2?' +
      'family=League+Gothic&' +
      'family=Crimson+Pro:ital,wght@1,400&' +
      'family=Mulish:wght@400;600;700&' +
      'family=JetBrains+Mono:wght@400;500;600&display=swap',
    displayStack: "'League Gothic', 'Oswald', 'Arial Narrow', sans-serif",
    scriptStack:  "'Crimson Pro', Georgia, serif",
    bodyStack:    "'Mulish', -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif",
    microStack:   "'JetBrains Mono', 'IBM Plex Mono', 'SF Mono', Menlo, Consolas, monospace",
  },

  // US road race — display every distance in miles.
  displayUnits: 'mi',

  editorialCopy: {
    profileSub: 'Full marathon loop around Schroon Lake · the half marathon is the back half (the marathon’s mile 13.1 to the finish)',
    aidSub:     'Fifteen water + sports-drink stations ring the lake — roughly every two miles to mile 20, then every mile from 20 to 25. The half marathon shares the marathon’s back-half stations. Full spread at the finish: water, sports drink, fresh fruit, yogurt, ice cream, and fresh-baked goods.',
    daySub:     'Marathon rolls out at 8:00 AM from Main Street (Route 9) in the village; the half marathon starts at 9:00 AM at the Hamlet of Adirondack. On-course services close at 2:30 PM and all roads reopen to traffic by 3:30 PM.',
  },

  raceFormat: {
    discipline: 'road-run', // paved roads around the lake (one short gravel stretch)
    hasSwim: false,
    hasTransitions: false,
    defaultDistanceId: 'marathon',

    // Each distance is one loop in the renderer's data model. The
    // marathon is the full loop; the half marathon is the marathon's
    // back half, exported as its own LineString (it shares geometry but
    // the renderer treats it as a standalone loop). assembly arrays stay
    // length-1 so override.js suppresses the assembly chip strip and the
    // directions panel reads as a clean per-distance list.
    loops: [
      {
        id: 'marathon',
        displayName: 'Marathon',
        kilometers: 42.16,
        miles: 26.2,
        // Real values from data/marathon.geojson — Open-Meteo DEM via
        // scripts/build-adirondack-marathon-courses.js. The east shore
        // (miles 4-12) is the climbing: short, steep two-lane roller
        // hills. Miles 13-18 along the south/east shore are flat; the
        // Route 9 return rolls gently north to the beach.
        elevationGain: 1544,
        elevationGainM: 471,
        color: '#13364A', // deep slate-blue
        defaultDirection: 'CW',
        cues: [
          { mile: 0.0,  kind: 'landmark', text: 'Start on Main Street (Route 9) in the village of Schroon Lake and head north. The first four miles are rolling or flat.' },
          { mile: 3.0,  kind: 'hazard',   text: 'One half-mile stretch of gravel road in mile 3 — the only unpaved section of the course.' },
          { mile: 4.0,  kind: 'landmark', text: 'Onto the two-lane country road down the east side of the lake. Miles 4-12 are short, steep rollers — the hilliest part of the day.' },
          { mile: 13.1, kind: 'landmark', text: 'Hamlet of Adirondack — the half marathon starts here at 9:00 AM. From here the course is flat along the east shore for the next several miles.' },
          { mile: 17.5, kind: 'landmark', text: 'Around the south end of the lake and onto Route 9 at Pottersville for the run back north.' },
          { mile: 18.0, kind: 'hazard',   text: 'On-course services close at 2:30 PM and roads reopen to traffic by 3:30 PM. Long, gentle Route 9 hills from here to the finish.' },
          { mile: 25.0, kind: 'water',    text: 'Last of the every-mile stations (miles 20-25). Two miles of Route 9 left to the beach.' },
          { mile: 26.2, kind: 'landmark', text: 'Right toward the Schroon Public Beach for the finish — water, sports drink, fruit, yogurt, ice cream, and fresh-baked goods at the finish area.' },
        ],
      },
      {
        id: 'half-marathon',
        displayName: 'Half Marathon',
        kilometers: 21.08,
        miles: 13.1,
        elevationGain: 530,
        elevationGainM: 162,
        color: '#C4561E', // autumn rust
        defaultDirection: 'CW',
        cues: [
          { mile: 0.0,  kind: 'landmark', text: 'Half marathon starts at 9:00 AM at the Hamlet of Adirondack — the marathon’s mile-13.1 marker. The first several miles are flat along the east shore.' },
          { mile: 4.5,  kind: 'landmark', text: 'Around the south end of the lake and onto Route 9 at Pottersville.' },
          { mile: 5.0,  kind: 'hazard',   text: 'On-course services close at 2:30 PM; roads reopen by 3:30 PM. Long, gentle Route 9 hills lead north from here.' },
          { mile: 12.0, kind: 'water',    text: 'Final mile stations along Route 9 north. The beach finish is close.' },
          { mile: 13.1, kind: 'landmark', text: 'Right toward the Schroon Public Beach for the finish — shared finish area with the marathon.' },
        ],
      },
    ],

    distances: [
      {
        id: 'marathon',
        label: 'Marathon 26.2 mi',
        shortLabel: 'Marathon',
        kilometers: 42.16,
        runMiles: 26.2,
        runGainFt: 1544,
        runGainM: 471,
        color: '#13364A',
        cutoff: '6h 30m',
        startTime: '8:00 AM',
        startWindow: '8:00 AM',
        assembly: [{ loopId: 'marathon', direction: 'CW' }],
        // Indices into the shared aid spine (see aidStations below). The
        // marathon visits the village start (0), all fifteen water
        // stations, and the beach finish — but NOT the half-marathon
        // start entry (index 7), which is a landmark, not a marathon aid.
        aidStations: [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
      },
      {
        id: 'half-marathon',
        label: 'Half Marathon 13.1 mi',
        shortLabel: 'Half',
        kilometers: 21.08,
        runMiles: 13.1,
        runGainFt: 530,
        runGainM: 162,
        color: '#C4561E',
        cutoff: null,
        startTime: '9:00 AM',
        startWindow: '9:00 AM',
        assembly: [{ loopId: 'half-marathon', direction: 'CW' }],
        // The half starts at the Hamlet of Adirondack (index 7 — its
        // aidIdx[0], rendered as the start pennant), then visits the
        // back-half water stations (miles 14-25) and the shared finish.
        aidStations: [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
      },
    ],
  },

  geography: {
    region: 'Schroon Lake, NY · southeastern Adirondacks',
    // Start on Main Street (Route 9) in the village of Schroon Lake — the
    // GPX trkpt[0]. The finish is ~250 m away at the Schroon Public Beach.
    startLat: 43.835115,
    startLng: -73.762145,
    elevationStory:
      'One full loop around Schroon Lake. The first four miles north out of the village are rolling or flat; miles 4-12 down the east shore are short, steep two-lane rollers — the climbing of the day. Miles 13-18 run flat along the south and east shore, then Route 9 rolls in long, gentle hills north back to the village and the Schroon Public Beach finish.',
    surface: ['paved roads', 'one half-mile gravel stretch (mile 3)'],
    waterFeature: 'Schroon Lake · Schroon River',
    weatherStation: 'Schroon Lake',
  },

  raceDay: {
    date: '2026-09-27',
    displayDate: 'Sunday, September 27, 2026',
    gunTime: '8:00 AM',
    // Sunrise/sunset for Schroon Lake on Sep 27, 2026 (EDT).
    sunrise: '6:46 AM',
    sunset:  '6:43 PM',
    startTimes: [
      { distance: 'marathon',      time: '8:00 AM · services close 2:30 PM · roads reopen 3:30 PM' },
      { distance: 'half-marathon', time: '9:00 AM · no posted cutoff' },
    ],
    cutoffs: [
      { mile: 26.2, time: '2:30 PM', label: 'Marathon cutoff — 6.5-hour limit (roads reopen to traffic by 3:30 PM)' },
    ],
  },

  // Aid-station spine in course order along the marathon. Index 0 is the
  // village start; index 7 is the Hamlet of Adirondack (the half-marathon
  // start); index 17 is the beach finish. The other fifteen entries are
  // the water + sports-drink stations. Aid placement is APPROXIMATE — the
  // host publishes spacing ("roughly every two miles to 20, then every
  // mile 20-25"), not surveyed coordinates, so stations are positioned by
  // mile along the course and named by the road segment they sit on.
  aidStations: [
    { name: 'Start · Main Street (Route 9), Schroon Lake village', mile: 0.0,  kilometer: 0.0,  stocked: 'Marathon start · 8:00 AM' },
    { name: 'Mile 2 · US-9 north toward Alder Meadow Rd',          mile: 2.0,  kilometer: 3.2,  stocked: 'Water + sports drink' },
    { name: 'Mile 4 · Adirondack Rd, east shore',                 mile: 4.0,  kilometer: 6.4,  stocked: 'Water + sports drink' },
    { name: 'Mile 6 · Adirondack Rd, east shore',                 mile: 6.0,  kilometer: 9.7,  stocked: 'Water + sports drink' },
    { name: 'Mile 8 · Adirondack Rd, east shore',                 mile: 8.0,  kilometer: 12.9, stocked: 'Water + sports drink' },
    { name: 'Mile 10 · Adirondack Rd, east shore',                mile: 10.0, kilometer: 16.1, stocked: 'Water + sports drink' },
    { name: 'Mile 12 · Adirondack Rd, east shore',                mile: 12.0, kilometer: 19.3, stocked: 'Water + sports drink' },
    { name: 'Hamlet of Adirondack · Half Marathon start',         mile: 13.1, kilometer: 21.1, stocked: 'Half marathon start · 9:00 AM' },
    { name: 'Mile 14 · East Shore Dr',                            mile: 14.0, kilometer: 22.5, stocked: 'Water + sports drink' },
    { name: 'Mile 16 · East Shore Dr',                            mile: 16.0, kilometer: 25.7, stocked: 'Water + sports drink' },
    { name: 'Mile 18 · Route 9, Pottersville',                    mile: 18.0, kilometer: 29.0, stocked: 'Water + sports drink' },
    { name: 'Mile 20 · Route 9 north',                            mile: 20.0, kilometer: 32.2, stocked: 'Water + sports drink' },
    { name: 'Mile 21 · Route 9 north',                            mile: 21.0, kilometer: 33.8, stocked: 'Water + sports drink' },
    { name: 'Mile 22 · Route 9 north',                            mile: 22.0, kilometer: 35.4, stocked: 'Water + sports drink' },
    { name: 'Mile 23 · Route 9 north',                            mile: 23.0, kilometer: 37.0, stocked: 'Water + sports drink' },
    { name: 'Mile 24 · Route 9 north',                            mile: 24.0, kilometer: 38.6, stocked: 'Water + sports drink' },
    { name: 'Mile 25 · Route 9 north',                            mile: 25.0, kilometer: 40.2, stocked: 'Water + sports drink' },
    { name: 'Finish · Schroon Public Beach',                      mile: 26.2, kilometer: 42.16, stocked: 'Finish · fruit, yogurt, ice cream, fresh-baked goods' },
  ],

  logistics: {
    parking:
      'Village lots and street parking in Schroon Lake near Main Street (Route 9). Bag check is at Fountain Park on Dock Street, across from Stewart’s near the marathon start, open Sunday 7:00–7:50 AM; bags are retrieved post-race at the finish area near the merchandise tent.',
    packetPickup:
      'Race expo + packet pickup at the pavilion above the marathon finish line: Saturday, Sept 26, 11 AM–5 PM, and Sunday, Sept 27, 6:30–7:45 AM. Registration changes can only be made Saturday. Virtual runners receive shirt + medal by mail.',
    shuttle:
      'No shuttle for the marathon — start, finish, parking, and bag check are all in the village of Schroon Lake. Half-marathon runners are bused to the Hamlet of Adirondack start; check the host site for the morning bus time.',
    spectatorTips:
      'Best viewing: the Main Street start and the Schroon Public Beach finish, both in the village; the Hamlet of Adirondack (the half-marathon start and the marathon’s mile 13.1); and the Route 9 corridor on the lake’s west side, where the course rolls north for the final eight miles. The east-shore hills (miles 4-12) are quiet two-lane road — reachable by car but with limited pull-offs.',
    hostGuideUrl: 'https://www.adirondackmarathon.org/',
  },

  cartographerNotes:
    'The Adirondack Marathon is one full clockwise loop of Schroon Lake — start on Main Street (Route 9) in the village, north and around the lake’s north end, down the hilly east shore on Adirondack Road, around the south end at Pottersville, and back up Route 9 to the Schroon Public Beach finish. The half marathon is the back half of that loop: it starts at the Hamlet of Adirondack (the marathon’s mile-13.1 point) and finishes with the marathon at the beach. The first four miles and the long Route 9 return are gentle; the east-shore miles 4-12 are the real work — short, steep two-lane rollers. Everything is paved except one half-mile gravel stretch in mile 3. Aid is generous: fifteen water and sports-drink stations ring the lake, roughly every two miles to mile 20 and then every mile from 20 to 25, with a full spread at the beach finish. The marathon’s only hard limit is the clock on the roads — runners must finish by the 2:30 PM cutoff (a 6.5-hour limit) and traffic returns to the roads by 3:30 PM. A note on the line itself: this course is reconstructed from OpenStreetMap road centerlines routed through OSRM, so it is faithful to the actual roads. The distances shown are the USATF-certified 26.2 and 13.1 miles; the raw OSM centerline runs about three percent longer, but the displayed miles, mile markers, and elevation profile are all scaled to the certified distances.',

  crossLinks: [
    { slug: 'tupper-lake-tinman',  name: 'Tupper Lake Tinman 13.1M',  region: 'Tupper Lake · NY' },
    { slug: 'escarpment',          name: 'Escarpment Trail Run 30K',   region: 'Catskill High Peaks · NY' },
    { slug: 'manitous-revenge',    name: "Manitou's Revenge 54M",      region: 'Catskill Devil’s Path · NY' },
    { slug: 'golden-leaf',         name: 'Golden Leaf Half Marathon',  region: 'Aspen · CO' },
    { slug: 'wild-goose',          name: 'Wild Goose Trail Festival',  region: 'Wawayanda · NJ' },
  ],
};
