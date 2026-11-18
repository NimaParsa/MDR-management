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
| GET | /projects/:projectId/transmittals | List transmittals |
| GET | /projects/:projectId/transmittals/:transmittalId | Read transmittal |
| GET | /projects/:projectId/transmittals/:transmittalId/documents | Transmittal document list |
| GET | /projects/:projectId/transmittals/:transmittalId/revisions | Transmittal revision history |
| GET | /projects/:projectId/invoices | List invoices |
| GET | /projects/:projectId/invoices/:invoiceId | Read invoice |
| GET | /projects/:projectId/invoices/:invoiceId/items | Read invoice line items |

Document, transmittal and invoice routes are currently read-only. Write workflows and financial calculation endpoints have not been implemented.

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
- Project overview
- Searchable and paginated document register
- Transmittal register with document and revision details
- Invoice tracker with invoice line-item details

The frontend displays invoice values returned by the API; it does not calculate VAT, earned value, or amounts due.

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