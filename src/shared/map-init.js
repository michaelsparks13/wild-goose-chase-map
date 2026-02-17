// map-init.js - PMTiles protocol, basemap style, initMap()
// Requires: CONFIG

var protocol = new pmtiles.Protocol();
maplibregl.addProtocol('pmtiles', protocol.tile);

var PMTILES_URL = 'pmtiles://https://pub-e494904da8db4a209e8229adcd8b63f9.r2.dev/basemap.pmtiles';

var BASEMAP_STYLE = {
  version: 8,
  glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
  sprite: 'https://protomaps.github.io/basemaps-assets/sprites/v4/light',
  sources: {
    protomaps: {
      type: 'vector',
      url: PMTILES_URL,
      attribution: '<a href="https://protomaps.com">Protomaps</a> &copy; <a href="https://openstreetmap.org">OpenStreetMap</a>'
    },
    'hillshade-dem': {
      type: 'raster-dem',
      tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
      tileSize: 256, maxzoom: 15, encoding: 'terrarium'
    }
  },
  layers: [].concat(basemaps.layers('protomaps', Object.assign({}, basemaps.namedFlavor('light'), CONFIG.basemapFlavor), { lang: 'en' }), [{
    id: 'hillshade', type: 'hillshade', source: 'hillshade-dem',
    paint: {
      'hillshade-exaggeration': 0.3,
      'hillshade-shadow-color': '#5a5a5a',
      'hillshade-highlight-color': '#ffffff',
      'hillshade-accent-color': '#4a8f29'
    }
  }])
};

var map;
var courseVisible = true;
var terrain3D = false;
var trailsOn = false;
var aidVisible = false;
var aidMarkers = [];
