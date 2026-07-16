#!/usr/bin/env python3
"""Render animated smoke-forecast frames in the Star Tribune editorial style.

Reads the hourly PM2.5 rasters cached by fetch_smoke.py, linearly interpolates
between forecast hours for smooth motion, and draws each frame with:
  near-white land, gray water, gray admin borders under the smoke, an
  orange-to-brown log-scaled smoke ramp, haloed city/region labels, a
  ticking local-time stamp, and a "FORECASTED PM2.5 DENSITY" legend.

Everything (raster and vectors) is projected through the same Lambert
conformal conic implemented below, so layers can never misalign.

Usage:
  /usr/bin/python3 render.py --still 18           # one frame for design work
  /usr/bin/python3 render.py                      # full frame sequence
"""

import argparse
import json
import os
import re
from datetime import datetime, timedelta, timezone

import numpy as np
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap
from matplotlib.patches import FancyBboxPatch
import matplotlib.patheffects as pe
from matplotlib.path import Path as MplPath
from matplotlib.patches import PathPatch

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
CACHE = os.path.join(HERE, "cache")
FRAMES = os.path.join(HERE, "frames")

# ---------------------------------------------------------------- geometry --

GRID_BBOX = (-106.0, 41.5, -77.0, 56.5)  # W S E N of the cached rasters
GRID_COLS, GRID_ROWS = 967, 500

# Lambert conformal conic (spherical) — display projection.
LON0, LAT0 = -92.3, 48.0
LAT1, LAT2 = 44.0, 54.0
R_EARTH = 6370997.0

# Projected map window, meters, centered on (LON0, LAT0).
VIEW_W_KM = 2140.0
VIEW_CX_KM, VIEW_CY_KM = -28.0, 145.0  # nudge window relative to proj origin

PX_W, PX_H = 808, 640
DPI = 150  # rendered at 1.5x then downscaled by ffmpeg


def lcc(lon, lat):
    """Spherical Lambert conformal conic forward projection -> meters."""
    lon = np.radians(np.asarray(lon, dtype=np.float64))
    lat = np.radians(np.asarray(lat, dtype=np.float64))
    lat1, lat2 = np.radians(LAT1), np.radians(LAT2)
    lat0, lon0 = np.radians(LAT0), np.radians(LON0)

    n = np.log(np.cos(lat1) / np.cos(lat2)) / np.log(
        np.tan(np.pi / 4 + lat2 / 2) / np.tan(np.pi / 4 + lat1 / 2)
    )
    f = np.cos(lat1) * np.tan(np.pi / 4 + lat1 / 2) ** n / n
    rho = R_EARTH * f / np.tan(np.pi / 4 + lat / 2) ** n
    rho0 = R_EARTH * f / np.tan(np.pi / 4 + lat0 / 2) ** n
    theta = n * (lon - lon0)
    return rho * np.sin(theta), rho0 - rho * np.cos(theta)


def view_extent():
    half_w = VIEW_W_KM * 1000 / 2
    half_h = half_w * PX_H / PX_W
    cx, cy = VIEW_CX_KM * 1000, VIEW_CY_KM * 1000
    return cx - half_w, cx + half_w, cy - half_h, cy + half_h


# ------------------------------------------------------------------- style --

LAND = "#f9f7f5"
WATER = "#d8d8d8"
STATE_BORDER = "#b9b5b1"
INTL_BORDER = "#7d7a77"
WATER_EDGE = "#c4c2c0"
LABEL_GRAY = "#8b8885"
INK = "#1a1a1a"

FONT = ["Helvetica Neue", "Helvetica", "Arial"]

# Smoke ramp sampled off the reference legend: cream -> orange -> dark brown.
SMOKE_STOPS = [
    "#f7e8d9", "#f3d3b4", "#eeb98b", "#e69a60",
    "#d97a3a", "#c05a20", "#9c3f10", "#71290a", "#4a1a06",
]
VMIN_UG, VMAX_UG = 5.0, 650.0  # µg/m³, log scale

