#!/usr/bin/env node
// Manual WebXR verification for the AR course preview:
//   npm i -D iwer @iwer/sem       # one-time (emulator deps, not in the suite)
//   node build.js
//   node scripts/verify-ar-webxr.js [slug]        (default: escarpment)
//
// Headless Chromium cannot run immersive-ar natively, so this drives the real
// WebXR code path with IWER (Immersive Web Emulation Runtime) + its Synthetic
// Environment Module for hit-test. It confirms the session negotiates a valid
// reference space, the dom-overlay console keeps working while immersed, and
// exiting restores model-viewer with the scrub position preserved.
//
// This lives outside the automated suite on purpose: the emulator adds heavy
// dev-only deps, and driving a full GLB decode under software WebGL is slow.
// Treat it as the reproducible pre-ship check for the AR path.

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const SLUG = process.argv.find((a, i) => i >= 2 && !a.startsWith('--')) || 'escarpment';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary' };

function requireOrDie(name) {
  try {
    return require.resolve(name);
  } catch {
    console.error(`Missing "${name}". Install the emulator deps first:\n  npm i -D iwer @iwer/sem`);
    process.exit(1);
  }
}

async function main() {
  const iwerPath = path.join(path.dirname(requireOrDie('iwer/package.json')), 'build', 'iwer.min.js');
  const semPkg = path.dirname(requireOrDie('@iwer/sem/package.json'));
  const semPath = path.join(semPkg, 'build', 'iwer-sem.min.js');
  const env = JSON.parse(fs.readFileSync(path.join(semPkg, 'captures', 'office_small.json'), 'utf8'));
  const { chromium } = require('@playwright/test');

  const glb = path.join(DIST, 'ar', SLUG, 'index.html');
  if (!fs.existsSync(glb)) {
    console.error(`No built page at dist/ar/${SLUG}/. Run: node build.js`);
    process.exit(1);
  }

  const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath.endsWith('/')) urlPath += 'index.html';
    const file = path.join(DIST, urlPath);
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      return res.end('not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;

  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const results = [];
  const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  };

  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await page.addInitScript({ path: iwerPath });
    await page.addInitScript({ path: semPath });
    await page.addInitScript((envJson) => {
      const { XRDevice, metaQuest3 } = window.IWER;
      const { SyntheticEnvironmentModule } = window.IWER_SEM;
      const device = new XRDevice(metaQuest3);
      device.installRuntime();
      device.installSEM(SyntheticEnvironmentModule);
      device.sem.loadEnvironment(envJson);
      window.__xrDevice = device;
    }, env);

    console.log(`\nVerifying WebXR AR path for ${SLUG}…`);
    await page.goto(`http://127.0.0.1:${port}/ar/${SLUG}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.getElementById('courseModel')?.loaded, { timeout: 30000 });

    check('WebXR entry offered', (await page.getAttribute('body', 'data-ar-mode')) === 'webxr');

    // The emulator injects a full-screen passthrough canvas that intercepts
    // synthetic pointer events, so drive the UI via element.click() in-page.
    await page.evaluate(() => document.getElementById('xrArBtn').click());
    await page.waitForFunction(() => document.body.dataset.xrActive === '1', { timeout: 30000 });
    check('immersive-ar session entered', true);
    check('placement hint shown', await page.evaluate(() => !document.getElementById('xrHint').hidden));

    // dom-overlay console stays live while immersed.
    await page.evaluate(() => {
      const s = document.getElementById('scrubber');
      s.value = '750';
      s.dispatchEvent(new Event('input', { bubbles: true }));
      s.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const mileInXr = await page.textContent('#mileNow');
    check('console scrubs inside AR', mileInXr === '14.0', `mile=${mileInXr}`);

    await page.evaluate(() => document.getElementById('xrExitBtn').click());
    await page.waitForFunction(() => !document.body.dataset.xrActive, { timeout: 10000 });
    const mvTime = await page.evaluate(() => document.getElementById('courseModel').currentTime);
    check('exit restores model-viewer at scrub position', Math.abs(mvTime - 33.75) < 0.5, `t=${mvTime}`);
    check('no page errors', errors.length === 0, errors.join('; '));
  } finally {
    await browser.close();
    server.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${failed.length ? `${failed.length} check(s) FAILED` : 'All checks passed'}\n`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
