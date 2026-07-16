# Design: Contract Risk Assessment Tool

**Version:** 0.2
**Status:** Draft
**Source Spec:** `delivery/specs/contract-risk-assessment/feature-spec.md`
**Source Architecture:** `delivery/specs/contract-risk-assessment/architecture.md`

---

## HLD — High-Level Design

---

### 1. Overview

This section describes the high-level design for the end-to-end user flow:

**upload → queue → simulated processing → report viewing → finding review**

It traces each step to the feature spec and architecture, identifies which components are involved, and describes the data that moves between them. No API design, database schema, or implementation detail is included.

---

### 2. Main User Flow

The complete path a Sales / Legal Desk User takes through the system (spec §2):

```
┌──────────────────────────────────────────────────────────────────┐
│  1. Open app           → Contract queue is visible (empty or     │
│                           populated from prior uploads)          │
│                                                                  │
│  2. Select a file      → File picker opens; user picks PDF/DOCX  │
│                                                                  │
│  3. Submit upload      → File sent to backend                    │
│         │                                                        │
│         ├─ Invalid type → Error shown; queue unchanged           │
│         └─ Valid type  → Entry appears in queue (Pending)        │
│                                                                  │
│  4. Wait               → Status auto-updates to Complete         │
│                           (no page reload)                       │
│                                                                  │
│  5. Open report        → Risk report loads for selected contract │
│                                                                  │
│  6. Review report      → User reads overall risk level +         │
│                           summary, scans ranked findings         │
│                                                                  │
│  7. Annotate findings  → User marks each finding Accepted /      │
│                           Overridden / Reviewed and optionally   │
│                           adds a comment (in-session)            │
└──────────────────────────────────────────────────────────────────┘
```

---

### 3. Main System Flow

The sequence of system-level events for a single successful upload through to annotation:

```
User                  Frontend               Backend API          Risk Engine          Database / File Store
 │                       │                       │                    │                        │
 │── selects file ───────►│                       │                    │                        │
 │                        │── validate type ──────►(client-side gate)  │                        │
 │                        │   invalid: show error │                    │                        │
 │                        │                       │                    │                        │
 │                        │── POST file ──────────►│                    │                        │
 │                        │                        │── write file ──────────────────────────────►│ (File Store)
 │                        │                        │── create contract record (Pending) ─────────►│ (Database)
 │                        │                        │── invoke Risk Engine (async) ───────────────►│
 │                        │◄─ contract record ─────│                    │                        │
 │                        │                        │                    │── wait 2–6 s ──────────│
 │                        │── begin polling ───────►│                    │                        │
 │                        │◄─ status: Pending ──────│                    │── apply mock rules ────│
 │                        │   (queue shows Pending) │                    │── write report ─────────►│ (Database)
 │                        │                        │                    │── update status:Complete►│ (Database)
 │                        │── poll ────────────────►│                    │                        │
 │                        │◄─ status: Complete ─────│                    │                        │
 │                        │   (queue updates, no    │                    │                        │
 │                        │    page reload)         │                    │                        │
 │── clicks Open report ──►│                        │                    │                        │
 │                        │── request report ───────►│                    │                        │
 │                        │                        │── read report + findings ───────────────────►│ (Database)
 │                        │◄─ report data ──────────│                    │                        │
 │                        │   (render report)       │                    │                        │
 │── marks finding ───────►│                        │                    │                        │
 │   Accepted/Overridden/  │── update component     │                    │                        │
 │   Reviewed              │   state only           │                    │                        │
 │                        │   (no network call)     │                    │                        │
 │── adds comment ────────►│                        │                    │                        │
 │                        │── update component     │                    │                        │
 │                        │   state only           │                    │                        │
```

---

### 4. Component Interactions

This section maps each step in the user flow to the components involved and the nature of their interaction.

| Step | User action | Frontend | Backend API | Risk Engine | Database | File Store |
|---|---|---|---|---|---|---|
| **Upload — valid** | Submits PDF/DOCX | Validates type; sends file | Receives file; creates record; triggers engine | — | Writes contract record (Pending) | Writes file |
| **Upload — invalid** | Submits non-PDF/DOCX | Shows error; stops | — | — | — | — |
| **Queue display** | Views queue | Requests queue; renders entries | Reads and returns all contracts (newest first) | — | Read | — |
| **Status polling** | Waits | Polls at interval; updates entry on Complete | Returns current status per contract | — | Read | — |
| **Report open** | Clicks Open (Complete only) | Requests report; renders result | Reads report and findings | — | Read | — |
| **Finding review** | Selects status; adds comment | Updates component state | — | — | — | — |
| **Page refresh** | Reloads browser | Re-fetches queue and report data | Serves persisted data | — | Read | — |

