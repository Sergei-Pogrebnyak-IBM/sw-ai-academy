/**
 * uploadHandler.js — POST /uploads (BE-05)
 *
 * Ordered steps (design §11.1):
 *   1. Parse multipart form data
 *   2. Validate file type (MIME + extension) — BE-04
 *   3. Write file to File Store — BE-03
 *   4. Create contract record in DB (status: Pending) — BE-02
 *   5. Invoke Risk Engine stub (non-blocking) — riskEngineStub
 *   6. Return contract record
 *
 * Error rules (design §11.4):
 *   - No stack traces, internal paths, or DB detail in any response.
 *   - On DB write failure after file save: attempt orphan file removal (plan LLD-04).
 */

const { randomUUID } = require('node:crypto');
const Busboy = require('busboy');
const { validateFileType } = require('./validateFileType');
const { saveFile, removeFile } = require('./fileStore');
const { getDb } = require('./db');
const { runRiskEngine } = require('./riskEngineStub');
const logger = require('./logger');

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
function uploadHandler(req, res) {
  // Reject non-multipart requests early
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('multipart/form-data')) {
    sendJson(res, 400, { error: 'Request must be multipart/form-data.' });
    return;
  }

  let fileName = '';
  let mimeType = '';
  const chunks = [];
  let fileReceived = false;

  const bb = Busboy({ headers: req.headers });

  bb.on('file', (fieldname, fileStream, info) => {
    fileReceived = true;
    fileName = info.filename || '';
    mimeType = info.mimeType || '';

    logger.info('upload_received', {
      file_name: fileName,
      mime_type: mimeType,
      extension: fileName.includes('.') ? '.' + fileName.split('.').pop().toLowerCase() : '',
    });

    fileStream.on('data', (chunk) => chunks.push(chunk));
    fileStream.on('error', () => {
      sendJson(res, 500, { error: 'Failed to read uploaded file.' });
    });
  });

  bb.on('finish', () => {
    if (!fileReceived || !fileName) {
      sendJson(res, 400, { error: 'No file was included in the request.' });
      return;
    }

    // Step 1: validate file type
    const validation = validateFileType(fileName, mimeType);
    if (!validation.valid) {
      logger.warn('upload_rejected_invalid_type', {
        file_name: fileName,
        mime_type: mimeType,
        reason: validation.reason,
      });
      sendJson(res, 422, { error: validation.reason });
      return;
    }

    const fileBuffer = Buffer.concat(chunks);
    const contractId = randomUUID();

    // Step 2: write file to File Store
    let filePath;
    try {
      filePath = saveFile(contractId, fileName, fileBuffer);
      logger.info('file_saved', { contract_id: contractId, file_path: filePath });
    } catch (err) {
      logger.error('file_write_failed', {
        contract_id: contractId,
        error_type: 'FILE_WRITE_FAILURE',
      });
      sendJson(res, 500, { error: 'Upload failed. Please try again.' });
      return;
    }

    // Step 3: create contract record in database
    const uploadedAt = new Date().toISOString();
    try {
      const db = getDb();
      db.prepare(
        'INSERT INTO contracts (id, file_name, uploaded_at, status, file_path) VALUES (?, ?, ?, ?, ?)'
      ).run(contractId, fileName, uploadedAt, 'Pending', filePath);

      logger.info('contract_created', {
        contract_id: contractId,
        file_name: fileName,
        uploaded_at: uploadedAt,
      });
    } catch (err) {
      logger.error('db_write_failed', {
        contract_id: contractId,
        operation: 'INSERT contracts',
        error_type: 'DB_WRITE_FAILURE',
      });
      // Attempt orphan file cleanup (plan LLD-04)
      removeFile(filePath);
      sendJson(res, 500, { error: 'Upload failed. Please try again.' });
      return;
    }

    // Step 4: invoke Risk Engine stub (non-blocking — do not await)
    setImmediate(() => runRiskEngine(contractId));

    // Step 5: return contract record (file_path excluded — internal detail)
    sendJson(res, 201, {
      id: contractId,
      file_name: fileName,
      uploaded_at: uploadedAt,
      status: 'Pending',
    });
  });

  bb.on('error', () => {
    sendJson(res, 400, { error: 'Failed to parse upload request.' });
  });

  req.pipe(bb);
}

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

module.exports = { uploadHandler };
