# queer-guide extract worker

Self-hosted [deepcrawl](https://github.com/lumpinif/deepcrawl) extraction service.
Fetches a URL server-side and returns **cleaned markdown + metadata + a same-origin
links list**. Internal infra — callers (Supabase edge functions, the submit worker,
the scraper) authenticate with `X-Internal-Secret`; end users never hit it.

## API

```
POST /extract
  X-Internal-Secret: <secret>
  { "url": "https://…", "render": false, "crawl": false }
→ { url, finalUrl, markdown, meta:{title,description,lang,author,publishedAt,image},
    links?:{flat,external}, method:"fetch", contentMethod, charCount }

GET /health → { ok: true }
```

- `crawl:true` adds `links` — same-origin candidate pages (`flat`, capped 200) for
  discovery, plus `external`.
- `render:true` is **Phase 4** (Cloudflare Browser Rendering for SPAs) — currently 501.

Guards: SSRF (private/loopback/link-local hosts blocked, re-checked post-redirect),
3 MB HTML cap, 8 s fetch timeout, html/xml content-type only.

## How it works

Reproduces deepcrawl v0's read pipeline (cheerio main-content → `node-html-markdown`
→ deepcrawl post-processors) without its `@deepcrawl/*` workspace web. See
[`src/deepcrawl/VENDORED.md`](src/deepcrawl/VENDORED.md).

## Dev / deploy

```
cp .dev.vars.example .dev.vars   # set INTERNAL_SECRET
npm install
npm test                          # unit tests (clean + ssrf)
npm run dev                       # wrangler dev
npm run deploy                    # wrangler deploy
wrangler secret put INTERNAL_SECRET   # = Supabase INTERNAL_INVOKE_SECRET
```

After deploy, set `EXTRACT_WORKER_URL` (e.g. `https://extract.queer.guide`) on the
Supabase edge functions so `_shared/extract-client.ts` can reach it. Until that
secret is set, callers fall back to their local extractors — no regression.
