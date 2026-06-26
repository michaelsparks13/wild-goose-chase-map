// wild-goose-ringwood.js — RaceTheme for the 2026 Wild Goose Trail Festival,
// the Sassquad-produced trail-party relocated to Ringwood State Park (Shepherd
// Lake), Ringwood, NJ. Sept 18-20, 2026. The original /wild-goose theme
// (Wawayanda venue) is preserved unchanged; this is a separate venue build.
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
  slug: 'wild-goose-ringwood',

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
        cues: [
          { mile: 0.0, kind: 'landmark', text: 'Leave Squatch HQ — the first ¼ mile shares the Pink/Blue corridor before branching off.' },
          { mile: 0.5, kind: 'surface',  text: '100% singletrack from here — the shortest and spiciest loop of the festival.' },
          { mile: 1.8, kind: 'hazard',   text: 'A couple of sustained climbs over 100 ft of vert — the steepest grade per mile on the course.' },
          { mile: 3.6, kind: 'surface',  text: 'Technical singletrack eases; the final ½ mile rejoins the Pink/Blue corridor.' },
          { mile: 4.8, kind: 'water',    text: 'Finish chute back into Squatch HQ aid.' },
        ],
      },
      {
        id: 'blue',
        displayName: 'Blue',
        miles: 5.49,
        elevationGain: 500,
        color: '#1E66D0',
        defaultDirection: 'CW',
        cues: [
          { mile: 0.0, kind: 'landmark', text: 'Start at Squatch HQ on Shepherd Lake — the first ~2 miles share the Pink corridor.' },
          { mile: 1.2, kind: 'surface',  text: 'Gentle rolling wide woods roads — the most runnable loop of the festival; settle into cruise control.' },
          { mile: 2.8, kind: 'landmark', text: 'Pass quiet ponds and the backside of the NJ Botanical Gardens through deep green canopy.' },
          { mile: 4.5, kind: 'surface',  text: 'Final mile drops onto singletrack rejoining the Pink corridor toward HQ.' },
          { mile: 5.4, kind: 'water',    text: 'Into Squatch HQ — the only aid; refill before the next loop.' },
        ],
      },
      {
        id: 'pink',
        displayName: 'Pink',
        miles: 7.80,
        elevationGain: 700,
        color: '#E7338C',
        defaultDirection: 'CW',
        cues: [
          { mile: 0.0, kind: 'landmark', text: 'Climb out of Squatch HQ; the first ~2 miles co-align with the Blue loop.' },
          { mile: 2.2, kind: 'surface',  text: 'Wide woods roads open up — settle into a rhythm for the scenic tour of Ringwood.' },
          { mile: 3.6, kind: 'landmark', text: 'Cruise past quiet ponds and historic estate ruins dating back to 1922.' },
          { mile: 5.2, kind: 'landmark', text: 'Skirt the backside of the NJ Botanical Gardens — views of the manicured grounds and stone statues.' },
          { mile: 6.6, kind: 'surface',  text: 'Final ~2 miles rejoin the Blue corridor; the last mile is sweet singletrack into HQ.' },
          { mile: 7.7, kind: 'water',    text: 'Back into Squatch HQ aid.' },
        ],
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
        cutoff: '10h',
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
        cutoff: '10h',
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
        cutoff: '10h',
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
        label: '50M',
        runMiles: 49.87,
        runGainFt: 4940,
        color: '#B45A1F',
        cutoff: '36h',
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
        ],
      },
      {
        id: '100m',
        label: '100M',
        runMiles: 104.70,
        runGainFt: 10550,
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
      'Three loops out of Squatch HQ at Shepherd Lake, Ringwood State Park — 18 miles of Ramapo Highlands trail. Blue (5.5 mi) and Pink (7.8 mi) run wide woods roads past quiet ponds, historic estate ruins, and the backside of the NJ Botanical Gardens; Checkered (4.9 mi) is short, spicy, and 100% singletrack with a couple of sustained climbs over 100 ft. No water crossings, no swamps — the Ringwood difference is the sustained climbing. Every loop returns to HQ.',
    surface: ['wide woods roads (Blue + Pink)', 'singletrack (Checkered)', 'sustained climbs over 100 ft', 'lakeside trail at HQ'],
    waterFeature: 'Shepherd Lake',
    weatherStation: 'KFWN', // Greenwood Lake Airport — closest reporting station to Ringwood
  },

  raceDay: {
    date: '2026-09-19',
    displayDate: 'Fri–Sun, Sep 18–20, 2026',
    gunTime: '7:00 AM Sat',
    sunrise: '6:39 AM',
    sunset:  '6:50 PM',
    // Ultras gun Saturday 7 AM with a single 36-hour final-loop cutoff;
    // the Sunday races stagger off 7 AM (50K) and 9 AM (30K/Half/5.5M).
    // The one hard rule for everyone: off the course by 7 PM Sunday.
    startTimes: [
      { distance: '100m', time: 'Sat 7:00 AM · 36h cutoff' },
      { distance: '100k', time: 'Sat 7:00 AM · 36h cutoff' },
      { distance: '50m',  time: 'Sat 7:00 AM · 36h cutoff' },
      { distance: '50k',  time: 'Sun 7:00 AM · 12h cutoff' },
      { distance: '30k',  time: 'Sun 9:00 AM · 10h cutoff' },
      { distance: 'half', time: 'Sun 9:00 AM · 10h cutoff' },
      { distance: '5_5m', time: 'Sun 9:00 AM · 10h cutoff' },
    ],
    cutoffs: [
      { mile: 103, time: '36h', label: '100M final-loop cutoff — 7 PM Sun' },
      { mile: 31,  time: '12h', label: '50K final cutoff — 7 PM Sun' },
      { mile: 18,  time: '10h', label: '30K / Half / 5.5M — 7 PM Sun' },
    ],
  },

  // Wild Goose has ONE aid station — Squatch HQ — open continuously from
  // 7 AM Saturday to 7 PM Sunday. The race-shell aid table renders this
  // single row; override.css promotes it visually so the scale is obvious.
  // A separate "No aid on course" strip is rendered next to it.
  aidStations: [
    {
      name: 'Squatch HQ',
      mile: 0,
      stocked: 'Water · Skratch · Coke · coffee · hot food (burgers, vegan pierogies, GF + vegan options) · on-site pizza for ultra finishers · EMT 7am–7pm · ambulance overnight · AED · first aid (incl. menstrual products) · Jackalope Tent quiet space',
    },
  ],

  logistics: {
    parking:
      '$5 cash parking pass per vehicle — bring exact change; keep the hangtag visible and it covers the whole weekend. 500+ spots by Shepherd Lake. Enter on Sloatsburg Road and follow signs to Shepherd Lake (about 5 minutes in).',
    packetPickup:
      'Friday 6:00–7:00 PM check-in, bib & swag pickup at Squatch HQ (5:00 PM pre-race meeting; film screening 7:15–8:30 PM). Race-morning check-in at HQ before each wave.',
    shuttle:
      'No shuttle. Free camping on the grass field by the lake Friday and Saturday nights (not Sunday) — tents, vans, and RVs welcome, no hookups, no showers. No power outlets in the park; bring battery packs.',
    spectatorTips:
      'Squatch HQ at Shepherd Lake is the only place to see runners — every loop returns here. Restrooms, playground, boat rentals, and lawn games on site. Pacers join 100M/100K/50M runners after sunset (6:50 PM Sat); no pacers for the Sunday races unless 60+ or AWD. Crew helps at HQ only.',
    hostGuideUrl: 'https://www.sassquadtrailrunning.com/wildgoose',
  },

  cartographerNotes:
    'The 2026 festival relocates to Ringwood State Park, running three loops out of Squatch HQ at Shepherd Lake — 18 miles of Ramapo Highlands trail, all returning to HQ. Blue (5.5 mi) is the most runnable: wide woods roads, gentle rolling climbs, quiet ponds, and the backside of the NJ Botanical Gardens. Pink (7.8 mi) is the scenic tour — more wide woods roads past historic estate ruins, with its first and last ~2 miles sharing the Blue corridor and a final mile of sweet singletrack into HQ. Checkered (4.9 mi) is the short, spicy one: 100% singletrack with a couple of sustained climbs over 100 ft of vert. The Ringwood difference from the old Wawayanda course is sustained climbing — there are no water crossings and no swamps here. Squatch HQ and the lakeside get genuinely wet on Saturday and Sunday mornings, so seal anything that needs to stay dry. Black bears, snakes, and ticks share these trails; the park stays open to the public, so expect other hikers and the occasional off-leash dog, and note that hunting is permitted on Saturdays. For 50M and longer, pace loop-by-loop, not section-by-section: each loop returns you to Squatch HQ — the only place to refill, eat real food, and decide whether to keep going. The Kids 1M runs Sunday morning out-and-back on the Blue/Pink trail by the lake — not mapped here.',

  // Editorial section subtitles for the three .essentials sections. Without
  // these, build.js falls back to Tinman triathlon copy ("Run leg only",
  // "Tinman half — Sprint and Olympic", swim/bike timing) — wrong for a loop
  // trail festival. These keep the subs on-brand for Wild Goose at Ringwood.
  editorialCopy: {
    profileSub: 'One continuous profile across your selected loop assembly — every loop returns to Squatch HQ.',
    aidSub:     'One aid station: Squatch HQ at Shepherd Lake. No aid on course — carry water and nutrition between loops.',
    daySub:     'Start times and cutoffs for all seven distances. Everyone must be off the course by 7 PM Sunday.',
  },

  crossLinks: [
    { slug: 'tupper-lake-tinman',  name: 'Tupper Lake Tinman 13.1M',   region: 'Tupper Lake · NY' },
    { slug: 'manitous-revenge',    name: "Manitou's Revenge 54M",       region: 'Catskill Devil’s Path · NY' },
    { slug: 'escarpment',          name: 'Escarpment Trail Run 30K',    region: 'Catskill High Peaks · NY' },
    { slug: 'sleeping-giant',      name: 'Sleeping Giant 25K',          region: 'Mt. Carmel · CT' },
    { slug: 'javelina-jundred',    name: 'Javelina Jundred 100M',       region: 'McDowell Mountain · AZ' },
  ],
};