**Interaction types used:**

- **HTTP (Frontend ↔ Backend API):** All data exchange between browser and server.
- **In-process call (Backend API → Risk Engine):** The engine is invoked as an internal module, not over the network (architecture AD-05).
- **Direct read/write (Backend API / Risk Engine ↔ Database):** The backend is the sole process that reads from and writes to SQLite.
- **File system write (Backend API → File Store):** Uploaded files are written once on receipt and never re-read by the system.
- **Component state (Frontend only):** Review decisions and comments never leave the browser (architecture AD-04).

---

### 5. Data Movement Across Components

The table below describes what data is created, moved, or transformed at each stage, and which component owns it.

#### 5.1 Upload

| Data | Source | Destination | Notes |
|---|---|---|---|
| Raw file bytes (PDF/DOCX) | User (browser) | File Store (via Backend API) | Written once; not read back by the system |
| File name, upload timestamp | Frontend | Backend API → Database | Stored as part of the contract record |
| Contract record (status: Pending) | Backend API | Database | Authoritative record; read by all queue and report requests |

#### 5.2 Simulated processing

| Data | Source | Destination | Notes |
|---|---|---|---|
| Contract ID | Backend API | Risk Engine | Identifies which record to update |
| Simulated delay | Risk Engine | (internal) | 2–6 s wait before generating output (NFR-02) |
| Overall risk level (High/Medium/Low) | Risk Engine | Database | Stored as part of the report record linked to the contract |
| Plain-language summary | Risk Engine | Database | Stored as part of the report record |
| Findings (severity, explanation, section reference) | Risk Engine | Database | One record per finding, linked to the report; ordered by severity (FR-06, FR-07) |
| Status update (Pending → Complete) | Risk Engine | Database | Triggers the queue status change visible to the user |

#### 5.3 Queue and status polling

| Data | Source | Destination | Notes |
|---|---|---|---|
| Contract list (name, timestamp, status) | Database | Backend API → Frontend | Full list, newest first (spec A-03) |
| Status field per contract | Database | Frontend (via polling) | Frontend reads this to update the queue entry without a reload (NFR-02, AD-03) |

#### 5.4 Report viewing

| Data | Source | Destination | Notes |
|---|---|---|---|
| Overall risk level + summary | Database | Backend API → Frontend | Displayed at top of report (FR-05) |
| Findings list (severity, explanation, section ref) | Database | Backend API → Frontend | Delivered pre-sorted by severity; frontend renders in order (FR-06, FR-07) |

#### 5.5 Finding review (in-session)

| Data | Source | Destination | Notes |
|---|---|---|---|
| Review status selection (Accepted/Overridden/Reviewed) | User | Frontend component state | Never sent to backend; lost on page refresh (FR-09, spec A-02) |
| Comment text | User | Frontend component state | Never sent to backend; lost on page refresh (FR-10, spec A-02) |

---

### 6. Traceability

Every step in the design is traced to the feature spec below.

| Design step | Spec requirement(s) | Architecture reference |
|---|---|---|
| File type validation at upload (frontend + backend) | FR-01; NFR-06 constraint in FR-01 Notes | AD-06 |
| Upload error shown, queue unchanged | FR-01 AC (invalid file) | AD-06 |
| Queue entry created immediately on upload | FR-02 | §4.2 Backend API |
| Queue shows file name, timestamp, status | FR-02 AC | §4.4 Database |
| Status auto-transitions Pending → Complete (2–6 s) | FR-03, NFR-02 | AD-02, AD-03 |
| Status update without page reload | FR-03, NFR-02 | AD-03 (polling) |
| Open report gated on Complete status | FR-04; FR-04 AC (Pending gate) | §4.1 Frontend |
| Overall risk level + summary at top of report | FR-05, FR-05 AC | §4.3 Risk Engine |
| Findings ranked by severity | FR-06, FR-06/FR-07 AC | §4.3 Risk Engine |
| Each finding: severity, explanation, section ref | FR-07 | §4.3 Risk Engine |
| High-risk findings visually distinct | FR-08, FR-08 AC | §4.1 Frontend |
| Review status per finding (in-session) | FR-09, FR-09 AC | AD-04 |
| Comment per finding (in-session) | FR-10, FR-10 AC | AD-04 |
| Files and reports persist across page refresh | NFR-01 | §4.4 Database, §4.5 File Store |
| Report fully rendered within 8 s | NFR-03 | §6 Cross-cutting (polling interval ≤2 s) |
| Single startup command, no external deps | NFR-04 | AD-01, AD-05 |

