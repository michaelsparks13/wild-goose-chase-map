// tupper-lake-tinman.js — concrete RaceTheme for the 44th-running Tinman.
// Voice: archival. Treatment: gallery-frame. Texture: paper-grain.
// Mirrors RaceTheme in ./race-theme.ts.

module.exports = {
  slug: 'tupper-lake-tinman',

  identity: {
    name: 'Tupper Lake Tinman',
    nameDisplay: 'Tupper Lake<br/><em>Tinman</em>',
    tagline: 'Race the Adirondacks',
    hostOrg: 'Adirondack Sports Council',
    establishedYear: 1982,
    raceDay: 'June 27, 2026 · 8:00 AM rolling start',
  },

  geography: {
    region: 'Tupper Lake, NY · Adirondack Park',
    elevationStory:
      'A flat village circuit between Raquette Pond and Little Wolf Pond — under 410 ft of gain across the full half.',
    surface: ['paved road', 'village streets', 'lakeside out-and-back'],
    waterFeature: 'Raquette Pond (swim start, 68°F race-week median)',
  },

  palette: {
    paper:  '#ece4d3', // warm cream substrate
    ink:    '#1a1c1c', // near-black, slight green-blue
    accent: '#9b3a2e', // tinman red-clay (desaturated for chrome)
    warm:   '#d99458', // sunrise hit (swim start)
    cool:   '#1f4659', // alpine lake blue
  },

  type: {
    display: 'Fraunces',
    body: 'Spectral',
    micro: 'JetBrains Mono',
    googleFontsHref:
      'https://fonts.googleapis.com/css2?' +
      'family=Fraunces:opsz,wght,SOFT,WONK@9..144,400;9..144,500;9..144,600;9..144,700;9..144,900;9..144,400..900&' +
      'family=Spectral:ital,wght@0,300;0,400;0,500;0,600;1,400;1,500&' +
      'family=JetBrains+Mono:wght@400;500;600&display=swap',
    displayStack: "'Fraunces', 'Spectral', Georgia, 'Times New Roman', serif",
    bodyStack:    "'Spectral', Georgia, 'Times New Roman', serif",
    microStack:   "'JetBrains Mono', 'IBM Plex Mono', 'SF Mono', Menlo, Consolas, monospace",
  },

  voice: 'archival',
  heroTreatment: 'gallery-frame',
  texture: 'paper-grain',

  courseData: [
    { label: 'Established',     value: '1982' },
    { label: 'Edition',         value: 'XLIV',     unit: '44th running' },
    { label: 'Race day',        value: 'June 27',  unit: '2026' },
    { label: 'Gun time',        value: '8:00',     unit: 'AM rolling start' },
    { label: 'Sunrise',         value: '5:09',     unit: 'AM ET' },
    { label: 'Sunset',          value: '8:48',     unit: 'PM ET' },
    { label: 'Air, race week',  value: '70 / 51',  unit: '°F H/L median' },
    { label: 'Water, race week',value: '68',       unit: '°F surface' },
    { label: 'Tinman swim',     value: '1.2',      unit: 'mi' },
    { label: 'Tinman bike',     value: '56',       unit: 'mi' },
    { label: 'Tinman run',      value: '13.1',     unit: 'mi' },
    { label: 'Run gain',        value: '407',      unit: 'ft' },
    { label: 'Surface',         value: 'Paved village + lakeside' },
    { label: 'Aid stations',    value: '8',        unit: 'on the run course' },
    { label: 'Recognition',     value: 'Triathlete · Best Half-Distance 2026' },
    { label: 'T2 / Run start',  value: 'Tinman Beach, Raquette Pond' },
  ],

  disciplines: [
    { label: 'Swim', distance: '1.2 mi · Raquette Pond' },
    { label: 'Bike', distance: '56 mi · NY-30 corridor' },
    { label: 'Run',  distance: '13.1 mi · Tupper Lake village' },
  ],

  fieldNotes:
    'Forty-four years of the same start line on Raquette Pond, and almost no two editions have asked the same question of the run leg. The job here was to draw the village without flattening it — to keep the History Museum, the Civic Center, and the Train Station legible at print size while honoring the fact that the Tinman is, mostly, a flat course that hides its work in the last three miles between the Wild Center and the turnaround at Little Wolf Pond.',

  acquisition: {
    print: {
      sizes: ['18 × 24 in', '24 × 36 in'],
      price: 'from $48',
      href: 'mailto:hello@falsesummitstudio.com?subject=Tinman%20print',
    },
    digital: {
      format: 'High-resolution PDF · CMYK + sRGB',
      price: '$22',
      href: 'mailto:hello@falsesummitstudio.com?subject=Tinman%20digital',
    },
    commission: {
      lede: 'A map for your race, drawn the same way.',
      href: 'mailto:hello@falsesummitstudio.com?subject=Commission%20inquiry',
    },
  },

  crossLinks: [
    { slug: 'escarpment',      name: 'Escarpment Trail Run 30K',  region: 'Catskill High Peaks · NY' },
    { slug: 'manitous-revenge',name: "Manitou's Revenge 54M",     region: 'Catskill Devil’s Path · NY' },
    { slug: 'sleeping-giant',  name: 'Sleeping Giant 25K',        region: 'Mt. Carmel · CT' },
    { slug: 'wild-goose',      name: 'Wild Goose Trail Festival', region: 'Wawayanda State Park · NJ' },
    { slug: 'golden-leaf',     name: 'Golden Leaf Half Marathon', region: 'Aspen, CO' },
  ],

  wordmark: 'Race the Adirondacks',

  mapCaption: 'The run leg of the Tinman, Olympic, and Sprint — drawn from NYSDOT centerlines and the 2025 official race route sheet.',
};
