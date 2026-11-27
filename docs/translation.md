# Self-hosted machine translation

Venue, event and organization text is translated into the site's 10 non-English
locales by **TranslateGemma 4B running on the home NAS** ("Brokkoli", UGREEN
DXP4800, Intel N100). No content goes to a third-party translation service.
Translations are async: no page ever waits for the NAS.

## What gets translated

| Table | Field | Column the frontend reads |
|---|---|---|
| `venues` | `description` | `description_i18n` |
| `events` (upcoming only) | `title`, `description` | `title_i18n`, `description_i18n` |
| `organizations` | `description` | `description_i18n` |

Target locales: `de fr es it pt ru zh ja ko ar` (`public.translation_locales()`,
mirrors `src/i18n/languages.ts`). Venue/organization **names** are never
translated (masked, see below). Accessibility notes are deliberately out of
scope: a mistranslated negative ("not step-free") is real-world harm.

## Architecture

```
reader on /de/venues/x ──(no translation yet)──► request_translation()  ─┐
admin/pipeline edits description ──► trg_zz_translation_source ─────────┤
operator ──► enqueue_translation_backfill() ────────────────────────────┤
                                                                         ▼
                                                    public.translation_jobs (queue)
                                                                         │ claim_translation_jobs()  (FOR UPDATE SKIP LOCKED)
   NAS ── worker (Node) ── llm (llama.cpp + TranslateGemma) ◄────────────┘
                 │ commit_translation()
                 ▼
   content_translations (ledger: hash, source lang, model, status)
   <field>_i18n jsonb on the row  ──►  localizedField() / <MachineTranslatedText>
```

- **Demand-driven.** The NAS can do roughly 220k source tokens/day; new venues
  plus upcoming events arrive at ~55k tokens/day × 10 locales (measured
  2026-11-21), about 2.5× its capacity. So nothing is enqueued just because a
  row was written. Jobs come from (priority in brackets):
  1. `request_translation(entity_type, id, locale)` [100, +1 per repeat view,
     max 1000]. Called by `src/hooks/useRequestTranslation.ts` when a
     non-English reader sees an original. Anon-callable, idempotent, crawlers
     skipped client-side, mirrors the table's visibility (safety-gated and
     cruising venues only for signed-in users; upcoming events only).
  2. The source-change trigger [90]: when a translated field's source text
     changes it clears that field's `*_i18n` map (readers fall back to the new
     original at once), marks ledger rows `stale`, and re-queues **only** the
     locales that had a translation.
  3. `enqueue_translation_backfill()` [10 by default], operator only.
- **Read path.** Unchanged from before: rows carry `*_i18n` maps, fetched with
  the row (`select *`), resolved by `localizedField()`
  (`src/lib/localizeContent.ts`). Translations are therefore governed by the
  row's own RLS; `content_translations` and `translation_jobs` are not
  readable by anon. `<MachineTranslatedText>` adds the "Machine-translated ·
  Show original" toggle.
- **Caching.** Locales are distinct URLs (`/de/venues/x`), and content is
  fetched client-side from Supabase, so no cache key can mix languages.
  Crawler HTML (`functions/_lib/detail.ts`) still serves the original text in
  every locale; translating crawler output is a separate decision.
- **Race safety.** The worker gets the current source text and its sha256 at
  claim time; `commit_translation()` rejects the result if the source changed
  meanwhile (`stale`) and never overwrites a `human_reviewed` translation of the
  same source.

The old LLM pipeline (`translate-i18n-batch` → NVIDIA free tier / Cloudflare
Workers AI) is **disabled for these fields** (`i18n_translation_targets.enabled
= false`). Its earlier output was kept and is replaced the next time the source
changes. It still runs for other tables (cities, countries, hotels, tags,
news titles, personalities, marketplace, villages).

## On the NAS

| What | Where |
|---|---|
| Compose project | `/volume1/docker/translator/docker-compose.yml` (copy of `services/translator-worker/docker-compose.nas.yml`) |
| Worker source | `/volume1/docker/translator/worker/` (copy of `services/translator-worker/`) |
| Secrets | `/volume1/docker/translator/.env`, `chmod 600` (template: `.env.example`) |
| Model | `/volume2/translator/models/translategemma-4b-it.Q4_K_M.gguf` (NVMe pool, no redundancy, re-downloadable) |

