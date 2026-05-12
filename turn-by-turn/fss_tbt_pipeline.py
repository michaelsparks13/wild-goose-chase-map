"""
fss_tbt_pipeline.py — False Summit Studio Turn-by-Turn pipeline.

Generates a structured turn-by-turn (TBT) dataset for a trail or road race
suitable as a layer in an FSS interactive map.

Inputs:
  • GPX track of the course                                   (required)
  • RD-provided section descriptions text file                (optional)
  • Live land-manager / OSM / GNIS API access                 (optional)

Outputs (under output_dir):
  • turns.geojson         — points: every actionable turn, with attributes
  • aids.geojson          — points: aid stations from GPX waypoints
  • course_line.geojson   — downsampled track for map basemap
  • switchback_zones.geojson — polygons: detected switchback corridors
  • tbt.csv               — flat tabular master
  • tbt.md                — human-readable TBT
  • tbt_master.json       — full structured master with all fields
  • _enrichment_cache.json — local cache of live-API results

No QGIS dependency. Run from terminal:
    python3 fss_tbt_pipeline.py

Dependencies: gpxpy, numpy. Install with:
    pip install gpxpy numpy

Version 1.0 — 2026-05
"""

# ════════════════════════════════════════════════════════════════════════════
# IMPORTS
# ════════════════════════════════════════════════════════════════════════════
import os
import re
import json
import csv
import math
import time
import urllib.parse
import urllib.request
import urllib.error
from pathlib import Path
from collections import Counter
from typing import Optional

import numpy as np
import gpxpy


# ════════════════════════════════════════════════════════════════════════════
# CONFIG — fill in per project
# ════════════════════════════════════════════════════════════════════════════
CONFIG = {
    # ── Project ─────────────────────────────────────────────────────────────
    "race_name":   "Race Name",
    "race_slug":   "race_slug",                   # snake_case for file names
    "gpx_path":    "/absolute/path/to/race.gpx",
    "output_dir":  "/absolute/path/to/output/",

    # ── Section descriptions (OPTIONAL) ─────────────────────────────────────
    # Path to a .txt file containing prose TBT broken into sections. Header
    # format expected per section (rest is free prose):
    #   SECTION: <from_aid> (<from_mi>) to <to_aid> (<to_mi>)
    # Example:
    #   SECTION: Cottonwood Creek (7.4) to Lane Mountain (32.5)
    # Set to None when no descriptions are available — pipeline falls back to
    # geometry + live-enrichment mode (turn locations from GPX, names from
    # USFS / OSM / GNIS).
    "section_descriptions_path": None,

    # ── Project-specific named features (OPTIONAL extensions) ───────────────
    # Generic regexes catch most "X Trail", "X Road", "FR123", "X Mountain"
    # patterns. Add anything they'd miss for this race.
    "extra_trail_names":   [],   # e.g. ["BCT", "AZT", "PCT"]
    "extra_road_names":    [],   # e.g. ["Senator Highway", "Old Munds Hwy"]
    "extra_feature_names": [],   # e.g. ["Whiskey Row", "Granite Dells"]

    # ── Geometry parameters (rarely changed) ────────────────────────────────
    "turn_threshold_deg":             30.0,   # min turn to be a candidate
    "actionable_threshold_deg":       60.0,   # min turn to be actionable
    "lookback_m":                     40.0,   # for bearing-change calculation
    "lookahead_m":                    40.0,
    "suppression_window_m":           80.0,   # de-dup co-located candidates
    "switchback_cluster_radius_mi":   0.16,   # ~250 m
    "switchback_min_turns":           3,
    "switchback_net_heading_tol_deg": 60.0,
    "course_line_downsample_to":      4000,   # target vertices for map line

    # ── Live-API enrichment (OPTIONAL) ──────────────────────────────────────
    "enable_live_enrichment":   True,
    "enrichment_radius_m":      75.0,
    "gnis_radius_m":           100.0,
    "politeness_delay_s":       0.4,    # between API calls
    "request_timeout_s":       30,
    "max_retries":              3,
    "user_agent":              "FSS-TBT-pipeline/1.0 (false-summit-studio)",
}


# ════════════════════════════════════════════════════════════════════════════
# CONSTANTS — regex patterns & endpoints
# ════════════════════════════════════════════════════════════════════════════

SECTION_HEADER_RE = re.compile(
    r'SECTION:\s*'
    r'(.+?)\s*\(([\d.]+)\)\s+to\s+'
    r'(.+?)\s*\(([\d.]+)\)',
    re.IGNORECASE,
)

# Mile mark in prose: "mile 4.2", "around mile 2.4", "at mile 28.6", etc.
MILE_RE = re.compile(
    r'\b(?:around |near |at |just (?:after|past) |after )?'
    r'mile[s]?\s+(\d+(?:\.\d+)?)\b',
    re.IGNORECASE,
)

# Turn verb vocabulary — order matters; longer/more specific patterns first.
TURN_VERBS = [
    # (regex, direction, intensity)
    (r'\bhard right\b',                     'right',    'sharp'),
    (r'\bhard left\b',                      'left',     'sharp'),
    (r'\bsharp right\b',                    'right',    'sharp'),
    (r'\bsharp left\b',                     'left',     'sharp'),
    (r'\bsharp right[- ]hand\b',            'right',    'sharp'),
    (r'\bsharp left[- ]hand\b',             'left',     'sharp'),
    (r'\bcritical right\b',                 'right',    'sharp'),
    (r'\bcritical left\b',                  'left',     'sharp'),
    (r'\bquick right\b',                    'right',    'normal'),
    (r'\bquick left\b',                     'left',     'normal'),
    (r'\bturn right\b',                     'right',    'normal'),
    (r'\bturn left\b',                      'left',     'normal'),
    (r'\bturning right\b',                  'right',    'normal'),
    (r'\bturning left\b',                   'left',     'normal'),
    (r'\bhang(?:s|ing)? a right\b',         'right',    'normal'),
    (r'\bhang(?:s|ing)? a left\b',          'left',     'normal'),
    (r'\bhangs right\b',                    'right',    'normal'),
    (r'\bhangs left\b',                     'left',     'normal'),
    (r'\bbear right\b',                     'right',    'slight'),
    (r'\bbear left\b',                      'left',     'slight'),
    (r'\bveer right\b',                     'right',    'slight'),
    (r'\bveer left\b',                      'left',     'slight'),
    (r'\bstay right\b',                     'right',    'fork'),
    (r'\bstay left\b',                      'left',     'fork'),
    (r'\bright (?:road )?fork\b',           'right',    'fork'),
    (r'\bleft (?:road )?fork\b',            'left',     'fork'),
    (r'\ba right\b',                        'right',    'normal'),
    (r'\ba left\b',                         'left',     'normal'),
    (r'\bcontinue straight\b',              'straight', 'normal'),
    (r'\bstays? straight\b',                'straight', 'normal'),
]

