# Backend tests

Run the automated test suite with:

```sh
npm test
```

The suite currently contains 22 automated tests covering:

- Project-access middleware: malformed IDs, missing membership, insufficient permission, successful authorization, and database failures.
- Authentication middleware: missing bearer token, disallowed JWT algorithm, valid database-backed session, missing session, disabled user, and database failures.
- Project visibility: the authenticated-user profile only returns projects for which the assigned role grants `projects.view`.
- Project data isolation: invoice and transmittal detail lookups, invoice items, and transmittal revisions must be constrained to the requested project at query level.
- Nullable document metrics: missing manhours, rates, progress, and weight factors remain `null` in API responses instead of being converted to zero.
- API error handling: malformed JSON, oversized request bodies, generic internal errors, and errors raised after response headers are sent.

GitHub Actions runs the syntax checks and this test suite on pushes and pull requests targeting `backend-import`.

These are automated unit and route-level tests with mocked database responses. They do not replace integration tests against the actual MariaDB schema or a deployed Dev environment.
