/**
 * server.js — Node.js HTTP server entry point (BE-01)
 *
 * - Binds to localhost only (never 0.0.0.0) — security rule
 * - Port configurable via PORT env var; default 3001
 * - Initialises DB and file store before accepting requests
 * - Routes:
 *     GET  /health   — liveness check (BE-01)
 *     POST /uploads  — file upload (BE-05)
 *     GET  /queue    — contract queue (BE-06)
 */

const http = require('node:http');
const { getDb } = require('./db');
const { ensureUploadDir } = require('./fileStore');
const { uploadHandler } = require('./uploadHandler');
const { queueHandler } = require('./queueHandler');
const logger = require('./logger');

const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = '127.0.0.1'; // never bind to 0.0.0.0

// --- Startup: initialise dependencies before accepting requests ---
ensureUploadDir();
getDb(); // runs CREATE TABLE IF NOT EXISTS

// --- Request router ---
const server = http.createServer((req, res) => {
  const { method, url } = req;

  // CORS headers for local dev (frontend dev server on a different port)
  // Allow the Vite dev server (5173) and the SSR dev server (3000)
  const allowedOrigins = ['http://localhost:5173', 'http://localhost:3000'];
  const origin = req.headers['origin'];
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (method === 'GET' && url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  if (method === 'POST' && url === '/uploads') {
    uploadHandler(req, res);
    return;
  }

  if (method === 'GET' && url === '/queue') {
    queueHandler(req, res);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found.' }));
});

server.listen(PORT, HOST, () => {
  logger.info('server_started', { host: HOST, port: PORT });
});

server.on('error', (err) => {
  logger.error('server_error', { error_type: err.code || 'UNKNOWN' });
  process.exit(1);
});