# Generic named-feature patterns. These catch the long tail without per-race
# enumeration. Order: most-specific suffix first.

ROAD_SUFFIXES = (
    r'(?:Road|Rd\.?|Highway|Hwy\.?|Street|St\.?|Avenue|Ave\.?|'
    r'Boulevard|Blvd\.?|Drive|Dr\.?|Lane|Ln\.?|Way|Parkway|Pkwy\.?|'
    r'Court|Ct\.?|Place|Pl\.?)'
)
TRAIL_SUFFIX = r'(?:Trail|Tr\.?|Path)'
FEATURE_SUFFIXES = (
    r'(?:Creek|River|Lake|Pond|Reservoir|Mountain|Mtn\.?|Peak|Hill|Hills|'
    r'Canyon|Valley|Falls|Wash|Mesa|Plateau|Pass|Saddle|Spring|Springs|'
    r'Junction|Crossing|Park|Forest|Reserve|Preserve|Bridge|Dam|Ridge|'
    r'Gulch|Draw|Hollow|Cove|Dunes|Bluff|Bluffs|Point|Cape|Beach)'
)

_NAMED_PHRASE = r"(?:[A-Z][\w\']+(?:[\s-][A-Z][\w\']+)*)"
_ROAD_CODE = r"(?:FR|NF|CR|SR|US|I-?|AZ|CA|CO|NV|UT|NM|TX|OR|WA|MT|WY|ID)\s*-?\s*\d+\w*"

ROAD_RE_GENERIC = re.compile(
    r"\b(" + _ROAD_CODE + r"|" + _NAMED_PHRASE + r"\s+" + ROAD_SUFFIXES + r")\b"
)
TRAIL_RE_GENERIC = re.compile(
    r"\b(" + _NAMED_PHRASE + r"\s+" + TRAIL_SUFFIX + r")\b"
)
FEATURE_RE_GENERIC = re.compile(
    r"\b(" + _NAMED_PHRASE + r"\s+" + FEATURE_SUFFIXES + r")\b"
)

HAZARD_PATTERNS = [
    (r'\bgate\b',                               'gate'),
    (r'\bbarbed[- ]wire fence\b',               'barbed_wire_fence'),
    (r'\bA[- ]Frame ladder\b',                  'a_frame_ladder'),
    (r'\bcattle guard\b',                       'cattle_guard'),
    (r'\b(?:wade across|cross.+(?:creek|river))\b', 'water_crossing'),
    (r'\b(?:steep|technical) descent\b',        'technical_descent'),
    (r'\b(?:culvert|underpass)\b',              'underpass'),
    (r'\bswitchback\b',                         'switchback'),
    (r'\bno passing zone\b',                    'no_passing_zone'),
    (r'\bGEAR CHECK\b',                         'gear_check'),
    (r'\bNO PACERS?\b',                         'no_pacers'),
]

# ── Live-API endpoints ──────────────────────────────────────────────────────
ENDPOINTS = {
    # PAD-US: "Manager_Name" — gives the land manager at any point in the US
    "padus_manager": (
        "https://gis1.usgs.gov/arcgis/rest/services/padus3/Manager_Name/MapServer/0/query"
    ),
    # USFS Enterprise Data Warehouse — National Forest System trails (named)
    "usfs_trails": (
        "https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_TrailNFSPublish_01/MapServer/0/query"
    ),
    # USFS — National Forest System Roads (FR numbers)
    "usfs_roads": (
        "https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_RoadBasic_01/MapServer/0/query"
    ),
    # NPS — Trails inside National Park Service units
    "nps_trails": (
        "https://mapservices.nps.gov/arcgis/rest/services/LandResourcesDivisionTractAndBoundaryService/Trails/MapServer/0/query"
    ),
    # OSM — Overpass API (any nearby ways/nodes with names/tags)
    "overpass": "https://overpass-api.de/api/interpreter",
    # USGS GNIS — authoritative U.S. place names (peaks, springs, mines, etc.)
    "gnis": (
        "https://carto.nationalmap.gov/arcgis/rest/services/geonames/MapServer/0/query"
    ),
}


# ════════════════════════════════════════════════════════════════════════════
# UTILITIES
# ════════════════════════════════════════════════════════════════════════════

def log(stage: str, msg: str):
    print(f"  [{stage}] {msg}")


def haversine_m(lat1, lon1, lat2, lon2):
    R = 6_371_000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2 * R * math.asin(math.sqrt(a))


