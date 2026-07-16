# Build Tasks: Upload Contract Slice

**Version:** 0.3
**Status:** Draft
**Slice:** Upload contract → save locally → create SQLite queue record → return processing status
**Frontend slice:** Contract upload page → file selection and validation feedback → submit to backend → show contract ID and processing status in the queue
**Source Plan:** `delivery/specs/contract-risk-assessment/plan.md`
**Source Design:** `delivery/specs/contract-risk-assessment/design.md`

---

## Slice scope

### Backend tasks (BE-01 – BE-07)

1. Bootstrap the Node.js server and SQLite database
2. Create the `contracts` database table
3. Configure the local file store (`uploads/` directory)
4. Implement backend file type validation
5. Implement the upload handler (receive → validate → save file → create record → trigger engine stub → respond)
6. Implement the queue endpoint (return all contracts, newest first)
7. Add structured logging for all upload and queue events

### Frontend tasks (FE-01 – FE-06)

1. Bootstrap the React application
2. Implement the upload form with client-side file type validation and error feedback
3. Implement the upload service (POST to backend upload endpoint)
4. Implement the contract queue view (render queue entries from backend data)
5. Implement the status polling loop (auto-update queue without page reload)
6. Wire upload form submission to queue display

**Not in scope (either slice):** report generation, Risk Engine, finding review, authentication, real document parsing, deployment.

---

## Task dependency order

### Backend

```
BE-01 (server bootstrap)
  └─► BE-02 (database initialisation)
        └─► BE-03 (file store setup)
              └─► BE-04 (file type validation)
                    └─► BE-05 (upload handler)
                          └─► BE-06 (queue endpoint)
                    BE-05 ──┐
                    BE-06 ──┴─► BE-07 (upload logging)
```

### Frontend

```
FE-01 (React app bootstrap)
  └─► FE-02 (upload form + client-side validation)
        ├─► FE-03 (upload service)               ← also depends on BE-05
        └─► FE-04 (queue view)
              └─► FE-05 (polling loop)            ← also depends on BE-06
                    └─► FE-06 (wire form to queue)
```

**Cross-slice dependency:** FE-03 depends on BE-05; FE-05 depends on BE-06. Both must be available (or stubbed) to verify end-to-end behaviour.

---

## Tasks

---

### BE-01 — Bootstrap the Node.js backend server

**Source reference:** plan §2 (Technical context), plan §3.2 (Backend API), architecture NFR-04  

**Implementation notes:**
- Create the Node.js project with a package manifest and a dependency lock file.
- Set up an HTTP server that listens on `localhost` only — do not bind to `0.0.0.0` (security rule).
- The server port should be configurable via environment variable, with a sensible default (e.g., 3001).
- Include a single startup command in the project manifest (e.g., `npm start`) that launches the server with no additional setup steps required (NFR-04).
- At this stage the server only needs to start cleanly and respond to a basic health check; no routes are required yet.
- Do not introduce any external services, cloud dependencies, or build pipelines at this stage.

**Expected output:**
- A running Node.js HTTP server that starts with a single command.
- Server binds to `127.0.0.1` (or `localhost`) only.
- A health check route responds with a success status to confirm the server is up.

**Completion criteria:**
- `npm start` (or equivalent) starts the server without errors.
- The health check route returns a success response.
- The server does not bind to `0.0.0.0`.

**Dependencies:** None.

---

### BE-02 — Initialise the SQLite database and contracts table

**Source reference:** design §8.1 (Contract data model), design §9 (Status model), plan §3.4 (Database), architecture AD-01  

**Implementation notes:**
- Use an embedded SQLite client library (no separate database server or network connection).
- The database file should be stored within the application directory (e.g., `data/app.db`). The path should be configurable via environment variable.
- On startup, run an initialisation routine that creates the `contracts` table if it does not already exist. This must be idempotent — running it multiple times must not produce errors or duplicate tables.
- The `contracts` table must store the following fields (design §8.1):
  - Unique identifier — system-generated, immutable
  - File name — as provided by the user, stored as-is
  - Upload timestamp — set at creation; ISO 8601 format recommended
  - Processing status — constrained to `Pending` or `Complete`; default value `Pending`
  - File path reference — path to the saved file in the File Store
