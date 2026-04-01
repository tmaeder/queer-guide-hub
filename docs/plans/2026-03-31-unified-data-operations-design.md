# Unified Data Operations Page

## Context

5 separate admin pages handle overlapping concerns:
- `/admin/pipelines` — Visual pipeline builder (React Flow)
- `/admin/pipelines/dashboard` — Pipeline run monitoring + circuit breakers + staging
- `/admin/workflows` — pgmq workflow orchestration (single-function runs)
- `/admin/automation` — Content processing modules (AI enhancer, tagger, validator, etc.)
- `/admin/imports/enrichment` — Post-commit enrichment quality monitoring

These share overlapping data (runs, review queues, quality metrics) and confuse the admin UX. This design merges all 5 into a single unified page.

## Design: 4-Tab Unified Page at `/admin/pipelines`

### Tab 1: Builder
**What:** React Flow visual pipeline editor (existing PipelineBuilder component)
**Shows:** Node palette, canvas, toolbar (save/run/dry-run), config panel
**No changes** — current builder as-is, full-height layout

### Tab 2: Monitor
**Merges:** Pipeline Monitor + Workflows Runs + Enrichment Dashboard

**Summary row (6 cards):**
- Running (pipeline_runs + workflow_runs where status='running')
- Completed (24h, both tables)
- Failed (24h, both tables)
- Quality Index (avg quality_score across 4 entity tables)
- Staging Items (ingestion_staging count)
- Review Queue (review_queue + content_changes pending count)

**Sub-sections:**
1. **Unified Run History** — Combined table from pipeline_runs + workflow_runs, sorted by created_at DESC. Columns: name, type (pipeline/workflow), status badge, items, duration, started. Click to expand per-node states (pipeline) or output_result (workflow).
2. **Quality Distribution** — Stacked bars per entity type (from enrichment dashboard). Avg scores, needs_attention counts.
3. **Review Queue** — Combined review_queue + content_changes (pending_review) items. Resolve/dismiss/approve/reject actions.

### Tab 3: Modules
**Merges:** Automation Dashboard (as-is, mostly unchanged)

**Shows:**
- Module cards grid (AI Enhancer, Auto Tagger, Content Validator, Data Normalizer, Dedup Checker, Link Sanitizer, Geo Enricher, Content Classifier)
- Toggle enable/disable, Dry Run, Run Now, Settings
- Run stats (runs, proposed, applied, threshold)
- Content changes history tab
- Link health tab
- Settings tab

**Minor change:** Add link to Builder tab for "these modules are also available as pipeline nodes"

### Tab 4: Health
**Merges:** Pipeline Monitor circuit breakers + Workflows overview stats + queue depths + definitions

**Sub-sections:**
1. **System Status** — Overall health summary (healthy/degraded/down)
2. **Circuit Breakers** — Grid of 17 API circuit breaker cards (state, failure count, open_until)
3. **Queue Depths** — pgmq queue metrics (scheduled_jobs, import_jobs, content_processing, pipeline_steps, enrichment_queue, dead_letter)
4. **Dead Letter** — Dead letter items with retry/dismiss actions
5. **Definitions** — Combined table: pipeline_definitions + workflow_definitions. Columns: name, type, schedule, enabled, actions (enqueue/edit/open in builder)
6. **Staging Stats** — Ingestion staging disposition breakdown

## Routes

- `/admin/pipelines` — defaults to Builder tab
- `/admin/pipelines?tab=monitor` — Monitor tab
- `/admin/pipelines?tab=modules` — Modules tab
- `/admin/pipelines?tab=health` — Health tab

## Deprecated Routes (redirect)
- `/admin/pipelines/dashboard` → `/admin/pipelines?tab=monitor`
- `/admin/workflows` → `/admin/pipelines?tab=health` (definitions section)
- `/admin/automation` → `/admin/pipelines?tab=modules`
- `/admin/imports/enrichment` → `/admin/pipelines?tab=monitor` (quality section)

## Navigation
Remove 4 nav items (Pipeline Monitor, Workflows, Automation, Enrichment).
Keep 1 nav item: "Data Operations" at `/admin/pipelines` (or rename to "Pipelines")

## Implementation
1. Create `UnifiedPipelinePage.tsx` with 4-tab layout using URL query param for tab state
2. Move existing components into tabs (PipelineBuilder, modules from AutomationDashboard, etc.)
3. Create unified `useUnifiedMonitor` hook combining pipeline_runs + workflow_runs queries
4. Add redirects for old routes
5. Update adminNavigation.ts
