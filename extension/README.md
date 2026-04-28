# queer.guide capture — Chrome Extension

Captures venues, events, hotels, marketplace items, and news from any
webpage and submits them as structured suggestions to queer.guide. Items
flow through the same `ingestion_staging → normalize → dedupe → quality →
review → commit` pipeline that the scraper uses; nothing goes live without
moderator approval.

## Architecture

```
[Chrome Extension MV3]
  ├── content/extract.ts     — runs in page context, returns DetectedItem[]
  ├── content/selection.ts   — manual mode (mouseup → text + nearest block)
  ├── background/index.ts    — message bus, OAuth/magic-link callback
  ├── popup/                 — React 19 UI
  └── shared/
        extractors/          — jsonld → microdata → opengraph → dom heuristics
        auth.ts              — minimal Supabase Auth client (chrome.storage)
        api.ts               — submit / status against worker-submit
        types.ts             — DetectedItem contract
```

The shared layer is provider-agnostic so the same code can run inside the
extension *and* in any other browser surface (web app, devtools panel)
without modification.

## Build & install (developer mode)

```bash
cd extension
npm install
VITE_SUBMIT_API=https://submit.queer.guide \
VITE_SUPABASE_URL=https://<project>.supabase.co \
VITE_SUPABASE_ANON_KEY=<anon> \
npm run build
```

In `chrome://extensions`:

1. Enable Developer mode.
2. "Load unpacked" → `extension/dist`.

The toolbar icon opens the popup; clicking it on any page triggers
extraction. No `<all_urls>` permission is requested — extraction only runs
on the active tab via `chrome.scripting.executeScript`.

## Tests

```bash
npm test
```

Vitest + happy-dom against fixture HTML. Covers JSON-LD type mapping
(Event / Restaurant / Hotel / Product / NewsArticle), OpenGraph fallback,
the merge precedence (jsonld > microdata > opengraph > dom), and the
"never copy article body" rule for news.

## Permissions and privacy

- Requested permissions: `activeTab`, `scripting`, `storage`. **No host
  permissions**.
- Extraction runs only on user click. The extension does not observe
  background tabs and does not phone home unless you submit an item.
- Submitted items include the page URL, your `auth.users.id`, and the
  fields you reviewed in the popup. They land in `ingestion_staging` with
  `source_type='user_submission'`.
- `articleBody` from `NewsArticle` JSON-LD is **never** copied; only the
  headline, summary/description, author, and publish date plus the source
  URL are transmitted, mitigating obvious copyright issues.

## Server side

- `workers/submit/` — Cloudflare Worker that verifies the user JWT, rate
  limits per user, and inserts into `ingestion_staging` via Supabase REST
  with the service-role key. Hash algorithm matches
  [scraper/src/db/staging-publisher.ts](../scraper/src/db/staging-publisher.ts)
  so user submissions and scraper rows can dedupe against each other.
- Migration: [Dev/src/db/migrations/002_user_submissions.sql](../Dev/src/db/migrations/002_user_submissions.sql)
  — adds `submitted_by_user_id`, `submission_url`, `submission_notes`,
  `submission_client` to `ingestion_staging` plus an RLS policy that lets
  authenticated users read only their own submissions.

## Known gaps / follow-ups

- **Web auth UI**: this checkout does not include the React frontend
  (`src` is gitignored / external). The popup currently asks the
  user to paste the magic-link code from the redirect page. Once the web
  app's auth-callback page can `chrome.runtime.sendMessage` (via
  `externally_connectable`), the manual paste step disappears.
- **Admin moderation tab**: planned at `/admin/pipelines?tab=user-submissions`
  in the web app; lives outside this checkout.
- **Image fetch & license check**: extension only sends image URLs;
  `pipeline-fetch-media` (server-side) is not yet implemented and is the
  next planned milestone.
- **Auto-import / watchlist**: deferred per plan, schema already supports
  it via the same `source_type='user_submission'` pathway.