- Do not create the `reports` or `findings` tables at this stage; they are out of scope for this slice.
- The database initialisation must complete before the server begins accepting requests.

**Expected output:**
- SQLite database file created on first startup.
- `contracts` table exists with all required columns and the correct default for status.
- Subsequent startups do not error on an already-existing table.

**Completion criteria:**
- Server starts cleanly with the database initialisation completed.
- A query against the `contracts` table succeeds and returns an empty result set on a fresh database.
- The table has all five columns defined in design §8.1.
- Re-running initialisation (simulating a restart) does not throw an error.

**Dependencies:** BE-01.

---

### BE-03 — Configure the local file store

**Source reference:** plan §3.5 (File Store), design §8.1 (file path reference field), architecture §4.5  

**Implementation notes:**
- Designate a directory within the application folder as the file store (e.g., `uploads/`). The path should be configurable via environment variable with a sensible default.
- On startup, ensure the directory exists; create it if it does not (idempotent).
- The directory must not be served to the browser; no static file serving route should point to it.
- Files in the store are never read back by the backend or the Risk Engine (design HLD §5.1 note: "Written once; not read back by the system"). The store only needs to support writes at this stage.
- Add the uploads directory to `.gitignore` so uploaded files are not committed to version control.
- Ensure a `.gitignore` file exists in the project root if one does not already exist (security rule).

**Expected output:**
- `uploads/` directory (or configured equivalent) created on startup if absent.
- Directory is not accessible via any HTTP route.
- `.gitignore` excludes the uploads directory and the SQLite database file.

**Completion criteria:**
- Application starts and `uploads/` directory exists (created if absent).
- No HTTP route serves files from the uploads directory.
- `.gitignore` is present and excludes both `uploads/` and the database file path.

**Dependencies:** BE-01.

---

### BE-04 — Implement backend file type validation

**Source reference:** design §10.1 (Backend validation rules), plan §6 AD-06 (LLD-01), spec FR-01  

**Implementation notes:**
- Implement a validation function that checks an uploaded file against two criteria (design §10.1, plan LLD-01):
  1. **MIME type** must be `application/pdf` or `application/vnd.openxmlformats-officedocument.wordprocessingml.document`.
  2. **File extension** must be `.pdf` or `.docx` (case-insensitive check).
- Both checks must pass for a file to be accepted. Either check failing alone is sufficient to reject the file.
- The rationale for checking both: browsers may report incorrect MIME types for some files; dual checking reduces the risk of a mislabelled file bypassing validation (design §10.1 note).
- If validation fails, the function must return a descriptive rejection reason (e.g., "Unsupported file type. Only PDF and DOCX files are accepted.").
- The error response returned to the caller must be human-readable but must not include internal file paths, stack traces, or system detail (design §11.4).
- This validation must run before any file is written to the File Store or any database record is created.
- This is a backend-only concern; frontend validation is a separate task in the frontend slice and is explicitly not in scope here.

**Expected output:**
- A validation function (or module) that accepts file metadata (name, MIME type) and returns either a pass or a structured rejection with a human-readable reason.
- Validated inputs: `.pdf` with correct MIME, `.docx` with correct MIME.
- Rejected inputs: any other extension, any other MIME type, mismatched extension and MIME type.

**Completion criteria:**
- Valid PDF files (correct name and MIME) pass validation.
- Valid DOCX files (correct name and MIME) pass validation.
- A `.txt` file is rejected regardless of MIME type reported.
- A file with extension `.pdf` but MIME type `text/plain` is rejected (mismatched extension + MIME).
- A file with correct MIME type but extension `.doc` (old Word format) is rejected.
- Rejection reason is human-readable and contains no system-internal detail.

**Dependencies:** BE-01.

---

### BE-05 — Implement the upload handler

**Source reference:** plan §3.2 (Backend API — upload endpoint), design HLD §3 (system flow), design §11.1 (upload error handling), spec FR-01, FR-02, architecture AD-06  

