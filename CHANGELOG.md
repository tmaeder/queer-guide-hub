# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- Chrome extension (`extension/`) — captures venues, events, hotels, marketplace items and news from any webpage via JSON-LD, microdata, OpenGraph and DOM heuristics, and submits them as moderated suggestions.
- `worker-submit/` Cloudflare Worker — verifies user Supabase JWTs and stages submissions into the existing `ingestion_staging` pipeline; reuses the scraper's stable JSON hash so dedupe works across scraper + user submissions.
- Migration `Dev/src/db/migrations/002_user_submissions.sql` — extends `ingestion_staging` with submitter columns and RLS so users read only their own submissions.
- CI workflow `.github/workflows/extension-ci.yml` — typecheck, test, build for both new packages on PR.

## [1.0.1] - 2026-04-18

### Fixed
- Correct useEffect dependency array syntax and remove unused useAuth() calls in feedback component
- Remove non-existent hotels and festivals indexes from search-proxy worker config

### Chore
- Update search-proxy worker submodule reference

## [1.0.0] - 2026-04-15

Initial release
