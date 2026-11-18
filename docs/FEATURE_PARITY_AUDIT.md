# MDR V3 Feature-Parity Audit

Reference: `Engineering_MDR_Invoice_Tracker_V3.html` (original standalone HTML/JSON application), plus the accepted V2 requirements recorded for this project.

Audit branch: `backend-import`
Audit date: 2026-11-18
Scope: source-code and schema inspection only. No hosting changes, database writes, migrations, or production changes were made.

## Findings

| Original capability | Current React/API status | Gap / required work |
|---|---|---|
| Add MDR document | Missing (API is read-only) | Implement project-scoped create endpoint and form |
| Edit MDR document | Missing | Implement update endpoint and editor |
| Delete MDR document | Missing | Implement permission-checked delete with transmittal-reference protection |
| Document fields: number, title, discipline, type | Partial (read only) | Preserve and make editable |
| Weight factor (default 1.0001) | Partial | Preserve legacy/automatic weight and manual override; enforce default on create/import |
| Planned manhours (default 0) | Partial | Add create/edit and use in calculations |
| Hourly rate (default USD 3/MH) | Partial | Add create/edit and use in calculations |
| Progress 0–100% | Partial | Add create/edit and validation |
| Status (Not Started, In Progress, IFA, IFR, IFC, Approved, On Hold, Cancelled) | Missing in documents schema/API/UI | Add migration and persist status |
| Planned issue date | Missing in documents schema/API/UI | Add migration and persist |
| Actual issue date | Missing in documents schema/API/UI | Add migration and persist |
| Revision | Missing in documents schema/API/UI | Add migration and persist |
| Remarks | Missing in documents schema/API/UI | Add migration and persist |
| Search by number/title/remarks/type | Partial (number/title only) | Expand filters |
| Discipline-grouped, expandable MDR | Missing | Implement grouped view and expand/collapse |
| Document cost = MH × hourly rate | Missing from UI/API | Implement consistent server/client calculation |
| Earned value = cost × progress / 100 | Missing from UI/API | Implement |
| Weighted discipline progress | Missing | Implement using document weight factors |
| Overall weighted project progress | Missing | Implement using document weight factors |
| Discipline weight share | Missing | Implement |
| Planned MH and financial dashboard | Missing | Implement KPIs and discipline breakdown |
| Contract value, earned value, remaining value | Missing | Implement |
| Invoice generator (earned-to-date or full-cost basis) | Partial (read-only invoice list/details) | Implement create/edit workflow and line-item snapshots |
| Invoice header: client, contractor, number, date, claim period, currency, VAT, basis | Partial | Persist missing header fields with migration/settings |
| VAT and total claim calculation | Missing | Implement and test |
| Print / Save PDF invoice | Missing | Implement printable invoice view |
| CSV export of MDR | Missing | Implement |
| JSON backup download | Missing | Implement project-scoped JSON export |
| JSON backup restore | Missing | Implement validated preview/import; never overwrite silently |
| Excel XLSX/XLS/CSV import | Missing | Implement worksheet selection, column mapping, preview, append/replace |
| Excel import defaults (WF 1.0001, rate 3) | Missing | Implement |
| Auto-save | Partial (server reads only) | Persist each successful mutation to MariaDB and show save state |
| Save Now | Missing | Add explicit save/refresh confirmation |
| Material Take off document type | Not confirmed in current discipline/document UI | Ensure selectable in document types |
| Theme / readable UI | Partial | Preserve large readable typography and Light/Dark/Obsidian Gold themes in the actual React app |

## Important data-model gaps

The existing schema already contains the core project-scoped tables and hybrid weight-factor columns, plus invoice and invoice-item tables. However, the current `documents` table does not contain status, planned/actual issue dates, revision, or remarks. The current `invoices` table does not contain contractor and claim-period/basis fields. A forward-only SQL migration is required before those fields can be stored on the live Dev database.

## Safety / release controls

- All implementation work is confined to `backend-import`.
- Do not deploy to cPanel Dev until the user explicitly starts the deployment step.
- Do not merge to `main` or change Production without separate explicit approval.
- Do not execute SQL migrations or write to the database without explicit approval and confirmation of the target database.
- Keep the original standalone HTML/JSON file as the behavioral reference; do not replace or delete it.
- Automated tests must cover formulas, validation, permission checks, import behavior, invoice totals, and project isolation.