**Implementation notes:**
- Implement a route that accepts a multipart file upload request.
- The handler must execute these steps in order, stopping and returning an error at any failure point (design §11.1):

  1. **Validate file type** using the function from BE-04. If invalid: return a human-readable error response; do not write any file; do not create any database record.
  2. **Write file to File Store** (`uploads/` directory from BE-03). Generate a unique file name on the server side to avoid collisions; preserve the original file name separately for display. If the write fails: log the error server-side (contract ID not yet assigned; log operation context); return a generic upload failure response; do not create a database record.
  3. **Create contract record in the database** with the following values (design §8.1): system-generated unique identifier, original file name as provided by the user, upload timestamp (current time, set server-side), status `Pending`, file path reference pointing to the saved file. If the database write fails after the file has been saved: log the error; attempt to remove the orphaned file from the File Store (plan LLD-04); return a generic failure response.
  4. **Invoke the Risk Engine** asynchronously (non-blocking). At this stage, the Risk Engine does not exist; invoke a no-op stub that accepts a contract ID and returns immediately. The stub will be replaced in a later slice. The upload response must not wait for the stub to complete.
  5. **Return the new contract record** (identifier, file name, upload timestamp, status) to the caller.

- Error responses must be human-readable and must not expose internal paths, stack traces, or database detail (design §11.4).
- The handler must be the sole writer to both the File Store and the Database for this operation.

**Expected output:**
- Upload route is reachable.
- A valid PDF or DOCX submission results in: file saved to `uploads/`, contract record written to database with status `Pending`, contract record returned in response.
- An invalid file type results in: error response with human-readable message, no file written, no database record created.
- A file store write failure results in: error response, no database record created.
- A database write failure after file save results in: error response, orphaned file removed from File Store.

**Completion criteria:**
- Uploading a valid PDF creates a record in the `contracts` table with status `Pending` and a correct file path reference.
- The returned record contains: identifier, original file name, upload timestamp, status `Pending`.
- Uploading an invalid file type returns a human-readable error; no record is written; no file is saved.
- Simulating a File Store write failure (e.g., by making the uploads directory read-only) returns a generic error; no database record is created.
- Simulating a database write failure after file save results in the orphaned file being removed.
- No stack traces or internal paths appear in any error response.

**Dependencies:** BE-02, BE-03, BE-04.

---

### BE-06 — Implement the queue endpoint

**Source reference:** plan §3.2 (Backend API — queue endpoint), design §5.3 (queue and status polling data), design §10.3 (queue validation), spec FR-02, FR-03, spec A-03  

**Implementation notes:**
- Implement a route that returns all contract records from the database, ordered by upload timestamp descending (newest first), as required by spec A-03.
- Each record in the response must include: identifier, file name, upload timestamp, processing status (design §8.1 fields).
- The file path reference must not be included in the response — it is an internal implementation detail and must not be exposed to the frontend (design §11.4, security rule).
- If the database contains no records, return an empty list (not an error).
- This endpoint is the one the frontend will poll to detect status transitions (design HLD §3). It must return the current status as stored in the database at the time of the request; no caching that could mask a status change.
- No pagination is required for MVP; return all records in a single response.

**Expected output:**
- Queue route returns a list of contract records (newest first).
- Each record contains identifier, file name, upload timestamp, and status.
- File path reference is absent from the response.
- An empty database returns an empty list with a success status.

**Completion criteria:**
- After uploading one or more contracts via BE-05, the queue endpoint returns all of them ordered by upload timestamp descending.
- The `status` field in the response reflects the value currently stored in the database.
- File path references do not appear in any response from this endpoint.
- An empty database returns an empty list, not an error.

**Dependencies:** BE-05.

---

### BE-07 — Add structured logging for upload and queue events

**Source reference:** design §13.1 (Backend API logging events), design §13.4 (never log list), plan §3.2 (Backend API logging), security rules  

**Implementation notes:**
- Implement structured logging in JSON format for all backend events defined in design §13.1.
- The following events must be logged at the levels specified:

  | Event | Level | Required context |
  |---|---|---|
  | File upload received | INFO | File name, detected MIME type, file extension |
  | File type rejected | WARN | File name, detected MIME type, reason |
  | Contract record created | INFO | Contract ID, file name, timestamp |
  | File write to File Store succeeded | INFO | Contract ID, file path |
  | File write to File Store failed | ERROR | Contract ID, error type |
  | Database write failed | ERROR | Contract ID, operation, error type |
  | Queue request served | INFO | Number of contracts returned |

- Log output must be valid JSON — one object per line.
- The following must never appear in any log entry (design §13.4):
  - File binary content or file contents of any kind
  - Full stack traces
  - Data entered by the user in any field (file name as provided is acceptable; comment text is not applicable in this slice)
