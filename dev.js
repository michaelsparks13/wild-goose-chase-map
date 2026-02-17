#!/usr/bin/env node
// dev.js - Dev server with watch + SSE live reload
// Zero dependencies (Node.js stdlib only)

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PORT = process.env.PORT || 3000;
const DIST = path.join(__dirname, 'dist');
const SRC = path.join(__dirname, 'src');

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const LIVE_RELOAD_SCRIPT = '<script>new EventSource("/__live-reload").addEventListener("reload",function(){location.reload()})</script>';

let sseClients = [];
let buildTimer = null;

function build() {
  try {
    execSync('node build.js', { cwd: __dirname, stdio: 'inherit' });
    return true;
  } catch (e) {
    console.error('Build failed:', e.message);
    return false;
  }
}

function notifyClients() {
  for (const res of sseClients) {
    try { res.write('event: reload\ndata: 1\n\n'); } catch (e) { /* ignore */ }
  }
}

function debouncedRebuild() {
  if (buildTimer) clearTimeout(buildTimer);
  buildTimer = setTimeout(function() {
    console.log('\nFile changed, rebuilding...');
    if (build()) {
      notifyClients();
    }
  }, 100);
}

function watchRecursive(dir) {
  try {
    fs.watch(dir, { recursive: true }, function(eventType, filename) {
      if (filename && !filename.includes('node_modules')) {
        debouncedRebuild();
      }
    });
  } catch (e) {
    console.error('Watch error:', e.message);
  }
}

// Initial build
console.log('Initial build...');
if (!build()) {
  process.exit(1);
}

// Start file watcher
watchRecursive(SRC);
watchRecursive(path.join(__dirname, 'build.js'));
console.log('Watching src/ for changes...');

// Start HTTP server
const server = http.createServer(function(req, res) {
  // SSE endpoint
  if (req.url === '/__live-reload') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write('data: connected\n\n');
    sseClients.push(res);
    req.on('close', function() {
      sseClients = sseClients.filter(function(c) { return c !== res; });
    });
    return;
  }

  // Static file serving from dist/
  let filePath = path.join(DIST, req.url === '/' ? 'index.html' : req.url);

  // Directory → index.html
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  let content = fs.readFileSync(filePath);

  // Inject live reload script into HTML responses
  if (ext === '.html') {
    content = content.toString().replace('</body>', LIVE_RELOAD_SCRIPT + '</body>');
  }

  res.writeHead(200, { 'Content-Type': contentType });
  res.end(content);
});

server.listen(PORT, function() {
  console.log('Dev server running at http://localhost:' + PORT);
  console.log('Press Ctrl+C to stop\n');
});
