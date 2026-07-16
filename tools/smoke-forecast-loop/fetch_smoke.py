#!/usr/bin/env python3
"""Fetch RRFS near-surface smoke (PM2.5 MASSDEN) for a range of forecast hours.

For each forecast hour this script:
  1. reads the GRIB2 .idx sidecar to find the byte range of the smoke field
     (MASSDEN, 8 m above ground, particulate organic matter dry, <2.5e-06 m),
  2. downloads just that message with an HTTP Range request (~4 MB vs ~800 MB),
  3. warps the rotated-pole 3 km North America grid to a regular lat/lon grid
     over the map window with gdalwarp, writing a raw Float32 ENVI .bil that
     the renderer reads straight into numpy.

Usage: /usr/bin/python3 fetch_smoke.py [--date 20260714] [--cycle 12] [--hours 0-60]
"""

import argparse
import os
import subprocess
import sys
import urllib.request

BUCKET = "https://noaa-rrfs-pds.s3.amazonaws.com"
KEY_TMPL = "rrfs_a/rrfs.{date}/{cycle:02d}/rrfs.t{cycle:02d}z.2dfld.3km.f{fh:03d}.na.grib2"
FIELD_MATCH = (
    "MASSDEN:8 m above ground:{fh_desc}:"
    "aerosol=Particulate organic matter dry:aerosol_size <2.5e-06"
)

# Map window (regular lat/lon) the renderer expects, deg: W S E N.
GRID_BBOX = (-106.0, 41.5, -77.0, 56.5)
GRID_COLS, GRID_ROWS = 967, 500

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache")

GDAL_ENV = dict(
    os.environ,
    PROJ_DATA="/opt/local/lib/proj9/share/proj",
    PROJ_LIB="/opt/local/lib/proj9/share/proj",
)


def field_byte_range(idx_text, fh):
    """Return (start, end_or_None) byte offsets of the smoke message."""
    fh_desc = "anl" if fh == 0 else f"{fh} hour fcst"
    needle = FIELD_MATCH.format(fh_desc=fh_desc)
    lines = idx_text.splitlines()
    for i, line in enumerate(lines):
        if needle in line:
            start = int(line.split(":")[1])
            end = None
            if i + 1 < len(lines):
                end = int(lines[i + 1].split(":")[1]) - 1
            return start, end
    raise KeyError(f"smoke field not found in idx (looked for {needle!r})")


def fetch(url, byte_range=None):
    req = urllib.request.Request(url)
    if byte_range:
        start, end = byte_range
        req.add_header("Range", f"bytes={start}-{end if end is not None else ''}")
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.read()


def warp_to_bil(grib_path, bil_path):
    w, s, e, n = GRID_BBOX
    subprocess.run(
        [
            "gdalwarp", "-q", "-overwrite",
            "-t_srs", "EPSG:4326",
            "-te", str(w), str(s), str(e), str(n),
            "-ts", str(GRID_COLS), str(GRID_ROWS),
            "-r", "bilinear",
            "-of", "ENVI", "-ot", "Float32",
            grib_path, bil_path,
        ],
        check=True,
        env=GDAL_ENV,
    )


def fetch_hour(date, cycle, fh):
    os.makedirs(CACHE, exist_ok=True)
    bil = os.path.join(CACHE, f"smoke.{date}.t{cycle:02d}z.f{fh:03d}.bil")
    if os.path.exists(bil):
        return bil
    key = KEY_TMPL.format(date=date, cycle=cycle, fh=fh)
    idx_text = fetch(f"{BUCKET}/{key}.idx").decode()
    byte_range = field_byte_range(idx_text, fh)
    grib = bil.replace(".bil", ".grib2")
    with open(grib, "wb") as f:
        f.write(fetch(f"{BUCKET}/{key}", byte_range))
    warp_to_bil(grib, bil)
    os.remove(grib)
    return bil


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default="20260714")
    ap.add_argument("--cycle", type=int, default=12)
    ap.add_argument("--hours", default="0-60")
    args = ap.parse_args()

    lo, hi = (int(x) for x in args.hours.split("-"))
    for fh in range(lo, hi + 1):
        path = fetch_hour(args.date, args.cycle, fh)
        print(f"f{fh:03d} -> {os.path.basename(path)}", flush=True)


if __name__ == "__main__":
    sys.exit(main())
