/*
 * race-theme.ts — schema for False Summit Studio race-page themes (v2).
 *
 * The page is an ATHLETE-FACING tool the race director links to from
 * their own site. It is not a studio showcase. Themes therefore describe
 * the *race's* identity (palette extracted from race brand assets, type
 * stack matching the race's voice), plus operational facts (race-day
 * timing, distances, geography, aid). Studio identity is fixed minimal
 * chrome, not a theme variable.
 *
 * The build is zero-dependency Node — see ./tupper-lake-tinman.js for
 * the runtime CommonJS shape, mirroring `RaceTheme` 1:1.
 */

/** Race format. The page surfaces only the disciplines the studio mapped. */
export type Discipline =
  | 'triathlon'
  | 'trail-run'
  | 'road-run'
  | 'gravel'
  | 'road-cycle'
  | 'multisport';

/** A single distance in a multi-distance event. */
export interface Distance {
  /** Slug used in toggles + JSON file names. e.g. 'sprint' | 'olympic' | 'tinman'. */
  id: string;
  /** Display label. e.g. "Sprint", "Olympic", "Tinman". */
  label: string;
  /** Run-leg distance in miles (this page maps the run only). */
  runMiles: number;
  /** Run-leg elevation gain in feet. */
  runGainFt: number;
  /** Per-distance accent color, sampled from the race's distance signage. */
  color: string;
  /**
   * Optional human-readable run-start window. Triathlons don't have a
   * single run gun; runners clear T2 across a window of time.
   * e.g. "9:15 – 9:45 AM (after T2)"
   */
  runStartWindow?: string;
}

export interface RaceIdentity {
  /** "Tupper Lake Tinman", in title case. Small banner, never a wordmark hero. */
  name: string;
  /** Short label for nav, breadcrumbs, simulator UI. e.g. "Tinman". */
  shortName: string;
  /** Producing organisation, written as it appears on the race site. */
  hostOrg: string;
  /** Race's own URL. */
  hostUrl: string;
  /** Year of first running, for heritage events. */
  establishedYear?: number;
  /** Path/URL to the race's actual logo asset (svg/png). Optional. */
  sourceLogoUrl?: string;
}

/**
 * Palette — pulled from the race's own brand assets, NOT invented from
 * a romantic idea of the geography. None of these may be `#ffffff`.
 */
export interface RacePalette {
  /** The race's signature color — extract from their logo/site. */
  raceBrand: string;
  /** The race's text/dark color (typically near-black). */
  raceInk: string;
  /** Page background — tinted, not pure white. */
  paper: string;
  /** Section/card backgrounds — slightly distinct from `paper`. */
  surfaceWarm: string;
  /** Course route color on the map. Use a high-contrast complement to the basemap. */
  routeColor: string;
  /** Aid station marker color. */
  aidStation: string;
  /** Hazard/cutoff/warning color. */
  hazard: string;
}

/** Type stack matching the race's voice. */
export interface RaceType {
  /** Display face for the small race wordmark; ≤ ~28px in any header. */
  display: string;
  /** Workhorse reading face for cues and notes. */
  body: string;
  /** Mono for distances, elevations, times — the technical voice. */
  micro: string;
  /** Optional Google Fonts URL. */
  googleFontsHref?: string;
  displayStack: string;
  bodyStack: string;
  microStack: string;
}

export interface RaceFormat {
  discipline: Discipline;
  /** Distances offered. Order = order in toggles. */
  distances: Distance[];
  /** True if the race has a swim — used only for context messaging. */
  hasSwim: boolean;
  /**
   * True if the race has bike→run transitions; used for honest run-start
   * messaging ("runners start the run after clearing T2", not "8:00 AM").
   */
  hasTransitions: boolean;
  /**
   * Default distance shown on first load. Should be the headline distance.
   * e.g. 'tinman'.
   */
  defaultDistanceId: string;
}

export interface RaceGeography {
  region: string;
  startLat: number;
  startLng: number;
  /** Human sentence about elevation, not a raw integer. */
  elevationStory: string;
  /** Surface composition in priority order. */
  surface: string[];
  /** Optional named water feature for context only — not mapped if hasSwim is false. */
  waterFeature?: string;
  /** Identifier for the live weather feed (city/airport code or station). */
  weatherStation: string;
}

export interface RaceDayStartTime {
  /** Distance id this start-time applies to. */
  distance: string;
  /** Display string. e.g. "8:00 AM (rolling swim)" or "9:15–9:45 AM (run)". */
  time: string;
}

export interface RaceCutoff {
  /** Mile within the run leg. */
  mile: number;
  /** Display string. e.g. "11:30 AM" or "+3h 30m from gun". */
  time: string;
  /** Short label. e.g. "Tinman aid station closes". */
  label: string;
}

export interface RaceDay {
  /** ISO date. e.g. "2026-06-27". */
  date: string;
  /** Display date. e.g. "June 27, 2026 · Saturday". */
  displayDate: string;
  /** Start times per distance. */
  startTimes: RaceDayStartTime[];
  /** Cutoffs that affect the run. Empty list if none. */
  cutoffs: RaceCutoff[];
  /** "5:09 AM" */
  sunrise: string;
  /** "8:48 PM" */
  sunset: string;
}

/** Aid station — used by both map markers and the on-page table. */
export interface AidStation {
  name: string;
  /** Mile within the run leg. */
  mile: number;
  /** What's stocked. */
  stocked: string;
  /** Optional cutoff time at this station. */
  cutoff?: string;
}

/** A single cross-link to another studio map. */
export interface CrossLink {
  slug: string;
  name: string;
  region: string;
}

/** Logistics — keep the page from duplicating the host race's full athlete guide. */
export interface RaceLogistics {
  parking: string;
  packetPickup: string;
  /** Brief shuttle/transit info. */
  shuttle?: string;
  /** Where on the run course spectators can realistically see runners 2+ times. */
  spectatorTips?: string;
  /** Link out to the host race's full athlete guide. */
  hostGuideUrl: string;
}

/** The cartographer's run-only operational note. 1–2 short paragraphs. */
export type CartographerNote = string;

export interface RaceTheme {
  slug: string;
  identity: RaceIdentity;
  palette: RacePalette;
  type: RaceType;
  raceFormat: RaceFormat;
  geography: RaceGeography;
  raceDay: RaceDay;
  aidStations: AidStation[];
  logistics: RaceLogistics;
  /** 1–2 paragraphs, run-scoped. The only place studio voice appears in body copy. */
  cartographerNotes: CartographerNote;
  /** Other maps from the studio. 3–5 entries. */
  crossLinks: CrossLink[];
  /**
   * Single-line scope note shown above the cue sheet. Tells the athlete
   * what is and isn't on this page. e.g.
   * "Run course only. For swim and bike routes, see the official race site."
   */
  scopeNote: string;
}
