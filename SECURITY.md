# Security policy

## Reporting a vulnerability or exposed credential

Please do not open a public issue for a security vulnerability or a possibly
exposed API key. Contact the repository owner privately through GitHub instead,
including the affected file, commit, or URL where possible.

The repository ignores `.env` and generated data. If a credential is ever
committed, revoke or rotate it with the provider immediately, then remove it
from the repository history before continuing work.

## Handling credentials

- Use `.env` for local secrets and keep it out of Git.
- Use `.env.example` only for placeholder values and non-sensitive settings.
- Never place credentials in GitHub Actions logs, examples, tests, or issues.