def initial_bearing_deg(lat1, lon1, lat2, lon2):
    """Forward azimuth from point 1 to point 2, in degrees [0, 360)."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    x = math.sin(dl) * math.cos(p2)
    y = math.cos(p1)*math.sin(p2) - math.sin(p1)*math.cos(p2)*math.cos(dl)
    return (math.degrees(math.atan2(x, y)) + 360.0) % 360.0


def angle_diff_signed(a, b):
    """Smallest signed angle from a to b in (-180, 180]."""
    return (b - a + 540.0) % 360.0 - 180.0


def envelope_around(lat, lon, radius_m):
    deg_lat = radius_m / 111_111.0
    deg_lon = radius_m / (111_111.0 * math.cos(math.radians(lat)))
    return {
        "xmin": lon - deg_lon, "ymin": lat - deg_lat,
        "xmax": lon + deg_lon, "ymax": lat + deg_lat,
        "spatialReference": {"wkid": 4326},
    }


def http_get_json(url, params=None, retries=None, timeout=None):
    retries = retries or CONFIG["max_retries"]
    timeout = timeout or CONFIG["request_timeout_s"]
    if params:
        sep = "&" if "?" in url else "?"
        url = url + sep + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": CONFIG["user_agent"]})
    last_err = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode("utf-8"))
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ConnectionError) as e:
            last_err = e
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
    raise last_err


def http_post_form(url, data, retries=None, timeout=None):
    retries = retries or CONFIG["max_retries"]
    timeout = timeout or CONFIG["request_timeout_s"]
    body = urllib.parse.urlencode(data).encode("utf-8")
    req = urllib.request.Request(
        url, data=body, method="POST",
        headers={
            "User-Agent": CONFIG["user_agent"],
            "Content-Type": "application/x-www-form-urlencoded",
        },
    )
    last_err = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read().decode("utf-8")
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ConnectionError) as e:
            last_err = e
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
    raise last_err


# ════════════════════════════════════════════════════════════════════════════
# STAGE 1 — Parse GPX → track arrays
# ════════════════════════════════════════════════════════════════════════════

def parse_gpx(gpx_path: str):
    """Read GPX, dedupe duplicate-consecutive points, compute cum distance & bearings.

    Waypoints (if present) become aid stations.
    Returns: dict with arrays + waypoints list.
    """
    log("stage1", f"reading {gpx_path}")
    with open(gpx_path) as f:
        gpx = gpxpy.parse(f)

    # Collect every point from every track segment, in order
    pts = []
    for trk in gpx.tracks:
        for seg in trk.segments:
            for p in seg.points:
                pts.append((p.latitude, p.longitude, p.elevation))
    if not pts:
        # Fall back to routes if no tracks (some COROS exports differ)
        for rte in gpx.routes:
            for p in rte.points:
                pts.append((p.latitude, p.longitude, p.elevation))

    if not pts:
        raise ValueError(f"No track points found in {gpx_path}")

    # Dedupe duplicate-consecutive vertices (GPS-pause artefacts)
    deduped = [pts[0]]
    for p in pts[1:]:
        if p[0] == deduped[-1][0] and p[1] == deduped[-1][1]:
            continue
        deduped.append(p)
    pts = deduped
    n = len(pts)
    log("stage1", f"{n} unique track points (after dedup)")

    lat = np.array([p[0] for p in pts])
    lon = np.array([p[1] for p in pts])
    ele = np.array([p[2] if p[2] is not None else np.nan for p in pts])

    # Cumulative distance
    seg_m = np.zeros(n)
    for i in range(1, n):
        seg_m[i] = haversine_m(lat[i-1], lon[i-1], lat[i], lon[i])
    cum_m = np.cumsum(seg_m)
    cum_mi = cum_m / 1609.344

    # Per-segment bearing (assigned to point i is the bearing from i-1 to i;
    # for point 0 we use the bearing from 0 to 1)
    bearing = np.zeros(n)
    for i in range(1, n):
        bearing[i] = initial_bearing_deg(lat[i-1], lon[i-1], lat[i], lon[i])
    if n > 1:
        bearing[0] = bearing[1]

    # Smooth bearing using a vector-average over a ±30 m window (avoids
    # catastrophic step at 360°/0° wraparound).
    smooth_window_m = 30.0
    bearing_smooth = np.zeros(n)
    for i in range(n):
        d = cum_m[i]
        i_lo = np.searchsorted(cum_m, d - smooth_window_m, side='left')
        i_hi = np.searchsorted(cum_m, d + smooth_window_m, side='right')
        i_lo = max(0, i_lo); i_hi = min(n, i_hi)
        bs = bearing[i_lo:i_hi]
        if len(bs) == 0:
            bearing_smooth[i] = bearing[i]; continue
        rad = np.radians(bs)
        sx = np.cos(rad).mean(); sy = np.sin(rad).mean()
        bearing_smooth[i] = (math.degrees(math.atan2(sy, sx)) + 360.0) % 360.0

    # Aid stations from waypoints
    waypoints = []
    for w in gpx.waypoints:
        # Snap waypoint to nearest track index
        d = (lat - w.latitude)**2 + (lon - w.longitude)**2
        idx = int(np.argmin(d))
        waypoints.append({
            "name": w.name or "",
            "lat": float(w.latitude),
            "lon": float(w.longitude),
            "ele_m": float(w.elevation) if w.elevation is not None else None,
            "course_mi": float(cum_mi[idx]),
            "track_idx": idx,
        })
    waypoints.sort(key=lambda w: w["course_mi"])
    log("stage1", f"{len(waypoints)} waypoints (potential aid stations)")
    log("stage1", f"course length: {cum_mi[-1]:.2f} mi")

    return {
        "lat": lat, "lon": lon, "ele": ele,
        "cum_m": cum_m, "cum_mi": cum_mi,
        "bearing": bearing, "bearing_smooth": bearing_smooth,
        "waypoints": waypoints,
        "n": n,
    }


# ════════════════════════════════════════════════════════════════════════════
# STAGE 2 — Detect candidate turns, switchback zones, actionable turns
# ════════════════════════════════════════════════════════════════════════════

def classify_turn(deg: float) -> str:
    a = abs(deg)
    side = "right" if deg > 0 else "left"
    if a < 30:   return "continue"
    if a < 60:   return f"slight_{side}"
    if a < 110:  return f"{side}"
    if a < 150:  return f"sharp_{side}"
    return f"hairpin_{side}"


def compute_turn_angles(track, lookback_m, lookahead_m):
    """For each point i, signed heading change from (i-lookback) to (i+lookahead)."""
    cum_m = track["cum_m"]
    bs = track["bearing_smooth"]
    n = track["n"]
    out = np.zeros(n)
    for i in range(n):
        d = cum_m[i]
        i_back = max(0, np.searchsorted(cum_m, d - lookback_m, side='left'))
        i_fwd  = min(n - 1, np.searchsorted(cum_m, d + lookahead_m, side='right') - 1)
        out[i] = angle_diff_signed(bs[i_back], bs[i_fwd])
    return out


def detect_candidate_turns(track):
    log("stage2", "computing turn angles")
    turn = compute_turn_angles(track, CONFIG["lookback_m"], CONFIG["lookahead_m"])

    # Greedy non-max suppression by magnitude
    abs_turn = np.abs(turn)
    threshold = CONFIG["turn_threshold_deg"]
    suppress_m = CONFIG["suppression_window_m"]
    cum_m = track["cum_m"]

    order = np.argsort(-abs_turn)
    keep_idx = []
    keep_d = []
    for i in order:
        if abs_turn[i] < threshold:
            break
        d = cum_m[i]
        if not keep_d or all(abs(d - kd) >= suppress_m for kd in keep_d):
            keep_idx.append(int(i)); keep_d.append(float(d))
    keep_idx.sort(key=lambda k: cum_m[k])

    candidates = []
    for i in keep_idx:
        candidates.append({
            "track_idx": int(i),
            "course_mi": float(track["cum_mi"][i]),
            "lat": float(track["lat"][i]),
            "lon": float(track["lon"][i]),
            "ele_m": float(track["ele"][i]) if not np.isnan(track["ele"][i]) else None,
            "bearing_in_deg":  float(track["bearing_smooth"][max(0, i - 5)]),
            "bearing_out_deg": float(track["bearing_smooth"][min(track["n"]-1, i + 5)]),
            "turn_deg": float(turn[i]),
            "turn_class": classify_turn(float(turn[i])),
        })
    log("stage2", f"{len(candidates)} candidate turns "
                  f"({len(candidates)/track['cum_mi'][-1]:.2f}/mi)")
    return candidates


def detect_switchback_zones(candidates):
    """Cluster of >=N alternating-sign turns within R miles, with small net heading change."""
    cluster_r  = CONFIG["switchback_cluster_radius_mi"]
    min_n      = CONFIG["switchback_min_turns"]
    net_tol    = CONFIG["switchback_net_heading_tol_deg"]

    candidates = sorted(candidates, key=lambda c: c["course_mi"])
    clusters = []
    i = 0
    while i < len(candidates):
        j = i
        while (j + 1 < len(candidates) and
               candidates[j+1]["course_mi"] - candidates[i]["course_mi"] <= cluster_r):
            j += 1
        cluster = candidates[i:j+1]
        if len(cluster) >= min_n:
            signs = [1 if c["turn_deg"] > 0 else -1 for c in cluster]
            n_alt = sum(1 for k in range(1, len(signs)) if signs[k] != signs[k-1])
            net   = abs(angle_diff_signed(cluster[0]["bearing_in_deg"],
                                          cluster[-1]["bearing_out_deg"]))
            if n_alt >= len(cluster) - 2 and net < net_tol:
                clusters.append({
                    "start_mi": cluster[0]["course_mi"],
                    "end_mi":   cluster[-1]["course_mi"],
                    "n_turns":  len(cluster),
                    "net_heading_change_deg": net,
                    "track_indices": [c["track_idx"] for c in cluster],
                    "lat_lon_path": [(c["lat"], c["lon"]) for c in cluster],
                })
        i = j + 1
    log("stage2", f"{len(clusters)} switchback zones detected")
    return clusters


def filter_actionable(candidates, switchback_zones):
    sb_idx = set(idx for sb in switchback_zones for idx in sb["track_indices"])
    threshold = CONFIG["actionable_threshold_deg"]
    actionable = [
        dict(c) for c in candidates
        if c["track_idx"] not in sb_idx and abs(c["turn_deg"]) >= threshold
    ]
    log("stage2", f"{len(actionable)} actionable turns "
                  f"(after switchback filter, |turn| >= {threshold}°)")
    return actionable


# ════════════════════════════════════════════════════════════════════════════
# STAGE 3 — Parse section descriptions (OPTIONAL)
# ════════════════════════════════════════════════════════════════════════════

def build_named_feature_regexes(extras_trails, extras_roads, extras_features):
    """Combine generic patterns with project-specific extras into final regexes."""
    def alt(items):
        if not items: return None
        return r'\b(' + '|'.join(re.escape(s) for s in sorted(set(items), key=len, reverse=True)) + r')\b'

    extras_t = alt(extras_trails)
    extras_r = alt(extras_roads)
    extras_f = alt(extras_features)

    return {
        "trails":   [TRAIL_RE_GENERIC]   + ([re.compile(extras_t, re.IGNORECASE)] if extras_t else []),
        "roads":    [ROAD_RE_GENERIC]    + ([re.compile(extras_r, re.IGNORECASE)] if extras_r else []),
        "features": [FEATURE_RE_GENERIC] + ([re.compile(extras_f, re.IGNORECASE)] if extras_f else []),
    }


def first_match(text, patterns):
    """Try each compiled regex; return earliest match's group(1) or group(0)."""
    best = None
    for p in patterns:
        m = p.search(text)
        if m and (best is None or m.start() < best.start()):
            best = m
    if best is None: return None, None
    return (best.group(1) if best.lastindex else best.group(0)), best