- Error log entries may include an error type or category (e.g., `"error_type": "FILE_WRITE_FAILURE"`) but must not include the raw exception message if it could expose internal paths or system detail.
- Logging must not be added to the risk engine stub introduced in BE-05; Risk Engine logging is out of scope for this slice.

**Expected output:**
- Every upload and queue event produces a JSON log entry with the required fields.
- Log entries are written to stdout (or a configurable output) in JSON format.
- No log entry contains file binary content, stack traces, or internal system detail beyond the fields specified.

**Completion criteria:**
- A valid upload produces at least three INFO log entries: upload received, file write succeeded, contract record created.
- An invalid file type produces one WARN log entry: file type rejected, with file name, MIME type, and reason.
- A queue request produces one INFO log entry: queue request served, with count of records returned.
- All log entries are valid JSON objects.
- No log entry includes raw file bytes, a full exception stack trace, or internal file paths beyond the file path reference field (which is permitted in the file write log entry).

**Dependencies:** BE-05, BE-06.

---

---

## Frontend tasks — Contract upload page slice

---

### FE-01 — Bootstrap the React application

**Source reference:** plan §2 (Technical context — Frontend), plan §3.1 (Frontend), architecture §3 (Major components)

**Implementation notes:**
- Create the React application. The frontend should be served by the Node.js backend in production; a separate dev server is acceptable during development to enable hot reload.
- The application entry point should render a single root component that owns top-level layout.
- No routing library is required for MVP — the application is a single page (spec §3 out of scope: no multi-page navigation).
- Do not introduce a component library, design system, CSS framework, or state management library beyond what React provides natively. Any styling decisions are deferred to individual component tasks.
- The application must be buildable and serveable from the project with a single command consistent with NFR-04.
- Do not wire any real data or API calls at this stage; placeholder or empty content is sufficient.

**Expected output:**
- A running React application that renders a root component in the browser.
- The app loads without console errors.
- The app is served by the backend (or a dev server) with a single startup command.

**Completion criteria:**
- `npm start` (or equivalent) starts both the backend and serves the frontend without errors.
- The root component renders a visible placeholder (e.g., a page heading or "Application loaded" message) in the browser with no console errors.
- No network requests are made on load (no API calls wired yet).

**Dependencies:** BE-01 (for serving the frontend via the backend in production).

---

### FE-02 — Implement the upload form with client-side file type validation and error feedback

**Source reference:** plan §3.1 (Frontend — upload form), design §10.2 (Frontend validation rules), spec FR-01, spec FR-01 AC

**Implementation notes:**
- Render a file upload form containing:
  - A file input control that accepts PDF and DOCX files. The browser-native `accept` attribute should be set to `.pdf,.docx` as a convenience hint, but this alone is not sufficient validation (design §10.2).
  - A submit control (button) to trigger the upload.
- Implement client-side file type validation that runs when the user selects a file or submits the form (design §10.2):
  - Check the selected file's extension (case-insensitive). Accepted values: `.pdf`, `.docx`.
  - If the extension is invalid, display a visible inline error message in the form. The message must be human-readable (e.g., "Only PDF and DOCX files are accepted.").
  - Do not send the upload request to the backend if client-side validation fails (design §10.2).
  - Log a WARN to the browser console when client-side validation rejects a file (design §13.3).
- The submit control must be disabled while an upload is in progress to prevent duplicate submissions.
- When validation passes and the form is submitted, the form component should call a handler passed to it as a prop — do not implement the actual HTTP call in this task (that is FE-03).
- No styling decisions are required beyond the inline error message being visible and distinguishable from normal form content.

**Expected output:**
- A rendered upload form with file input and submit button.
- Selecting an invalid file type and submitting shows a visible inline error message; no network request is made.
- Selecting a valid file and submitting calls the onSubmit handler prop.
- Submit button is disabled while upload is in progress (controlled by prop or local state flag).

**Completion criteria:**
- A `.txt` file selection triggers the inline error message with no network request sent.
- A `.png` file selection triggers the inline error message with no network request sent.
- A `.pdf` file selection clears any prior error and calls the submit handler on form submission.
- A `.docx` file selection clears any prior error and calls the submit handler on form submission.
- Extension check is case-insensitive (`.PDF` and `.DOCX` are accepted).
- A WARN is written to the browser console when a file is rejected client-side, containing the file name and reason.
- The submit button is disabled when an upload is in flight.

