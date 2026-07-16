/**
 * queueHandler.js — GET /queue (BE-06)
 *
 * Returns all contract records ordered by upload timestamp descending (newest first).
 * Spec A-03, design §5.3, FR-02, FR-03.
 *
 * Security: file_path is intentionally excluded from the response (design §11.4).
 * An empty database returns an empty array with HTTP 200 — not an error.
 */

const { getDb } = require('./db');
const logger = require('./logger');

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
function queueHandler(req, res) {
  let contracts;
  try {
    const db = getDb();
    // Select only the fields the frontend needs; exclude file_path
    contracts = db
      .prepare(
        'SELECT id, file_name, uploaded_at, status FROM contracts ORDER BY uploaded_at DESC'
      )
      .all();
  } catch (err) {
    logger.error('db_read_failed', {
      operation: 'SELECT contracts',
      error_type: 'DB_READ_FAILURE',
    });
    sendJson(res, 500, { error: 'Failed to retrieve contract queue.' });
    return;
  }

  logger.info('queue_served', { count: contracts.length });

  sendJson(res, 200, contracts);
}

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

module.exports = { queueHandler };