CITIES = [
    # name, lon, lat, label side ("l" puts text left of dot)
    ("Ely", -91.867, 47.903, "l"),
    ("Duluth", -92.100, 46.786, "l"),
    ("St. Cloud", -94.162, 45.561, "l"),
    ("Twin Cities", -93.265, 44.977, "l"),
]

REGIONS = [
    ("MANITOBA", -98.3, 51.2),
    ("ONTARIO", -90.3, 51.3),
    ("MINNESOTA", -95.1, 46.1),
    ("WISCONSIN", -90.4, 44.65),
    ("MICHIGAN", -87.5, 46.1),
]

# Defaults match the July 2026 Boundary Waters event; override via CLI flags.
CDT = timezone(timedelta(hours=-5))
CYCLE_UTC = datetime(2026, 7, 14, 12, tzinfo=timezone.utc)
CYCLE_DATE, CYCLE_HOUR = "20260714", 12


def build_cmap():
    cmap = LinearSegmentedColormap.from_list("smoke", SMOKE_STOPS, N=256)
    colors = cmap(np.linspace(0, 1, 256))
    # Alpha ramps in over the light end so faint smoke stays translucent.
    t = np.linspace(0, 1, 256)
    colors[:, 3] = np.clip(t / 0.16, 0, 1) * 0.93 + np.clip((t - 0.55) / 0.45, 0, 1) * 0.07
    return LinearSegmentedColormap.from_list("smoke_a", colors, N=256)


def smoke_norm(ug):
    """Map µg/m³ -> 0..1 on a log scale, clipped."""
    with np.errstate(divide="ignore", invalid="ignore"):
        v = (np.log10(np.maximum(ug, 1e-6)) - np.log10(VMIN_UG)) / (
            np.log10(VMAX_UG) - np.log10(VMIN_UG)
        )
    return np.clip(v, 0.0, 1.0)


def letterspace(text):
    """Space out glyphs for label tracking, keeping decimals like 2.5 whole."""
    return " ".join(re.findall(r"\d+\.\d+|\S", text))


def timestamp_lines(fh_float, cycle_utc=CYCLE_UTC, tz=CDT):
    valid = (cycle_utc + timedelta(hours=float(fh_float))).astimezone(tz)
    hr = valid.strftime("%I").lstrip("0")
    ampm = "a.m." if valid.strftime("%p") == "AM" else "p.m."
    return f"{hr}:00 {ampm}", valid.strftime("%a. %B %-d")


# ------------------------------------------------------------------- data ---


def load_hours(hours, date=CYCLE_DATE, cycle=CYCLE_HOUR):
    fields = {}
    for fh in hours:
        path = os.path.join(CACHE, f"smoke.{date}.t{cycle:02d}z.f{fh:03d}.bil")
        a = np.fromfile(path, dtype=np.float32).reshape(GRID_ROWS, GRID_COLS)
        fields[fh] = a * 1e9  # kg/m³ -> µg/m³
    return fields


def geojson_paths(name, keep=None):
    with open(os.path.join(DATA, name)) as f:
        gj = json.load(f)
    rings = []
    for feat in gj["features"]:
        geom = feat["geometry"]
        if geom is None or (keep and not keep(feat.get("properties") or {})):
            continue
        if geom["type"] == "LineString":
            rings.append((geom["coordinates"], False))
        elif geom["type"] == "MultiLineString":
            rings.extend((c, False) for c in geom["coordinates"])
        elif geom["type"] == "Polygon":
            rings.extend((c, True) for c in geom["coordinates"])
        elif geom["type"] == "MultiPolygon":
            for poly in geom["coordinates"]:
                rings.extend((c, True) for c in poly)
    return rings


def projected_path(rings, closed_only=False):
    verts, codes = [], []
    for coords, closed in rings:
        if closed_only and not closed:
            continue
        arr = np.asarray(coords, dtype=np.float64)
        x, y = lcc(arr[:, 0], arr[:, 1])
        pts = np.column_stack([x, y])
        verts.append(pts)
        c = np.full(len(pts), MplPath.LINETO)
        c[0] = MplPath.MOVETO
        if closed:
            c[-1] = MplPath.CLOSEPOLY
        codes.append(c)
    return MplPath(np.concatenate(verts), np.concatenate(codes))


