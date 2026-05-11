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
    raceBrand:    '#4F5F2D', // deep Sassquad olive (between Wix color_24 + color_25)
    raceInk:      '#1a1a1a', // near-black, matches Sassquad body ink
    paper:        '#faf7ed', // cream-white substrate — barely tinted, no pure white
    surfaceWarm:  '#efe9d5', // recessed kraft surface, distinct from paper
    routeColor:   '#1a1a1a', // course default ink when no loop highlighted
    aidStation:   '#FDD80D', // Sassquad golden yellow (Wix --color_28)
    hazard:       '#B53528', // warm rust — no-aid-on-course strip + bears
    accent:       '#D4FC79', // Sassquad chartreuse (Wix --color_22) — active states
    darkForest:   '#353F1E', // Sassquad dark forest (Wix --color_25) — deep tone
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
    loops: [
      {
        id: 'checkered',
        displayName: 'Checkered',
        miles: 4.75,
        elevationGain: 479,
        color: '#1f1d18',
        pattern: 'checkered',
        defaultDirection: 'CW',
        cues: [
          { mile: 0.0, kind: 'landmark', text: 'Leave Squatch HQ via the lake beach access trail.' },
          { mile: 1.2, kind: 'surface',  text: 'Doublewide singletrack settles into rolling forest floor — the most runnable loop in the festival.' },
          { mile: 2.6, kind: 'landmark', text: 'Iron Furnace ruins on the right; the trail wraps the historic mining site before turning back toward the lake.' },
          { mile: 4.5, kind: 'water',    text: 'Lake views resume; finish chute leads straight into HQ aid.' },
        ],
      },
      {
        id: 'blue',
        displayName: 'Blue',
        miles: 6.0,
        elevationGain: 600,
        color: '#1E66D0',
        defaultDirection: 'CW',
        cues: [
          { mile: 0.0, kind: 'landmark', text: 'Start onto the Banker Trail — blue blazes leading north out of HQ.' },
          { mile: 1.4, kind: 'hazard',   text: 'Wooden footbridge with an awkward step-down on the far side — slow through here, especially wet.' },
          { mile: 2.8, kind: 'surface',  text: 'Trail shifts to rooty singletrack with rolling micro-climbs through hemlock stands.' },
          { mile: 4.5, kind: 'landmark', text: 'Joins the shared Pink/Blue corridor along Laurel Pond and Double Pond trails.' },
          { mile: 5.7, kind: 'water',    text: 'Return down the doubletrack to HQ; no on-course water between here and the aid station.' },
        ],
      },
      {
        id: 'pink',
        displayName: 'Pink',
        miles: 7.75,
        elevationGain: 840,
        color: '#E7338C',
        defaultDirection: 'CW',
        cues: [
          { mile: 0.0, kind: 'landmark', text: 'Climb west out of HQ along the Lookout Trail; pink blazes lead through mountain laurel.' },
          { mile: 1.8, kind: 'hazard',   text: 'Wood-plank boardwalks begin — single-file, narrow, no passing zone. Trekking poles fold here.' },
          { mile: 2.6, kind: 'surface',  text: 'Technical rocks and roots stretch — runnable for Hudson Highlands locals, technical for runners off Long Island flats. Walk what you would otherwise risk an ankle on.' },
          { mile: 4.2, kind: 'landmark', text: 'High point of the loop with seasonal ridge views; descent begins.' },
          { mile: 5.5, kind: 'surface',  text: 'Joins the shared Pink/Blue corridor — listen for blazes shifting from pink to dual pink/blue.' },
          { mile: 7.4, kind: 'water',    text: 'Final descent into HQ aid.' },
        ],
      },
    ],

    // Distances offered in 2026. Order = chip-strip order. The Kids 1M
    // is a separate non-loop course on Sunday morning and is captured in
    // the cartographer notes rather than as a Distance entry.
    distances: [
      {
        id: '10k',
        label: '10K',
        runMiles: 6,
        runGainFt: 600,
        color: '#5D8AA8',
        cutoff: '10h',
        assembly: [
          { loopId: 'blue', direction: 'CW' },
        ],
      },
      {
        id: 'half',
        label: 'Half Marathon',
        runMiles: 13.75,
        runGainFt: 1414,
        color: '#3A6B3F',
        cutoff: '10h',
        assembly: [
          { loopId: 'blue', direction: 'CW' },
          { loopId: 'pink', direction: 'CW' },
        ],
      },
      {
        id: '50k',
        label: '50K',
        runMiles: 31.0,
        runGainFt: 3238,
        color: '#D9952F',
        cutoff: '12h',
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
        label: '50 Miler',
        runMiles: 50.75,
        runGainFt: 5272,
        color: '#B45A1F',
        cutoff: '36h',
        assembly: [
          { loopId: 'checkered', direction: 'CW' },
          { loopId: 'blue',      direction: 'CW' },
          { loopId: 'pink',      direction: 'CW' },
          { loopId: 'checkered', direction: 'CW' },
          { loopId: 'blue',      direction: 'CW' },
          { loopId: 'pink',      direction: 'CW' },
          { loopId: 'blue',      direction: 'CW' },
          { loopId: 'pink',      direction: 'CW' },
        ],
      },
      {
        id: '100k',
        label: '100K',
        runMiles: 62.0,
        runGainFt: 6476,
        color: '#A03060',
        cutoff: '36h',
        assembly: [
          { loopId: 'pink',      direction: 'CW' },
          { loopId: 'checkered', direction: 'CW' },
          { loopId: 'blue',      direction: 'CW' },
          { loopId: 'pink',      direction: 'CW' },
          { loopId: 'checkered', direction: 'CW' },
          { loopId: 'pink',      direction: 'CW' },
          { loopId: 'checkered', direction: 'CW' },
          { loopId: 'blue',      direction: 'CW' },
          { loopId: 'pink',      direction: 'CW' },
          { loopId: 'checkered', direction: 'CW' },
        ],
      },
      {
        id: '100m',
        label: '100 Miler',
        runMiles: 100.25,
        runGainFt: 11239,
        color: '#3A3A40',
        cutoff: '36h',
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
        ],
      },
    ],
  },

  geography: {
    region: 'Wawayanda State Park · Hewitt, NJ',
    startLat: 41.1905,
    startLng: -74.4292,
    elevationStory:
      'Loop course out of Squatch HQ on Wawayanda Lake — mixed doublewide, singletrack, boardwalk, and one awkward bridge. Pink carries the rocky technical sections and the wood-plank boardwalks; Blue and Checkered are the more runnable laps.',
    surface: ['doublewide forest road', 'rooty singletrack', 'wood-plank boardwalk (Pink loop)', 'short ridge climbs'],
    waterFeature: 'Wawayanda Lake',
    weatherStation: 'KFWN', // Greenwood Lake Airport — closest reporting station
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

  scopeNote:
    'Course only. Multi-day festival schedule, registration, kids course, and rules live on Sassquad’s site.',
};
