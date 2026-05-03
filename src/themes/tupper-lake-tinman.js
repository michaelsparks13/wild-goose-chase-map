// tupper-lake-tinman.js — RaceTheme for the run-course pages of the
// Tupper Lake Tinman, Olympic, and Sprint triathlons. June 27, 2026.
//
// Mirrors RaceTheme in ./race-theme.ts. Run-only scope: this page does
// NOT map the swim or bike legs. References to swim/bike timing exist
// only as honest context so athletes know what they're looking at.
//
// Palette is extracted from the Tinman's actual brand identity (yellow
// on black on cream, sampled from the host site's logo and
// historical race signage), not invented from a romantic idea of the
// Adirondacks.

module.exports = {
  slug: 'tupper-lake-tinman',

  identity: {
    name: 'Tupper Lake Tinman',
    shortName: 'Tinman',
    hostOrg: 'Adirondack Sports Council',
    hostUrl: 'https://www.tupperlaketinman.com/',
    establishedYear: 1982,
  },

  // Tinman brand: school-bus yellow on near-black. The yellow is the
  // signature color on the logo, race bibs, and finisher medals. Paper
  // is a warm off-white that pairs without going clinical.
  palette: {
    raceBrand:    '#F5C518', // Tinman yellow — sampled from the logo
    raceInk:      '#1a1a1a', // near-black
    paper:        '#f6f1e7', // warm off-white, race-week page substrate
    surfaceWarm:  '#ede4cf', // section background, slightly recessed from paper
    routeColor:   '#C8102E', // half-marathon red (high contrast on paper basemap)
    aidStation:   '#0F6C8A', // utility blue for aid pins
    hazard:       '#B53528', // cutoff / hazard
  },

  type: {
    // Display: a slab/serif under 28px. Used only in the small wordmark
    // and the printable cue sheet header. Roboto Slab pairs well with
    // the Tinman logo's industrial slab character.
    display: 'Roboto Slab',
    // Body: workhorse reading face for cue rows, table rows, and notes.
    body:    'Source Serif 4',
    // Mono: technical strip — distances, elevations, times.
    micro:   'JetBrains Mono',
    googleFontsHref:
      'https://fonts.googleapis.com/css2?' +
      'family=Roboto+Slab:wght@500;600;700&' +
      'family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,500;0,8..60,600;1,8..60,400&' +
      'family=JetBrains+Mono:wght@400;500;600&display=swap',
    displayStack: "'Roboto Slab', Georgia, 'Times New Roman', serif",
    bodyStack:    "'Source Serif 4', Georgia, 'Times New Roman', serif",
    microStack:   "'JetBrains Mono', 'IBM Plex Mono', 'SF Mono', Menlo, Consolas, monospace",
  },

  raceFormat: {
    discipline: 'triathlon',
    hasSwim: true,           // race has a swim, but it is NOT mapped here
    hasTransitions: true,    // honest run-start windows, not single gun time
    defaultDistanceId: 'tinman',
    distances: [
      { id: 'sprint',  label: 'Sprint',  runMiles: 3.1,  runGainFt: 193, color: '#F5C518', runStartWindow: '9:15 – 9:45 AM (after T2)' },
      { id: 'olympic', label: 'Olympic', runMiles: 6.2,  runGainFt: 218, color: '#2E7D32', runStartWindow: '10:00 – 10:45 AM (after T2)' },
      { id: 'tinman',  label: 'Tinman',  runMiles: 13.1, runGainFt: 407, color: '#C8102E', runStartWindow: '11:30 AM – 12:45 PM (after T2)' },
    ],
  },

  geography: {
    region: 'Tupper Lake, NY · Adirondack Park',
    startLat: 44.22999,
    startLng: -74.46478,
    elevationStory:
      'A flat village circuit with under 410 ft of run-leg gain — mostly paved roads between Raquette Pond and Little Wolf Pond.',
    surface: ['paved village streets', 'lakeside out-and-back', 'short shaded sections through Tupper Lake'],
    weatherStation: 'KSLK', // Saranac Lake Adirondack Regional, ~10mi NE
  },

  raceDay: {
    date: '2026-06-27',
    displayDate: 'Sat, Jun 27, 2026',
    gunTime: '8:00 AM',
    sunrise: '5:09 AM',
    sunset:  '8:48 PM',
    startTimes: [
      { distance: 'sprint',  time: 'Run starts ~9:15 AM (after T2)' },
      { distance: 'olympic', time: 'Run starts ~10:00 AM (after T2)' },
      { distance: 'tinman',  time: 'Run starts ~11:30 AM (after T2)' },
    ],
    cutoffs: [], // host race holds final-call discretion; not duplicated here
  },

  // Names align with data/aid-stations.json mile values; the table on the
  // page is generated from this list, not re-keyed from the JSON, so a
  // single source of truth governs both the map markers and the table.
  aidStations: [
    { name: 'Park Street',          mile: 1.4,  stocked: 'Water · Powerade · gels' },
    { name: 'Civic Center',         mile: 2.7,  stocked: 'Water · Powerade · oranges · pretzels' },
    { name: 'Demars Boulevard',     mile: 4.1,  stocked: 'Water · Powerade' },
    { name: 'Wild Center',          mile: 5.6,  stocked: 'Water · Powerade · Coca-Cola · gels' },
    { name: 'Little Wolf Pond Turn',mile: 7.0,  stocked: 'Water · Powerade · ice (hot day)' },
    { name: 'Wild Center Return',   mile: 8.3,  stocked: 'Water · Powerade · Coca-Cola' },
    { name: 'Civic Center Return',  mile: 10.5, stocked: 'Water · Powerade · oranges · pretzels' },
    { name: 'Park Street Return',   mile: 12.0, stocked: 'Water · Powerade · gels · ice' },
  ],

  logistics: {
    parking:
      'Athlete parking at the Tupper Lake Municipal Park lot and overflow at the Civic Center. Spectator parking on Park Street and Demars Blvd; avoid the run course shoulders.',
    packetPickup:
      'Friday June 26, 4:00–8:00 PM at Tinman Beach. Limited race-morning pickup from 6:00–7:30 AM.',
    shuttle:
      'No spectator shuttle. The run course is walkable from any village parking lot.',
    spectatorTips:
      'The Civic Center (mi 2.7 / 10.5) is the best spot to see runners twice; the Wild Center turnaround (mi 7) is the only place you’ll see them mid-stride between the two passes.',
    hostGuideUrl: 'https://www.tupperlaketinman.com/',
  },

  cartographerNotes:
    'The run is paved village streets and lakeside out-and-back, almost entirely flat — what makes it bite is sun exposure between miles 4 and 7, where you’re on open road with no shade and the asphalt has held the day’s heat. Drink at every aid station from Demars Boulevard onward, even if you don’t feel like it. The Sprint, Olympic, and Tinman share the same first 1.5 miles before they fan out: watch the painted marks at the Park Street split, where the Sprint turns back while Olympic and Tinman continue. The only place a spectator can realistically see you mid-stride is the Wild Center turnaround at mile 7; everywhere else they’ll see you twice on opposite sides of the road, so plan the rendezvous accordingly.',

  crossLinks: [
    { slug: 'escarpment',        name: 'Escarpment Trail Run 30K',  region: 'Catskill High Peaks · NY' },
    { slug: 'manitous-revenge',  name: "Manitou's Revenge 54M",     region: 'Catskill Devil’s Path · NY' },
    { slug: 'sleeping-giant',    name: 'Sleeping Giant 25K',        region: 'Mt. Carmel · CT' },
    { slug: 'wild-goose',        name: 'Wild Goose Trail Festival', region: 'Wawayanda State Park · NJ' },
    { slug: 'golden-leaf',       name: 'Golden Leaf Half Marathon', region: 'Aspen · CO' },
  ],

  scopeNote:
    'Run course only. For swim and bike routes, see the official race site.',
};
