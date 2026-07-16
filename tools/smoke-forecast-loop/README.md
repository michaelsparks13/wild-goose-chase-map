# Smoke Forecast Loop

Animated wildfire-smoke forecast loop in an editorial news-graphic style —
built to recreate the Star Tribune's July 2026 Boundary Waters smoke
animation (near-surface PM2.5 from NOAA's Rapid Refresh Forecast System
sweeping across Minnesota and the Great Lakes).

## What it produces

A ~8 s, 30 fps, 808×640 looping MP4:

- Near-white land, gray water, thin gray state/province borders
- Log-scaled orange→dark-brown PM2.5 smoke ramp with a translucent low end
- Haloed city dots (Ely, Duluth, St. Cloud, Twin Cities) and letterspaced
  region labels; major-lake shorelines and the international border stay
  legible above heavy smoke
- Ticking local-time stamp (CDT) and a "FORECASTED PM2.5 DENSITY" legend

## Pipeline

```
fetch_smoke.py   RRFS 2dfld 3km NA grib2 .idx → HTTP Range download of the
                 MASSDEN (8 m AGL, organic PM2.5) message only (~4 MB/hour)
                 → gdalwarp rotated-pole → regular lat/lon Float32 .bil
render.py        hourly .bil grids → linear time interpolation → matplotlib
                 frames (spherical Lambert conformal conic implemented in
                 numpy so raster and vectors share one projection)
ffmpeg           frames → yuv420p looping MP4
```

Data sources (all free, no keys):

| Source | Used for |
|--------|----------|
| `noaa-rrfs-pds` S3 bucket | RRFS smoke forecast (PM2.5 mass density) |
| Natural Earth 10m | states/provinces, international borders, lakes, ocean |

## Usage

```bash
# 1. Fetch forecast hours (cycle date/hour + range are flags)
/usr/bin/python3 fetch_smoke.py --date 20260714 --cycle 12 --hours 0-60

# 2. Basemap (once): download NE shapefiles, clip to region → data/*.geojson
bash fetch_basemap.sh

# 3. Design iteration: single frame at any (fractional) forecast hour
/usr/bin/python3 render.py --still 18

# 4. Full sequence + encode
/usr/bin/python3 render.py --subframes 4
ffmpeg -y -framerate 30 -i frames/frame_%04d.png \
  -vf "scale=808:640:flags=lanczos" -c:v libx264 -pix_fmt yuv420p -crf 19 \
  -movflags +faststart output/smoke-loop.mp4

# Tests
/usr/bin/python3 test_smoke_loop.py
```

Requires: system Python 3 with numpy + matplotlib, GDAL CLI tools
(MacPorts: `PROJ_DATA=/opt/local/lib/proj9/share/proj` is set internally),
ffmpeg.

## Adapting to another event

**Same region, new date** (the common case — e.g. next summer's smoke):
pass matching flags to both scripts, nothing else changes:

```bash
/usr/bin/python3 fetch_smoke.py --date 20270712 --cycle 12 --hours 0-48
/usr/bin/python3 render.py     --date 20270712 --cycle 12 --hours 0-48 --tz-offset -5
```

**New region:**

1. Adjust `GRID_BBOX` in `fetch_smoke.py` and the view constants
   (`LON0/LAT0`, `VIEW_W_KM`, `VIEW_CX_KM/VIEW_CY_KM`) in `render.py`.
2. Swap the `CITIES` / `REGIONS` label lists.
3. Re-run `fetch_basemap.sh` if the region leaves the clipped extent.
4. `--still <fh>` renders single frames for fast design iteration before
   committing to the full sequence.

Note: `cache/` (per-hour rasters) and `frames/` are throwaway build
artifacts; `output/` holds the final MP4.
