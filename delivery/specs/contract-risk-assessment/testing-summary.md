# Testing Summary: File Upload Validation

**Version:** 0.1  
**Status:** Draft  
**Scope:** Backend file type validation — `src/validateFileType.js` (BE-04)  
**Build slice:** Upload contract → save locally → create SQLite queue record → return processing status  
**Source specs:** `feature-spec.md`, `tasks.md`, `unit-test-scenarios.md`

---

## 1. Behavior tested

The unit tests exercise the `validateFileType(fileName, mimeType)` function in
[`backend/src/validateFileType.js`](../../../backend/src/validateFileType.js).

This function is the sole implementation of BE-04 (backend file type validation). It:

- Extracts the file extension from the supplied file name and lower-cases it.
- Looks the extension up in an allowlist that maps each accepted extension to its required MIME type.
- Rejects the file if the extension is unknown **or** if the MIME type does not match the expected value for that extension (both checks must pass independently).
- Returns `{ valid: true }` on acceptance, or `{ valid: false, reason: string }` on rejection, where `reason` is a human-readable message containing no internal system detail.

---

## 2. Acceptance criteria covered

| AC | Source | Covered |
|---|---|---|
| Only PDF and DOCX files are accepted; any other type must be rejected | `feature-spec.md` §4 FR-01 | ✅ UTS-01, UTS-02, UTS-03, UTS-04 |
| MIME type must be `application/pdf` or `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | `tasks.md` BE-04 | ✅ UTS-01, UTS-02, UTS-05 |
| File extension must be `.pdf` or `.docx` (case-insensitive) | `tasks.md` BE-04 | ✅ UTS-07, UTS-08 |
| Both checks must pass; either check failing alone is sufficient to reject | `tasks.md` BE-04 | ✅ UTS-05 (good ext, bad MIME), UTS-06 (bad ext, good MIME) |
| Rejection reason must be human-readable; no paths, stack traces, or system detail | `tasks.md` BE-04, design §11.4 | ✅ UTS-09 (asserted on all rejection paths) |

---

## 3. Unit test scenarios covered

| ID | Description | Type | Result |
|---|---|---|---|
| UTS-01 | Valid PDF (correct extension + MIME) is accepted | Positive | ✅ Pass |
| UTS-02 | Valid DOCX (correct extension + MIME) is accepted | Positive | ✅ Pass |
| UTS-03 | `.txt` file is rejected (both checks fail) | Negative | ✅ Pass |
| UTS-04 | `.png` file is rejected (both checks fail) | Negative | ✅ Pass |
| UTS-05 | `.pdf` extension with `text/plain` MIME rejected (MIME mismatch) | Negative | ✅ Pass |
| UTS-06 | `.doc` extension with DOCX MIME rejected (extension mismatch) | Negative | ✅ Pass |
| UTS-07 | `.PDF` uppercase extension is accepted (case-insensitive) | Boundary | ✅ Pass |
| UTS-08 | `.DOCX` uppercase extension is accepted (case-insensitive) | Boundary | ✅ Pass |
| UTS-09 | Rejection reason is safe across all 4 rejection paths | Negative | ✅ Pass |

**Total: 12 test cases, 4 suites, 0 failures.**

Test file: [`backend/src/__tests__/validateFileType.test.js`](../../../backend/src/__tests__/validateFileType.test.js)

---

## 4. Code coverage

Run with `node --test --experimental-test-coverage` against `src/validateFileType.js`.

```
---------------------------------------------------------------------
file                 | line % | branch % | funcs % | uncovered lines
---------------------------------------------------------------------
src
 validateFileType.js | 100.00 |    83.33 |  100.00 |
---------------------------------------------------------------------
all files            | 100.00 |    83.33 |  100.00 |
---------------------------------------------------------------------
```

### Branch gap — 83.33%

The uncovered branch is the `false` arm of the ternary on line 27:

```js
const ext = fileName.includes('.')
  ? '.' + fileName.split('.').pop().toLowerCase()
  : '';   // ← this path is not exercised
```

This path is reached only when a file name contains **no dot at all** (e.g. `"contractfile"`).

**Why it is not covered:** No scenario for an extension-free file name appears in `unit-test-scenarios.md`, and `tasks.md` BE-04 defines valid and invalid inputs exclusively in terms of named extensions (`.pdf`, `.docx`, `.doc`, `.txt`). The no-extension case is an implicit rejection not called out in the spec's acceptance criteria.

**Impact:** The branch still results in a rejection (the empty string `''` is not in `ALLOWED_TYPES`, so the function correctly returns `{ valid: false, reason: ... }`). The gap is a missing test, not a missing behaviour.

---

## 5. What is intentionally not covered in this lab

The following are excluded per the task rules and the build slice scope:

| Area | Reason for exclusion |
|---|---|
| Full upload-to-queue integration (BE-05) | Out of scope for this testing lab; requires HTTP, file system, and database |
| SQLite persistence (BE-02) | Out of scope; no database interactions are tested |
| Frontend file type validation (FE-02) | Out of scope; UI and browser behaviour are not tested here |
| Client-side error message display | Out of scope; no UI tests |
| Report generation (FR-04 – FR-08) | Out of scope; not part of the upload validation slice |
| Finding review (FR-09, FR-10) | Out of scope |
| Authentication and RBAC | Out of scope (also out of scope for the feature MVP) |
| Real document parsing | Out of scope (also out of scope for the feature MVP) |
| Status polling and queue endpoint (BE-06) | Out of scope for this testing lab |
| File size limits | Not defined in `feature-spec.md` or `tasks.md`; no threshold exists to test against |

---

## 6. Recommendations for next testing steps

**Immediate — close the known coverage gap**

Add one scenario to `unit-test-scenarios.md` and one test case:

- Input: a file name with no extension (e.g. `"contractfile"`), any MIME type.
- Expected: rejected; reason is human-readable. This brings branch coverage to 100%.

**Next slice — integration tests for BE-05 (upload handler)**

When the upload handler is ready to test in isolation, add integration-level tests (using `node:test` + a lightweight HTTP client such as `undici`, which ships with Node 18+) for:

- Valid PDF upload → file written to `uploads/`, contract record created in SQLite with status `Pending`, correct fields returned in response.
- Invalid file type → no file written, no database record created, human-readable error returned.
- File store write failure (make `uploads/` read-only) → generic error returned, no database record created.
- Database write failure after file save → orphaned file removed from `uploads/`.

These map directly to the BE-05 completion criteria in `tasks.md` and are blocked until BE-02, BE-03, and BE-04 are wired together in the handler.

**Frontend validation (FE-02)**

Client-side extension checks can be unit-tested with a React testing library (e.g. React Testing Library + `node:test` or Vitest) once the frontend bootstrap (FE-01) is complete. Key scenarios mirror UTS-03, UTS-04, UTS-07, UTS-08 — verify inline error display and that no network request is issued on rejection.
