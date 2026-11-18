# Backend tests

Run the automated test suite with:

```sh
npm test
```

The suite currently contains 18 automated tests covering:

- Project-access middleware: malformed IDs, missing membership, insufficient permission, successful authorization, and database failures.
- Authentication middleware: missing bearer token, disallowed JWT algorithm, valid database-backed session, missing session, disabled user, and database failures.
- Project visibility: the authenticated-user profile only returns projects for which the assigned role grants `projects.view`.
- Project data isolation: invoice and transmittal detail lookups must constrain queries by both record ID and project ID.
- API error handling: malformed JSON, oversized request bodies, generic internal errors, and errors raised after response headers are sent.

GitHub Actions runs the syntax checks and this test suite on pushes and pull requests targeting `backend-import`.

These are automated unit and route-level tests with mocked database responses. They do not replace integration tests against the actual MariaDB schema or a deployed Dev environment.
