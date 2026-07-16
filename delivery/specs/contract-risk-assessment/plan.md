# Implementation Plan: Contract Risk Assessment Tool

**Version:** 0.1
**Status:** Draft
**Source Spec:** `delivery/specs/contract-risk-assessment/feature-spec.md`
**Source Architecture:** `delivery/specs/contract-risk-assessment/architecture.md`
**Source Design:** `delivery/specs/contract-risk-assessment/design.md`

---

## 1. Summary

This plan describes what to build, how the pieces fit together, and the decisions that constrain the implementation. It is intended to give a development team enough shared understanding to begin building without ambiguity about scope, component responsibilities, or expected behaviour.

The system is a single-user, single-tenant web application. A user uploads a contract in PDF or DOCX format. The backend stores the file, creates a contract record, and asynchronously invokes a simulated risk engine that produces a structured risk report. The frontend polls for status changes and presents the queue and report to the user. Review decisions and comments are in-session only and never reach the backend.

**Stack:** React · Node.js · SQLite · local file store  
**Deployment:** Local or simple cloud; single startup command; no external dependencies  
**MVP scope:** Demo-ready; single user; simulated analysis only

---

## 2. Technical Context

| Dimension | Detail |
|---|---|
| Frontend | React single-page application served by the backend or a separate dev server |
| Backend | Node.js HTTP server; handles uploads, serves queue and report data, and coordinates the Risk Engine |
| Risk Engine | Internal Node.js module within the backend process; not a separate service (architecture AD-05) |
| Database | SQLite embedded database; no separate server process required (architecture AD-01) |
| File store | A designated `uploads/` directory within the application folder; not served to the browser |
| Authentication | None — single user, no login (spec §3 out of scope) |
| External dependencies | None |
| Session state | Review decisions and finding comments are React component state only; never persisted (architecture AD-04, spec A-02) |

---

## 3. Components and Boundaries

### 3.1 Frontend (React)

**What it owns:**
- Upload form: file picker, client-side type validation, error display, submit control (FR-01)
- Contract queue view: list of contracts newest-first, showing file name, upload timestamp, processing status, and the open-report control (FR-02, FR-03, FR-04)
- Report view: overall risk level, summary, ranked findings list with severity labels, section references, and high-risk visual distinction (FR-05 through FR-08)
- Per-finding review controls: review status selector (Accepted / Overridden / Reviewed) and free-text comment field, both held in component state (FR-09, FR-10)
- Polling loop: requests contract status at a short interval (≤2 s) and updates the queue display when status changes (NFR-02, NFR-03)

**What it does not own:**
- Business logic, risk rules, or status transitions
- Persistence of any kind beyond the current browser session
- Any communication with the Risk Engine directly

**Boundary:** All server communication is over HTTP to the Backend API only.

---

### 3.2 Backend API (Node.js)

**What it owns:**
- File upload endpoint: receives multipart form data, validates file type (MIME type and extension), writes file to File Store, creates contract record in Database with status `Pending`, invokes Risk Engine asynchronously, returns the new contract record (FR-01, FR-02, architecture AD-06)
- Queue endpoint: returns all contract records ordered by upload timestamp descending (FR-02, FR-03, spec A-03)
- Status endpoint (or included in queue): returns current processing status for one or all contracts; consumed by the frontend polling loop (FR-03, NFR-02)
- Report endpoint: returns the full report (risk level, summary, findings ordered by display order) for a given contract once status is `Complete` (FR-04 through FR-07)
- Error responses: human-readable reasons for file type rejection; generic messages for all other failures; no stack traces or internal paths in any response (design §11.4)
- Logging: structured JSON for all significant events (design §13.1)

**What it does not own:**
- Risk logic — fully delegated to the Risk Engine
- Review decisions or comments — never stored
- Access control

**Boundary:** Sole writer to the Database and File Store. The Risk Engine is called in-process.

---

### 3.3 Risk Engine (Node.js backend module)

