# Architecture: Contract Risk Assessment Tool

**Version:** 0.1
**Status:** Draft
**Source Spec:** `delivery/specs/contract-risk-assessment/feature-spec.md`

---

## 1. Purpose

This document describes the architecture of the MVP Contract Risk Assessment Tool. It defines the major components, their responsibilities and boundaries, the data flow between them, and the key decisions made to satisfy the approved feature specification. It is intended to guide implementation without prescribing API design, database schema, or code.

---

## 2. System Context

The system is a single-user, single-tenant web application running locally or in a simple cloud environment. There are no external service dependencies, no authentication layer, and no integrations with third-party document intelligence or AI services.

```
┌─────────────────────────────────────────────────────────┐
│                      Browser                            │
│                                                         │
│   React Frontend  ◄──── HTTP / REST ────►  Node.js API  │
│                                               │         │
│                                          ┌────┴──────┐  │
│                                          │  SQLite   │  │
│                                          │ Database  │  │
│                                          └───────────┘  │
│                                               │         │
│                                          ┌────┴──────┐  │
│                                          │   Local   │  │
│                                          │File Store │  │
│                                          └───────────┘  │
└─────────────────────────────────────────────────────────┘
```

**User:** Sales / Legal Desk User (single user, no login required)  
**Deployment:** Local machine or simple cloud host (NFR-04)  
**External dependencies:** None

---

## 3. Major Components

| Component | Technology | Role |
|---|---|---|
| **Frontend** | React | Renders UI, manages in-session state (review decisions, comments), polls for status updates |
| **Backend API** | Node.js | Receives uploads, persists contracts and reports, serves queue and report data |
| **Risk Engine** | Node.js (backend module) | Simulates risk analysis; applies predefined mock rules and produces structured report data |
| **Database** | SQLite | Persists contracts and generated risk reports across page refreshes |
| **File Store** | Local application folder | Persists uploaded PDF/DOCX files |

---

## 4. Component Responsibilities and Boundaries

### 4.1 Frontend (React)

**Responsible for:**
- Rendering the contract upload interface and enforcing client-side file type validation (FR-01).
- Displaying the contract queue with file name, upload timestamp, and current processing status (FR-02, FR-03).
- Polling the backend at a short interval to detect status transitions from `Pending` to `Complete`, and updating the queue display without a page reload (FR-03, NFR-02).
- Gating the "open report" action — the control is disabled when status is `Pending` (FR-04).
- Rendering the risk report: overall risk level, summary, ranked findings list, severity labels, section references, and visual distinction for high-risk findings (FR-05 through FR-08).
- Managing per-finding review status selection (Accepted / Overridden / Reviewed) in component state for the duration of the session (FR-09, spec A-02).
- Managing per-finding free-text comments in component state for the duration of the session (FR-10, spec A-02).

**Does not:**
- Persist review decisions or comments to the database (out of scope, spec §3).
- Implement the simulated delay — it reflects status returned by the backend (see Risk Engine).
- Perform document parsing of any kind.

**Boundary:** The frontend communicates with the backend exclusively via HTTP. It holds no business logic beyond display rules and in-session state.

---

### 4.2 Backend API (Node.js)

**Responsible for:**
- Receiving file uploads, validating that the file is PDF or DOCX, and rejecting unsupported types with an error response (FR-01).
- Writing the uploaded file to the local file store.
- Creating a contract record in the database with status `Pending` and triggering the Risk Engine asynchronously.
- Serving the contract queue (all contracts, newest first) with current status (FR-02, FR-03, spec A-03).
- Serving the completed risk report for a given contract (FR-04 through FR-07).

**Does not:**
- Implement risk logic — that is delegated entirely to the Risk Engine.
- Store or retrieve review decisions or comments.
- Enforce access control.

**Boundary:** The backend is the sole writer to the database and file store. The frontend is a read/write client over HTTP only.

---

### 4.3 Risk Engine (Node.js backend module)

**Responsible for:**
- Simulating the visible processing delay of 2–6 seconds after a contract is received (NFR-02, spec A-04).
- Applying a predefined set of mock risk rules to produce a structured report: overall risk level, plain-language summary, and a ranked list of findings (FR-05 through FR-07).
- Each finding includes: severity (High / Medium / Low), a short explanation, and a simulated contract section reference.
- Updating the contract status in the database from `Pending` to `Complete` and writing the report data once generation finishes.

**Does not:**
- Read or parse the uploaded file content — the analysis is fully simulated (spec A-01, spec §3 out of scope).
- Expose its own interface to the frontend directly.

**Boundary:** The Risk Engine is an internal backend module, not a separate service. It is invoked by the backend after a successful upload and writes results directly to the database.

> **Decision note (AD-02):** The delay is introduced inside the Risk Engine (server-side) rather than client-side. This makes the `Pending → Complete` transition observable via polling and reflects a realistic async processing pattern, satisfying NFR-02 and the demo scenario in spec §2.

---

### 4.4 Database (SQLite)

**Responsible for:**
- Persisting contract metadata: file name, upload timestamp, processing status, and a reference to the stored file (NFR-01).
- Persisting generated risk report data: overall risk level, summary, and findings (severity, explanation, section reference) linked to their contract.

**Does not:**
- Store review decisions or comments (in-session only per spec A-02).
- Store file binary content (delegated to the file store).

**Boundary:** SQLite is a file-backed embedded database local to the backend process. No network access, no separate database server.

---

