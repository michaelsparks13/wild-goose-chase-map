#!/usr/bin/env node
'use strict';

// Fetch the OSM road network for the Tupper Lake area covering all three
// Tinman race courses, and cache it as `osm-roads.json` for offline use by
// `build-tinman-steps.js`.
//
// Run sparingly — only when OSM data has been corrected and we want to pull
// the updates. Output is checked into git so build-tinman-steps.js can run
// without network access.

const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT = path.join(__dirname, '..', 'src', 'maps', 'tupper-lake-tinman', 'data', 'osm-roads.json');

// South, West, North, East — covers Faust, downtown Tupper Lake village,
// the Sunmount campus, the Wolf Pond corridor, and the Old Wawbeek / Dugal
// road loop east of town.
const BBOX = '44.220,-74.500,44.265,-74.420';

const QUERY = `[out:json][timeout:60];way(${BBOX})[highway~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|track|living_street|road)$"];out tags geom;`;

function postOverpass() {
  const data = 'data=' + encodeURIComponent(QUERY);
  return new Promise((resolve, reject) => {
    const req = https.request({
      host: 'overpass-api.de',
      path: '/api/interpreter',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(data),
        'User-Agent': 'tinman-cue-builder/1.0 (+https://falsesummitstudio.com)',
      },
      timeout: 90_000,
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
          return;
        }
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.write(data);
    req.end();
  });
}

(async function main() {
  console.log(`Fetching OSM road network for bbox ${BBOX} ...`);
  const j = await postOverpass();
  const ways = j.elements || [];
  const named = ways.filter(w => w.tags && w.tags.name);
  console.log(`  ${ways.length} ways (${named.length} named)`);
  fs.writeFileSync(OUT, JSON.stringify(j));
  console.log(`Wrote ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(1)} KB)`);
})().catch(err => { console.error(err); process.exit(1); });
