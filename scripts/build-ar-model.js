#!/usr/bin/env node
// Builds the AR tabletop course model for a race:
//   node scripts/build-ar-model.js <slug>
//
// Fetches terrarium DEM + Esri World Imagery tiles for the course bbox,
// builds a decimated terrain mesh with a satellite diffuse map, drapes the
// course as a tube, adds aid-station pins and an animated lead-pack marker,
// and writes src/maps/<slug>/data/ar/course.glb + ar-meta.json.
//
// Like scripts/fetch-weather.js, this runs at authoring time and its outputs
// are committed — the Netlify build never touches the network.

const fs = require('fs');
const path = require('path');
const { computeBBox, pickZoom, cumulativeMiles, coordAtMile, localProjector } = require('./ar/geo');
const { buildHeightRaster } = require('./ar/dem');
const { buildDiffuseTexture, shrinkTexture } = require('./ar/imagery');
const {
  buildTerrain,
  buildPlinth,
  resampleCourse,
  buildTube,
  buildSphere,
  buildPin,
  buildLeadPackKeyframes,
} = require('./ar/mesh');
const { buildGlb } = require('./ar/glb');

// Progressive quality tiers tried until the GLB fits its size budget.
const QUALITY_TIERS = [
  { cols: 192, texPx: 2048, texQ: 70 },
  { cols: 160, texPx: 1792, texQ: 62 },
  { cols: 128, texPx: 1536, texQ: 55 },
  { cols: 96, texPx: 1024, texQ: 50 },
];

const DEFAULTS = {
  targetSizeM: 0.42,     // longest side of the tabletop model, meters
  exaggeration: 1.6,     // vertical exaggeration for readability
  animationSeconds: 45,  // lead-pack full-course duration
  padRatio: 0.15,        // bbox padding around the course
};

function loadConfig(slug) {
  const configPath = path.join(__dirname, '..', 'src', 'maps', slug, 'config.js');
  if (!fs.existsSync(configPath)) {
    throw new Error(`No config found for "${slug}" at ${configPath}`);
  }
  return require(configPath);
}

function extractCourse(config) {
  if (Array.isArray(config.courseCoords) && config.courseCoords.length > 1) {
    return config.courseCoords;
  }
  throw new Error(
    `Config for "${config.slug}" has no courseCoords array. ` +
      'Multi-loop maps need a flattened headline-race coordinate list.'
  );
}

