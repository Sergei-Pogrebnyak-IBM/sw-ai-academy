/**
 * validateFileType.js — backend file type validation (BE-04)
 *
 * Checks both MIME type and file extension (design §10.1, plan LLD-01).
 * Both must pass — either failing alone is sufficient to reject the file.
 *
 * Rationale: browsers may report incorrect MIME types; dual checking reduces
 * the risk of a mislabelled file bypassing validation.
 *
 * Returns { valid: true } or { valid: false, reason: string }.
 * The reason string is human-readable and contains no internal system detail.
 */

// Each entry maps an extension to its expected MIME type.
// Both the extension AND the MIME must be present and consistent.
const ALLOWED_TYPES = new Map([
  ['.pdf',  'application/pdf'],
  ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
]);

/**
 * @param {string} fileName  — original file name including extension
 * @param {string} mimeType  — MIME type reported by the client
 * @returns {{ valid: boolean, reason?: string }}
 */
function validateFileType(fileName, mimeType) {
  const ext = fileName.includes('.')
    ? '.' + fileName.split('.').pop().toLowerCase()
    : '';

  const expectedMime = ALLOWED_TYPES.get(ext);

  // Extension must be known AND MIME must match the expected value for that extension.
  // This catches: unknown extensions, incorrect MIMEs, and mismatched extension+MIME pairs.
  if (!expectedMime || expectedMime !== mimeType) {
    return {
      valid: false,
      reason: 'Unsupported file type. Only PDF and DOCX files are accepted.',
    };
  }

  return { valid: true };
}

module.exports = { validateFileType };
