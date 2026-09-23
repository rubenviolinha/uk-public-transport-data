# Contributing

Thanks for helping improve UK Public Transport Data.

## Local setup

1. Clone the repository and run `npm install`.
2. Copy `.env.example` to `.env`.
3. Add only the credentials required for the source you are testing.
4. Run `npm run check` before opening a pull request.

## Adding a data source or station

- Keep upstream credentials in `.env`; never put them in source code, issues,
  screenshots, commits, or pull requests.
- Document the provider, licensing/attribution requirements, refresh cadence,
  and the fields used by the normalised data model.
- Store generated feeds and snapshots under `data/`; they are intentionally
  ignored by Git.
- Prefer a normalised public-facing structure over exposing provider-specific
  raw data directly.

## Pull requests

Keep changes focused, update the README or relevant documentation, and explain
how the change was checked. Do not include secrets, generated live data, or
personal information.
