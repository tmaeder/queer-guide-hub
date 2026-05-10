# Unified Enrichment Pipeline Design

**Status:** Approved
**Date:** 2026-03-30
**Priority:** Data quality
**Scope:** Full (Ingest + Post-Ingest Enrichment)
**Approach:** Full Event-Driven via pgmq (Ansatz C)

---

## Overview

Replace the current disconnected cron-based enrichment (geo-link, embeddings, link validation, reviews all on independent schedules) with a unified event-driven pipeline where every data change automatically flows through all enrichment steps via pgmq.

### Current Problems

1. **Fire-and-Forget Inserts** — Data sits unenriched until the next cron run (up to hours)
2. **Time-based, not event-based** — Enrichment runs on schedule regardless of new data
3. **No feedback loops** — Failed enrichment (e.g. city not found) is silently ignored
4. **Duplicate work** — Batch processes re-scan everything instead of targeting changes
5. **No quality gate** — Incomplete entities are immediately searchable

### Architecture

```
INGEST (Stage 0)           ENRICH (Stages 1-4)              PUBLISH (Stage 5)
─────────────────          ────────────────────              ──────────────────

Scraper API ──┐
Email Ingest ─┤
fetch-news ───┤            ┌→ geo-link ────────┐
import-ilga ──┼→ DB Write ─┤→ validate-links ──┼→ quality-score → search-index → review
import-foursq─┤  + pgmq    ├→ embedding ───────┤
REST countries┤            └→ dedupe-check ────┘
import-airports┘

Every arrow = pgmq message
Every step = independent consumer
Failure = dead-letter queue + exponential backoff retry
```

---

## Stage 0 — Ingest

All data sources write to the database. A **DB trigger** on each content table automatically enqueues a message to `enrichment_queue`. This decouples ingest from enrichment completely — no ingest code needs modification.

### Sources

| Source | Trigger | Frequency |
|--------|---------|-----------|
| Scraper API (6 sources) | Orchestrator | Daily 03:15 + hourly Events |
| Email Ingest | Incoming email | On-demand |
| fetch-news | Cron | Hourly |
| import-ilga-data | Cron | Daily |
| import-foursquare-venues | Cron | Daily (after API key fix) |
| import-rest-countries | Manual | Monthly |
| import-airports-data | Manual | Monthly |

### DB Trigger

```sql
CREATE FUNCTION notify_enrichment_pipeline()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pgmq.send('enrichment_queue', jsonb_build_object(
    'entity_type', TG_TABLE_NAME,
    'entity_id', NEW.id,
    'action', TG_OP,
    'changed_columns', CASE
      WHEN TG_OP = 'UPDATE' THEN to_jsonb(akeys(hstore(NEW) - hstore(OLD)))
      ELSE NULL
    END
  ));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enrich_after_change
  AFTER INSERT OR UPDATE ON venues
  FOR EACH ROW EXECUTE FUNCTION notify_enrichment_pipeline();

-- Same trigger on: events, personalities, news_articles
```

The `changed_columns` field enables smart routing — e.g. if only `description` changed, skip geo-link but re-run embedding.

---

## Stage 1 — Parallel Enrichment

Four independent consumers process the same entity concurrently.

### 1a. geo-link

- **Input:** entity_type + entity_id
- **Action:** Match city/country via alias maps + city_aliases table
- **Output:** Sets city_id, country_id on entity
- **Failure:** Message to dead_letter with reason (e.g. "city not found: Zurigo")
- **Smart skip:** If entity already has city_id and changed_columns doesn't include location fields → skip

### 1b. validate-links

- **Input:** URLs from entity's website, source_url fields
- **Action:** HTTP HEAD request, follow redirects, check status
- **Output:** Updates link_status field (valid/broken/redirect)
- **Failure:** Retry 3x with backoff, then mark as broken
- **Smart skip:** If no URL fields changed → skip

### 1c. populate-embedding

- **Input:** Text content (name + description + tags)
- **Action:** Generate embedding via CF Workers AI BGE-base-en-v1.5 (768d)
- **Output:** Row in content_embeddings table
- **Failure:** Retry 2x, then skip (non-critical)
- **Smart skip:** If only non-text fields changed (e.g. coordinates) → skip

### 1d. dedupe-recheck (NEW)

- **Input:** entity_type + entity_id
- **Action:** Check against all existing entities using:
  - Strong match: normalized(name) + normalized(city) + domain
  - Address match: normalized address + Jaro-Winkler name (0.8 threshold)
  - Fuzzy match: Jaro-Winkler name (0.85 threshold) + same city