**What it owns:**
- Server-side delay of 2–6 seconds, randomised, non-blocking (NFR-02, design §12.4)
- Application of the predefined mock rule set to generate findings (design §12.1, §12.2)
- Derivation of overall risk level using Option A: highest-severity finding in the report (design §12.3 — pending Product Owner confirmation)
- Generation of a plain-language summary for the report (FR-05)
- Writing the complete report (risk level, summary, findings) to the Database (design §8.2, §8.3)
- Updating the contract status from `Pending` to `Complete` in the Database (design §9)
- On unexpected error: logging with contract ID; leaving contract in `Pending`; not writing a partial report (design §11.2)
- Logging: structured JSON for processing start, completion, and failure (design §13.2)

**What it does not own:**
- File content reading — the uploaded file is never opened or parsed (spec A-01)
- A network interface of its own — invoked in-process by the Backend API

**Boundary:** Internal module. Invoked once per contract upload, runs asynchronously, writes exclusively to the Database.

---

### 3.4 Database (SQLite)

**What it stores:**
- Contract records: identifier, file name, upload timestamp, processing status, file path reference (design §8.1)
- Report records: identifier, contract reference, overall risk level, summary (design §8.2)
- Finding records: identifier, report reference, severity, explanation, section reference, display order (design §8.3)

**What it does not store:**
- File binary content (in File Store)
- Review decisions or comments (in-session only)

**Boundary:** Embedded in the backend process. No network port, no separate server.

---

### 3.5 File Store (local `uploads/` directory)

**What it stores:**
- The raw PDF or DOCX file as received, named or referenced via the contract record (design §8.1 file path reference)

**What it does not do:**
- Serve files to the browser
- Provide any interface beyond filesystem read/write

**Boundary:** Written by the Backend API once on upload. Never read by the Risk Engine.

---

## 4. Interfaces and Integrations

The only interface boundary in this system is the HTTP layer between the Frontend and the Backend API.

### 4.1 Frontend → Backend API (HTTP)

The following operations cross this boundary. This is not a full API specification — endpoints, methods, and response shapes are for the implementation team to define.

| Operation | Direction | Trigger | Key data carried |
|---|---|---|---|
| Upload contract | Frontend → Backend | User submits file | Multipart file (PDF/DOCX), file name |
| Fetch queue | Frontend → Backend | On page load; on interval (polling) | — (returns all contracts) |
| Fetch report | Frontend → Backend | User opens a Complete contract | Contract identifier |

**Error responses** must include a human-readable message and must not include internal system detail (design §11.4).

### 4.2 Backend API → Risk Engine (in-process)

Not an HTTP interface. The Backend API invokes the Risk Engine as a function call after a successful upload, passing the contract identifier. The call is non-blocking — the backend responds to the frontend before the engine completes.

### 4.3 Backend API ↔ Database (embedded)

Direct read/write via SQLite client library. No network interface.

### 4.4 Backend API → File Store (filesystem)

Direct file system write on upload. No read path exists in the current design.

---

## 5. Data Model Summary

Three persisted entities. Full field-level detail is in design §8.

```
Contract ──────────────── Report ──────────────── Finding (1..n)
  identifier                identifier               identifier
  file name                 contract reference       report reference
  upload timestamp          overall risk level       severity
  processing status         summary                  explanation
  file path reference                                section reference
                                                     display order
```

**Status values on Contract:** `Pending` (initial) → `Complete` (terminal)  
**Severity values on Finding and Report risk level:** `High` · `Medium` · `Low`  
**Review status and comments:** Frontend component state only — not in the data model

---

## 6. Key Decisions and Rationale

