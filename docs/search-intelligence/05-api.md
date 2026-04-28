# API — `search-intelligence` edge function

All routes under `/functions/v1/search-intelligence/<path>`. Auth: `Authorization: Bearer <user JWT>`; `requireAdmin` enforces admin role. CORS allowlist is the standard `getCorsHeaders(req)`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET    | `/health`                                       | Heartbeat (no admin required) |
| GET    | `/indexes`                                      | List Meili indexes + DB row counts |
| GET    | `/indexes/:name/stats`                          | numberOfDocuments, fieldDistribution, isIndexing |
| GET    | `/indexes/:name/settings?source=desired|applied`| Desired (DB) or applied (Meili) settings |
| PATCH  | `/indexes/:name/settings`                       | Persist new desired settings, optionally apply |
| GET    | `/indexes/:name/settings/versions`              | Version history |
| POST   | `/indexes/:name/settings/rollback`              | Roll back to a version |
| POST   | `/search-debug`                                 | Forward query to Meili w/ admin key, return raw + ranking trace |
| GET    | `/synonyms`                                     | List synonyms with filters |
| POST   | `/synonyms`                                     | Create a synonym (status defaults to `pending`) |
| PATCH  | `/synonyms/:id`                                 | Update / approve / reject |
| DELETE | `/synonyms/:id`                                 | Soft-archive |
| POST   | `/synonyms/sync`                                | Project active synonyms into Meili settings.synonyms |
| POST   | `/reindex`                                      | Start a reindex job |
| GET    | `/reindex/:jobId`                               | Job progress |
| GET    | `/tasks/:taskUid`                               | Meilisearch task pass-through |
| GET    | `/audit?actor=&action=&resource=&limit=`        | Audit log query |
| POST   | `/consistency-check`                            | Compare DB rows vs. Meili documents per type |
| GET    | `/visibility/:entity_type/:id`                  | Read or recompute visibility score |
| POST   | `/visibility/:entity_type/:id/recompute`        | Force recompute |

## Response envelope

```jsonc
{
  "success": true,
  "data": { ... },
  "meta": {
    "request_id": "uuid",
    "duration_ms": 42
  }
}
```

Errors:

```jsonc
{ "success": false, "error": "human message", "code": "string" }
```

## Auth & rate limiting

- `requireAdmin` enforces admin role (same helper as other functions).
- Service-role tokens are also accepted (matching project convention) so internal cron jobs can hit `/reindex`.
- Rate limit (Phase 1+): 60 admin writes / minute / actor.

## Selected schemas

### `POST /synonyms`

```jsonc
{
  "terms":         ["queer bar", "queer pub"],
  "replacements":  ["gay bar"],
  "locale":        "en",
  "indexes":       ["venues"],
  "is_one_way":    true,
  "tag_id":        null,
  "notes":         "spotted in zero-hit query log",
  "source":        "manual"
}
```

Returns the created row. Status defaults to `pending`. Approval (`PATCH` with `{ status: 'active' }`) is the moment Meili is notified — that PATCH triggers `/synonyms/sync` on the affected indexes.

### `POST /search-debug`

```jsonc
{
  "index": "venues",
  "query": "gay bar berlin",
  "filter": "country = 'DE'",
  "limit":  20,
  "showRankingScore": true,
  "showRankingScoreDetails": true,
  "matchingStrategy": "all"
}
```

Returns the raw Meilisearch response plus a `summary` block:

```jsonc
"summary": {
  "hits":            12,
  "processingTimeMs": 6,
  "rankingRules":    ["words","typo","proximity","attribute","sort","exactness"],
  "topMatches":      [{ "id": "...", "score": 0.91, "matchedAttributes": [...] }]
}
```

### `POST /reindex`

```jsonc
{
  "index":   "venues",
  "scope":   { "full": true },
  "confirm": true
}
```

Returns `{ "jobId": "uuid" }`. Poll `GET /reindex/:jobId`.

### `POST /consistency-check`

```jsonc
{ "type": "venues", "limit": 50 }
```

Returns:

```jsonc
{
  "type": "venues",
  "db_rows": 1342,
  "meili_docs": 1339,
  "missing_in_meili": ["uuid", "uuid", "uuid"],
  "orphans_in_meili": [],
  "stale_docs": []
}
```

`stale_docs` is computed from `entity.updated_at > meili_doc.updated_at`, when both are present.

## Examples

```bash
# Approve a pending synonym, which also pushes to Meili
curl -X PATCH https://<project>.functions.supabase.co/search-intelligence/synonyms/<id> \
  -H "Authorization: Bearer $JWT" \
  -H "content-type: application/json" \
  -d '{ "status": "active" }'

# Inspect drift
curl https://<project>.functions.supabase.co/search-intelligence/indexes/venues/settings?source=desired \
  -H "Authorization: Bearer $JWT" | jq

curl https://<project>.functions.supabase.co/search-intelligence/indexes/venues/settings?source=applied \
  -H "Authorization: Bearer $JWT" | jq
```
