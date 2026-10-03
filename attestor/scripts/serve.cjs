'use strict';
/**
 * Minimal static host for the Attestor Module: serves attestor/dist on its own origin.
 *
 * The attestor must come from somewhere the consent server does not control (decision D-03).
 * CORS is required for a cross-origin <script crossorigin="anonymous" integrity="...">: without
 * an Access-Control-Allow-Origin header the browser refuses to apply SRI to the response.
 *
 *   node scripts/serve.cjs [port]      default 8090
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

function createServer(dir, overrides = {}) {
  return http.createServer((req, res) => {
    const name = path.basename((req.url || '/').split('?')[0]);
    const file = path.join(dir, name);
    if (!/^[\w.-]+$/.test(name) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
      return;
    }
    let body = fs.readFileSync(file);
    if (overrides[name]) body = overrides[name](body);
    res.writeHead(200, {
      'Content-Type': name.endsWith('.json')
        ? 'application/json'
        : 'text/javascript; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(body);
  });
}

module.exports = { createServer };

if (require.main === module) {
  const port = Number(process.argv[2] || 8090);
  createServer(path.join(__dirname, '..', 'dist')).listen(port, '127.0.0.1', () => {
    console.log(`attestor host listening on http://127.0.0.1:${port}`);
  });
}
