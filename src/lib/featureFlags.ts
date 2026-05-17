// Feature flags. Read from Vite env vars at build time.
//
// LEGACY_NEWS_TRIGGER_ENABLED — gates the manual "Fetch Now" admin
// triggers in NewsSourcesManager and AdminNewsSources, which call the
// legacy `fetch-news` edge function. The canonical news pipeline runs
// hourly via wf-news-pipeline → news-ingestion DAG; the manual triggers
// exist only for emergency reuse.
//
// Set VITE_LEGACY_NEWS_TRIGGER=true in .env to enable.
//
// Removal target: 2026-06-01 (30 days after Phase 1b landed). After
// that date, delete this flag, both UI sites, and the fetch-news
// edge function itself.

const truthy = (v: string | undefined) =>
  v === 'true' || v === '1' || v === 'yes';

export const LEGACY_NEWS_TRIGGER_ENABLED = truthy(
  import.meta.env.VITE_LEGACY_NEWS_TRIGGER,
);

// MAP_SHELL_ENABLED — gates the new unified MapShell (command bar + lens
// picker + filter chips) that replaces per-surface map chrome. Phase 1
// ships behind this flag so /map can A/B against the legacy ExploreMap
// chrome. When stable, all callers migrate and the flag is deleted.
export const MAP_SHELL_ENABLED = truthy(import.meta.env.VITE_MAP_SHELL);