**Dependencies:** FE-01.

---

### FE-03 — Implement the upload service

**Source reference:** plan §4.1 (Frontend → Backend API — upload contract operation), plan §3.1 (Frontend), design HLD §3 (system flow — POST file), design §11.1 (upload error handling — frontend behaviour)

**Implementation notes:**
- Implement a service function (or module) that takes a `File` object and sends it to the backend upload endpoint as a multipart form request.
- The service must return the contract record from a successful response (identifier, file name, upload timestamp, status `Pending`) for the caller to use.
- On a successful response, the service returns the new contract record. On a failed response, it returns a structured error that includes a human-readable message from the backend response body.
- The service must not surface any backend-internal detail (stack traces, file paths) — it should pass through only the human-readable message field from the backend error response (design §11.4).
- Log an ERROR to the browser console when the upload request fails, containing only the generic message — no server-internal detail (design §13.3).
- The service is a plain function or module — it has no UI of its own. It is wired to the upload form in FE-06.
- For this task, the function can be tested by calling it directly (e.g., from a browser console or a temporary test harness). Full integration with the form is deferred to FE-06.
- The backend upload endpoint (BE-05) must be available for end-to-end verification of this task.

**Expected output:**
- An upload service function that accepts a `File` and returns a promise resolving to a contract record on success or a structured error on failure.
- A valid PDF or DOCX file sent to the backend results in a contract record returned to the caller with status `Pending`.
- An invalid response from the backend results in a structured error with a human-readable message, no internal detail.

**Completion criteria:**
- Calling the service with a valid PDF file results in a resolved promise containing a contract record with an identifier and status `Pending`.
- Calling the service with an invalid file type (bypassing frontend validation) results in a rejected/error response containing the backend's human-readable rejection message.
- No stack traces, file paths, or internal backend detail are surfaced to the caller in any error path.
- A console ERROR is logged when the request fails, containing only the generic message.

**Dependencies:** FE-01, BE-05.

---

### FE-04 — Implement the contract queue view

**Source reference:** plan §3.1 (Frontend — contract queue view), design §5.3 (queue and status polling data), design HLD §4 (component interactions — queue display), spec FR-02, FR-03, FR-02 AC

**Implementation notes:**
- Implement a queue component that renders a list of contract entries.
- The component accepts an array of contract records as a prop (identifier, file name, upload timestamp, status). It does not fetch data itself — data fetching is handled in FE-05 and wired in FE-06.
- Each queue entry must display (spec FR-02 AC, design §5.3):
  - File name
  - Upload timestamp (formatted as a human-readable date and time)
  - Processing status (`Pending` or `Complete`)
- The list must be ordered newest first, as returned by the backend (spec A-03). The component renders entries in the order of the array prop — it does not re-sort.
- The "Open report" control per entry is out of scope for this slice. A placeholder element (e.g., a disabled button labelled "Open report") may be included to reserve the position in the layout, but it must remain non-functional.
- When the array prop is empty, the component renders a visible empty state message (e.g., "No contracts uploaded yet.") rather than a blank area.
- No styling decisions beyond readable, distinguishable display of the three fields and a visible empty state are required.

**Expected output:**
- A queue component that renders contract entries from a prop array.
- Each entry shows file name, upload timestamp, and processing status.
- An empty array renders an empty state message.
- Entries appear in the order supplied (newest first, as returned by the backend).

**Completion criteria:**
- Passing an array of two contract records renders two entries, each with file name, timestamp, and status visible.
- Entries are rendered in the order of the array prop.
- Passing an empty array renders the empty state message and no entry rows.
- The "Open report" control (if present) is non-functional and visually indicated as disabled.
- No data fetching occurs inside the component.

**Dependencies:** FE-01.

---

### FE-05 — Implement the status polling loop

**Source reference:** plan §3.1 (Frontend — polling loop), plan §6 AD-03, design §5.3 (queue polling data), design HLD §3 (polling in system flow), spec FR-03, NFR-02, NFR-03

