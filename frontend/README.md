# MDR Management Frontend

Responsive React + TypeScript application for the MDR Management API.

## Requirements

- Node.js 22+
- npm
- Access to the MDR backend API

## Local development

~~~sh
cd frontend
npm install
~~~

For the integrated cPanel deployment, the default `/api` URL is correct. Copy `.env.example` to `.env.local` only if you need to override it:

~~~env
VITE_API_BASE_URL=https://dev-mdr.zarrinparsa.ir/api
~~~

Then run:

~~~sh
npm run dev
~~~

The Vite development server is available at http://localhost:5173.

## Production build

~~~sh
npm run typecheck
npm run build
~~~

The static site is generated in `frontend/dist`. For the integrated Node deployment, upload the complete `dist` directory to `frontend/dist` under the backend application root. The Express app detects `frontend/dist/index.html`, serves the static assets, and routes non-API paths to the React entry point. The existing API-only behavior remains unchanged when no build is present.

Set `VITE_API_BASE_URL` at build time; it must include the backend `/api` prefix. Same-origin hosting uses `/api` and requires no CORS configuration. If hosting the frontend on a separate origin, set the exact origin in the backend `FRONTEND_ORIGINS` allowlist.

## Included screens

- Sign in and current-session restoration
- Project selection and permission-aware navigation
- Project overview
- Searchable, paginated document register with discipline filter
- Transmittal list and read-only document/revision details
- Invoice list and read-only invoice item details

The current backend exposes read-only document, transmittal and invoice routes. The frontend intentionally does not offer create/edit/delete actions or calculate financial values. Values are displayed as returned by the API.

## Session handling

The bearer token is kept in `sessionStorage`, so it is cleared when the browser tab session ends. This is a pragmatic client-side session choice, not a substitute for a server-managed HttpOnly cookie architecture. Always use HTTPS.

## Notes

- Navigation is hidden when the selected project role lacks the corresponding permission; the backend remains the authoritative access-control layer.
- The frontend does not bypass or replace backend authorization.
- No database credentials or JWT signing secrets belong in frontend environment variables.