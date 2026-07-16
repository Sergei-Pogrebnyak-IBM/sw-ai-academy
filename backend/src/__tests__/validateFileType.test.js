'use strict';

/**
 * Unit tests for validateFileType (BE-04)
 *
 * Scenarios: UTS-01 through UTS-09
 * Source: delivery/specs/contract-risk-assessment/unit-test-scenarios.md
 *
 * Framework: node:test + node:assert (built-in, no extra dependency required)
 * Run: npm test  (from the backend/ directory)
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validateFileType } = require('../validateFileType');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PDF_MIME  = 'application/pdf';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Assert that the rejection reason contains no internal system detail.
 * Source: UTS-09 / BE-04 completion criteria / design §11.4
 */
function assertReasonIsSafe(reason) {
  assert.ok(reason.length > 0, 'Rejection reason must not be empty');
  assert.ok(!/[/\\]/.test(reason),  'Rejection reason must not contain file path separators');
  assert.ok(!/stack/i.test(reason), 'Rejection reason must not contain the word "stack"');
  assert.ok(!/Error:/i.test(reason), 'Rejection reason must not contain exception class names');
}

// ---------------------------------------------------------------------------
// Positive tests
// ---------------------------------------------------------------------------

describe('validateFileType — positive (valid files accepted)', () => {

  it('UTS-01 — valid PDF (correct extension + MIME) returns valid:true', () => {
    const result = validateFileType('contract.pdf', PDF_MIME);

    assert.equal(result.valid, true);
    assert.equal(result.reason, undefined, 'No rejection reason should be present on a passing result');
  });

  it('UTS-02 — valid DOCX (correct extension + MIME) returns valid:true', () => {
    const result = validateFileType('contract.docx', DOCX_MIME);

    assert.equal(result.valid, true);
    assert.equal(result.reason, undefined, 'No rejection reason should be present on a passing result');
  });

});

// ---------------------------------------------------------------------------
// Negative tests
// ---------------------------------------------------------------------------

describe('validateFileType — negative (invalid files rejected)', () => {

  it('UTS-03 — .txt file is rejected regardless of matching MIME', () => {
    const result = validateFileType('notes.txt', 'text/plain');

    assert.equal(result.valid, false);
    assert.ok(typeof result.reason === 'string', 'Rejection reason must be a string');
    assertReasonIsSafe(result.reason);
  });

  it('UTS-04 — .png file is rejected', () => {
    const result = validateFileType('scan.png', 'image/png');

    assert.equal(result.valid, false);
    assert.ok(typeof result.reason === 'string', 'Rejection reason must be a string');
    assertReasonIsSafe(result.reason);
  });

  it('UTS-05 — .pdf extension with mismatched MIME (text/plain) is rejected', () => {
    // Correct extension alone must not be sufficient — MIME must also match.
    const result = validateFileType('contract.pdf', 'text/plain');

    assert.equal(result.valid, false);
    assert.ok(typeof result.reason === 'string', 'Rejection reason must be a string');
    assertReasonIsSafe(result.reason);
  });

  it('UTS-06 — .doc extension with DOCX MIME is rejected (old Word format)', () => {
    // Correct MIME alone must not be sufficient — extension must also match.
    const result = validateFileType('contract.doc', DOCX_MIME);

    assert.equal(result.valid, false);
    assert.ok(typeof result.reason === 'string', 'Rejection reason must be a string');
    assertReasonIsSafe(result.reason);
  });

});

// ---------------------------------------------------------------------------
// Boundary tests — case-insensitivity
// ---------------------------------------------------------------------------

describe('validateFileType — boundary (case-insensitive extension check)', () => {

  it('UTS-07 — .PDF (uppercase) is accepted', () => {
    const result = validateFileType('CONTRACT.PDF', PDF_MIME);

    assert.equal(result.valid, true);
    assert.equal(result.reason, undefined);
  });

  it('UTS-08 — .DOCX (uppercase) is accepted', () => {
    const result = validateFileType('CONTRACT.DOCX', DOCX_MIME);

    assert.equal(result.valid, true);
    assert.equal(result.reason, undefined);
  });

});

// ---------------------------------------------------------------------------
// UTS-09 — rejection reason content is safe across all rejection paths
// ---------------------------------------------------------------------------

describe('validateFileType — UTS-09 rejection reason contains no internal detail', () => {

  const rejectionCases = [
    { desc: '.txt + text/plain',          fileName: 'notes.txt',    mimeType: 'text/plain'  },
    { desc: '.png + image/png',            fileName: 'scan.png',     mimeType: 'image/png'   },
    { desc: '.pdf + text/plain (mismatch)',fileName: 'contract.pdf', mimeType: 'text/plain'  },
    { desc: '.doc + DOCX MIME (mismatch)', fileName: 'contract.doc', mimeType: DOCX_MIME     },
  ];

  for (const { desc, fileName, mimeType } of rejectionCases) {
    it(`reason is safe for: ${desc}`, () => {
      const result = validateFileType(fileName, mimeType);

      assert.equal(result.valid, false);
      assertReasonIsSafe(result.reason);
    });
  }

});
