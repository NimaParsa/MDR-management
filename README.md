# MDR Management

MDR Management is a project-scoped engineering document control and commercial tracking application.

## Repository structure

- `app.js`, `routes/`, `middleware/`: Node.js / Express API.
- `tests/`: backend unit and route-level tests using mocked database responses.
- `frontend/`: React + TypeScript single-page application.

## Backend

### Runtime

- Node.js 22
- MariaDB / MySQL
- Express 4 and mysql2

Database schema and imported project data are provisioned separately from this repository.

### Configuration

Configure these variables in the hosting environment:

| Variable | Purpose |
| --- | --- |
| DB_HOST | MariaDB host |
| DB_PORT | MariaDB port (defaults to 3306) |
| DB_USER | Database username |
| DB_PASSWORD | Database password |
| DB_NAME | Database name |
| JWT_SECRET | Secret used to sign and verify authentication tokens |
| PORT | HTTP port (defaults to 3000) |
| FRONTEND_ORIGINS | Optional comma-separated exact frontend origins allowed by CORS |

Keep credentials outside source control. The backend expects environment variables to be supplied by the runtime. Set `FRONTEND_ORIGINS` only when the frontend is hosted on a different origin; use exact origins including scheme, and leave it empty for same-origin hosting.

### Install, run and test

~~~sh
npm install
npm start
npm test
~~~

### Current API surface

All API routes are prefixed with `/api`.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | /health | API process liveness |
| GET | /ready | Database readiness |
| POST | /auth/login | Authenticate and create a database-backed session |
| GET | /auth/me | Current user and assigned projects |
| POST | /auth/logout | Invalidate current session |
| GET | /projects | List visible projects |
| GET | /projects/:id | Read one assigned project |
| GET | /projects/:projectId/disciplines | List active disciplines |
| GET | /projects/:projectId/documents | Paginated, filterable document register |
| GET | /projects/:projectId/mdr-summary | Full MDR snapshot and weighted / financial project metrics |
| POST | /projects/:projectId/documents | Create an MDR document |
| PATCH | /projects/:projectId/documents/:documentId | Update an MDR document |
| DELETE | /projects/:projectId/documents/:documentId | Delete an untransmitted MDR document |
| POST | /projects/:projectId/documents/import | Transactional append / replace MDR import |
| POST | /projects/:projectId/disciplines | Add a custom project discipline |
| GET / PUT | /projects/:projectId/invoice-settings | Read / save invoice header defaults |
| GET | /projects/:projectId/transmittals | List transmittals |
| GET | /projects/:projectId/transmittals/:transmittalId | Read transmittal |
| GET | /projects/:projectId/transmittals/:transmittalId/documents | Transmittal document list |
| GET | /projects/:projectId/transmittals/:transmittalId/revisions | Transmittal revision history |
| GET | /projects/:projectId/invoices | List invoices |
| POST | /projects/:projectId/invoices | Generate a draft invoice and immutable MDR line-item snapshot |
| GET | /projects/:projectId/invoices/:invoiceId | Read invoice |
| GET | /projects/:projectId/invoices/:invoiceId/items | Read invoice line items |

Document create, update, delete and bulk import are implemented with project permission checks. Invoice draft generation calculates earned value or full contract cost, subtracts previously invoiced amounts, calculates VAT, and stores document-level snapshots. Transmittal routes remain read-only in this release.

## Frontend

See [frontend/README.md](frontend/README.md) for setup and deployment.

~~~sh
cd frontend
npm install
cp .env.example .env.local
# Set VITE_API_BASE_URL to the backend API base URL, including /api
npm run dev
~~~

Production output is generated in `frontend/dist`. Configure the web server's SPA fallback and ensure the backend allows the deployed frontend origin through CORS.

### Frontend screens

- Sign in and session restoration
- Permission-aware project selection and navigation
- Project overview with weighted progress and financial KPIs
- Editable, searchable, discipline-grouped MDR with full V3 document fields
- XLSX / XLS / CSV import with worksheet selection, column mapping and preview (CSV remains available without the Excel reader)
- CSV export and project-scoped JSON backup / restore
- Transmittal register with document and revision details (read-only)
- Invoice generator with live VAT preview, stored line-item snapshots and print / Save as PDF
- Light, Dark and Obsidian Gold themes

The frontend displays invoice values returned by the API; it does not calculate VAT, earned value, or amounts due.

## MDR V3 database migration

The initial schema predates several V3 fields. Before using the new MDR and invoice write workflows on a database, take a fresh database backup and review / apply:

`migrations/001_mdr_v3_feature_parity.sql`

The migration adds document status, planned / actual issue dates, revision and remarks; invoice contractor and claim-period fields; and contract / claim amounts on invoice snapshots. It is not run automatically by the application. Confirm the target database and obtain explicit approval before executing it.

## Deployment readiness

See [the controlled deployment checklist](docs/DEPLOYMENT_CHECKLIST.md) before deploying to Dev. Production deployment is a separate approval step; this branch must not be merged into `main` without explicit release authorization.

## Security notes

- Authentication uses HS256 JWTs and database-backed sessions.
- Tokens expire after eight hours; logout invalidates the current session.
- Project routes enforce membership and permissions on the backend.
- The login limiter is process-local and resets on restart.
- Reverse-proxy client IP handling must be verified on the Dev host before enabling proxy trust.
- Helmet headers, a 1 MB JSON body limit, and consistent JSON error responses are enabled.
- Never expose database credentials or JWT signing secrets to the frontend.

## CI and test scope

- Backend CI checks JavaScript syntax and runs `npm test`.
- Frontend CI runs TypeScript checks and a production Vite build.
- Backend automated tests use mocked database responses; they are not live MariaDB integration tests.

## Development branch

Active development takes place on `backend-import`. The `main` branch and Production deployment are intentionally kept separate.