**Implementation notes:**
- Implement a data-fetching and polling mechanism that:
  1. Fetches the full contract list from the backend queue endpoint on component mount (initial load).
  2. Repeats the fetch at a fixed interval of **2 seconds or less** (plan AD-03, NFR-03 — polling interval must be ≤2 s to keep total render time within the 8 s budget).
  3. On each successful fetch, updates the contract list held in state, which is passed as a prop to the queue component (FE-04).
  4. Stops polling (clears the interval) when the component unmounts, to prevent memory leaks and stale state updates.
- The mechanism should live in the root component or a dedicated data-management layer — not inside the queue component itself (FE-04 is a pure display component, design §4.1 Frontend boundary).
- On a fetch failure, log an ERROR to the browser console with a generic message; do not crash the UI or display an error that obscures the queue (design §13.3). The existing queue state should be preserved until a successful response is received.
- The polling loop must not block the UI between polls — it runs on a timer, not a continuous loop.
- The backend queue endpoint (BE-06) must be available for end-to-end verification.

**Expected output:**
- On page load, the contract queue is populated from the backend.
- Every ≤2 seconds, the queue data is refreshed from the backend without a page reload.
- When a contract's status changes from `Pending` to `Complete` in the backend (e.g., manually updated in the database for testing), the queue display updates automatically within the next polling interval.
- Component unmount stops the polling interval.

**Completion criteria:**
- On page load, contracts previously uploaded (and persisted in the database via BE-05) appear in the queue.
- After manually updating a contract's status to `Complete` in the database, the queue display updates to show `Complete` within 2 seconds, without a page reload.
- After the polling component is removed from the DOM, no further network requests to the queue endpoint are made — confirmed via browser DevTools Network tab.
- A fetch failure logs a console ERROR with a generic message and does not clear the displayed queue.

**Dependencies:** FE-04, BE-06.

---

### FE-06 — Wire upload form submission to the queue display

**Source reference:** plan §3.1 (Frontend — full upload flow), design HLD §2 (main user flow), design HLD §3 (system flow — full sequence), spec FR-01, FR-02, FR-03, spec FR-01 AC, FR-02 AC

**Implementation notes:**
- Connect the upload form (FE-02), the upload service (FE-03), the queue view (FE-04), and the polling loop (FE-05) into the complete upload-to-queue flow in the root component (or equivalent top-level component):
  1. User selects a file. Client-side validation runs (FE-02). If invalid, the inline error is shown and the flow stops.
  2. User submits the form. The upload service (FE-03) is called with the selected file. The submit button is disabled for the duration.
  3. On a successful response, the returned contract record is added to the local contract list in state immediately (optimistic update), so it appears in the queue without waiting for the next poll. Its status will be `Pending`.
  4. On an upload failure, the inline error area in the form displays the human-readable message from the service. The queue is unchanged (spec FR-01 AC).
  5. The polling loop (FE-05) continues independently and will update the queue entry's status from `Pending` to `Complete` once the backend transitions it.
  6. After a successful upload, the form is reset (file input cleared, any prior error cleared) so the user can submit another contract.
- The optimistic update in step 3 ensures the queue entry appears immediately (spec FR-02: "contract appears in the contract queue immediately") without relying solely on the next poll interval.
- Do not navigate away from the page on upload success — the queue and the upload form are on the same page.

**Expected output:**
- The complete upload-to-queue user flow works end-to-end:
  - Valid file selected → submitted → appears in queue as `Pending` immediately → status updates to `Complete` automatically within the polling interval.
  - Invalid file selected → inline error shown → queue unchanged.
  - Upload failure → error message shown in form → queue unchanged.
- Form resets after a successful upload.

**Completion criteria:**
- Uploading a valid PDF results in an immediate `Pending` entry in the queue, confirmed by the contract record returned from the backend (not just a frontend fabrication).
- The queue entry transitions from `Pending` to `Complete` automatically (no page reload) within the polling interval after the backend Risk Engine stub completes (or when status is manually updated for testing).
- Uploading an invalid file type shows the inline validation error; the queue has no new entry; no network request is made.
- An upload that fails at the backend (e.g., network error) shows the human-readable error in the form; the queue is unchanged.
- After a successful upload, the file input is cleared and the error area is empty, ready for a new upload.
- The submit button is disabled during the upload and re-enabled after success or failure.

**Dependencies:** FE-02, FE-03, FE-04, FE-05, BE-05, BE-06.