# ----------------------------------------------------------------- drawing --


class FrameRenderer:
    def __init__(self):
        lons = np.linspace(GRID_BBOX[0], GRID_BBOX[2], GRID_COLS)
        lats = np.linspace(GRID_BBOX[3], GRID_BBOX[1], GRID_ROWS)
        lon_m, lat_m = np.meshgrid(lons, lats)
        self.mesh_x, self.mesh_y = lcc(lon_m, lat_m)
        self.cmap = build_cmap()

        self.lakes = geojson_paths("lakes.geojson")
        self.big_lakes = geojson_paths(
            "lakes.geojson",
            keep=lambda p: p.get("scalerank") is not None and p["scalerank"] <= 1)
        self.ocean = geojson_paths("ocean.geojson")
        self.states = geojson_paths("states_lines.geojson")
        self.intl = geojson_paths("intl_lines.geojson")

        self.fig = plt.figure(figsize=(PX_W / 100, PX_H / 100), dpi=DPI)
        self.fig.patch.set_facecolor(LAND)
        self.ax = self.fig.add_axes([0, 0, 1, 1])
        self.ax.set_facecolor(LAND)
        self.ax.set_axis_off()
        x0, x1, y0, y1 = view_extent()
        self.ax.set_xlim(x0, x1)
        self.ax.set_ylim(y0, y1)
        self.ax.set_aspect("equal")

        self._draw_static_under()
        self.smoke_artist = self.ax.pcolormesh(
            self.mesh_x, self.mesh_y,
            np.zeros((GRID_ROWS, GRID_COLS)),
            cmap=self.cmap, vmin=0, vmax=1,
            shading="gouraud", zorder=4, rasterized=True,
        )
        self._draw_static_over()
        self.ts_hour, self.ts_date = self._draw_chrome()

    def _fill(self, rings, color, zorder):
        patch = PathPatch(projected_path(rings, closed_only=True),
                          facecolor=color, edgecolor="none", zorder=zorder)
        self.ax.add_patch(patch)

    def _lines(self, rings, color, lw, zorder):
        patch = PathPatch(projected_path(rings), facecolor="none",
                          edgecolor=color, linewidth=lw, zorder=zorder,
                          capstyle="round", joinstyle="round")
        self.ax.add_patch(patch)

    def _draw_static_under(self):
        self._fill(self.ocean, WATER, 1)
        self._fill(self.lakes, WATER, 1.2)
        self._lines(self.states, STATE_BORDER, 0.8, 2)
        self._lines(self.intl, INTL_BORDER, 0.9, 3)

    def _draw_static_over(self):
        # Major water edges + intl border read through heavy smoke.
        self._lines(self.big_lakes, WATER_EDGE, 0.6, 5)
        self._lines(self.intl, INTL_BORDER, 0.9, 6)

        halo = [pe.withStroke(linewidth=3.2, foreground="white")]
        for name, lon, lat in REGIONS:
            x, y = lcc(lon, lat)
            self.ax.text(x, y, letterspace(name), fontsize=8.2, color=LABEL_GRAY,
                         family=FONT, weight="medium", ha="center", va="center",
                         zorder=8, path_effects=halo)
        for name, lon, lat, side in CITIES:
            x, y = lcc(lon, lat)
            self.ax.scatter([x], [y], s=8, color=INK, zorder=9)
            dx = -9000 if side == "l" else 9000
            self.ax.text(x + dx, y + 2500, name, fontsize=9.5, color=INK,
                         family=FONT, weight="medium",
                         ha="right" if side == "l" else "left", va="center",
                         zorder=9, path_effects=halo)

    def _draw_chrome(self):
        fig = self.fig
        halo = [pe.withStroke(linewidth=3.5, foreground="white")]
        # Timestamp (figure coords), left of the legend column.
        ts_hour = fig.text(0.215, 0.245, "", fontsize=13, color=INK,
                           family=FONT, weight="bold", ha="center",
                           zorder=10, path_effects=halo)
        ts_date = fig.text(0.215, 0.205, "", fontsize=13, color=INK,
                           family=FONT, weight="regular", ha="center",
                           zorder=10, path_effects=halo)

        # Legend card.
        card = FancyBboxPatch((0.082, 0.06), 0.266, 0.098,
                              boxstyle="round,pad=0.004,rounding_size=0.006",
                              transform=fig.transFigure, facecolor="white",
                              edgecolor="#cccccc", linewidth=0.8, zorder=10)
        fig.patches.append(card)
        fig.text(0.125, 0.128, letterspace("FORECASTED PM2.5 DENSITY"),
                 fontsize=6.4, color=INK, family=FONT, weight="bold", zorder=11)
        # Gradient bar.
        bar_ax = fig.add_axes([0.125, 0.096, 0.18, 0.022], zorder=11)
        grad = np.linspace(0, 1, 256)[None, :]
        bar_ax.imshow(grad, aspect="auto", cmap=LinearSegmentedColormap.from_list(
            "legend", SMOKE_STOPS, N=256))
        bar_ax.set_axis_off()
        fig.text(0.125, 0.068, "Less smoke", fontsize=8, color=INK,
                 family=FONT, weight="medium", zorder=11)
        fig.text(0.305, 0.068, "More smoke", fontsize=8, color=INK,
                 family=FONT, weight="medium", ha="right", zorder=11)
        return ts_hour, ts_date

    def render(self, field_ug, fh_float, out_path, cycle_utc=CYCLE_UTC, tz=CDT):
        self.smoke_artist.set_array(smoke_norm(field_ug).ravel())
        hour, date = timestamp_lines(fh_float, cycle_utc, tz)
        self.ts_hour.set_text(hour)
        self.ts_date.set_text(date)
        self.fig.savefig(out_path, dpi=DPI, facecolor=LAND)


