# MDR V3 Feature-Parity Audit

Reference: `Engineering_MDR_Invoice_Tracker_V3.html` (original standalone HTML/JSON application), plus accepted V2 requirements recorded for this project.

Audit branch: `backend-import`
Audit date: 2026-11-18
Scope: original source inspection and current branch code review. No cPanel deployment, live database migration, database write, or Production change has been made.

Status definitions:
- **Implemented in branch**: code is present in `backend-import`; CI checks must pass.
- **Prepared; migration required**: code and SQL migration are present, but the live database has not been changed.
- **Needs live verification**: requires testing against the Dev MariaDB database and browser workflow.

## Feature matrix

| Original capability | Current status | Notes |
|---|---|---|
| Add MDR document | Implemented in branch; migration required | Project-scoped API and form |
| Edit MDR document | Implemented in branch; migration required | Project-scoped API and editor |
| Delete MDR document | Implemented in branch; migration required | Blocked if document is linked to a transmittal |
| Document number, title, discipline, type | Implemented in branch | Project-specific disciplines; custom discipline creation |
| Weight Factor default 1.0001 | Implemented in branch | Hybrid automatic / manual weight-factor mode preserved |
| Planned manhours default 0 | Implemented in branch | Used in financial calculations |
| Hourly rate default USD 3/MH | Implemented in branch | Used in financial calculations |
| Progress 0–100% | Implemented in branch | Validated server-side |
| Status list | Prepared; migration required | Not Started, In Progress, IFA, IFR, IFC, Approved, On Hold, Cancelled |
| Planned / actual issue dates | Prepared; migration required | New document columns in migration |
| Revision and remarks | Prepared; migration required | New document columns in migration |
| Search by number, title, type, revision, remarks | Implemented in branch | Client-side in MDR view and server-side list filter |
| Discipline-grouped, expandable MDR | Implemented in branch | Expand All / Collapse All |
| Document cost = MH × hourly rate | Implemented in branch | Shared calculation module |
| Earned value = cost × progress / 100 | Implemented in branch | Shared calculation module |
| Weighted discipline progress | Implemented in branch | Weighted by effective document Weight Factor |
| Overall weighted project progress | Implemented in branch | Weighted by effective document Weight Factor |
| Discipline weight share | Implemented in branch | Calculated from project total weight |
| Planned MH and financial dashboard | Implemented in branch | Includes discipline breakdown |
| Contract value, earned value, remaining value | Implemented in branch | Dashboard and MDR summary |
| Invoice generator: earned / full-cost basis | Implemented in branch | Draft invoice is generated from current MDR |
| Invoice header: client, contractor, number, date, claim period, currency, VAT, basis | Prepared; migration required | Project invoice defaults stored in project_settings |
| Previous claims, amount due and VAT | Implemented in branch | Previously invoiced defaults from project setting and is editable per invoice |
| Invoice line-item snapshot | Prepared; migration required | Stores contract, earned and claim amounts per document |
| Print / Save PDF invoice | Implemented in branch | Browser print view |
| CSV export of MDR | Implemented in branch | Includes source and calculated columns |
| JSON backup download | Implemented in branch | Includes MDR and invoice header defaults |
| JSON backup restore | Implemented in branch | Explicit confirmation; replace is blocked when documents are in transmittals |
| XLSX / XLS / CSV import | Implemented in branch | Sheet selection, column mapping, preview, append / replace |
| Excel import defaults WF 1.0001 and rate 3 | Implemented in branch | CSV parsing remains available without the Excel reader |
| Auto-save | Implemented in branch | Successful mutations persist immediately to MariaDB |
| Save Now | Implemented in branch | Refreshes authoritative data from the database |
| Material Take off document type | Implemented in branch | Included in selectable document types |
| Larger readable UI and themes | Implemented in branch | Light, Dark and Obsidian Gold in the actual React app |

## Required database migration

The original database schema does not contain all V3 document and invoice fields. The forward-only migration is:

`migrations/001_mdr_v3_feature_parity.sql`

It adds:
- documents: status, planned / actual issue dates, revision and remarks;
- invoices: contractor, claim period, invoice basis and claim-basis amount;
- invoice_items: contract amount and claim amount snapshots.

The migration has **not** been executed. The Dev database must be backed up and explicitly confirmed before applying it. Application startup does not run migrations.

## Remaining verification before hosting

1. Confirm Backend CI and Frontend CI pass on the latest `backend-import` commit.
2. GitHub Pages now includes the premium dashboard preview and an interactive MDR sandbox with browser-local demo data. It can be used to test document CRUD, weighted calculations, CSV/JSON backup and restore, import and invoice preview / print. It is deliberately not connected to MariaDB or the live React/API application.
3. After explicit approval, apply the SQL migration to the confirmed Dev database only.
4. Deploy to Dev and test document CRUD, calculations, Excel/CSV import, JSON restore, invoice generation and print output against MariaDB.
5. Verify project isolation, role permissions, audit records, duplicate handling and transmittal deletion protection.
6. Obtain separate explicit release approval before any merge to `main` or Production deployment.

Backend CI and Frontend CI passed on the current implementation commits; the GitHub Pages deployment also completed successfully. Backend unit tests use mocked database responses. They do not replace live MariaDB integration tests.
