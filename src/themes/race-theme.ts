/*
 * race-theme.ts — schema for False Summit Studio race-page themes.
 *
 * This file is the single source of truth for the per-race design system
 * that flexes the editorial chrome around each map. It is intentionally a
 * .ts file so the schema travels with the design intent (voice, treatment,
 * palette tokens), while concrete themes ship as plain CommonJS modules
 * (`./<slug>.js`) consumed by the zero-dependency build pipeline.
 *
 * The build does not run a TS compiler — see ./tupper-lake-tinman.js for
 * the runtime shape, which mirrors `RaceTheme` 1:1.
 */

/** A studio-voice marker that selects a font + tone preset in the chrome. */
export type RaceVoice =
  | 'archival'              // heritage events, transitional serif, restrained
  | 'field-guide'           // working-landscape trail races, slab + reading serif
  | 'editorial'             // flagship races, didone or Caslon revival
  | 'topographic-technical' // alpine / mountain, geometric mono + lining sans
  | 'trail-party';          // community ultras, slab + sturdy sans

/** How the map is *framed* on the page — print-design term, not animation. */
export type HeroTreatment =
  | 'unfurl'                 // the map unfolds across the spread (point-to-point)
  | 'gallery-frame'          // matted with generous margins, museum-print energy
  | 'split-with-elevation'   // map + elevation profile share a left/right split
  | 'parallax-portfolio';    // portfolio-style stacked layout, no parallax-of-stars

/** Substrate texture applied to the page background. */
export type Texture =
  | 'paper-grain'
  | 'topo-lines'
  | 'aerial-noise'
  | 'clean';

/** Identity copy block — race-supplied voice, not the studio's. */
export interface RaceIdentity {
  /** "Tupper Lake Tinman", in title case. The display type does the work. */
  name: string;
  /**
   * Optional HTML override for the masthead headline. Use to wrap a single
   * proper-noun word in <em> for an italic accent ("Tupper Lake <em>Tinman</em>").
   * Sanitised by the build to allow only <em> and <br/>.
   */
  nameDisplay?: string;
  /** A single line in the *race's own* tone of voice — its wordmark, not a marketing slogan. */
  tagline: string;
  /** Producing organisation, written as it appears on the race site. */
  hostOrg: string;
  /** Year of first running, for heritage events. Omit for new races. */
  establishedYear?: number;
  /** Race day display string. e.g. "June 27, 2026". */
  raceDay?: string;
}

/** Geographic specifics — concrete, not "upstate NY". */
export interface RaceGeography {
  /** "Adirondack High Peaks", "Catskill Devil's Path", "Sonoran Desert". */
  region: string;
  /** A human sentence about the elevation story, not a raw integer. */
  elevationStory: string;
  /** Surface composition in priority order: ['paved road','village','mixed surface'] */
  surface: string[];
  /** Optional named water feature for triathlons / lakeside races. */
  waterFeature?: string;
}

/** All five tokens are required. None of them may be `#fff`. */
export interface RacePalette {
  /** Page substrate — warm paper, never pure white. */
  paper: string;
  /** Body ink — near-black with a hue from the geography. */
  ink: string;
  /** Accent for links, key figures, focal punctuation. */
  accent: string;
  /** Warm pole of the palette (sunrise, fire road, bib pinks). */
  warm: string;
  /** Cool pole of the palette (lake, conifer, ridge shadow). */
  cool: string;
}

/** Type stack — pick three families with intentional jobs. */
export interface RaceType {
  /** Display face for the race wordmark and headlines. */
  display: string;
  /** Reading face for field notes and body. */
  body: string;
  /** Mono / micro face for the technical course-data strip. */
  micro: string;
  /** Optional Google Fonts URL; if omitted the build uses only system fallbacks. */
  googleFontsHref?: string;
  /** CSS family stack for `--font-display`, including fallbacks. */
  displayStack: string;
  /** CSS family stack for `--font-body`. */
  bodyStack: string;
  /** CSS family stack for `--font-micro`. */
  microStack: string;
}

/** A single line in the typographically-dense course data strip. */
export interface CourseDatum {
  /** Mono micro-label, sentence case. e.g. "Distance", "Elevation gain". */
  label: string;
  /** Serif numeral or short string. Keep under ~24 chars. */
  value: string;
  /** Optional unit, set smaller in the mono face. e.g. "mi", "ft", "°F". */
  unit?: string;
}

/** A single related-map link, presented contact-sheet style. */
export interface CrossLink {
  /** Race slug — must match a built /maps/{slug}/ route. */
  slug: string;
  /** Race name as it appears on its own page. */
  name: string;
  /** Region one-liner, mono micro. */
  region: string;
}

/** Acquisition options. Omit any block that doesn't apply to the race. */
export interface Acquisition {
  print?: { sizes: string[]; price: string; href: string };
  digital?: { format: string; price: string; href: string };
  commission?: { lede: string; href: string };
}

/** A 2–3 sentence studio-voice note about what made this map a specific job. */
export type FieldNote = string;

/**
 * The full theme. One file per race in src/themes/, paired with a config in
 * src/maps/{slug}/. The build reads `config.theme` and uses it to render the
 * editorial chrome around the existing map view.
 */
export interface RaceTheme {
  slug: string;
  identity: RaceIdentity;
  geography: RaceGeography;
  palette: RacePalette;
  type: RaceType;
  voice: RaceVoice;
  heroTreatment: HeroTreatment;
  texture: Texture;
  /**
   * Course data strip. Order matters — the strip reads left-to-right,
   * top-to-bottom on a 4-column grid. Aim for 6–10 entries.
   */
  courseData: CourseDatum[];
  /**
   * For triathlons and multi-discipline races: a typographic triptych of
   * disciplines. Renders as a row of capitalized labels with hairline
   * separators. Omit for single-discipline races.
   */
  disciplines?: { label: string; distance: string }[];
  fieldNotes: FieldNote;
  acquisition: Acquisition;
  /** Other maps from the studio. Keep tight — 3 to 5 entries. */
  crossLinks: CrossLink[];
  /**
   * Optional small wordmark line treated typographically (not as a button).
   * Tinman uses this for "Race the Adirondacks".
   */
  wordmark?: string;
  /**
   * Caption that appears below the map in italic body text, like a museum
   * plate label. e.g. "Run course, all five distances · drawn from NYSDOT".
   */
  mapCaption?: string;
}