def parse_section_descriptions(path: Optional[str]):
    """Parse a SECTION-formatted descriptions file. Returns ([], []) if no path."""
    if not path or not os.path.exists(path):
        log("stage3", "no descriptions file — skipping prose extraction")
        return [], []

    with open(path) as f:
        text = f.read()

    raw_chunks = re.split(r'={20,}|\n-{20,}', text)
    sections = []
    for chunk in raw_chunks:
        m = SECTION_HEADER_RE.search(chunk)
        if not m: continue
        from_aid, from_mi, to_aid, to_mi = m.groups()
        body = chunk[m.end():].strip()
        sections.append({
            "from_aid": from_aid.strip(),
            "from_mi":  float(from_mi),
            "to_aid":   to_aid.strip(),
            "to_mi":    float(to_mi),
            "body":     body,
        })
    log("stage3", f"parsed {len(sections)} sections from descriptions")

    feats = build_named_feature_regexes(
        CONFIG["extra_trail_names"],
        CONFIG["extra_road_names"],
        CONFIG["extra_feature_names"],
    )

    all_turns = []
    for s in sections:
        all_turns.extend(extract_prose_turns(s, feats))

    # Annotate sections with named features mentioned & hazards (for the markdown output)
    for s in sections:
        s["named_trails"]   = sorted({m for p in feats["trails"]   for m in p.findall(s["body"]) if isinstance(m, str)})
        s["named_roads"]    = sorted({m for p in feats["roads"]    for m in p.findall(s["body"]) if isinstance(m, str)})
        s["named_features"] = sorted({m for p in feats["features"] for m in p.findall(s["body"]) if isinstance(m, str)})
        s["hazards"] = sorted({name for pat, name in HAZARD_PATTERNS
                               if re.search(pat, s["body"], re.IGNORECASE)})

    log("stage3", f"extracted {len(all_turns)} prose turns")
    return sections, all_turns


def extract_prose_turns(section, feats):
    """Walk through a section's body and emit one record per turn-verb match."""
    body  = section["body"]
    s0    = section["from_mi"]
    s1    = section["to_mi"]
    turns = []

    # Collect raw matches across all turn verbs
    raw = []
    for pattern, direction, intensity in TURN_VERBS:
        for m in re.finditer(pattern, body, re.IGNORECASE):
            raw.append({"pos": m.start(), "end": m.end(), "verb": m.group(0),
                        "direction": direction, "intensity": intensity,
                        "verb_len": len(m.group(0))})

    # De-overlap: at any position, prefer the longest match
    raw.sort(key=lambda x: (x["pos"], -x["verb_len"]))
    deduped = []
    for r in raw:
        if deduped and r["pos"] < deduped[-1]["end"]:
            # overlapping — keep the one we already accepted
            continue
        deduped.append(r)

    for r in deduped:
        char_pos = r["pos"]
        # look for a mile mark in the 80 chars before or 30 chars after the verb
        win_before = body[max(0, char_pos-80):char_pos]
        win_after  = body[r["end"]:r["end"]+30]
        mile = None
        for win in (win_before, win_after):
            mm = MILE_RE.search(win)
            if mm:
                v = float(mm.group(1))
                if s0 - 1 <= v <= s1 + 1:
                    mile = v; break

        # look for the target onto/at within 150 chars after
        after = body[r["end"]:r["end"]+150]
        target_feature = None; target_type = None
        # priority: trail, then road, then feature
        for kind in ("trails", "roads", "features"):
            tag, _ = first_match(after, feats[kind])
            if tag:
                target_feature = tag.strip()
                target_type = kind[:-1]  # 'trail' / 'road' / 'feature'
                break

        # surrounding sentence for context
        sent_start = body.rfind('.', 0, char_pos) + 1
        sent_end   = body.find('.', r["end"])
        if sent_end == -1: sent_end = r["end"] + 200
        sentence = re.sub(r'\s+', ' ', body[sent_start:sent_end].strip())

        turns.append({
            "section_from_aid": section["from_aid"],
            "section_to_aid":   section["to_aid"],
            "section_start_mi": s0,
            "section_end_mi":   s1,
            "verb_match":       r["verb"],
            "direction":        r["direction"],
            "intensity":        r["intensity"],
            "approx_course_mi": mile,
            "target_feature":   target_feature,
            "target_type":      target_type,
            "context":          sentence[:250],
            "char_pos_in_section": char_pos,
        })
    turns.sort(key=lambda t: t["char_pos_in_section"])
    return turns


