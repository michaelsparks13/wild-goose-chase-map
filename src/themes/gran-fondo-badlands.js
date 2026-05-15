// gran-fondo-badlands.js — RaceTheme for the TransRockies Gran Fondo
// Badlands, the road-cycling event in Drumheller, Alberta. July 4, 2026.
//
// Four dinosaur-named distances (Brontosaurus 163K, T-Rex 100K,
// Triceratops 75K, Velociraptor 50K), each its own complete loop GPX.
// Aid stations are nested on a shared spine — the 50K hits 3 stations,
// 163K hits 7 — so they're declared once at the race level and each
// distance shows the subset it visits via its own km marker.
//
// Palette extracted from granfondobadlands.ca via Playwright MCP. The
// race is hosted on Squarespace (not Wix), uses Poppins (forbidden) for
// body text — substituted with Manrope. Brand primary is the literal
// hoodoo-rust color of the Drumheller Valley (#A84D24), pulled from
// their CTA button + sticky-banner. Logo carries a brush script "Gran
// Fondo" we echo with Yellowtail and an extended-cap "BADLANDS"
// wordmark we echo with Big Shoulders Display. Voice register is
// `trail-party` — friendly + adventurous, dinosaur-themed but not
// childish. None of the chosen fonts (Big Shoulders Display, Manrope,
// Yellowtail, JetBrains Mono) appear on the forbidden list.

