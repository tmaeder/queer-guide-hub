# Deploy runbook — extract worker (self-hosted deepcrawl)

All code for Phases 1–4 is committed on `claude/competent-noyce-4e4819` and verified
locally (worker: 10 tests + live smoke; submit: 20 tests; both tsc-clean). Nothing is
live yet — every caller falls back to its local extractor until the worker is
deployed **and** `EXTRACT_WORKER_URL` is set, so there is zero regression risk in the
intermediate state.

Deploy as one unit, in this order.

## 1. Provision the extract worker

Requires **Cloudflare Browser Rendering** enabled on account `7aa3765cc5f50f2b681b782eb4a8d296`
(the `[browser]` binding in `workers/extract/wrangler.toml`). If you want to ship
Phases 1–3 first without Browser Rendering, comment out the `[browser]` block and
deploy — `render:true` then returns 501 and only the SPA path (Phase 4) is dark.

```bash
cd workers/extract
npm install
npm test                       # 10 pass
npx wrangler deploy            # provisions extract.queer.guide (custom domain)
```

## 2. Wire the shared secret

The worker's `INTERNAL_SECRET` must equal Supabase's `INTERNAL_INVOKE_SECRET` (callers
send it as `X-Internal-Secret`). Get the existing value from the Supabase vault
(`vault.decrypted_secrets` where `name='internal_invoke_secret'`), then:

```bash
cd workers/extract
echo "<INTERNAL_INVOKE_SECRET value>" | npx wrangler secret put INTERNAL_SECRET
```

## 3. Point the edge functions + submit worker at the worker

```bash
# Edge functions (5) — used by extract-client.ts and source-crawl-seed:
supabase secrets set EXTRACT_WORKER_URL=https://extract.queer.guide \
  --project-ref xqeacpakadqfxjxjcewc
# (INTERNAL_INVOKE_SECRET already exists in the function env — extract-client reads it.)

# Submit worker — SPA /render fallback:
cd workers/submit
npx wrangler secret put EXTRACT_WORKER_URL   # https://extract.queer.guide
npx wrangler secret put INTERNAL_SECRET      # same value as step 2
```

## 4. Deploy the edge functions

Backward-compatible: `pipeline-extract-fulltext` defaults to `news_articles`, reads
`target_table` from node config, tries the worker then falls back to local.

```bash
for fn in pipeline-extract-fulltext pipeline-enrich-news pipeline-enrich-venue \
          pipeline-enrich-events source-crawl-seed; do
  supabase functions deploy "$fn" --project-ref xqeacpakadqfxjxjcewc
done
cd workers/submit && npx wrangler deploy
```

## 5. Apply migrations

Auto-apply on merge to `main` via CI `db push`. To apply early, use MCP
`apply_migration` with the **same version** as the committed file (CI then skips):

- `20260619180000_extract_worker_circuit_breakers.sql` — seeds `deepcrawl_extract` + `cf_browser_render`
- `20260619181000_extract_node_venue_event_dags.sql` — splices `extract` into venue + event DAGs
- `20260619182000_register_crawl_seed_node.sql` — registers the crawl-seed node type

> Ordering: deploy the updated `pipeline-extract-fulltext` (step 4) **before** the
> `20260619181000` DAG migration, or a venue/event run would invoke the old news-only
> function with a `target_table` it ignores.

## 6. Verify on production

```bash
# Worker reachable + gated
curl -s https://extract.queer.guide/health                     # {"ok":true}
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  https://extract.queer.guide/extract -d '{"url":"https://example.com"}'   # 401

# Full-text path (news): run the extract node dry, confirm markdown populated
#   POST pipeline-extract-fulltext { "dry_run": true, "batch_size": 5 }  (X-Internal-Secret)
#   → normalized_data.markdown present, extraction_meta.method = "worker:*"

# Discovery: POST source-crawl-seed { "seed_url":"https://…","target_table":"news_articles","dry_run":true }
#   → candidates > 0, staged > 0

# SPA submit fallback: POST submit.queer.guide/render { "url":"<a known SPA>" } with a user JWT
#   → previously-empty now returns an item sourced from markdown/meta

# Circuit-breaker fallback: stop the worker, run the extract node → falls back to
#   extractArticle(), api_circuit_breakers.deepcrawl_extract records a failure, content not blanked.
```

## Rollback

- Unset `EXTRACT_WORKER_URL` on the edge functions → instant fallback to local extractors.
- Remove the `extract` node from a DAG (re-point `normalize` → its old target) to stop website fetches in that pipeline.
- The worker is stateless; `wrangler delete` removes it cleanly.
