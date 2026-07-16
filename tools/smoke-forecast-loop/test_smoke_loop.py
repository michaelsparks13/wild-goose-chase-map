#!/usr/bin/env python3
"""Unit tests for the smoke-forecast-loop pipeline (no network, no rendering).

Run: /usr/bin/python3 test_smoke_loop.py
"""

import numpy as np

import fetch_smoke
import render


def test_lcc_orientation():
    x0, y0 = render.lcc(render.LON0, render.LAT0)
    assert abs(x0) < 1e-6, "projection center must sit on x=0"
    xn, yn = render.lcc(render.LON0, render.LAT0 + 1)
    assert yn > y0, "north must be +y"
    xe, ye = render.lcc(render.LON0 + 1, render.LAT0)
    assert xe > x0, "east must be +x"
    # One degree of latitude near the center is ~111 km.
    assert 100_000 < yn - y0 < 122_000


def test_lcc_vectorized():
    lons = np.array([-95.0, -90.0])
    lats = np.array([45.0, 50.0])
    x, y = render.lcc(lons, lats)
    assert x.shape == (2,) and y.shape == (2,)
    assert np.isfinite(x).all() and np.isfinite(y).all()


def test_smoke_norm_clips_and_is_monotonic():
    v = render.smoke_norm(np.array([0.0, render.VMIN_UG, 50.0, render.VMAX_UG, 1e5]))
    assert v[0] == 0.0 and v[1] == 0.0
    assert v[-1] == 1.0 and v[-2] == 1.0
    assert np.all(np.diff(v) >= 0)


def test_cmap_alpha_ramp():
    cmap = render.build_cmap()
    rgba = cmap(np.linspace(0, 1, 256))
    assert rgba[0, 3] < 0.05, "no-smoke end must be transparent"
    assert rgba[-1, 3] > 0.9, "heavy-smoke end must be near-opaque"
    assert np.all(np.diff(rgba[:, 3]) >= -1e-9), "alpha must never decrease"


def test_letterspace_keeps_decimals_whole():
    assert render.letterspace("MANITOBA") == "M A N I T O B A"
    assert "2.5" in render.letterspace("FORECASTED PM2.5 DENSITY")


def test_timestamps_match_reference_clip():
    # 12z Jul 14 cycle is 7:00 a.m. CDT; the clip ends at f060 = 7:00 p.m. Thu.
    assert render.timestamp_lines(0) == ("7:00 a.m.", "Tue. July 14")
    assert render.timestamp_lines(29) == ("12:00 p.m.", "Wed. July 15")
    assert render.timestamp_lines(60) == ("7:00 p.m.", "Thu. July 16")


def test_timestamps_accept_other_cycles_and_zones():
    from datetime import datetime, timedelta, timezone
    cycle = datetime(2026, 7, 20, 0, tzinfo=timezone.utc)
    est_dst = timezone(timedelta(hours=-4))
    assert render.timestamp_lines(0, cycle, est_dst) == ("8:00 p.m.", "Sun. July 19")


def test_idx_byte_range_parsing():
    idx = "\n".join([
        "82:1000:d=2026071412:PRES:surface:18 hour fcst:",
        "83:2000:d=2026071412:MASSDEN:8 m above ground:18 hour fcst:"
        "aerosol=Particulate organic matter dry:aerosol_size <2.5e-06",
        "84:3500:d=2026071412:MASSDEN:8 m above ground:18 hour fcst:"
        "aerosol=Dust dry:aerosol_size <2.5e-06",
    ])
    assert fetch_smoke.field_byte_range(idx, 18) == (2000, 3499)


def test_idx_last_message_open_ended():
    idx = (
        "1:0:d=2026071412:MASSDEN:8 m above ground:6 hour fcst:"
        "aerosol=Particulate organic matter dry:aerosol_size <2.5e-06"
    )
    assert fetch_smoke.field_byte_range(idx, 6) == (0, None)


def test_idx_missing_field_raises():
    try:
        fetch_smoke.field_byte_range("1:0:d=x:PRES:surface:6 hour fcst:", 6)
    except KeyError:
        return
    raise AssertionError("expected KeyError for missing smoke field")


def test_scalerank_zero_survives_keep_filter():
    # Regression: Great Lakes carry scalerank 0, which is falsy.
    keep = lambda p: p.get("scalerank") is not None and p["scalerank"] <= 1
    assert keep({"scalerank": 0})
    assert not keep({"scalerank": 7})
    assert not keep({})


def main():
    tests = [(k, v) for k, v in sorted(globals().items())
             if k.startswith("test_") and callable(v)]
    for name, fn in tests:
        fn()
        print(f"ok  {name}")
    print(f"{len(tests)} tests passed")


if __name__ == "__main__":
    main()