- **Output:** Sets duplicate_of_id if match found, or null
- **Failure:** Non-critical, skip on error
- **Why new:** Currently only the Node orchestrator dedupes within its own batch. Email ingest, fetch-news, and manual entries bypass deduplication entirely.

### Completion Tracking

Each consumer writes a completion message:
```json
{
  "entity_type": "venues",
  "entity_id": "uuid",
  "step": "geo-link",
  "status": "done|failed|skipped",
  "duration_ms": 145
}
```

The workflow-dispatcher waits for all Stage 1 steps to complete before advancing to Stage 2.

---

## Stage 2 — Derived Data

Runs after Stage 1 completion.

### 2a. quality-score

Computes a completeness/quality score (0-100) per entity.

**Venue scoring:**

| Check | Points |
|-------|--------|
| Name present | +15 |
| Coordinates present | +15 |
| City linked (geo-link OK) | +10 |
| Country linked | +5 |
| Category set | +10 |
| Website URL valid | +10 |
| At least 1 photo | +10 |
| Description > 50 chars | +10 |
| Embedding present | +5 |
| No duplicate flag | +10 |
| **Total** | **100** |

**Event scoring:**

| Check | Points |
|-------|--------|
| Title present | +15 |
| Start date set | +15 |
| City linked | +10 |
| Country linked | +5 |
| Venue linked | +10 |
| Description present | +10 |
| Website URL valid | +10 |
| Embedding present | +5 |
| Category set | +10 |
| No duplicate flag | +10 |
| **Total** | **100** |

**News scoring:**

| Check | Points |
|-------|--------|
| Title present | +15 |
| Content > 100 chars | +15 |
| Source linked | +10 |
| City/Country linked | +15 |
| Featured image | +10 |
| URL valid | +10 |
| Embedding present | +10 |
| No duplicate flag | +15 |
| **Total** | **100** |

**Personality scoring:**

| Check | Points |
|-------|--------|
| Name present | +15 |
| Birth date set | +10 |
| City linked | +10 |
| Country linked | +10 |
| Profession set | +10 |
| LGBTI connection described | +15 |
| Photo present | +10 |
| Embedding present | +10 |
| No duplicate flag | +10 |
| **Total** | **100** |

### 2b. tag-similarity-update (incremental)

- **Trigger:** New or updated tag embedding
- **Action:** Compute cosine similarity only between the changed tag and all existing tags
- **Output:** Upsert rows in tag_relationships for the affected tag
- **Replaces:** Full matrix recompute in compute_tag_similarities()

---

## Stage 3 — Search Index (Quality Gate)

| Threshold | Action |
|-----------|--------|
| `quality_score >= 40` | tsvector columns updated, entity becomes searchable |
| `quality_score < 40` | Entity stays in DB but excluded from search. `needs_attention = true` |
| `quality_score >= 80` | Eligible for `featured` placement |

This prevents incomplete entries (e.g. venue without city and coordinates) from degrading search results.

---

## Stage 4 — Automated Review

| Check | Trigger | Action |
|-------|---------|--------|
| Anomaly detection | Score dropped on update | Flag for manual review |
| Duplicate candidates | dedupe-recheck found match | Add to review queue |
| Stale content | Event date in the past | Mark as expired |
| Broken sources | > 3 broken links from same source | Flag source for investigation |

Output: Rows in `review_queue` table, surfaced in CMS dashboard.

---

## Stage 5 — Feedback Loops

| Situation | Reaction |
|-----------|----------|
| geo-link fails | `enrichment_status.geo_link = "failed"` + reason. Manual edit triggers retry |
| Embedding fails | Retry after 1h (pgmq set_vt). After 3 failures → dead_letter |
| quality_score < 40 after 24h | CMS notification: "X new entities need attention" |
| Duplicate confirmed (manual) | Merge logic: Entity B merged into A, redirects set |
| Duplicate rejected (manual) | Clear duplicate_of_id, add to dedupe exclusion list |

---

## Database Changes

### New columns on venues, events, personalities, news_articles

```sql
ALTER TABLE venues ADD COLUMN quality_score SMALLINT DEFAULT 0;
ALTER TABLE venues ADD COLUMN needs_attention BOOLEAN DEFAULT false;
ALTER TABLE venues ADD COLUMN duplicate_of_id UUID REFERENCES venues(id);
ALTER TABLE venues ADD COLUMN enrichment_status JSONB DEFAULT '{}';
-- enrichment_status example:
-- {"geo_link": "done", "embedding": "pending", "links": "failed", "dedupe": "done"}

-- Same for events, personalities, news_articles
```

### New table: enrichment_log

