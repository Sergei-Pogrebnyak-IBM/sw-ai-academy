# Unit Test Scenarios: File Upload Validation

**Version:** 0.1  
**Status:** Draft  
**Scope:** Backend file type validation only (BE-04 validation function)  
**Source specs:** `feature-spec.md`, `tasks.md`  
**Out of scope:** Full upload-to-queue integration, SQLite persistence, UI, report generation, finding review, authentication, real document parsing

---

## Traceability

| Acceptance criterion | Source |
|---|---|
| Only PDF and DOCX are accepted; any other file type must produce a visible error | feature-spec.md §4 FR-01 |
| MIME type must be `application/pdf` or `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | tasks.md BE-04 |
| File extension must be `.pdf` or `.docx` (case-insensitive) | tasks.md BE-04 |
| Both checks must pass; either failing alone is sufficient to reject | tasks.md BE-04 |
| Rejection reason must be human-readable; no internal paths, stack traces, or system detail | tasks.md BE-04, design §11.4 |
| Validation must run before any file write or database record creation | tasks.md BE-04 |

No file size limit is defined in `feature-spec.md` or `tasks.md`; file size scenarios are excluded.

---

## Scenarios

---

### UTS-01 — Valid PDF file is accepted

| Field | Value |
|---|---|
| **Scenario ID** | UTS-01 |
| **Type** | Positive |
| **Source AC** | FR-01: "Only PDF and DOCX are accepted"; BE-04 completion criteria: "Valid PDF files (correct name and MIME) pass validation" |
| **Input** | `fileName: "contract.pdf"`, `mimeType: "application/pdf"` |
| **Expected result** | Validation passes; function returns a pass result (no rejection reason) |

---

### UTS-02 — Valid DOCX file is accepted

| Field | Value |
|---|---|
| **Scenario ID** | UTS-02 |
| **Type** | Positive |
| **Source AC** | FR-01: "Only PDF and DOCX are accepted"; BE-04 completion criteria: "Valid DOCX files (correct name and MIME) pass validation" |
| **Input** | `fileName: "contract.docx"`, `mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"` |
| **Expected result** | Validation passes; function returns a pass result (no rejection reason) |

---

### UTS-03 — Unsupported extension `.txt` is rejected

| Field | Value |
|---|---|
| **Scenario ID** | UTS-03 |
| **Type** | Negative |
| **Source AC** | FR-01: "any other file type must produce a visible error"; BE-04 completion criteria: "A `.txt` file is rejected regardless of MIME type reported" |
| **Input** | `fileName: "notes.txt"`, `mimeType: "text/plain"` |
| **Expected result** | Validation fails; function returns a human-readable rejection reason; reason contains no file paths, stack traces, or system detail |

---

### UTS-04 — Unsupported extension `.png` is rejected

| Field | Value |
|---|---|
| **Scenario ID** | UTS-04 |
| **Type** | Negative |
| **Source AC** | FR-01 AC: "e.g., `.txt`, `.png`"; BE-04: "any other extension … is sufficient to reject" |
| **Input** | `fileName: "scan.png"`, `mimeType: "image/png"` |
| **Expected result** | Validation fails; function returns a human-readable rejection reason; reason contains no file paths, stack traces, or system detail |

---

### UTS-05 — Extension `.pdf` with mismatched MIME type is rejected

| Field | Value |
|---|---|
| **Scenario ID** | UTS-05 |
| **Type** | Negative |
| **Source AC** | BE-04 completion criteria: "A file with extension `.pdf` but MIME type `text/plain` is rejected (mismatched extension + MIME)" |
| **Input** | `fileName: "contract.pdf"`, `mimeType: "text/plain"` |
| **Expected result** | Validation fails; function returns a human-readable rejection reason |

**Rationale:** Both extension and MIME type must pass. Correct extension alone is not sufficient.

---

### UTS-06 — Correct MIME type with unsupported extension `.doc` is rejected

| Field | Value |
|---|---|
| **Scenario ID** | UTS-06 |
| **Type** | Negative |
| **Source AC** | BE-04 completion criteria: "A file with correct MIME type but extension `.doc` (old Word format) is rejected" |
| **Input** | `fileName: "contract.doc"`, `mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"` |
| **Expected result** | Validation fails; function returns a human-readable rejection reason |

**Rationale:** Correct MIME type alone is not sufficient; extension must also match.

---

### UTS-07 — PDF extension check is case-insensitive

| Field | Value |
|---|---|
| **Scenario ID** | UTS-07 |
| **Type** | Boundary |
| **Source AC** | BE-04: "case-insensitive check"; FE-02 completion criteria: "`.PDF` and `.DOCX` are accepted" (same rule reflected in backend task) |
| **Input** | `fileName: "CONTRACT.PDF"`, `mimeType: "application/pdf"` |
| **Expected result** | Validation passes; function returns a pass result |

---

### UTS-08 — DOCX extension check is case-insensitive

| Field | Value |
|---|---|
| **Scenario ID** | UTS-08 |
| **Type** | Boundary |
| **Source AC** | BE-04: "case-insensitive check" |
| **Input** | `fileName: "CONTRACT.DOCX"`, `mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"` |
| **Expected result** | Validation passes; function returns a pass result |

---

### UTS-09 — Rejection reason is human-readable and free of internal detail

| Field | Value |
|---|---|
| **Scenario ID** | UTS-09 |
| **Type** | Negative |
| **Source AC** | BE-04: "return a descriptive rejection reason … human-readable … must not include internal file paths, stack traces, or system detail"; design §11.4 |
| **Input** | Any rejected file (e.g., `fileName: "notes.txt"`, `mimeType: "text/plain"`) |
| **Expected result** | Rejection reason is a non-empty string; does not contain a file system path separator (`/` or `\`), the word "stack", or exception/error class names |

**Note:** This scenario can be asserted alongside UTS-03 through UTS-06 rather than as a standalone test run; it is listed separately to make the content requirement explicit.

---

## Summary

| ID | Description | Type |
|---|---|---|
| UTS-01 | Valid PDF (correct extension + MIME) is accepted | Positive |
| UTS-02 | Valid DOCX (correct extension + MIME) is accepted | Positive |
| UTS-03 | `.txt` file rejected (invalid extension + MIME) | Negative |
| UTS-04 | `.png` file rejected (invalid extension + MIME) | Negative |
| UTS-05 | `.pdf` extension with `text/plain` MIME rejected (MIME mismatch) | Negative |
| UTS-06 | `.doc` extension with DOCX MIME rejected (extension mismatch) | Negative |
| UTS-07 | `.PDF` uppercase extension is accepted (case-insensitive) | Boundary |
| UTS-08 | `.DOCX` uppercase extension is accepted (case-insensitive) | Boundary |
| UTS-09 | Rejection reason is human-readable, contains no internal detail | Negative |
