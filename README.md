# MDR Management Backend

Node.js and Express API for the MDR Management application.

## Runtime

- Node.js 22
- MariaDB / MySQL
- Express 4
- mysql2 connection pool

The database schema and imported project data are managed separately from this repository. Provision the required MDR database before starting the API.

## Configuration

Provide these environment variables through your hosting control panel or process manager:

| Variable | Purpose |
| --- | --- |
| DB_HOST | MariaDB host |
| DB_PORT | MariaDB port (defaults to 3306) |
| DB_USER | Database username |
| DB_PASSWORD | Database password |
| DB_NAME | Database name |
| JWT_SECRET | Secret used to sign and verify authentication tokens |
| PORT | HTTP port (defaults to 3000) |

Use a strong, unique JWT secret and keep all credentials outside source control. This application does not load a .env file itself; environment variables must be provided by the runtime or hosting environment.

## Install and run

~~~sh
npm install
npm start
~~~

Run the automated test suite:

~~~sh
node --test
~~~

## Current API surface

All endpoints are prefixed with /api.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | /health | Public API process health (liveness) check |\n| GET | /ready | Database connectivity readiness check (returns 503 when the database is unavailable) |
| POST | /auth/login | Authenticate and create a database-backed session |
| GET | /auth/me | Return the current user and assigned projects |
| POST | /auth/logout | Invalidate the current session |
| GET | /projects | List projects visible to the current user |
| GET | /projects/:id | Read one assigned project |
| GET | /projects/:projectId/disciplines | List active project disciplines |
| GET | /projects/:projectId/documents | List project documents with pagination and filters |
| GET | /projects/:projectId/transmittals | List project transmittals |
| GET | /projects/:projectId/transmittals/:transmittalId | Read a transmittal |
| GET | /projects/:projectId/transmittals/:transmittalId/documents | List documents in a transmittal |
| GET | /projects/:projectId/transmittals/:transmittalId/revisions | Read transmittal revision history |
| GET | /projects/:projectId/invoices | List project invoices |
| GET | /projects/:projectId/invoices/:invoiceId | Read an invoice |
| GET | /projects/:projectId/invoices/:invoiceId/items | Read invoice items |

The current project, document, transmittal, and invoice API routes are read-only. Write workflows and financial calculation endpoints are not implemented in this backend snapshot.

## Security notes

- Authentication uses signed HS256 JWTs and database-backed sessions.
- Tokens expire after eight hours; logout deletes the current session.
- Project routes enforce project membership and the required permission.
- Login attempts are rate-limited in process memory. This limiter resets when the process restarts and is not shared across multiple application instances.
- Reverse-proxy client IP handling has not yet been verified on the deployed Dev host. Do not enable proxy trust broadly without confirming the hosting proxy configuration.
- Helmet security headers and a 1 MB JSON request-body limit are enabled.
- The public database diagnostic endpoint has been removed.

## CI and test scope

GitHub Actions checks JavaScript syntax and runs node --test for pushes and pull requests targeting backend-import.

The automated suite uses mocked database responses. It is not a substitute for integration tests against the real MariaDB schema or endpoint tests on the Dev deployment.

## Development branch

Active development takes place on backend-import. The main branch and Production deployment are intentionally kept separate during this review.