```sql
CREATE TABLE enrichment_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  step TEXT NOT NULL,        -- 'geo-link', 'embedding', 'validate-links', 'dedupe', 'quality-score'
  status TEXT NOT NULL,      -- 'done', 'failed', 'skipped'
  error_message TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_enrichment_log_entity ON enrichment_log(entity_type, entity_id);
CREATE INDEX idx_enrichment_log_step_status ON enrichment_log(step, status);
CREATE INDEX idx_enrichment_log_created ON enrichment_log(created_at);
```

### New table: review_queue

```sql
CREATE TABLE review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  review_type TEXT NOT NULL,  -- 'duplicate', 'low_quality', 'anomaly', 'stale', 'broken_source'
  details JSONB DEFAULT '{}',
  status TEXT DEFAULT 'pending',  -- 'pending', 'resolved', 'dismissed'
  resolved_by UUID REFERENCES profiles(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_review_queue_status ON review_queue(status) WHERE status = 'pending';
```

---

## What Changes for Existing Functions

| Function | Today | After |
|----------|-------|-------|
| geo-link-content | Hourly cron, batch all types | pgmq consumer, single entities. Hourly cron kept as catch-up safety net |
| validate-links | Weekly full scan | pgmq consumer for new URLs + weekly full scan stays |
| populate-embeddings | Manual/batch | pgmq consumer, single entities |
| compute_tag_similarities | Manual full recompute | Incremental after new embedding via tag-similarity-update |
| run-automated-reviews | Daily cron blind | pgmq consumer after quality-score, targeted |
| workflow-dispatcher | Phase 0 unused | Central orchestration backbone for all stages |
| fetch-news | Insert without follow-up | No change — DB trigger starts pipeline automatically |
| Orchestrator (Node) | Own dedupe only | Keeps own dedupe + DB trigger starts post-ingest pipeline |
| Email Ingest | Manual geo-link trigger | No change — DB trigger starts pipeline automatically |

---

## Smart Routing (Avoiding Redundant Work)

The DB trigger includes `changed_columns` for UPDATE operations. The workflow-dispatcher uses this to skip irrelevant steps:

| Changed columns | Skip |
|----------------|------|
| Only coordinates/address | Skip embedding, keep geo-link |
| Only description/name | Skip geo-link, re-run embedding |
| Only website URL | Skip geo-link + embedding, run validate-links |
| Only photo/image fields | Skip all except quality-score recalc |
| Only quality_score itself | Skip everything (prevent loops) |

The trigger must also guard against infinite loops: enrichment steps that UPDATE the entity (setting city_id, quality_score, etc.) must not re-trigger the pipeline. Solution: check `changed_columns` — if only enrichment-managed columns changed, don't enqueue.

### Enrichment-managed columns (excluded from trigger)

```
city_id, country_id, quality_score, needs_attention, duplicate_of_id,
enrichment_status, geo_linked_at, link_status
```

---

## Implementation Phases

| Phase | Scope | Depends on |
|-------|-------|-----------|
| **1** | DB trigger + enrichment_queue + quality_score/enrichment_status columns + enrichment_log table | — |
| **2** | geo-link as pgmq consumer (single-entity mode) | Phase 1 |
| **3** | populate-embedding as pgmq consumer | Phase 1 |
| **4** | quality-score calculation as own step | Phase 2 + 3 |
| **5** | Search index quality gate (tsvector only at score >= 40) | Phase 4 |
| **6** | validate-links as pgmq consumer (new URLs) | Phase 1 |
| **7** | dedupe-recheck as new consumer | Phase 1 + 3 (needs embeddings) |
| **8** | enrichment_log + review_queue + CMS dashboard | Phase 4 |
| **9** | Feedback loops (retry, notifications, manual merge) | Phase 8 |

Phases 2, 3, and 6 can run in parallel. Phase 4 requires 2+3. Phase 7 requires 3.

---

## Observability

### enrichment_log queries

```sql
-- Average duration per step (last 24h)
SELECT step, AVG(duration_ms), COUNT(*) FILTER (WHERE status = 'failed')
FROM enrichment_log WHERE created_at > now() - interval '24h'
GROUP BY step;

-- Entities stuck in pipeline (started but not completed all steps)
SELECT entity_type, entity_id, enrichment_status
FROM venues WHERE enrichment_status != '{}'
AND NOT (enrichment_status ?& array['geo_link','embedding','links','dedupe','quality_score']);

-- Dead letter queue depth
SELECT * FROM pgmq.metrics('dead_letter');
```

### CMS Dashboard widgets

- Pipeline health: messages/hour, avg latency, failure rate per step
- Quality distribution: histogram of quality_score across entity types
- Review queue: pending items by type
- Enrichment coverage: % of entities with all steps completed