module.exports = {
  slug: 'gran-fondo-badlands',

  identity: {
    name: 'TransRockies Gran Fondo Badlands',
    shortName: 'Gran Fondo Badlands',
    hostOrg: 'TransRockies Race Series',
    hostUrl: 'https://www.granfondobadlands.ca/',
    establishedYear: 2017,
  },

  // Sampled from granfondobadlands.ca. The race's brand IS the
  // landscape: rust-orange of the hoodoos and Red Deer River cliffs.
  // Magenta is the secondary banner color in the badge logo. Sage is
  // the muted prairie-grass tone used on quiet UI elements. Paper is a
  // warm ivory to evoke a vintage trail-badge aesthetic without
  // tipping into pure-white (forbidden) or kraft-paper.
  palette: {
    raceBrand:    '#A84D24', // hoodoo rust — primary CTA + sticky banner
    raceInk:      '#1A1A1A', // near-black, matches their dark nav
    paper:        '#F8F2EA', // warm ivory — never pure #ffffff
    paperCard:    '#FFFFFF', // card surfaces inside the ivory paper
    surfaceWarm:  '#EDE6DC', // recessed substrate, deeper than paper
    routeColor:   '#1A1A1A', // course default ink
    aidStation:   '#C68E1E', // ochre — secondary brand accent (Triceratops)
    hazard:       '#B53528', // warm rust — heat / no-aid strip
    accent:       '#8B2668', // magenta from logo banner — active states
    sageQuiet:    '#77796E', // sage olive — muted text
    bone:         '#E8DCC4', // cream-bone — chip rests, callouts

    // Per-distance loop colors. Each dinosaur gets a distinct hex; the
    // flagship (Brontosaurus) wears the brand primary, T-Rex carries
    // the brand secondary, the two shorter rides take complementary
    // ochre and teal that sit naturally with rust + magenta.
    loopBrontosaurus: '#A84D24', // hoodoo rust — flagship
    loopTrex:         '#8B2668', // magenta — fierce predator
    loopTriceratops:  '#C68E1E', // golden ochre — sturdy plant-eater
    loopVelociraptor: '#3F6B5F', // teal — sleek + agile
  },

  type: {
    // Display: Big Shoulders Display echoes the extended-cap "BADLANDS"
    // wordmark on the logo — geometric poster condensed, the closest
    // free analog to the racing-poster sans Squarespace ships them.
    display: 'Big Shoulders Display',
    // Script: Yellowtail echoes the "Gran Fondo" brush in the badge.
    // Used sparingly (race name flourishes, "Gran Fondo" wordmark).
    script:  'Yellowtail',
    // Body: Manrope is the Poppins analog the forbidden-font list
    // requires. Geometric sans, friendly weight curve, holds at body
    // sizes for the cue list and aid table.
    body:    'Manrope',
    // Mono: JetBrains Mono for the distance / km / elevation strip.
    micro:   'JetBrains Mono',
    googleFontsHref:
      'https://fonts.googleapis.com/css2?' +
      'family=Big+Shoulders+Display:wght@500;700;800&' +
      'family=Yellowtail&' +
      'family=Manrope:wght@300;400;500;600;700&' +
      'family=JetBrains+Mono:wght@400;500;600&display=swap',
    displayStack: "'Big Shoulders Display', 'Oswald', 'Anton', 'Impact', sans-serif",
    scriptStack:  "'Yellowtail', 'Pacifico', 'Brush Script MT', cursive",
    bodyStack:    "'Manrope', -apple-system, 'Helvetica Neue', sans-serif",
    microStack:   "'JetBrains Mono', 'IBM Plex Mono', 'SF Mono', Menlo, Consolas, monospace",
  },

  // Display units across the page. This race lives in Canada and is
  // billed by the host in km — the FSS data files store miles internally
  // for schema parity, but every label the rider reads is metric.
  displayUnits: 'km',

  raceFormat: {
    discipline: 'road-cycle',
    hasSwim: false,
    hasTransitions: false,
    defaultDistanceId: 'brontosaurus',

    // Each distance is its own complete loop GPX (parsed in
    // src/maps/gran-fondo-badlands/data/{slug}.geojson). The "loops"
    // collection mirrors the distances 1:1 so the existing
    // multi-loop config.js plumbing in the FSS build can be reused
    // without inventing a new schema. The chip strip on each distance
    // therefore shows one chip — kept for consistency with Wild Goose;
    // override.js suppresses it when the assembly has length ≤ 1.
    loops: [
      {
        id: 'brontosaurus',
        displayName: 'Brontosaurus',
        kilometers: 163.2,
        miles: 101.4,
        elevationGain: 2935,  // ft (≈895m)
        elevationGainM: 895,
        color: '#A84D24',
        defaultDirection: 'CW',
        cues: [
          { mile: 0.0,  kind: 'landmark', text: 'Roll out from the Badlands Community Facility — east into the Red Deer River valley as the sun comes over the hoodoos.' },
          { mile: 15.3, kind: 'landmark', text: 'First hoodoo views on the right; Bleriot Ferry crossing ahead — courtesy yields to the cable ferry crew.' },
          { mile: 38.0, kind: 'hazard',   text: 'Long open exposure to the Bacon Station — minimal shade, prairie crosswinds. Pace conservatively in the heat.' },
          { mile: 50.1, kind: 'water',    text: 'East Coulee Fire Hall — last full restock before the Wayne / Rosebud Coulee climb sequence.' },
          { mile: 79.4, kind: 'landmark', text: 'Dorothy Community Centre — the eastward turnaround. From here it is rolling prairie back into Drumheller.' },
          { mile: 99.0, kind: 'landmark', text: 'Final descent into Drumheller along the river plain; the BCF spire is visible from ~3 km out.' },
        ],
      },
      {
        id: 'trex',
        displayName: 'T-Rex',
        kilometers: 102.4,
        miles: 63.6,
        elevationGain: 2103,  // ft (≈641m, route as published)
        elevationGainM: 641,
        color: '#8B2668',
        defaultDirection: 'CW',
        cues: [
          { mile: 0.0,  kind: 'landmark', text: 'Wave start from the Badlands Community Facility (7:45 / 8:30 / 9:15 AM). East along the river road.' },
          { mile: 15.3, kind: 'landmark', text: 'Bleriot Ferry — a working cable ferry crossing the Red Deer River; volunteers manage the queue.' },
          { mile: 38.0, kind: 'hazard',   text: 'Climb out of the Last Chance Saloon (Bacon Station) — sustained 4-6% with prairie sun.' },
          { mile: 50.1, kind: 'water',    text: 'East Coulee Fire Hall — turnaround for T-Rex. Refill, eat, head back the way you came.' },
          { mile: 60.8, kind: 'landmark', text: 'Wayne / Rosebud Creek crossings — the eleven historic bridges. Single-file through the narrow ones.' },
        ],
      },
      {
        id: 'triceratops',
        displayName: 'Triceratops',
        kilometers: 75.9,
        miles: 47.2,
        elevationGain: 1309,  // ft (≈399m)
        elevationGainM: 399,
        color: '#C68E1E',
        defaultDirection: 'CW',
        cues: [
          { mile: 0.0,  kind: 'landmark', text: 'Roll out from the Badlands Community Facility at 9:15 AM — the workhorse 75K loop heads east into the river valley.' },
          { mile: 15.3, kind: 'landmark', text: 'Bleriot Ferry — courtesy yields to the cable ferry crew, single-file across.' },
          { mile: 30.0, kind: 'water',    text: 'Roadside pullout aid — full restock before the Last Chance Saloon climb.' },
          { mile: 38.0, kind: 'landmark', text: 'Last Chance Saloon (Bacon Station) — Triceratops turnaround. Heard a rumor about the bacon? It is true. Eat, then head back.' },
        ],
      },
      {
        id: 'velociraptor',
        displayName: 'Velociraptor',
        kilometers: 52.2,
        miles: 32.4,
        elevationGain: 1368,  // ft (≈417m)
        elevationGainM: 417,
        color: '#3F6B5F',
        defaultDirection: 'CW',
        cues: [
          { mile: 0.0,  kind: 'landmark', text: 'Wave start from the Badlands Community Facility at 9:15 AM — the introductory 50K loop, agile and fast.' },
          { mile: 15.3, kind: 'landmark', text: 'Bleriot Ferry — first ferry crossing for many newer riders; volunteers manage the queue.' },
          { mile: 20.6, kind: 'water',    text: 'Roadside pullout aid — Velociraptor turnaround. Take a moment, refill, head back along the river.' },
          { mile: 30.0, kind: 'landmark', text: 'Final descent back into Drumheller — the BCF spire is visible from a few km out.' },
        ],
      },
    ],

    // Each distance is one loop. assembly arrays stay length-1 so the
    // existing multi-loop config.js plumbing can be reused without a
    // schema fork. override.js suppresses the chip strip when length
    // ≤ 1, so the rider sees a clean per-distance directions list.
    distances: [
      {
        id: 'brontosaurus',
        label: 'Brontosaurus 163K',
        shortLabel: 'Brontosaurus',
        kilometers: 163.2,
        runMiles: 101.4,
        runGainFt: 2935,
        runGainM: 895,
        color: '#A84D24',
        cutoff: '9h',
        startTime: '7:00 AM',
        startWindow: '7:00 AM',
        dinosaur: 'brontosaurus',
        assembly: [{ loopId: 'brontosaurus', direction: 'CW' }],
        aidStations: [0, 1, 2, 3, 4, 5, 6, 7],
      },
      {
        id: 'trex',
        label: 'T-Rex 100K',
        shortLabel: 'T-Rex',
        kilometers: 102.4,
        runMiles: 63.6,
        runGainFt: 2103,
        runGainM: 641,
        color: '#8B2668',
        cutoff: '7.5h',
        startTime: '7:45 AM',
        startWindow: '7:45 / 8:30 / 9:15 AM (waves)',
        dinosaur: 'trex',
        assembly: [{ loopId: 'trex', direction: 'CW' }],
        aidStations: [0, 1, 2, 3, 4, 7],
      },
      {
        id: 'triceratops',
        label: 'Triceratops 75K',
        shortLabel: 'Triceratops',
        kilometers: 75.9,
        runMiles: 47.2,
        runGainFt: 1309,
        runGainM: 399,
        color: '#C68E1E',
        cutoff: '7h',
        startTime: '9:15 AM',
        startWindow: '9:15 AM',
        dinosaur: 'triceratops',
        assembly: [{ loopId: 'triceratops', direction: 'CW' }],
        aidStations: [0, 1, 2, 3, 7],
      },
      {
        id: 'velociraptor',
        label: 'Velociraptor 50K',
        shortLabel: 'Velociraptor',
        kilometers: 52.2,
        runMiles: 32.4,
        runGainFt: 1368,
        runGainM: 417,
        color: '#3F6B5F',
        cutoff: '6h',
        startTime: '9:15 AM',
        startWindow: '9:15 AM',
        dinosaur: 'velociraptor',
        assembly: [{ loopId: 'velociraptor', direction: 'CW' }],
        aidStations: [0, 1, 2, 7],
      },
    ],
  },

  geography: {
    region: 'Drumheller, Alberta · Canadian Badlands',
    startLat: 51.4665,
    startLng: -112.7050,
    elevationStory:
      'Out-and-back loops through the Red Deer River valley and the Drumheller hoodoos. Rolling prairie with two notable climb sequences — Bleriot Ferry → Last Chance Saloon, and Wayne / Rosebud Coulee on the longer distances. Open road, full sun exposure, prairie crosswinds.',
    surface: ['paved highway', 'paved secondary roads', 'one cable-ferry river crossing'],
    waterFeature: 'Red Deer River',
    weatherStation: 'Drumheller East AGCM (CWPF)',
  },

  raceDay: {
    date: '2026-07-04',
    displayDate: 'Saturday, July 4, 2026',
    gunTime: '7:00 AM',
    sunrise: '5:15 AM',
    sunset:  '9:55 PM',
    startTimes: [
      { distance: 'brontosaurus', time: '7:00 AM · 9h cutoff' },
      { distance: 'trex',         time: '7:45 / 8:30 / 9:15 AM (waves) · 7.5h cutoff' },
      { distance: 'triceratops',  time: '9:15 AM · 7h cutoff' },
      { distance: 'velociraptor', time: '9:15 AM · 6h cutoff' },
    ],
    cutoffs: [
      { mile: 32.4, time: '6h',  label: 'Velociraptor 50K cutoff' },
      { mile: 47.2, time: '7h',  label: 'Triceratops 75K cutoff' },
      { mile: 63.6, time: '7.5h', label: 'T-Rex 100K cutoff' },
      { mile: 101.4, time: '9h', label: 'Brontosaurus 163K cutoff' },
    ],
  },

  // Aid stations are shared across distances. Each station is on the
  // same physical road, hit by some subset of the four routes. The
  // distance-level `aidStations` arrays above index into this list.
  aidStations: [
    {
      name: 'Badlands Community Facility · Start',
      mile: 0,
      kilometer: 0,
      stocked: 'Water · F2C Hydro-Durance · F2C Glyco-Durance',
    },
    {
      name: 'Bleriot Ferry Crossing',
      mile: 15.3,
      kilometer: 24.6,
      stocked: 'Water · F2C Glyco-Durance',
    },
    {
      name: 'Roadside Pullout',
      mile: 20.6,
      kilometer: 33.1,
      stocked: 'Water · Glyco-Durance · Xact bars · PB&J · cookies · bananas · watermelon · chips · Dino-sours',
    },
    {
      name: 'Last Chance Saloon · "Bacon Station"',
      mile: 38.0,
      kilometer: 61.2,
      stocked: 'Water · Glyco-Durance · Xact bars · bacon or tomato sandwiches',
    },
    {
      name: 'East Coulee Fire Hall',
      mile: 50.1,
      kilometer: 80.6,
      stocked: 'Water · Glyco-Durance · Xact bars · PB&J · cookies · bananas · watermelon · chips · Dino-sours',
    },
    {
      name: 'Hwy 570 / Range Road 16-0',
      mile: 69.4,
      kilometer: 111.6,
      stocked: 'Water · F2C Glyco-Durance',
    },
    {
      name: 'Dorothy Community Centre',
      mile: 79.3,
      kilometer: 127.6,
      stocked: 'Water · Glyco-Durance · Xact bars · PB&J · cookies · bananas · watermelon · chips · Dino-sours',
    },
    {
      name: 'Badlands Community Facility · Finish',
      mile: 101.4, // approximated to the longest distance — renderer uses per-route mileage
      kilometer: 163.2,
      stocked: 'Water · Hydro-Durance · Glyco-Durance · F2C Pharma-Pure recovery smoothies',
    },
  ],

  logistics: {
    parking:
      'Athlete parking at the Badlands Community Facility (BCF), 80 Veterans Way, Drumheller. Lot opens at 5:30 AM Saturday.',
    packetPickup:
      'Friday 3:00–8:00 PM at the BCF. Saturday race-morning pickup from 5:30 AM until 30 minutes before each wave start.',
    shuttle:
      'No shuttle — the start, finish, and all aid stations are accessible by car for crew. Parking at outlying aid is informal road-side.',
    spectatorTips:
      'Best viewing: Bleriot Ferry crossing (km 25), Last Chance Saloon at the bottom of the climb (km 61), and the BCF finish chute. Cable ferry runs continuously through the morning.',
    hostGuideUrl: 'https://www.granfondobadlands.ca/',
  },

  cartographerNotes:
    'The four distances share a spine: every rider rolls out east from the Badlands Community Facility and crosses the Red Deer River at the Bleriot Ferry around km 25. From there the loops diverge — Velociraptor turns at km 33, Triceratops at km 38 (the Bacon Station), T-Rex at km 81, Brontosaurus carries on east to Dorothy Community Centre at km 128 before swinging back. This is open prairie cycling: minimal shade, sustained crosswinds across the coulee tops, and one technical climb sequence between Last Chance Saloon and East Coulee. Carry more water than you think on the longer loops — gaps between aid stretch to 30 km on the Brontosaurus return. The cable ferry across the Red Deer River is a working ferry, not a race control: queue patiently, wait for the volunteers to wave you on, single-file across. Bacon at the Bacon Station is real and worth slowing down for. The Brontosaurus 163K is the published 9-hour-cutoff flagship; pace it like an honest century, not a fast metric.',

  crossLinks: [
    { slug: 'wild-goose',          name: 'Wild Goose Trail Festival',  region: 'Wawayanda · NJ' },
    { slug: 'tupper-lake-tinman',  name: 'Tupper Lake Tinman 13.1M',   region: 'Tupper Lake · NY' },
    { slug: 'manitous-revenge',    name: "Manitou's Revenge 54M",       region: 'Catskill Devil’s Path · NY' },
    { slug: 'escarpment',          name: 'Escarpment Trail Run 30K',    region: 'Catskill High Peaks · NY' },
    { slug: 'golden-leaf',         name: 'Golden Leaf Half Marathon',   region: 'Aspen · CO' },
  ],
};