async function buildRaceModel(slug) {
  const config = loadConfig(slug);
  const opts = { ...DEFAULTS, ...(config.ar || {}) };
  const coords = extractCourse(config);
  const cumMiles = cumulativeMiles(coords);
  const computedMiles = cumMiles[cumMiles.length - 1];
  const totalMiles = config.totalMiles || computedMiles;
  const budgetMB = opts.budgetMB || (totalMiles > 120 ? 15 : 5);
  const log = (msg) => console.log(`  ${msg}`);

  console.log(`\nBuilding AR model for ${slug} (${totalMiles} mi, budget ${budgetMB} MB)`);

  const bbox = computeBBox(coords, opts.padRatio);
  const demZoom = pickZoom(bbox, { maxTiles: 6, maxZoom: 13 });
  const raster = await buildHeightRaster(bbox, demZoom, { log });

  let texture = await buildDiffuseTexture(bbox, {
    maxPx: QUALITY_TIERS[0].texPx,
    quality: QUALITY_TIERS[0].texQ,
    log,
  });

  const brandColor = (config.cssVars && config.cssVars['--primary']) || '#C1440E';
  let result = null;

  for (const tier of QUALITY_TIERS) {
    const tierTexture =
      texture.width <= tier.texPx ? texture : shrinkTexture(texture, tier.texPx, tier.texQ);

    const projProbe = localProjector(bbox);
    const scale = opts.targetSizeM / Math.max(projProbe.widthM, projProbe.depthM);

    const terrain = buildTerrain({
      bbox, raster, cols: tier.cols, exaggeration: opts.exaggeration, scale,
    });
    const plinth = buildPlinth(terrain);

    // Cap tube path points so huge courses don't dominate the buffer.
    const stepMeters = Math.max(50, (computedMiles * 1609.34) / 1500);
    const course = resampleCourse({ coords, cumMiles, terrain, stepMeters });
    const tubeRadius = opts.targetSizeM * 0.005;
    const tube = buildTube(course.points, tubeRadius, 6);

    const pinDims = {
      poleHeight: opts.targetSizeM * 0.06,
      poleRadius: opts.targetSizeM * 0.0016,
      headRadius: opts.targetSizeM * 0.011,
    };
    const pinGeom = buildPin(pinDims);
    const aidStations = config.aidStations || [];
    const pins = aidStations.map((station) => {
      const [lng, lat] = coordAtMile(coords, cumMiles, station.mile * (computedMiles / totalMiles));
      const p = terrain.proj.project([lng, lat]);
      return {
        geom: pinGeom,
        translation: [p.x * scale, terrain.heightAt(lng, lat), p.z * scale],
      };
    });

    const keyframes = buildLeadPackKeyframes(course, opts.animationSeconds);
    const leadPackGeom = buildSphere(tubeRadius * 3, 10, 7);

    const glb = await buildGlb({
      terrainGeom: terrain.surface,
      plinthGeom: plinth,
      tubeGeom: tube,
      pins,
      leadPackGeom,
      keyframes,
      texture: tierTexture,
      colors: {
        course: brandColor,
        plinth: '#2b2723',
        pin: '#ffffff',
        leadPack: '#ffd54a',
      },
    });

    const sizeMB = glb.length / (1024 * 1024);
    log(
      `Tier cols=${tier.cols} tex=${tierTexture.width}px → ${sizeMB.toFixed(2)} MB ` +
        `(${terrain.rows}x${terrain.cols} grid, ${course.points.length} course pts)`
    );

    result = {
      glb, terrain, course, pins, aidStations, keyframes, scale, sizeMB,
      pinHeadY: pinDims.poleHeight + pinDims.headRadius * 1.6,
    };
    if (sizeMB <= budgetMB) break;
  }

  if (result.sizeMB > budgetMB) {
    throw new Error(
      `GLB is ${result.sizeMB.toFixed(2)} MB after the lowest quality tier ` +
        `(budget ${budgetMB} MB). Reduce padRatio or targetSizeM.`
    );
  }

  const outDir = path.join(__dirname, '..', 'src', 'maps', slug, 'data', 'ar');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'course.glb'), result.glb);

  const meta = {
    slug,
    raceName: config.raceName || config.title || slug,
    totalMiles,
    budgetMB,
    glbBytes: result.glb.length,
    scaleDenominator: Math.round(1 / result.scale),
    animationSeconds: opts.animationSeconds,
    exaggeration: opts.exaggeration,
    modelSize: {
      x: +(result.terrain.proj.widthM * result.scale).toFixed(3),
      y: +result.terrain.reliefModel.toFixed(3),
      z: +(result.terrain.proj.depthM * result.scale).toFixed(3),
    },
    aidStations: result.aidStations.map((station, i) => ({
      node: `aid-${i}`,
      name: station.name,
      mile: station.mile,
      services: station.services || '',
      // Hotspot anchor at the pin head, in model space.
      position: [
        +result.pins[i].translation[0].toFixed(4),
        +(result.pins[i].translation[1] + result.pinHeadY).toFixed(4),
        +result.pins[i].translation[2].toFixed(4),
      ],
    })),
  };
  fs.writeFileSync(path.join(outDir, 'ar-meta.json'), JSON.stringify(meta, null, 2));

  console.log(
    `  Wrote ${path.relative(process.cwd(), path.join(outDir, 'course.glb'))} ` +
      `(${result.sizeMB.toFixed(2)} MB) + ar-meta.json (scale 1:${meta.scaleDenominator})`
  );
  return meta;
}

async function main() {
  const slugs = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (!slugs.length) {
    console.error('Usage: node scripts/build-ar-model.js <slug> [<slug>...]');
    process.exit(1);
  }
  for (const slug of slugs) {
    await buildRaceModel(slug);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { buildRaceModel, QUALITY_TIERS, DEFAULTS };
