#!/bin/bash
# Download Natural Earth 10m layers and clip them to the map region as
# GeoJSON. Run once; outputs land in data/. Requires curl, unzip, ogr2ogr.
set -euo pipefail
cd "$(dirname "$0")/data"

export PROJ_DATA=/opt/local/lib/proj9/share/proj
export PROJ_LIB=/opt/local/lib/proj9/share/proj

CLIP="-110 39 -74 58"  # generous margin around the render window

fetch() {
  local theme=$1 name=$2 out=$3
  curl -sL -o "$name.zip" "https://naciscdn.org/naturalearth/10m/$theme/$name.zip"
  unzip -oq "$name.zip" -d "$name"
  # shellcheck disable=SC2086
  ogr2ogr -f GeoJSON -clipsrc $CLIP "$out" "$name/$name.shp"
  rm -rf "$name" "$name.zip"
}

fetch cultural ne_10m_admin_1_states_provinces_lines states_lines.geojson
fetch cultural ne_10m_admin_0_boundary_lines_land intl_lines.geojson
fetch physical ne_10m_lakes lakes.geojson
fetch physical ne_10m_ocean ocean.geojson

ls -la ./*.geojson
