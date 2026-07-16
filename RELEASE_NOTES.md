# Release Notes — Contract Risk Assessment Tool

---

## [0.1.0] — 2026-07-16 · Initial Release

### Overview

First release of the **Contract Risk Assessment Tool** — an MVP full-stack web application for sales and legal desk users. This release establishes the complete product skeleton: contract upload flow, processing queue, simulated risk report generation, and per-finding review actions.

This release is **demo / MVP grade**. Risk analysis is simulated; the tool is intended for internal demos and early stakeholder review.

---

### What's New

#### User-Facing Features

- **Contract upload** — Upload PDF or DOCX files via a dedicated upload form with client- and server-side file type validation.
- **Contract queue** — View all uploaded contracts with file name, upload timestamp, and processing status. Status updates automatically without a page reload.
- **Risk report** — Each uploaded contract produces a simulated risk report containing an overall risk level, a short summary, and a ranked list of findings with severity labels and simulated contract section references. High-risk findings are visually distinguished.
- **Per-finding review actions** — Mark individual findings as Accepted, Overridden, or Reviewed within a session.
- **Per-finding comments** — Add free-text notes to any finding within a session.
- **Dashboard** — Summary view with number tiles and visualisations.

#### Backend

- Node.js / Express API with multipart file upload (`busboy`), PDF/DOCX magic-byte validation, SQLite contract queue (`better-sqlite3`), local file store, and simulated risk engine.
- Winston-based structured logging.
- Unit test suite covering file type validation.

#### Frontend

- React 18 + Vite with server-side rendering (SSR) configured.
- Carbon Design System components throughout.
- i18n scaffolding with German (`de`) locale.
- Full client-side routing with lazy-loaded pages.
- Test suite covering routing, cookies, theme utilities, and key components.

---

### Known Limitations

| Limitation | Detail |
|---|---|
| Simulated risk engine | `riskEngineStub.js` applies predefined mock rules only — no real document parsing or AI analysis. |
| No authentication | Single-user experience; no login, no RBAC. Not suitable for multi-user or production use without an auth layer. |
| Review state not persisted | Per-finding accepted / overridden / reviewed states and comments are held in React component state and are lost on page refresh. |
| Local storage only | SQLite database and local file store are not suitable for multi-user or cloud-native deployments without migration. |

---

### Delivery Artefacts Included

- Epic: `delivery/epics/contract-risk-assessment-epic.md`
- Feature spec, architecture doc, design doc, tasks, plan, testing summary, and unit test scenarios under `delivery/specs/contract-risk-assessment/`

---

### Commits in This Release

| Commit | Description |
|---|---|
| `7539c67` | `feat: initial commit — contract risk assessment full-stack app` |
| `cfcc391` | `chore: vscode settings` |

Merged to `main` via PR #1.

---

*Generated from release context review on 2026-07-16.*
