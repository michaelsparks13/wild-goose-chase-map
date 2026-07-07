#!/usr/bin/env node
// Exports course.usdz (iOS Quick Look) from a race's course.glb:
//   node scripts/export-usdz.js <slug>
//
// three's USDZExporter needs browser APIs (canvas, ImageBitmap), so this
// runs it inside headless Chromium via Playwright — same pattern as the
// web-pipeline poster engine. Quick Look USDZ is static: the lead-pack
// animation only plays in the GLB paths.

const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('@playwright/test');

const ROOT = path.join(__dirname, '..');
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.glb': 'model/gltf-binary',
};

const EXPORT_PAGE = `<!doctype html>
<html><head><meta charset="utf-8">
<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js"}}</script>
</head><body>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from '/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { USDZExporter } from '/node_modules/three/examples/jsm/exporters/USDZExporter.js';

// The GLB uses KHR_mesh_quantization (normalized integer attributes).
// USDZExporter reads raw arrays, so expand everything back to float32.
function denormalize(geom) {
  for (const name of Object.keys(geom.attributes)) {
    const attr = geom.attributes[name];
    if (!attr.normalized) continue;
    const arr = new Float32Array(attr.count * attr.itemSize);
    for (let i = 0; i < attr.count; i++) {
      for (let c = 0; c < attr.itemSize; c++) {
        arr[i * attr.itemSize + c] = attr.getComponent(i, c);
      }
    }
    geom.setAttribute(name, new THREE.BufferAttribute(arr, attr.itemSize));
  }
}

window.exportUsdz = (async () => {
  const gltf = await new GLTFLoader().loadAsync('/model/course.glb');
  gltf.scene.traverse((obj) => {
    if (obj.isMesh) denormalize(obj.geometry);
  });
  const exporter = new USDZExporter();
  const data = await exporter.parseAsync(gltf.scene);
  let binary = '';
  const bytes = new Uint8Array(data);
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
})();
</script>
</body></html>`;

async function exportUsdz(slug) {
  const glbPath = path.join(ROOT, 'src', 'maps', slug, 'data', 'ar', 'course.glb');
  if (!fs.existsSync(glbPath)) {
    throw new Error(`No course.glb for "${slug}" — run scripts/build-ar-model.js first.`);
  }

  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    let file;
    if (urlPath === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(EXPORT_PAGE);
    }
    if (urlPath === '/model/course.glb') {
      file = glbPath;
    } else if (urlPath.startsWith('/node_modules/three/')) {
      file = path.join(ROOT, urlPath);
    }
    if (!file || !fs.existsSync(file)) {
      res.writeHead(404);
      return res.end('not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    await page.goto(`http://localhost:${port}/`);
    const base64 = await page.evaluate(() => window.exportUsdz);
    if (!base64) {
      throw new Error(`USDZ export returned nothing. Page errors: ${pageErrors.join('; ')}`);
    }
    const usdz = Buffer.from(base64, 'base64');
    const outPath = path.join(path.dirname(glbPath), 'course.usdz');
    fs.writeFileSync(outPath, usdz);
    console.log(
      `Wrote ${path.relative(process.cwd(), outPath)} (${(usdz.length / 1024 / 1024).toFixed(2)} MB)`
    );
  } finally {
    await browser.close();
    server.close();
  }
}

async function main() {
  const slugs = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (!slugs.length) {
    console.error('Usage: node scripts/export-usdz.js <slug> [<slug>...]');
    process.exit(1);
  }
  for (const slug of slugs) {
    await exportUsdz(slug);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { exportUsdz };