| ID | Decision | Rationale | Source |
|---|---|---|---|
| AD-01 | SQLite as database | No separate server process; single startup command; sufficient for single-user MVP | architecture §7 |
| AD-02 | Processing delay is server-side (inside Risk Engine) | Makes `Pending → Complete` a real database state change observable by polling; not a UI illusion | architecture §7, design §9 |
| AD-03 | Frontend polls for status (≤2 s interval) | Simplest mechanism for auto-update without WebSocket or SSE infrastructure; polling interval must be ≤2 s to keep total render time within the 8 s budget (NFR-03) | architecture §7, design §6 |
| AD-04 | Review decisions and comments in component state only | Spec A-02 explicitly scopes these as in-session; no backend endpoint or database table required | architecture §7, spec A-02 |
| AD-05 | Risk Engine is an internal module, not a separate service | Avoids inter-service complexity for MVP; engine is called in-process | architecture §7 |
| AD-06 | File type validated at both frontend and backend | Frontend provides immediate user feedback; backend is the authoritative gate — cannot be bypassed by a direct HTTP request | architecture §7, design §10 |
| LLD-01 | File type check uses both MIME type and file extension | Browsers may report incorrect MIME types; dual check reduces the risk of a mislabelled file passing validation | design §10.1 |
| LLD-02 | No `Failed` status in MVP | The demo path does not exercise error recovery; a stuck `Pending` is the observable indicator; simplifies the status model | design §9 |
| LLD-03 | Risk Engine error leaves contract in `Pending` (no partial report) | Ensures database consistency; a partial report would be worse than no report | design §11.2 |
| LLD-04 | Backend attempts to remove orphaned file if database write fails post-upload | Keeps File Store consistent with Database; prevents accumulation of files with no contract record | design §11.1 |
| LLD-05 | Overall risk level = highest-severity finding (Option A) | Simplest rule; sufficient for demo; pending Product Owner confirmation (spec OQ-03) | design §12.3 |
| LLD-06 | Findings ordering: High → Medium → Low, then by rule definition order within severity | Satisfies FR-06; consistent and predictable for demo | design §12.5 |

---

## 7. Risks and Assumptions

### 7.1 Unresolved decisions (blockers before development begins)

| # | Item | Risk if unresolved | Owner |
|---|---|---|---|
| R-01 | Mock risk rules (OQ-01): which clause types and exact wording | Without a confirmed rule set, the Risk Engine cannot be implemented; demo quality depends on plausible findings | `[Product Owner]` |
| R-02 | Overall risk level derivation (OQ-03): Option A (highest finding) is the working default | If the Product Owner selects Option B (weighted count), the Risk Engine logic changes before it is built; changing it after is low-cost but adds rework | `[Product Owner]` |

### 7.2 Design assumptions

| # | Assumption | Impact if wrong |
|---|---|---|
| A-01 | Risk analysis is fully simulated; the uploaded file is never read | If real parsing is needed later, the Risk Engine boundary must be redesigned; no impact on MVP |
| A-02 | Review decisions and comments are in-session only | If persistence is required later, a new database table and backend endpoint are needed; no impact on MVP |
| A-03 | Queue is a flat chronological list; no filtering or sorting required | If filtering is requested before launch, the queue endpoint and frontend need extending |
| A-04 | Single user; no concurrent access | If multiple users are added, SQLite write contention and session isolation become concerns |
| A-05 | Uploaded files are never deleted | Files accumulate across demo sessions; a manual reset step or restart is needed between demos (architecture HR-04) |
| A-06 | Polling interval of ≤2 s is acceptable for demo use | If polling causes noticeable load in the demo environment, the interval may need tuning without violating the 8 s render budget |

### 7.3 Out-of-scope items that could be requested late

The following are explicitly out of scope for MVP. Each would require non-trivial changes if introduced:

| Item | Effort to add later |
|---|---|
| Persistence of review decisions / comments | New DB table, new backend endpoint, frontend refactor |
| Authentication / RBAC | New auth layer, session management, all endpoints gated |
| Real document parsing | Replace the Risk Engine boundary; introduces external dependencies |
| Queue filtering or sorting | Backend query changes; frontend filter controls |
| Export or share reports | New backend capability; no current output format defined |
