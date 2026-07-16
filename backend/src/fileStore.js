/**
 * fileStore.js — local file store initialisation and write (BE-03)
 *
 * Manages the uploads/ directory.
 * Files are written once on upload and never read back (design HLD §5.1).
 * The directory is never served to the browser.
 */

const fs = require('node:fs');
const path = require('node:path');
const logger = require('./logger');

const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';

/**
 * Ensure the upload directory exists. Idempotent.
 */
function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
  logger.info('file_store_ready', { upload_dir: UPLOAD_DIR });
}

/**
 * Write a file buffer to the store.
 * Uses a server-generated name to avoid collisions; the original name is stored in the DB.
 *
 * @param {string} contractId  — the contract's UUID
 * @param {string} originalName — original file name (for extension preservation)
 * @param {Buffer} buffer      — file bytes
 * @returns {string}           — absolute path of the saved file
 */
function saveFile(contractId, originalName, buffer) {
  const ext = path.extname(originalName).toLowerCase();
  const storedName = `${contractId}${ext}`;
  const filePath = path.join(UPLOAD_DIR, storedName);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

/**
 * Attempt to remove a file. Used for orphan cleanup (design §11.1 / plan LLD-04).
 * Swallows errors — best-effort only.
 *
 * @param {string} filePath
 */
function removeFile(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // Best-effort; failure is not propagated
  }
}

module.exports = { ensureUploadDir, saveFile, removeFile };