# ════════════════════════════════════════════════════════════════════════════
# STAGE 4 — Snap prose to geometry  /  build geometry-only records
# ════════════════════════════════════════════════════════════════════════════

DIR_FROM_GEOM_CLASS = {
    "left": "left", "sharp_left": "left", "hairpin_left": "left", "slight_left": "left",
    "right": "right", "sharp_right": "right", "hairpin_right": "right", "slight_right": "right",
}


def _enrich_record_with_track(rec, mi, track):
    idx = int(np.searchsorted(track["cum_mi"], mi))
    idx = min(idx, track["n"] - 1)
    rec["lat"] = float(track["lat"][idx])
    rec["lon"] = float(track["lon"][idx])
    rec["ele_m"] = float(track["ele"][idx]) if not np.isnan(track["ele"][idx]) else None
    return rec


def snap_prose_to_geometry(prose_turns, sections, actionable, track):
    """For each prose turn, find the best matching geometry turn in the same section."""
    log("stage4", "snapping prose turns to GPX geometry")

    # group prose turns by section
    by_section = {}
    for t in prose_turns:
        key = (t["section_start_mi"], t["section_end_mi"])
        by_section.setdefault(key, []).append(t)
    for key in by_section:
        by_section[key].sort(key=lambda t: t["char_pos_in_section"])

    snapped = []
    for s in sections:
        key = (s["from_mi"], s["to_mi"])
        prose = by_section.get(key, [])
        geom_section = [g for g in actionable if s["from_mi"] <= g["course_mi"] <= s["to_mi"] + 0.05]
        used = [False] * len(geom_section)

        prev_mi = s["from_mi"]
        for p in prose:
            if p["direction"] == "straight":
                # never snap "continue straight" to a geometry turn
                placed_mi = p.get("approx_course_mi") or (s["from_mi"] + s["to_mi"]) / 2.0
                rec = {**p, "snapped_course_mi": placed_mi,
                       "snap_method": "approximate_or_midpoint",
                       "matched_turn_deg": None}
                rec = _enrich_record_with_track(rec, placed_mi, track)
                snapped.append(rec); prev_mi = placed_mi; continue

            # candidates: same direction, not yet used
            cands = [(i, g) for i, g in enumerate(geom_section)
                     if not used[i] and DIR_FROM_GEOM_CLASS.get(g["turn_class"]) == p["direction"]]

            if not cands:
                placed_mi = p.get("approx_course_mi") or (s["from_mi"] + s["to_mi"]) / 2.0
                rec = {**p, "snapped_course_mi": placed_mi,
                       "snap_method": "no_geom_match",
                       "matched_turn_deg": None}
                rec = _enrich_record_with_track(rec, placed_mi, track)
                snapped.append(rec); prev_mi = placed_mi; continue

            # mile-anchored if prose has a mile mark
            if p.get("approx_course_mi") is not None:
                target = p["approx_course_mi"]
                best = min(cands, key=lambda ig: abs(ig[1]["course_mi"] - target))
                if abs(best[1]["course_mi"] - target) <= 0.6:
                    i, g = best; used[i] = True
                    rec = {**p, "snapped_course_mi": g["course_mi"],
                           "snap_method": "mile_anchored",
                           "snap_distance_mi": abs(g["course_mi"] - target),
                           "matched_turn_deg":  g["turn_deg"],
                           "lat": g["lat"], "lon": g["lon"], "ele_m": g["ele_m"]}
                    snapped.append(rec); prev_mi = g["course_mi"]; continue

            # sequential: first candidate at-or-after the previous turn
            seq = [(i, g) for i, g in cands if g["course_mi"] >= prev_mi - 0.05]
            if not seq: seq = cands
            i, g = seq[0]; used[i] = True
            rec = {**p, "snapped_course_mi": g["course_mi"],
                   "snap_method": "sequential",
                   "matched_turn_deg":  g["turn_deg"],
                   "lat": g["lat"], "lon": g["lon"], "ele_m": g["ele_m"]}
            snapped.append(rec); prev_mi = g["course_mi"]

    snapped.sort(key=lambda t: t["snapped_course_mi"])
    counts = Counter(t["snap_method"] for t in snapped)
    log("stage4", "snap methods: " + ", ".join(f"{k}={v}" for k, v in counts.most_common()))
    return snapped


def build_geometry_only_records(actionable, track, waypoints):
    """When no descriptions provided: produce TBT records from geometry alone.

    Each actionable turn becomes one record. Section context comes from
    bracketing aid stations (waypoints). Targets are filled in by Stage 5
    enrichment if enabled.
    """
    log("stage4", "geometry-only mode (no descriptions provided)")

    # Build aid-station bracket lookup for each actionable turn
    aids_sorted = sorted(waypoints, key=lambda w: w["course_mi"]) if waypoints else []

    def section_for(mi):
        if not aids_sorted:
            return ("Start", "Finish")
        prev = next(((w["name"], w["course_mi"]) for w in reversed(aids_sorted)
                     if w["course_mi"] <= mi), ("Start", 0.0))
        nxt  = next(((w["name"], w["course_mi"]) for w in aids_sorted
                     if w["course_mi"] >  mi), ("Finish", aids_sorted[-1]["course_mi"]))
        return prev[0], nxt[0]

    records = []
    for g in sorted(actionable, key=lambda x: x["course_mi"]):
        from_aid, to_aid = section_for(g["course_mi"])
        direction = DIR_FROM_GEOM_CLASS.get(g["turn_class"])
        intensity = ("sharp" if "sharp" in g["turn_class"] or "hairpin" in g["turn_class"]
                     else "normal" if g["turn_class"] in ("left", "right")
                     else "slight")
        records.append({
            "section_from_aid": from_aid,
            "section_to_aid":   to_aid,
            "section_start_mi": next((w["course_mi"] for w in aids_sorted if w["name"] == from_aid), 0.0),
            "section_end_mi":   next((w["course_mi"] for w in aids_sorted if w["name"] == to_aid),
                                     track["cum_mi"][-1]),
            "verb_match":       "",
            "direction":        direction,
            "intensity":        intensity,
            "approx_course_mi": g["course_mi"],
            "target_feature":   None,
            "target_type":      None,
            "context":          "",
            "snapped_course_mi": g["course_mi"],
            "snap_method":      "geometry_only",
            "matched_turn_deg": g["turn_deg"],
            "lat": g["lat"], "lon": g["lon"], "ele_m": g["ele_m"],
        })
    return records


# ════════════════════════════════════════════════════════════════════════════
# STAGE 5 — Live API enrichment (OPTIONAL)
# ════════════════════════════════════════════════════════════════════════════

def cache_key(lat, lon):
    return f"{lat:.5f},{lon:.5f}"


def _safe_call(fn, *args, **kwargs):
    """Wrap an API call; return None on any error rather than killing the run."""
    try:
        return fn(*args, **kwargs)
    except Exception as e:
        return {"error": str(e)[:120]}


