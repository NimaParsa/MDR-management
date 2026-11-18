# Deployment checklist

This checklist is for a controlled **development-host deployment first**. Do not deploy this branch to Production or merge it into `main` as part of routine development.

## 1. Release identity and CI

- [ ] Confirm the intended commit is the current `backend-import` branch head.
- [ ] Confirm Backend CI passed for that exact commit.
- [ ] Confirm Frontend CI passed for that exact commit whenever frontend files changed.
- [ ] Download the `mdr-frontend-dist` artifact from the successful Frontend CI run for the same commit. Do not reuse an artifact from an earlier run.
- [ ] Keep the commit SHA and CI run URLs with the deployment record.

## 2. Backups and prerequisites

- [ ] Confirm the cPanel Node.js application uses Node.js 22 or newer.
- [ ] Record the current application path and startup file before changing anything.
- [ ] Take a restorable backup of the current application files.
- [ ] Take and verify a database backup before any deployment activity.
- [ ] Confirm the MariaDB database and imported project data are already provisioned and accessible.
- [ ] Confirm there is a tested rollback path to the previous application files and database backup.

**Important:** The database schema and imported project data are provisioned outside this repository. This repository currently contains no schema migration or database seed script. Do not create, alter, truncate, or re-import production tables as part of this application deployment.

## 3. Runtime configuration

Set these values in the hosting environment, not in source files:

- [ ] `DB_HOST`
- [ ] `DB_PORT` (normally 3306)
- [ ] `DB_NAME`
- [ ] `DB_USER`
- [ ] `DB_PASSWORD`
- [ ] `JWT_SECRET` (long, random, private value)
- [ ] `PORT` (the port assigned by the hosting platform, if required)
- [ ] `FRONTEND_ORIGINS` only if the frontend is served from a different origin; use exact HTTPS origins.

Never put credentials in Git, frontend environment variables, build artifacts, screenshots, or support messages. Use HTTPS for all access.

## 4. Application files

- [ ] Update the Node application files from the approved `backend-import` commit.
- [ ] Keep the host's environment configuration outside the source checkout.
- [ ] Install production dependencies in the backend application directory using the hosting platform's supported process (for example, `npm install --omit=dev --no-audit --no-fund`). There is currently no committed backend lockfile, so record the installed dependency versions.
- [ ] Run `npm run preflight`. It checks Node version, required environment-variable presence, port formats, HTTPS CORS origins, and whether the frontend build exists. It never prints secret values and does not test database connectivity.
- [ ] Upload the complete `frontend/dist` directory from the matching CI artifact to `frontend/dist` under the backend application root.
- [ ] Do not upload frontend source maps or local development environment files unless specifically required.
- [ ] Restart the Node application using the cPanel Node.js application controls.

The Express application serves the React build when `frontend/dist/index.html` exists. Without that file, the root path retains the API-only status response.

## 5. Post-deployment verification on Dev

- [ ] Open `/api/health`; expect HTTP 200.
- [ ] Open `/api/ready`; expect HTTP 200 and a connected database.
- [ ] Open the application root; confirm the React sign-in screen loads and static assets return successfully.
- [ ] Sign in with a designated test account; confirm only assigned projects are listed.
- [ ] Verify each role sees only the navigation and data allowed by its project permissions.
- [ ] Check Documents search, discipline filter, pagination, and missing-value display.
- [ ] Check Transmittal list, linked documents, revision history, and detail retry.
- [ ] Check Invoice list, stored amounts, line items, missing values, and read-only messaging.
- [ ] Verify mobile navigation, keyboard focus, dialogs, and horizontal table scrolling.
- [ ] Sign out; confirm the old session can no longer access protected API routes.
- [ ] Review cPanel application logs for startup errors, database errors, and unexpected 4xx/5xx responses.

Do not use live commercial records for test writes. The current application exposes read-only invoice, document, and transmittal APIs.

## 6. Rollback

If health checks, login, permissions, or core screens fail:

1. Stop or restart the Node application using the host controls.
2. Restore the previous application files and previous matching frontend build.
3. Restore the database backup only if a database change was actually made and the recovery plan requires it.
4. Recheck `/api/health`, `/api/ready`, login, and project access.
5. Record the failed commit, symptoms, and rollback result before attempting another release.

## 7. Production gate

Production deployment is a separate, explicit release decision. It requires:

- [ ] Successful Dev deployment and user acceptance.
- [ ] Confirmed backup and rollback readiness.
- [ ] Confirmed database compatibility and environment configuration.
- [ ] A separately approved Production release commit and deployment window.

The `main` branch and Production environment must remain unchanged until that approval is explicitly given.