---

## LLD — Low-Level Design

---

### 7. Overview

This section describes the low-level design for the Contract Risk Assessment MVP. It covers the data model, status lifecycle, validation rules, error handling, simulated assessment behaviour, and logging requirements. All decisions are traceable to the feature spec and architecture. No code, database schema, or implementation tasks are included.

---

### 8. Data Model Overview

The system persists two logical entities: **Contract** and **Report**. A Report has a one-to-one relationship with a Contract. A Report contains one or more **Findings**.

#### 8.1 Contract

Represents a single uploaded file and its processing lifecycle.

| Field | Description | Constraints |
|---|---|---|
| Unique identifier | System-generated identifier for the contract | Required; immutable after creation |
| File name | Original name of the uploaded file as provided by the user | Required; stored as-is for display (FR-02) |
| Upload timestamp | Date and time the upload was received by the backend | Required; set at creation; used for queue ordering (spec A-03) |
| Processing status | Current lifecycle state of the contract | Required; one of the values defined in §9; transitions are one-way |
| File path reference | Location of the uploaded file in the File Store | Required; set at creation; used to confirm file was saved |

#### 8.2 Report

Created by the Risk Engine when processing completes. Linked to exactly one Contract.

| Field | Description | Constraints |
|---|---|---|
| Unique identifier | System-generated identifier for the report | Required; immutable |
| Contract reference | Links report to its parent contract | Required; one report per contract |
| Overall risk level | Aggregated risk level for the contract | Required; one of: High, Medium, Low (FR-05) |
| Summary | Short plain-language description of the overall risk | Required; human-readable text; no fixed length limit for MVP |

#### 8.3 Finding

Each Finding belongs to exactly one Report. A Report must contain at least one Finding.

| Field | Description | Constraints |
|---|---|---|
| Unique identifier | System-generated identifier for the finding | Required; immutable |
| Report reference | Links finding to its parent report | Required |
| Severity | Risk severity of this finding | Required; one of: High, Medium, Low (FR-07) |
| Explanation | Short plain-language description of the risk | Required; non-empty |
| Section reference | Simulated contract section this finding relates to | Required; a plausible section label (e.g., "Section 4.2 — Indemnification") (FR-07) |
| Display order | Integer used to sort findings highest severity first | Required; set by Risk Engine at generation time (FR-06) |

#### 8.4 In-session state (Frontend only — not persisted)

The following are held in React component state and never reach the backend (architecture AD-04, spec A-02).

| Field | Description |
|---|---|
| Review status per finding | One of: Accepted, Overridden, Reviewed — or unset. Scoped to the current browser session (FR-09) |
| Comment per finding | Free-text string entered by the user. Scoped to the current browser session (FR-10) |

---

### 9. Status Model

Processing status is the only lifecycle state in the system. It lives on the Contract record and transitions in one direction only.

```
  ┌─────────┐     Risk Engine completes     ┌──────────┐
  │ Pending │ ──────────────────────────── ► │ Complete │
  └─────────┘                               └──────────┘
       ▲
  Set at upload
```

| Status | Set by | Meaning | Observable effect |
|---|---|---|---|
| `Pending` | Backend API (at upload) | Contract has been received; risk analysis is in progress | Queue shows `Pending`; report link is disabled (FR-04 AC) |
| `Complete` | Risk Engine (after delay) | Risk analysis has finished; report is available | Queue shows `Complete`; report link is enabled (FR-04 AC) |

**Rules:**
- A contract is always created with status `Pending`.
- The only valid transition is `Pending → Complete`.
- There is no `Failed` status in MVP. If the Risk Engine encounters an unexpected condition, it logs the error and the contract remains in `Pending` indefinitely (see §11).
- Status is never set by the frontend.

---

### 10. Validation Rules

#### 10.1 File upload — Backend (authoritative gate, FR-01, architecture AD-06)