def query_padus(lat, lon):
    params = {
        "geometry": json.dumps({"x": lon, "y": lat, "spatialReference": {"wkid": 4326}}),
        "geometryType": "esriGeometryPoint", "inSR": 4326,
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": "Mang_Name,Loc_Nm,Mang_Type",
        "returnGeometry": "false", "f": "json",
    }
    r = http_get_json(ENDPOINTS["padus_manager"], params)
    feats = r.get("features", [])
    if not feats: return None
    a = feats[0]["attributes"]
    return {"manager": a.get("Mang_Name"), "unit": a.get("Loc_Nm"), "manager_type": a.get("Mang_Type")}


def query_arcgis_lines(endpoint, lat, lon, radius_m, out_fields):
    env = envelope_around(lat, lon, radius_m)
    params = {
        "geometry": json.dumps(env), "geometryType": "esriGeometryEnvelope",
        "inSR": 4326, "spatialRel": "esriSpatialRelIntersects",
        "outFields": out_fields,
        "returnGeometry": "true", "outSR": 4326, "f": "geojson",
    }
    r = http_get_json(endpoint, params)
    out = []
    for feat in r.get("features", []):
        geom = feat.get("geometry") or {}
        coords = geom.get("coordinates", []) or []
        if not coords: continue
        # paths or single line — pick first vertex as a proxy for nearest distance
        p = coords[0][0] if isinstance(coords[0][0], list) else coords[0]
        d = haversine_m(lat, lon, p[1], p[0])
        out.append({"props": feat["properties"], "distance_m": round(d, 1)})
    out.sort(key=lambda x: x["distance_m"])
    return out


def query_overpass(lat, lon, radius_m):
    q = f"""
    [out:json][timeout:30];
    (
      way["highway"](around:{int(radius_m)},{lat},{lon});
      way["route"~"hiking|foot|mtb"](around:{int(radius_m)},{lat},{lon});
      node["natural"~"peak|saddle|spring|waterfall"](around:{int(radius_m*2)},{lat},{lon});
      node["amenity"~"drinking_water|toilets|parking|shelter"](around:{int(radius_m*2)},{lat},{lon});
      node["man_made"~"tower|water_tower|lighthouse"](around:{int(radius_m*2)},{lat},{lon});
    );
    out tags center;
    """
    r = json.loads(http_post_form(ENDPOINTS["overpass"], {"data": q}))
    ways, feats = [], []
    for el in r.get("elements", []):
        tags = el.get("tags", {})
        if el["type"] == "way":
            c = el.get("center") or {}
            d = haversine_m(lat, lon, c.get("lat", lat), c.get("lon", lon))
            ways.append({"id": el["id"], "name": tags.get("name"),
                         "highway": tags.get("highway"), "ref": tags.get("ref"),
                         "distance_m": round(d, 1)})
        elif el["type"] == "node":
            d = haversine_m(lat, lon, el["lat"], el["lon"])
            feats.append({"id": el["id"], "name": tags.get("name"),
                          "natural": tags.get("natural"),
                          "amenity": tags.get("amenity"),
                          "man_made": tags.get("man_made"),
                          "distance_m": round(d, 1)})
    ways.sort(key=lambda x: x["distance_m"])
    feats.sort(key=lambda x: x["distance_m"])
    return {"ways": ways, "features": feats}


def query_gnis(lat, lon, radius_m):
    env = envelope_around(lat, lon, radius_m)
    params = {
        "geometry": json.dumps(env), "geometryType": "esriGeometryEnvelope",
        "inSR": 4326, "spatialRel": "esriSpatialRelIntersects",
        "outFields": "feature_name,feature_class",
        "returnGeometry": "true", "outSR": 4326, "f": "geojson",
    }
    r = http_get_json(endpoint=ENDPOINTS["gnis"], params=params) \
        if False else http_get_json(ENDPOINTS["gnis"], params)
    out = []
    for feat in r.get("features", []):
        g = feat.get("geometry") or {}
        coords = g.get("coordinates", [])
        if not coords: continue
        d = haversine_m(lat, lon, coords[1], coords[0])
        out.append({"name": feat["properties"].get("feature_name"),
                    "type": feat["properties"].get("feature_class"),
                    "distance_m": round(d, 1)})
    out.sort(key=lambda x: x["distance_m"])
    return out


def enrich_one_point(lat, lon, cache):
    """Enrich one (lat, lon) using cache; populate cache if missed."""
    key = cache_key(lat, lon)
    if key in cache:
        return cache[key]

    radius   = CONFIG["enrichment_radius_m"]
    radius_g = CONFIG["gnis_radius_m"]

    pad = _safe_call(query_padus, lat, lon)
    is_usfs = pad and pad.get("manager") and "Forest" in (pad.get("manager") or "")
    is_nps  = pad and pad.get("manager_type") and "NPS" in (pad.get("manager_type") or "")

    usfs_t = _safe_call(query_arcgis_lines, ENDPOINTS["usfs_trails"], lat, lon, radius,
                        "TRAIL_NAME,TRAIL_NO,TRAIL_CN") if is_usfs else []
    usfs_r = _safe_call(query_arcgis_lines, ENDPOINTS["usfs_roads"], lat, lon, radius,
                        "NAME,ID,FUNCTIONAL_CLASS") if is_usfs else []
    nps_t  = _safe_call(query_arcgis_lines, ENDPOINTS["nps_trails"], lat, lon, radius,
                        "TRLNAME,TRLALTNAME,TRLCLASS") if is_nps else []
    osm    = _safe_call(query_overpass, lat, lon, radius)
    gnis   = _safe_call(query_gnis, lat, lon, radius_g)

    result = {
        "jurisdiction":      pad.get("manager") if isinstance(pad, dict) else None,
        "jurisdiction_unit": pad.get("unit") if isinstance(pad, dict) else None,
        "usfs_nearby_trails": (usfs_t or [])[:5] if isinstance(usfs_t, list) else [],
        "usfs_nearby_roads":  (usfs_r or [])[:5] if isinstance(usfs_r, list) else [],
        "nps_nearby_trails":  (nps_t  or [])[:5] if isinstance(nps_t,  list) else [],
        "osm_nearby_ways":    (osm.get("ways", [])     if isinstance(osm, dict) else [])[:5],
        "osm_nearby_features":(osm.get("features", []) if isinstance(osm, dict) else [])[:5],
        "gnis_nearby_features": (gnis or [])[:5] if isinstance(gnis, list) else [],
    }
    cache[key] = result
    return result


