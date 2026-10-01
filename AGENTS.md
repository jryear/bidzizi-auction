# Repository Operating Notes

## Product
BidZizi is being rebuilt for company-hosted auction events. This repository currently operates the fresh staging foundation: a Next.js page and a read-only Neon database connection check. Project maintainers use it to verify hosting and database connectivity before implementing auction workflows.

## Durable invariants
- Database credentials stay on the server and outside Git, client bundles, and public responses.
- Connectivity status comes from a live database query; cached, build-time, or fictional results must not be reported as a verified connection.
- This rebuild imports no legacy application code or database contents. Old resources remain separate until explicitly retired.

## Work style
- Investigate relevant code and run the product before assuming the task language describes the correct implementation.
- Prefer coherent end-to-end ownership over narrowly local edits.
- Make reversible implementation decisions autonomously.
- Surface decisions that change product meaning, security/privacy boundaries, durable data contracts, or other consequential commitments.
- For interface changes, inspect the rendered result; passing tests alone is not completion.

## Context
- Staging resources, connection ownership, and deployment verification: `docs/STAGING_CONNECTIVITY.md`.

## Contracted work
Frozen implementation contracts live in `tasks/`.

For a contracted task, the committed contract defines the required observable outcome. Do not modify the task spec or its declared evidence while implementing it. The shared verifier lives outside the project repository and acts as the completion trust anchor.

Run:

```bash
python ~/code/_kernel/verify.py tasks/<task>.toml --repo . --base main --claim "<completion claim>"
```

A supported verifier result is completion evidence; it is not a substitute for product judgment during discovery.