### 4.5 File Store (Local application folder)

**Responsible for:**
- Storing the uploaded PDF or DOCX file on the local filesystem, referenced by the contract record in the database (NFR-01).

**Does not:**
- Serve files directly to the browser.
- Require any cloud storage or object storage infrastructure.

**Boundary:** A designated folder within the application directory (e.g., `uploads/`). The backend is the sole process that reads from and writes to this folder.

---

## 5. Data Flow

### 5.1 Upload and report generation

```
User selects file
      │
      ▼
Frontend validates file type (PDF / DOCX)
      │  invalid → show error, stop
      │  valid ↓
      ▼
POST file to Backend API
      │
      ▼
Backend saves file → File Store
Backend creates contract record (status: Pending) → Database
Backend triggers Risk Engine (async)
Backend returns contract record to Frontend
      │
      ▼
Frontend adds entry to queue (status: Pending)
Frontend begins polling Backend for status
      │
      ▼
Risk Engine waits 2–6 seconds (simulated delay)
Risk Engine generates mock findings
Risk Engine writes report → Database
Risk Engine updates contract status → Complete → Database
      │
      ▼
Frontend poll detects status: Complete
Frontend updates queue entry (no page reload)
```

### 5.2 Viewing a report

```
User clicks "Open report" (only enabled when status: Complete)
      │
      ▼
Frontend requests report data from Backend API
      │
      ▼
Backend reads report + findings from Database
Backend returns structured report to Frontend
      │
      ▼
Frontend renders: overall risk level, summary, ranked findings
```

### 5.3 Reviewing findings (in-session)

```
User selects review status or enters comment on a finding
      │
      ▼
Frontend updates component state only
No network request — state is in-session only (spec A-02)
```

---

## 6. Cross-Cutting Requirements

| Requirement | How it is satisfied |
|---|---|
| **NFR-01** — Files persist across page refreshes | Contract metadata and report data are stored in SQLite; uploaded files are stored on disk. Both survive a browser reload. |
| **NFR-02** — Status updates without page reload | Frontend polls the backend for contract status. When `Complete` is returned, the queue updates in place. |
| **NFR-03** — Report rendered within 8 seconds | The 2–6 s delay is enforced inside the Risk Engine. The frontend polling interval must be short enough (≤2 s) that the total visible latency stays within 8 s. |
| **NFR-04** — Single startup command, no external dependencies | SQLite is embedded; no separate database process. File store is a local folder. The application starts with one command (e.g., `npm start`). |
| **FR-01 file type enforcement** | Validated at both the frontend (user experience) and the backend (authoritative gate). The backend rejects non-PDF/DOCX regardless of what the frontend sends. |

---

## 7. Key Architecture Decisions

| ID | Decision | Rationale | Spec reference |
|---|---|---|---|
| AD-01 | SQLite as the database | No separate database server; single startup command; sufficient for single-user MVP. | NFR-04, spec §Assumptions |
| AD-02 | Processing delay lives in the Risk Engine (server-side), not the frontend | Makes the `Pending → Complete` transition a real observable state change in the database, not a UI illusion. The frontend reflects truth from the backend. | NFR-02, spec A-04 |
| AD-03 | Frontend polls for status updates (short interval) | Simplest mechanism to satisfy auto-update without a page reload for an MVP with no persistent connections required. No WebSocket or SSE infrastructure needed. | NFR-02, FR-03 |
| AD-04 | Review decisions and comments held in React component state only | Spec explicitly scopes these as in-session only (A-02, §3 out of scope). No backend endpoint, no database table needed for this data. | FR-09, FR-10, spec A-02 |
| AD-05 | Risk Engine is an internal module, not a separate service | Avoids inter-service complexity for MVP. The engine is called in-process by the backend after upload. | spec A-01, NFR-04 |
| AD-06 | File type validation at both frontend and backend | Frontend validation provides immediate feedback (FR-01 AC). Backend validation is the authoritative gate and cannot be bypassed by a direct HTTP request. | FR-01 |

---

## 8. Assumptions and Decisions for Human Review

| # | Item | Type | Owner |
|---|---|---|---|
| HR-01 | The Risk Engine applies mock rules uniformly to every uploaded file regardless of actual file content. The same set of findings (varying only in simulated section references) will be produced for every contract. This is acceptable for demo use but means no two contracts will feel genuinely different unless the mock rules are varied. | Decision to confirm | `[Product Owner]` |
| HR-02 | The overall risk level (High / Medium / Low) derivation rule is unresolved (OQ-03 in the feature spec). The architecture assumes the Risk Engine owns this calculation. Whichever rule is chosen (highest finding vs. weighted count) is an internal logic detail that does not change the component structure. | Blocker to resolve | `[Product Owner]` |
| HR-03 | The frontend polling interval is assumed to be ≤2 seconds to satisfy the 8-second total render budget (NFR-03). If the chosen interval is longer, NFR-03 may not be achievable in the worst case. | Decision to confirm | `[Tech Lead]` |
| HR-04 | Uploaded files are never deleted from the file store or the database in this MVP. Over repeated demo sessions, files and records will accumulate. A manual cleanup step or restart will be needed to reset state between demos. | Decision to confirm | `[Product Owner]` |
| HR-05 | The number and content of predefined mock risk rules (OQ-01) is unresolved. The architecture supports any number of rules but the demo quality depends on this being decided before implementation begins. | Blocker to resolve | `[Product Owner]` |
