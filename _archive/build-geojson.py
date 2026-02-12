#!/usr/bin/env python3
"""
Convert Wild Goose Trail Festival GPX files to simplified GeoJSON
with elevation profiles and race statistics.
"""
import json
import math
import xml.etree.ElementTree as ET
from pathlib import Path

NS = {'gpx': 'http://www.topografix.com/GPX/1/1'}

GPX_FILES = {
    'pink': {
        'path': Path.home() / 'Downloads' / 'wild-goose-pink-loop-775m.gpx',
        'color': '#E834EC',
        'label': 'Pink Loop',
        'nominal_miles': 7.75,
        'type': 'trk',
    },
    'blue': {
        'path': Path.home() / 'Downloads' / 'wild-goose-blue-6m.gpx',
        'color': '#0479FF',
        'label': 'Blue Loop',
        'nominal_miles': 6.0,
        'type': 'rte',
    },
    'checkered': {
        'path': Path.home() / 'Downloads' / 'wild-goose-checkered-loop-475m.gpx',
        'color': '#D4A017',
        'label': 'Checkered Loop',
        'nominal_miles': 4.75,
        'type': 'trk',
    },
}

OUT_DIR = Path(__file__).parent / 'data'


def haversine(lat1, lon1, lat2, lon2):
    """Distance in meters between two lat/lon points."""
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def parse_gpx(path, gpx_type):
    """Extract list of (lat, lon, ele_meters) from GPX file."""
    tree = ET.parse(path)
    root = tree.getroot()

    if gpx_type == 'trk':
        pts = root.findall('.//gpx:trkpt', NS)
    else:
        pts = root.findall('.//gpx:rtept', NS)

    coords = []
    for pt in pts:
        lat = float(pt.get('lat'))
        lon = float(pt.get('lon'))
        ele_node = pt.find('gpx:ele', NS)
        ele = float(ele_node.text) if ele_node is not None else 0
        coords.append((lat, lon, ele))
    return coords


def simplify_by_distance(coords, min_dist_m=15):
    """Keep points that are at least min_dist_m apart, plus direction changes."""
    if len(coords) <= 2:
        return coords
    result = [coords[0]]
    for i in range(1, len(coords) - 1):
        d = haversine(result[-1][0], result[-1][1], coords[i][0], coords[i][1])
        if d >= min_dist_m:
            result.append(coords[i])
    result.append(coords[-1])
    return result


def compute_stats(coords):
    """Compute distance (miles), gain (ft), loss (ft), min/max ele (ft)."""
    total_dist = 0
    gain = 0
    loss = 0
    m_to_ft = 3.28084
    m_to_mi = 0.000621371

    elevations_ft = [c[2] * m_to_ft for c in coords]

    for i in range(1, len(coords)):
        total_dist += haversine(coords[i - 1][0], coords[i - 1][1],
                                coords[i][0], coords[i][1])
        d_ele = coords[i][2] - coords[i - 1][2]
        if d_ele > 0:
            gain += d_ele
        else:
            loss += abs(d_ele)

    return {
        'distance_mi': round(total_dist * m_to_mi, 2),
        'gain_ft': round(gain * m_to_ft),
        'loss_ft': round(loss * m_to_ft),
        'min_ele_ft': round(min(elevations_ft)),
        'max_ele_ft': round(max(elevations_ft)),
    }


def build_elevation_profile(coords):
    """Build distance-elevation pairs for charting. Returns list of {d: miles, e: feet}."""
    m_to_ft = 3.28084
    m_to_mi = 0.000621371
    profile = [{'d': 0, 'e': round(coords[0][2] * m_to_ft, 1)}]
    cum_dist = 0

    for i in range(1, len(coords)):
        cum_dist += haversine(coords[i - 1][0], coords[i - 1][1],
                              coords[i][0], coords[i][1])
        profile.append({
            'd': round(cum_dist * m_to_mi, 3),
            'e': round(coords[i][2] * m_to_ft, 1),
        })
    return profile


def deduplicate_consecutive(coords):
    """Remove consecutive duplicate points."""
    if not coords:
        return coords
    result = [coords[0]]
    for c in coords[1:]:
        if c[0] != result[-1][0] or c[1] != result[-1][1]:
            result.append(c)
    return result


def process_loop(name, config):
    print(f"Processing {name}...")
    raw = parse_gpx(config['path'], config['type'])
    print(f"  Raw points: {len(raw)}")

    deduped = deduplicate_consecutive(raw)
    print(f"  After dedup: {len(deduped)}")

    # Compute stats on full-res data
    stats = compute_stats(deduped)
    print(f"  Distance: {stats['distance_mi']} mi, Gain: {stats['gain_ft']} ft")

    # Build elevation profile from full-res data (thinned to ~200 pts)
    profile_full = build_elevation_profile(deduped)

    # Simplify geometry for map display
    # Use ~10m epsilon for simplification
    if len(deduped) > 400:
        simplified = simplify_by_distance(deduped, 15)
    else:
        simplified = deduped
    print(f"  Simplified: {len(simplified)} points")

    # Thin elevation profile to ~200 points
    if len(profile_full) > 200:
        step = len(profile_full) // 200
        profile = profile_full[::step]
        if profile[-1] != profile_full[-1]:
            profile.append(profile_full[-1])
    else:
        profile = profile_full

    # Build GeoJSON
    geojson = {
        'type': 'FeatureCollection',
        'features': [{
            'type': 'Feature',
            'properties': {
                'name': config['label'],
                'loop': name,
                'color': config['color'],
                'nominal_miles': config['nominal_miles'],
                **stats,
            },
            'geometry': {
                'type': 'LineString',
                'coordinates': [[c[1], c[0], c[2]] for c in simplified],
            },
        }],
        'profile': profile,
    }

    out_path = OUT_DIR / f'{name}.geojson'
    with open(out_path, 'w') as f:
        json.dump(geojson, f)
    print(f"  Wrote {out_path} ({out_path.stat().st_size // 1024} KB)")
    return geojson


def main():
    OUT_DIR.mkdir(exist_ok=True)
    all_data = {}
    for name, config in GPX_FILES.items():
        all_data[name] = process_loop(name, config)

    # Print summary
    print("\n=== Summary ===")
    for name, data in all_data.items():
        props = data['features'][0]['properties']
        print(f"{props['name']}: {props['distance_mi']} mi | "
              f"+{props['gain_ft']} ft / -{props['loss_ft']} ft | "
              f"Ele: {props['min_ele_ft']}-{props['max_ele_ft']} ft | "
              f"{len(data['features'][0]['geometry']['coordinates'])} pts")


if __name__ == '__main__':
    main()