- `llm`: `ghcr.io/ggml-org/llama.cpp:server-b12429` pinned by digest, `-c 2048
  -t 2 --parallel 1 --load-mode none`, `cpus: 3`, `mem_limit: 4g`,
  `memswap_limit: 4g`, `oom_score_adj: 1000`, healthcheck `/health`. Only on
  the internal network `translator_net`: no published ports, no internet.
  Why each of those, all measured on 2026-11-21:
  - **No swap, no mmap.** Every generated token reads all weights. With mmap
    the NAS's page-cache churn (UGOS indexing, a 100 GB Photon import) evicted
    them; with swap allowed, 214 MB of weights sat in swap. Either way it fell
    from ~4 to ~0.2 tokens/s. `--load-mode none` (this build's `--no-mmap`)
    plus `memswap_limit = mem_limit` keeps ~2.8 GB pinned in RAM.
  - **`oom_score_adj: 1000`.** That RAM can no longer be reclaimed, so under
    memory pressure `llm` is the process the kernel kills first (and Docker
    restarts), never Home Assistant.
  - **2 threads.** llama.cpp's threads synchronise every step, so one thread
    descheduled by other work stalls them all: with a CPU-heavy neighbour,
    3 threads gave 0.37 tok/s, 2 gave 1.4, 1 gave 1.84. On a quiet NAS 3
    threads reach ~4–5. Change `-t` if the NAS's normal load changes.
- `worker`: `node:24` image, `cpus: 0.5`, `mem_limit: 256m`, read-only root,
  no capabilities. On `translator_net` (to reach `llm`) and `translator_egress`
  (outbound HTTPS to Supabase). No inbound ports, no tunnel.
- The worker waits while the NAS has less than `MIN_MEM_AVAILABLE_MB` (3 GB)
  available, and during `QUIET_HOURS` only takes jobs with priority ≥
  `QUIET_MIN_PRIORITY` (demand), leaving backfill for the night.

All commands below run on the NAS (`ssh nas`) in `/volume1/docker/translator`.
`docker` needs `sudo -n` (see `/etc/sudoers.d/claude-docker`).

### Deploy / update the worker

```sh
# from the repo checkout on the Mac
tar --no-xattrs -C services/translator-worker -czf - --exclude node_modules --exclude test --exclude .env . \
  | ssh nas 'rm -rf /volume1/docker/translator/worker && mkdir -p /volume1/docker/translator/worker && tar -C /volume1/docker/translator/worker -xzf -'
ssh nas 'cat > /volume1/docker/translator/docker-compose.yml' < services/translator-worker/docker-compose.nas.yml
ssh nas 'cd /volume1/docker/translator && sudo -n docker compose -p translator up -d --build'
```

(`scp` into `/volume1/docker` fails on UGOS; pipe over `ssh` instead.)

### Restart

```sh
sudo -n docker compose -p translator restart worker   # or llm
sudo -n docker compose -p translator stop              # stop both
```

A job interrupted mid-translation stays `running` and is reclaimed after 30 min.

### Upgrade the model server or the model

1. Pick a `server-bNNNNN` tag from `ghcr.io/ggml-org/llama.cpp`, pull it, and
   read its digest: `sudo -n docker inspect --format '{{index .RepoDigests 0}}' <image>`.
2. Put tag **and** digest in `docker-compose.nas.yml`, copy it to the NAS,
   `up -d llm`, wait for `healthy`.
3. New model file: download into `/volume2/translator/models/`, check the
   sha256 against the Hugging Face file listing, change `-m` and `MODEL_NAME`.
   The worker never hard-codes the prompt: it calls llama.cpp's
   `/apply-template`, which renders the chat template stored in the GGUF.

### Backfill

Enqueues untranslated rows at low priority (default 10, below every demand
job). Venues go best `quality_score` first, events soonest first, orgs newest.

```sh
sudo -n docker compose -p translator run --rm worker node src/main.ts backfill --entity venues --locales de,fr,es --limit 500
```

Capacity guide (measured median, 4.1 tokens/s generation): a ~470-character
description takes ~50 s per language. All live venues + upcoming events + orgs
in 10 languages ≈ 75 days at 24/7, so backfill in slices.

### What's failing?

```sh
sudo -n docker compose -p translator logs --tail 100 worker   # JSON lines, no content
sudo -n docker compose -p translator run --rm worker node src/main.ts status
```

`status` prints `translation_queue_signals()`: pending, running, failed/done in
the last 24 h, oldest pending, last success, top error codes. Error codes:

| Code | Meaning | Retried? |
|---|---|---|
| `llm_unavailable`, `llm_http_5xx` | model server down or busy | yes, backoff 5/10/20 min |
| `token_lost` | a masked span (URL, email, markup, name) did not survive, even after one retry | no |
| `glossary_miss` | a do-not-translate term or a glossary term's fixed form is missing from the output | no (fails at once) |
| `truncated` | output hit the token limit | no |
| `length_ratio`, `wrong_language`, `untranslated`, `template_leak`, `empty_output` | output failed a sanity check | no |
| `worker_error` | unexpected exception (logged with a short message) | yes |
| `abandoned` | worker died mid-job; reclaimed | yes, up to 3 attempts |

A failed job is not re-requested for the same source text, so a page view does
not loop it; editing the text gives it a new chance. Failed jobs are pruned
after 30 days, done jobs after 7.

## Glossary and masking

`services/translator-worker/glossary.json`:

- `doNotTranslate`: exact, case-sensitive terms that must appear verbatim in
  the output (e.g. `LGBTQIA+`, `PrEP`, `Bear`).
- `terms`: matched case-insensitively as whole words in the source; the output
  must contain the fixed form for the target language. **Leave a language out**
  where a fixed word would break grammatical agreement (German *queer* →
  *queere Nacht*; French/Spanish *non-binaire/no binaria*): the model then
  translates that term freely. A trailing hyphen blocks a match
  (`trans-Atlantic`), a leading one does not (`anti-trans`).

Glossary terms are **validated after translation, not masked**. Measured on
TranslateGemma (2026-11-21): a placeholder standing in for a *word* ("the best
known `[[2]]` brand", "a `[[6]]` night") is dropped — `LGBTQIA+` vanished in
Japanese and Arabic, "Trans" in French — while the same words left in the text
come through. A miss fails the job with `glossary_miss` **without a retry**:
a sampled retry reproduced the same wording and once changed a fact (Friday →
Thursday), and the page showing the original is the safe outcome. What these
misses caught on 2026-11-21: Japanese dropping "queer", Arabic rendering a
"queer night" as "a night for young people", French turning "trans" into
"transgenres". Forms may list several accepted spellings (Japanese drag queen:
ドラァグクイーン / ドラッグクイーン / ドラグクイーン).

What **is** masked: URLs, emails, `{placeholders}`, HTML tags, inline code and
the venue/organization name. Each becomes an opaque `[[n]]` token that must
come back exactly once (these survived in every language tested); otherwise
the chunk is retried once, then the job fails with `token_lost`.

Edit the glossary, run `npm test` in `services/translator-worker`, redeploy the
worker.

## Adding a language

1. Add it to `src/i18n/languages.ts` (site) — the content pipeline follows the
   site's locales.
2. Add it to `public.translation_locales()` (migration) — the queue's CHECK and
   `request_translation()` use it.
3. If it uses a non-Latin script, add it to `SCRIPT` and `ratioBounds` in
   `services/translator-worker/src/text.ts` (output sanity checks).
4. Add glossary forms where they are invariant.
5. TranslateGemma must support it (its template lists ~1,000 codes, including
   regional ones like `de-CH`).

## Tests

- `services/translator-worker`: `npm test` — chunking, masking/restoring,
  output checks, quiet hours.
- `services/translator-worker`: `npm run test:db` — applies the migration to a
  throwaway Postgres 17 (Homebrew `postgresql@17`) and checks the queue, the
  trigger and the grants as anon, authenticated and service_role.
- `src/components/content/__tests__/MachineTranslatedText.test.tsx` — toggle,
  demand request, crawler and English skips.

## Benchmark (2026-11-21, NAS under normal load)

5 real venue descriptions (~470 chars) × 10 languages, temperature 0:

| | median | range |
|---|---|---|
| seconds per item | 50 | 33–193 |
| generation tokens/s | 4.1 | 1.2–5.1 |
| prompt tokens/s | 10.8 | 5.5–15.1 |

Peak `llm` RAM 3.8 GB; CPU package 59–79 °C; Home Assistant answered every
probe (worst 0.33 s). Quality: de/fr/es fluent with small errors; ja/ar made
factual slips (oysters → shrimp, "house music" → "calm music") — hence the
"Machine-translated · Show original" label on every translation.
