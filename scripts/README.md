# scripts/

Operator one-shots and CI helpers (run with `node`/`tsx`, or `bash` for `.sh`).

What lives here:
- Build/CI gates wired into npm scripts (`check-env.mjs`, `sync-public-locales.ts`, `check-bundle-shape.mjs`, a11y/seo scans).
- Operator backfills (`backfill*.sh`, `meili-*.sh`) and audit/exploratory scripts.
- `output/` and `data-cleanup/` hold generated artifacts (gitignored).

Conventions:
- If a script is referenced by `package.json` or a workflow in `.github/workflows/`, keep it; one-shot backfills are kept as history of schema/data evolution.
- Add new CI-gating scripts here and reference them from `package.json` so they're discoverable.