def resolve_target_name(record, enrichment):
    """Pick the best name for what this turn is going onto, when prose didn't supply one."""
    # If the prose parser already extracted a target, keep it
    if record.get("target_feature"):
        return record["target_feature"], record.get("target_type")

    # USFS named trails > USFS roads > NPS trails > OSM named ways > OSM refs
    for t in enrichment.get("usfs_nearby_trails", []):
        n = (t.get("props") or {}).get("TRAIL_NAME")
        if n and n.strip(): return n.strip(), "trail"
    for t in enrichment.get("nps_nearby_trails", []):
        n = (t.get("props") or {}).get("TRLNAME")
        if n and n.strip(): return n.strip(), "trail"
    for r in enrichment.get("usfs_nearby_roads", []):
        p = r.get("props") or {}
        if p.get("NAME") and p["NAME"].strip(): return p["NAME"].strip(), "road"
        if p.get("ID"): return f"FR {p['ID']}", "road"
    for w in enrichment.get("osm_nearby_ways", []):
        if w.get("name"): return w["name"], "trail" if w.get("highway") in ("path","footway","track","bridleway") else "road"
    for w in enrichment.get("osm_nearby_ways", []):
        if w.get("ref"):  return w["ref"], "road"
    return None, None


def run_enrichment(records):
    if not CONFIG["enable_live_enrichment"]:
        log("stage5", "live enrichment disabled — skipping")
        return records

    cache_path = Path(CONFIG["output_dir"]) / "_enrichment_cache.json"
    cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}
    log("stage5", f"loaded {len(cache)} cached enrichment results")

    enriched = []
    for i, rec in enumerate(records):
        lat, lon = rec.get("lat"), rec.get("lon")
        if lat is None or lon is None:
            enriched.append(rec); continue
        was_cached = cache_key(lat, lon) in cache
        e = enrich_one_point(lat, lon, cache)
        rec.update(e)
        # Resolve display target if prose didn't have one
        name, kind = resolve_target_name(rec, e)
        rec["resolved_target_name"] = name
        rec["resolved_target_type"] = kind
        if not rec.get("target_feature") and name:
            rec["target_feature"] = name
            rec["target_type"] = kind
        enriched.append(rec)
        if (i + 1) % 25 == 0:
            log("stage5", f"  enriched {i+1}/{len(records)}")
            cache_path.write_text(json.dumps(cache))
        if not was_cached:
            time.sleep(CONFIG["politeness_delay_s"])

    cache_path.write_text(json.dumps(cache))
    log("stage5", f"enrichment complete; cache saved ({len(cache)} entries)")
    return enriched


# ════════════════════════════════════════════════════════════════════════════
# STAGE 6 — Emit deliverables
# ════════════════════════════════════════════════════════════════════════════

def write_master_json(records, sections, switchback_zones, waypoints, track, out_dir):
    path = Path(out_dir) / "tbt_master.json"
    payload = {
        "race_name": CONFIG["race_name"],
        "race_slug": CONFIG["race_slug"],
        "course_length_mi": float(track["cum_mi"][-1]),
        "n_turns": len(records),
        "n_sections": len(sections),
        "n_switchback_zones": len(switchback_zones),
        "n_aid_stations": len(waypoints),
        "sections": sections,
        "turns": records,
        "switchback_zones": [{k: v for k, v in sb.items() if k != "track_indices"} for sb in switchback_zones],
        "aid_stations": waypoints,
    }
    path.write_text(json.dumps(payload, indent=2, default=str))
    log("stage6", f"wrote {path.name}")


def write_csv(records, out_dir):
    path = Path(out_dir) / "tbt.csv"
    fields = ["course_mi", "lat", "lon", "ele_m", "direction", "intensity",
              "verb", "target_feature", "target_type", "section_from_aid",
              "section_to_aid", "snap_method", "snap_distance_mi",
              "matched_turn_deg", "jurisdiction", "jurisdiction_unit",
              "context"]
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        for t in records:
            w.writerow({
                "course_mi": round(t["snapped_course_mi"], 2),
                "lat":  round(t.get("lat") or 0, 6) if t.get("lat") else "",
                "lon":  round(t.get("lon") or 0, 6) if t.get("lon") else "",
                "ele_m": round(t.get("ele_m") or 0, 0) if t.get("ele_m") else "",
                "direction":      t.get("direction"),
                "intensity":      t.get("intensity"),
                "verb":           t.get("verb_match", ""),
                "target_feature": t.get("target_feature") or "",
                "target_type":    t.get("target_type") or "",
                "section_from_aid": t.get("section_from_aid") or "",
                "section_to_aid":   t.get("section_to_aid") or "",
                "snap_method":      t.get("snap_method"),
                "snap_distance_mi": round(t.get("snap_distance_mi", 0), 3) if t.get("snap_distance_mi") else "",
                "matched_turn_deg": round(t.get("matched_turn_deg", 0), 1) if t.get("matched_turn_deg") else "",
                "jurisdiction":      t.get("jurisdiction") or "",
                "jurisdiction_unit": t.get("jurisdiction_unit") or "",
                "context":           (t.get("context") or "")[:160],
            })
    log("stage6", f"wrote {path.name}  ({len(records)} rows)")


def write_geojson_turns(records, out_dir):
    """One feature per turn — drop-in Mapbox GL / Leaflet layer."""
    path = Path(out_dir) / "turns.geojson"
    features = []
    for i, t in enumerate(records):
        if t.get("lat") is None or t.get("lon") is None: continue
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [t["lon"], t["lat"]]},
            "properties": {
                "id": f"turn_{i:03d}",
                "course_mi": round(t["snapped_course_mi"], 2),
                "ele_m":     t.get("ele_m"),
                "direction": t.get("direction"),
                "intensity": t.get("intensity"),
                "label":     t.get("target_feature") or "",
                "label_type": t.get("target_type") or "",
                "section":    f"{t.get('section_from_aid','')} → {t.get('section_to_aid','')}",
                "snap_method": t.get("snap_method"),
                "context":     t.get("context", ""),
                "jurisdiction":      t.get("jurisdiction") or "",
                "jurisdiction_unit": t.get("jurisdiction_unit") or "",
            },
        })
    path.write_text(json.dumps({"type": "FeatureCollection", "features": features}))
    log("stage6", f"wrote {path.name}  ({len(features)} features)")


def write_geojson_aids(waypoints, out_dir):
    path = Path(out_dir) / "aids.geojson"
    features = [{
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [w["lon"], w["lat"]]},
        "properties": {
            "id": f"aid_{i:02d}",
            "name": w["name"],
            "course_mi": round(w["course_mi"], 2),
            "ele_m": w["ele_m"],
        }} for i, w in enumerate(waypoints)]
    path.write_text(json.dumps({"type": "FeatureCollection", "features": features}))
    log("stage6", f"wrote {path.name}  ({len(features)} features)")