| Rule | Behaviour on violation |
|---|---|
| File must be present in the upload request | Reject with a descriptive error; no record created |
| File MIME type must be `application/pdf` or `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | Reject with a descriptive error; no record created |
| File extension must be `.pdf` or `.docx` (checked in addition to MIME type) | Reject with a descriptive error; no record created |

> MIME type and extension are both checked because browsers may report incorrect MIME types for certain files. Checking both reduces the risk of a mislabelled file bypassing validation.

#### 10.2 File upload — Frontend (user-experience gate, FR-01, architecture AD-06)

| Rule | Behaviour on violation |
|---|---|
| Selected file extension must be `.pdf` or `.docx` | Show a visible inline error message before the file is submitted; do not send the request to the backend |

> Frontend validation is a UX convenience only. The backend is the authoritative gate and must not be bypassed.

#### 10.3 Queue data

| Rule | Behaviour on violation |
|---|---|
| Contract identifier in a report or status request must correspond to an existing contract record | Backend returns an appropriate not-found response; frontend shows no report |

---

### 11. Error Handling Rules

All error handling follows the principle of fail-safe defaults: errors are logged server-side, generic messages are returned to the frontend, and system state is left consistent (no partial records).

#### 11.1 Upload errors

| Condition | Backend behaviour | Frontend behaviour |
|---|---|---|
| Invalid file type | Return error response with a human-readable reason | Display error message to user; leave queue unchanged (FR-01 AC) |
| File write to File Store fails | Log the error server-side; return a generic upload failure response; do not create a contract record | Display a generic upload failure message |
| Database write fails after file is saved | Log the error server-side; attempt to remove the orphaned file from File Store; return a generic failure response | Display a generic upload failure message |

#### 11.2 Risk Engine errors

| Condition | Risk Engine behaviour | Observable effect |
|---|---|---|
| Unexpected error during mock rule application | Log the error server-side with the contract ID | Contract remains in `Pending` status; no report is written; queue continues to show `Pending` |

> There is no automatic retry in MVP. A persistent `Pending` state is the observable indicator that something went wrong. No user-facing error message is shown for this case in MVP (the demo scenario does not exercise this path).

#### 11.3 Report request errors

| Condition | Backend behaviour | Frontend behaviour |
|---|---|---|
| Report requested for a contract that is still `Pending` | Return an appropriate not-found or not-ready response | The report link is disabled in the frontend so this should not occur; if it does, show a generic error |
| Report data missing or incomplete in the database | Log the error server-side; return a generic error response | Display a generic error message in the report view |

#### 11.4 General principles

- Error messages returned to the frontend must not include stack traces, file paths, database details, or any internal system information (security rule).
- All server-side errors are logged with sufficient context to diagnose the issue (contract ID, operation, error type) — but never including file content or user-supplied data beyond identifiers.

---

### 12. Simulated Assessment Rules

The Risk Engine applies a fixed set of mock risk rules to every contract, regardless of file content (spec A-01, architecture HR-01). The output is deterministic given the same rule set.

#### 12.1 Mock risk rule structure

Each predefined rule produces one Finding. A rule specifies:

| Field | Description |
|---|---|
| Rule name | Internal identifier for the rule (not shown to the user) |
| Severity | High, Medium, or Low |
| Explanation | The text displayed to the user as the finding explanation (FR-07) |
| Simulated section reference | The section label displayed to the user (e.g., "Section 3.1 — Limitation of Liability") (FR-07) |

#### 12.2 Minimum rule set for MVP

The following clause types must be covered by predefined rules (spec OQ-01 — to be confirmed by Product Owner before implementation). These are representative; the exact wording is an implementation detail.

| Severity | Clause type |
|---|---|
| High | Unlimited liability |
| High | Indemnification — broad or uncapped |
| Medium | Auto-renewal without notice period |
| Medium | IP assignment — broad or perpetual |
| Low | Governing law — non-standard jurisdiction |
| Low | Unilateral amendment right |

> **Note:** OQ-01 is still open. This rule set is a starting proposal. The Product Owner must confirm or adjust before development begins.

#### 12.3 Overall risk level derivation

The derivation rule is unresolved (spec OQ-03 / architecture HR-02). Two candidates:

| Option | Rule | Implication |
|---|---|---|
| **A — Highest finding** | Overall risk = severity of the highest-severity finding in the report | Simple; a single High finding always produces a High report |
| **B — Weighted count** | Overall risk = calculated from a weighted sum of finding severities | More nuanced; multiple Medium findings could produce a High report |

**Default for MVP (pending Product Owner confirmation):** Option A — highest finding. This is the simpler rule and sufficient for demo use.

#### 12.4 Processing delay

- The Risk Engine introduces a server-side delay of between 2 and 6 seconds before writing the report and updating the status (NFR-02, architecture AD-02).
- The delay is randomised within the 2–6 s range on each invocation to appear realistic.
- The delay must not block the backend from handling other requests (it runs asynchronously, architecture AD-05).

#### 12.5 Findings ordering

- Findings are stored with an explicit display order field (§8.3).
- Ordering: High severity findings first, then Medium, then Low.
- Within the same severity, order is determined by the order rules are defined in the rule set.
- The backend delivers findings pre-sorted; the frontend renders them in the order received (HLD §5.4).

---

### 13. Logging Rules

Logging follows structured JSON format. No sensitive data, file content, or internal system details are ever logged (security rule, architecture §6).

#### 13.1 Backend API — events to log

| Event | Level | Required context |
|---|---|---|
| File upload received | INFO | File name, detected MIME type, file extension |
| File type rejected | WARN | File name, detected MIME type, reason |
| Contract record created | INFO | Contract ID, file name, timestamp |
| File write to File Store succeeded | INFO | Contract ID, file path |
| File write to File Store failed | ERROR | Contract ID, error type (no stack trace to client) |
| Database write failed | ERROR | Contract ID, operation, error type |
| Queue request served | INFO | Number of contracts returned |
| Report request served | INFO | Contract ID |
| Report request — not found / not ready | WARN | Contract ID, reason |

#### 13.2 Risk Engine — events to log

| Event | Level | Required context |
|---|---|---|
| Processing started | INFO | Contract ID |
| Processing completed | INFO | Contract ID, number of findings generated, overall risk level |
| Processing failed | ERROR | Contract ID, error type |

#### 13.3 Frontend — events to log (browser console only)

| Event | Level | Notes |
|---|---|---|
| File type rejected (client-side) | WARN | File name, reason — console only, never sent to backend |
| Upload request failed | ERROR | Generic message only; no server error detail surfaced |
| Polling detected status change | INFO | Contract ID, new status |

#### 13.4 What must never be logged

- File binary content or file contents of any kind.
- Full stack traces in any response returned to the frontend.
- Internal file paths in responses returned to the frontend.
- Any data entered by the user in comment fields.

---

### 14. LLD Traceability

| LLD item | Spec requirement(s) | Architecture reference |
|---|---|---|
| Contract data model (§8.1) | FR-02 (name, timestamp), NFR-01 (persistence) | §4.2 Backend API, §4.4 Database |
| Report data model (§8.2) | FR-05 (risk level, summary) | §4.3 Risk Engine, §4.4 Database |
| Finding data model (§8.3) | FR-06 (ranked), FR-07 (severity, explanation, section ref) | §4.3 Risk Engine |
| In-session state (§8.4) | FR-09, FR-10, spec A-02 | AD-04 |
| Status model — Pending / Complete (§9) | FR-03, FR-04 AC | AD-02, §4.3 Risk Engine |
| No Failed status in MVP (§9) | spec §3 out of scope (no error recovery) | HR-01 |
| Backend file type validation — MIME + extension (§10.1) | FR-01, FR-01 AC | AD-06 |
| Frontend file type validation (§10.2) | FR-01 AC (error shown) | AD-06 |
| Upload error handling — no partial records (§11.1) | FR-01 AC (queue unchanged on error) | §4.2 Backend API |
| Risk Engine error — contract stays Pending (§11.2) | spec A-01 (simulated; demo path) | §4.3 Risk Engine |
| No stack traces or system detail in error responses (§11.4) | Security rules | §4.2 Backend API |
| Mock rule structure (§12.1) | spec A-01, FR-07 | §4.3 Risk Engine |
| Minimum mock rule set (§12.2) | spec OQ-01 (open — PO to confirm) | architecture HR-05 |
| Overall risk level — Option A default (§12.3) | FR-05, spec OQ-03 (open — PO to confirm) | architecture HR-02 |
| Processing delay — server-side, randomised 2–6 s (§12.4) | NFR-02, FR-03 | AD-02 |
| Findings ordering — High first (§12.5) | FR-06 | §4.3 Risk Engine |
| Structured JSON logging, no sensitive data (§13) | Security rules | §4.2 Backend API, §4.3 Risk Engine |
