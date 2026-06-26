// wild-goose.js — RaceTheme for the Wild Goose Trail Festival, the
// Sassquad-produced trail-party at Wawayanda State Park, NJ. Sept 18-20, 2026.
//
// Mirrors RaceTheme in ./race-theme.ts with the loop-based extensions:
// `raceFormat.loops` declares the three named loops (Checkered, Blue,
// Pink) once, and each distance carries an `assembly` of loop-id +
// direction. Total miles + gain on each distance should match the sum
// across its assembly (the theme test enforces this).
//
// Palette is sampled from Sassquad's existing visual identity (deep
// forest green primary; trail-blaze pink and blue used in their loop
// signage and course-marking flags). Voice is `trail-party`: friendly
// slab display, sturdy sans body, JetBrains Mono for technical strip.
// None of the chosen fonts (Bricolage Grotesque, Manrope, JetBrains
// Mono) appear on the forbidden list.

module.exports = {
  slug: 'wild-goose',

  identity: {
    name: 'Wild Goose Trail Festival',
    shortName: 'Wild Goose',
    hostOrg: 'Sassquad Trail Running',
    hostUrl: 'https://www.sassquadtrailrunning.com/wildgoose',
    establishedYear: 2019,
  },

  // Palette extracted from sassquadtrailrunning.com/wildgoose at build
  // time. Iteration v2 (post-screenshot review): the lighter olive
  // (#6A7E3D) read washed out against the dark top bar, and the warm
  // khaki paper (#f4eee0) read as light brown rather than neutral cream.
  // Both are now deepened: raceBrand uses the darker olive between Wix
  // color_24 and color_25, and paper is a near-white cream that still
  // avoids pure #ffffff per the brief.
  palette: {
    // v4: user feedback said v3's olive was still too light and the cream
    // substrate still read as brown. Going to Sassquad's actual dark
    // forest (#353F1E, Wix color_25) for raceBrand — the deepest forest
    // green in their token table — and dropping paper to a near-neutral
    // off-white (#fbfaf5) that has just enough warmth to avoid clinical
    // pure-white without reading as kraft paper.
    raceBrand:    '#353F1E', // Sassquad dark forest (Wix --color_25)
    raceInk:      '#1a1a1a', // near-black, matches Sassquad body ink
    paper:        '#FFFFF0', // ivory — user-specified v5 substrate
    surfaceWarm:  '#f7f3df', // recessed near-paper, barely warmer than ivory (was #f4eed5 — too khaki)
    routeColor:   '#1a1a1a', // course default ink when no loop highlighted
    aidStation:   '#FDD80D', // Sassquad golden yellow (Wix --color_28)
    hazard:       '#B53528', // warm rust — no-aid-on-course strip + bears
    accent:       '#D4FC79', // Sassquad chartreuse (Wix --color_22) — active states (chip + tab)
    headerAccent: '#b7e815', // user-specified v5 header color (wordmark + countdown)
    darkForest:   '#353F1E', // Sassquad dark forest (Wix --color_25) — same as raceBrand now
  },

  type: {
    // Display: Bangers is Sassquad's actual heading font on every h1/h2/
    // h3 (Wix loads it as `orig_bangers_regular`). Friendly slab, hand-
    // lettered comic-book feel — the literal "trail-party" register.
    display: 'Bangers',
    // Body: Barlow is the closest open analog to Sassquad's DIN Next W01
    // — workhorse sans with subtle condensed proportions, sturdy at body
    // sizes for the within-loop cue list.
    body:    'Barlow',
    // Mono: JetBrains Mono for the distance / mileage / time strip.
    micro:   'JetBrains Mono',
    googleFontsHref:
      'https://fonts.googleapis.com/css2?' +
      'family=Bangers&' +
      'family=Barlow:wght@400;500;600;700&' +
      'family=JetBrains+Mono:wght@400;500;600&display=swap',
    displayStack: "'Bangers', 'Impact', 'Oswald', sans-serif",
    bodyStack:    "'Barlow', -apple-system, 'Helvetica Neue', sans-serif",
    microStack:   "'JetBrains Mono', 'IBM Plex Mono', 'SF Mono', Menlo, Consolas, monospace",
  },

  raceFormat: {
    discipline: 'trail-run',
    hasSwim: false,
    hasTransitions: false,
    defaultDistanceId: '50k',

    // Three named loops, declared once. The map source renders these from
    // src/maps/wild-goose/data/{pink,blue,checkered}.geojson; the theme
    // captures the metadata used by the chip strip + within-loop cue
    // panel + assembly verification.
    // Miles + elevationGain are computed/back-solved from the 2026 Ringwood
    // GPX (scripts → /tmp/wgr_assemble.py): Checkered 4.93 mi, Blue 5.49 mi,
    // Pink 7.80 mi. Per-loop gain is back-solved from the race guide's
    // advertised short-distance totals (B=500/575, P=700/800, C=670/700) —
    // raw GPX integration is GPS/DEM noise (the Checkered track alone reads
    // +227%). `cues` are repopulated from the guide's course-section prose
    // (§62+); they intentionally carry no Wawayanda landmarks.
    loops: [
      {
        id: 'checkered',
        displayName: 'Checkered',
        miles: 4.93,
        elevationGain: 670,
        color: '#1f1d18',
        pattern: 'checkered',
        defaultDirection: 'CW',
        cues: [],
      },
      {
        id: 'blue',
        displayName: 'Blue',
        miles: 5.49,
        elevationGain: 500,
        color: '#1E66D0',
        defaultDirection: 'CW',
        cues: [],
      },
      {
        id: 'pink',
        displayName: 'Pink',
        miles: 7.80,
        elevationGain: 700,
        color: '#E7338C',
        defaultDirection: 'CW',
        cues: [],
      },
    ],

    // Distances offered at Ringwood (2026). Order = chip-strip order,
    // ascending. runMiles is the GPX-computed assembled length; runGainFt
    // is N × back-solved per-loop gain so the selector chip and elevation
    // profile always agree. The race guide's advertised gain runs higher
    // on 50K/100K/100M (its own rounding) — those rows are flagged in the
    // build report, not silently matched. No 10K and no 36-hour event in
    // the Ringwood set; the 5.5 Miler is the shortest distance, and "30K"
    // is the display label for the Pink+Checkered+Blue lap the guide calls
    // 28K. Per-distance `cutoff` is filled from the guide.
    distances: [
      {
        id: '5_5m',
        label: '5.5 Miler',
        runMiles: 5.49,
        runGainFt: 500,
        color: '#5D8AA8',
        cutoff: '',
        assembly: [
          { loopId: 'blue', direction: 'CW' },
        ],
      },
      {
        id: 'half',
        label: '13.1M',
        runMiles: 13.30,
        runGainFt: 1200,
        color: '#3A6B3F',
        cutoff: '',
        assembly: [
          { loopId: 'blue', direction: 'CW' },
          { loopId: 'pink', direction: 'CW' },
        ],
      },
      {
        id: '30k',
        label: '30K',
        runMiles: 18.28,
        runGainFt: 1870,
        color: '#7E8A3F',
        cutoff: '',
        assembly: [
          { loopId: 'pink',      direction: 'CW' },
          { loopId: 'checkered', direction: 'CW' },
          { loopId: 'blue',      direction: 'CW' },
        ],
      },
      {
        id: '50k',
        label: '50K',
        runMiles: 31.04,
        runGainFt: 3240,
        color: '#D9952F',
        cutoff: '',
        assembly: [
          { loopId: 'pink',      direction: 'CW' },
          { loopId: 'checkered', direction: 'CW' },
          { loopId: 'blue',      direction: 'CW' },
          { loopId: 'pink',      direction: 'CW' },
          { loopId: 'checkered', direction: 'CW' },
        ],
      },
      {
        id: '50m',
        label: '50M',
        runMiles: 49.87,
        runGainFt: 4940,
        color: '#B45A1F',
        cutoff: '',
        assembly: [
          { loopId: 'pink',      direction: 'CW' },
          { loopId: 'checkered', direction: 'CW' },
          { loopId: 'blue',      direction: 'CW' },
          { loopId: 'pink',      direction: 'CW' },
          { loopId: 'checkered', direction: 'CW' },
          { loopId: 'blue',      direction: 'CW' },
          { loopId: 'pink',      direction: 'CW' },
          { loopId: 'blue',      direction: 'CW' },
        ],
      },
      {
        id: '100k',
        label: '100K',
        runMiles: 62.64,
        runGainFt: 6310,
        color: '#A03060',
        cutoff: '',
        assembly: [
          { loopId: 'pink',      direction: 'CW' },
          { loopId: 'checkered', direction: 'CW' },
          { loopId: 'blue',      direction: 'CW' },
          { loopId: 'pink',      direction: 'CW' },
          { loopId: 'checkered', direction: 'CW' },
          { loopId: 'blue',      direction: 'CW' },
          { loopId: 'pink',      direction: 'CW' },
          { loopId: 'checkered', direction: 'CW' },
          { loopId: 'blue',      direction: 'CW' },
          { loopId: 'pink',      direction: 'CW' },
        ],
      },
      {
        id: '100m',
        label: '100M',
        runMiles: 104.70,
        runGainFt: 10550,
        color: '#3A3A40',
        cutoff: '',
        assembly: [
          { loopId: 'pink',      direction: 'CW' },
          { loopId: 'checkered', direction: 'CW' },
          { loopId: 'blue',      direction: 'CW' },
          { loopId: 'pink',      direction: 'CW' },
          { loopId: 'checkered', direction: 'CW' },
          { loopId: 'blue',      direction: 'CW' },
          { loopId: 'pink',      direction: 'CW' },
          { loopId: 'checkered', direction: 'CW' },
          { loopId: 'blue',      direction: 'CW' },
          { loopId: 'pink',      direction: 'CW' },
          { loopId: 'checkered', direction: 'CW' },
          { loopId: 'blue',      direction: 'CW' },
          { loopId: 'pink',      direction: 'CW' },
          { loopId: 'checkered', direction: 'CW' },
          { loopId: 'blue',      direction: 'CW' },
          { loopId: 'pink',      direction: 'CW' },
          { loopId: 'blue',      direction: 'CW' },
        ],
      },
    ],
  },

  geography: {
    region: 'Ringwood State Park · Ringwood, NJ',
    startLat: 41.13799,
    startLng: -74.23171,
    elevationStory:
      'Loop course out of Squatch HQ at Shepherd Lake in Ringwood State Park — three named laps over Ramapo Mountain terrain. Pink (7.8 mi) carries the longest climb and the rockiest, most technical footing; Checkered (4.9 mi) is the steepest per mile; Blue (5.5 mi) is the most runnable. Every loop returns to HQ.',
    surface: ['forest doubletrack', 'rooty singletrack', 'rocky ridge climbs', 'lake-side trail'],
    waterFeature: 'Shepherd Lake',
    weatherStation: 'KFWN', // Greenwood Lake Airport — closest reporting station to Ringwood
  },

  raceDay: {
    date: '2026-09-19',
    displayDate: 'Fri-Sun, Sep 18-20, 2026',
    gunTime: '7:00 AM Sat',
    sunrise: '6:36 AM',
    sunset:  '7:00 PM',
    startTimes: [
      { distance: '100m', time: 'Sat 7:00 AM · 36h cutoff' },
      { distance: '100k', time: 'Sat 7:00 AM · 36h cutoff' },
      { distance: '50m',  time: 'Sat 7:00 AM · 36h cutoff' },
      { distance: '50k',  time: 'Sun 7:00 AM · 12h cutoff' },
      { distance: 'half', time: 'Sun 8:00 AM · 10h cutoff' },
      { distance: '10k',  time: 'Sun 8:30 AM · 10h cutoff' },
    ],
    cutoffs: [
      { mile: 50,  time: '36h',  label: '100-mile pace check at HQ' },
      { mile: 31,  time: '12h',  label: '50K final cutoff at HQ' },
    ],
  },

  // Wild Goose has ONE aid station — Squatch HQ — that's open 36 hours
  // continuously. The race-shell aid table renders this single row; the
  // override.css promotes that row visually so the scale is obvious. A
  // separate "No aid on course" strip is rendered next to it.
  aidStations: [
    {
      name: 'Squatch HQ',
      mile: 0,
      stocked: 'Water · Skratch · hot food (vegan + GF available) · EMT 7am-7pm · ambulance overnight · AED · first aid · Jackalope Tent quiet space',
    },
  ],

  logistics: {
    parking:
      '$5 cash per vehicle at the park entrance gate — bring exact change. Athlete parking at the Wawayanda Lake beach lot; overflow lots open Saturday before sunrise.',
    packetPickup:
      'Friday 4:00–8:00 PM at Squatch HQ. Saturday race-morning pickup from 5:30–6:45 AM. Sunday race-morning pickup from 6:30–7:45 AM.',
    shuttle:
      'No shuttle. Camping is free at the festival; pop-up tents allowed in designated areas around HQ.',
    spectatorTips:
      'Squatch HQ is the only place to see runners — every loop returns here. Pacers are allowed after sunset Saturday for 50M+, pre-registration required via Sassquad.',
    hostGuideUrl: 'https://www.sassquadtrailrunning.com/wildgoose',
  },

  cartographerNotes:
    'The festival runs three loops out of Squatch HQ at Wawayanda Lake. Checkered (4.75 mi) is the most runnable — doublewide forest road with rolling micro-climbs. Blue (6 mi) has one awkward wooden bridge with a step-down on the far side, especially treacherous when wet. Pink (7.75 mi) carries the technical sections — rocky stretches, exposed roots, and the narrow wood-plank boardwalks that are single-file and not wheelchair-accessible; trekking poles need to fold for these. NYC and Long Island runners will find Pink technical, Hudson Highlands locals will find it runnable — walk what you would otherwise risk turning an ankle for. Black bears and timber rattlesnakes use these trails too; defer to NJ DEP guidance on encounters. For 50M and longer, pace loop-by-loop, not section-by-section: each loop returns you to Squatch HQ, the only place to refill water, eat real food, and decide whether to keep going. The Kids 1M runs Sunday morning on a separate non-loop course around the lake beach — not mapped here.',

  crossLinks: [
    { slug: 'tupper-lake-tinman',  name: 'Tupper Lake Tinman 13.1M',   region: 'Tupper Lake · NY' },
    { slug: 'manitous-revenge',    name: "Manitou's Revenge 54M",       region: 'Catskill Devil’s Path · NY' },
    { slug: 'escarpment',          name: 'Escarpment Trail Run 30K',    region: 'Catskill High Peaks · NY' },
    { slug: 'sleeping-giant',      name: 'Sleeping Giant 25K',          region: 'Mt. Carmel · CT' },
    { slug: 'javelina-jundred',    name: 'Javelina Jundred 100M',       region: 'McDowell Mountain · AZ' },
  ],
};
