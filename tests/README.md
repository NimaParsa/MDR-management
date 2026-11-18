# Backend tests

Run the automated test suite with:

```sh
node --test
```

The current suite exercises project-access middleware behavior, including malformed IDs, missing project membership, insufficient permissions, successful authorization, and database failures. The GitHub Actions workflow runs this suite on pushes and pull requests targeting `backend-import`.