# -------------------------------------------------------------------- main --


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--still", type=float, default=None,
                    help="render a single frame at this forecast hour")
    ap.add_argument("--hours", default="0-60")
    ap.add_argument("--subframes", type=int, default=4,
                    help="interpolated frames per forecast hour")
    ap.add_argument("--date", default=CYCLE_DATE,
                    help="forecast cycle date, YYYYMMDD (must match fetch)")
    ap.add_argument("--cycle", type=int, default=CYCLE_HOUR,
                    help="forecast cycle hour, UTC (must match fetch)")
    ap.add_argument("--tz-offset", type=float, default=-5.0,
                    help="local UTC offset for the timestamp, hours")
    args = ap.parse_args()

    cycle_utc = datetime.strptime(args.date, "%Y%m%d").replace(
        hour=args.cycle, tzinfo=timezone.utc)
    tz = timezone(timedelta(hours=args.tz_offset))

    lo, hi = (int(x) for x in args.hours.split("-"))
    os.makedirs(FRAMES, exist_ok=True)
    renderer = FrameRenderer()

    if args.still is not None:
        fh0 = int(np.floor(args.still))
        frac = args.still - fh0
        fields = load_hours({fh0, min(fh0 + 1, hi)}, args.date, args.cycle)
        f = fields[fh0] if frac == 0 else (
            (1 - frac) * fields[fh0] + frac * fields[min(fh0 + 1, hi)])
        out = os.path.join(FRAMES, f"still_f{args.still:06.2f}.png")
        renderer.render(f, args.still, out, cycle_utc, tz)
        print(out)
        return

    fields = load_hours(range(lo, hi + 1), args.date, args.cycle)
    n = 0
    for fh in range(lo, hi):
        a, b = fields[fh], fields[fh + 1]
        for s in range(args.subframes):
            frac = s / args.subframes
            renderer.render((1 - frac) * a + frac * b, fh + frac,
                            os.path.join(FRAMES, f"frame_{n:04d}.png"),
                            cycle_utc, tz)
            n += 1
    renderer.render(fields[hi], hi, os.path.join(FRAMES, f"frame_{n:04d}.png"),
                    cycle_utc, tz)
    print(f"{n + 1} frames -> {FRAMES}")


if __name__ == "__main__":
    main()