def write_course_line(track, out_dir):
    path = Path(out_dir) / "course_line.geojson"
    target = CONFIG["course_line_downsample_to"]
    n = track["n"]
    step = max(1, n // target)
    coords = [[float(track["lon"][i]), float(track["lat"][i])] for i in range(0, n, step)]
    coords.append([float(track["lon"][-1]), float(track["lat"][-1])])
    fc = {"type": "FeatureCollection", "features": [{
        "type": "Feature",
        "geometry": {"type": "LineString", "coordinates": coords},
        "properties": {"name": CONFIG["race_name"]},
    }]}
    path.write_text(json.dumps(fc))
    log("stage6", f"wrote {path.name}  ({len(coords)} vertices)")


def write_switchback_zones(switchback_zones, out_dir):
    path = Path(out_dir) / "switchback_zones.geojson"
    features = []
    for i, sb in enumerate(switchback_zones):
        if not sb.get("lat_lon_path"): continue
        coords = [[lon, lat] for lat, lon in sb["lat_lon_path"]]
        features.append({
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": coords},
            "properties": {
                "id": f"sb_{i:03d}",
                "start_mi": round(sb["start_mi"], 2),
                "end_mi":   round(sb["end_mi"], 2),
                "n_turns":  sb["n_turns"],
                "length_ft": round((sb["end_mi"] - sb["start_mi"]) * 5280, 0),
            },
        })
    path.write_text(json.dumps({"type": "FeatureCollection", "features": features}))
    log("stage6", f"wrote {path.name}  ({len(features)} zones)")


# ── Markdown ────────────────────────────────────────────────────────────────
DIR_LABEL = {
    ("right",    "sharp"):  "**SHARP RIGHT**",
    ("left",     "sharp"):  "**SHARP LEFT**",
    ("right",    "normal"): "**Right**",
    ("left",     "normal"): "**Left**",
    ("right",    "slight"): "*Bear right*",
    ("left",     "slight"): "*Bear left*",
    ("right",    "fork"):   "*Stay right*",
    ("left",     "fork"):   "*Stay left*",
    ("straight", "normal"): "*Continue straight*",
}
METHOD_ICON = {
    "mile_anchored": "🎯", "sequential": "🔗",
    "approximate_or_midpoint": "📍", "no_geom_match": "⚠",
    "geometry_only": "·",
}


def write_markdown(records, sections, switchback_zones, out_dir):
    path = Path(out_dir) / "tbt.md"
    L = []
    L.append(f"# {CONFIG['race_name']} — Turn-by-Turn\n")
    L.append("Auto-generated by FSS TBT pipeline.")
    if CONFIG["section_descriptions_path"]:
        L.append(f"Source descriptions: `{CONFIG['section_descriptions_path']}`")
    else:
        L.append("Mode: geometry + live-enrichment only (no prose descriptions provided).")
    L.append("")
    L.append("Snap quality legend: 🎯 mile-anchored · 🔗 sequential · 📍 approximate/straight · ⚠ no match · · geometry-only\n")
    L.append("---\n")

    by_section = {}
    for t in records:
        key = (t.get("section_start_mi", 0), t.get("section_end_mi", 0),
               t.get("section_from_aid", ""), t.get("section_to_aid", ""))
        by_section.setdefault(key, []).append(t)

    sec_meta = {(s["from_mi"], s["to_mi"]): s for s in sections}

    for key in sorted(by_section.keys()):
        s0, s1, fa, ta = key
        L.append(f"## Mi {s0:.1f} → Mi {s1:.1f}: {fa} → {ta}\n")
        meta = sec_meta.get((s0, s1), {})
        if meta.get("named_trails"):   L.append(f"**Trails:** {', '.join(meta['named_trails'])}")
        if meta.get("named_roads"):    L.append(f"**Roads:** {', '.join(meta['named_roads'])}")
        if meta.get("hazards"):        L.append(f"**Hazards:** {', '.join(meta['hazards'])}")
        L.append("")
        L.append("| Mi | Action | Onto / Near | Section quality |")
        L.append("|---|---|---|---|")
        for t in by_section[key]:
            label  = DIR_LABEL.get((t.get("direction"), t.get("intensity")),
                                   (t.get("direction") or "").title())
            target = t.get("target_feature") or "—"
            icon   = METHOD_ICON.get(t.get("snap_method", ""), "")
            L.append(f"| {t['snapped_course_mi']:.2f} | {label} | {target} | {icon} |")
        L.append("")

    if switchback_zones:
        L.append("## Appendix — Switchback zones\n")
        L.append("| Start mi | End mi | Length (ft) | # turns |")
        L.append("|---|---|---|---|")
        for sb in switchback_zones[:50]:
            L.append(f"| {sb['start_mi']:.2f} | {sb['end_mi']:.2f} | "
                     f"{(sb['end_mi']-sb['start_mi'])*5280:.0f} | {sb['n_turns']} |")
        if len(switchback_zones) > 50:
            L.append(f"\n*… plus {len(switchback_zones)-50} more.*")

    path.write_text("\n".join(L))
    log("stage6", f"wrote {path.name}")


# ════════════════════════════════════════════════════════════════════════════
# MAIN
# ════════════════════════════════════════════════════════════════════════════

def main():
    out_dir = Path(CONFIG["output_dir"])
    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"\n=== FSS TBT Pipeline · {CONFIG['race_name']} ===")
    print(f"GPX:    {CONFIG['gpx_path']}")
    print(f"Output: {out_dir}\n")

    # 1. GPX
    track = parse_gpx(CONFIG["gpx_path"])

    # 2. Geometry → candidates → switchbacks → actionable
    candidates = detect_candidate_turns(track)
    switchback_zones = detect_switchback_zones(candidates)
    actionable = filter_actionable(candidates, switchback_zones)

    # 3. Optional: parse descriptions
    sections, prose_turns = parse_section_descriptions(CONFIG["section_descriptions_path"])

    # 4. Synthesize master records
    if prose_turns:
        master = snap_prose_to_geometry(prose_turns, sections, actionable, track)
    else:
        master = build_geometry_only_records(actionable, track, track["waypoints"])
        sections = []

    # 5. Live enrichment
    master = run_enrichment(master)

    # 6. Emit deliverables
    write_master_json(master, sections, switchback_zones, track["waypoints"], track, out_dir)
    write_csv(master, out_dir)
    write_geojson_turns(master, out_dir)
    write_geojson_aids(track["waypoints"], out_dir)
    write_course_line(track, out_dir)
    write_switchback_zones(switchback_zones, out_dir)
    write_markdown(master, sections, switchback_zones, out_dir)

    # Summary
    print(f"\n=== Summary ===")
    print(f"Course length:        {track['cum_mi'][-1]:.2f} mi")
    print(f"Aid stations:         {len(track['waypoints'])}")
    print(f"Candidate turns:      {len(candidates)}")
    print(f"Switchback zones:     {len(switchback_zones)}")
    print(f"Actionable turns:     {len(actionable)}")
    print(f"Master records:       {len(master)}")
    snap_counts = Counter(t.get("snap_method") for t in master)
    for m, c in snap_counts.most_common():
        print(f"  {m:30s}  {c}")
    n_named = sum(1 for t in master if t.get("target_feature"))
    print(f"Records with named target: {n_named} / {len(master)} ({100*n_named/max(len(master),1):.0f}%)")
    print(f"\nOutput files in: {out_dir}\n")


if __name__ == "__main__":
    main()
