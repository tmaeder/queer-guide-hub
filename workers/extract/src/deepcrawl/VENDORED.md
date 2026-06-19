# Vendored from deepcrawl

Upstream: https://github.com/lumpinif/deepcrawl
Pinned commit: `cb4817bac2b3c5a2d9bd8e0c05061fcc43afde97`
License: MIT (see upstream `LICENSE`)

## What is vendored

deepcrawl is a monorepo whose extraction services live under
`apps/workers/v0/src/services/` (`scrape`, `markdown`, `metadata`, `link`,
`html-cleaning`). Those services are wired into the repo's oRPC / D1 / better-auth
/ `@deepcrawl/*` workspace web, which we do **not** want — we need only the
extraction contract: **fetch a URL → cleaned markdown + metadata + links tree**.

So we reproduce deepcrawl v0's *read pipeline* in a single standalone Cloudflare
Worker (`workers/extract/`) using the **same library stack** it uses:

- `cheerio` — DOM load + main-content isolation + metadata (deepcrawl `scrape.service.ts`)
- `node-html-markdown` (`NodeHtmlMarkdown.translate`) — HTML → markdown (deepcrawl `read.processor.ts`)
- markdown post-processors — `markdown-helpers.ts` here is lifted **verbatim** from
  deepcrawl `apps/workers/v0/src/services/markdown/markdown-helpers.ts`
  (`processMultiLineLinks`, `removeSkipToContentLinks`).

Main-content selection (`<article>` → `<main>` → densest `<p>` cluster) is adapted
from this repo's existing `supabase/functions/_shared/news-quality/extract.ts` so
the markdown body and the legacy plain-text fallback agree on what "the content" is.

deepcrawl's `@paoramen/cheer-reader` (a JSR Readability port) is intentionally **not**
pulled in — it needs JSR-registry npm config and duplicates the cheerio main-content
step we already do. Swappable later if its output proves materially better.

## Updating

deepcrawl is flagged upstream as unstable / not-production-ready. Do **not** track
`main`. To bump: review the diff of the four services above at a new commit, update
this file's pinned SHA, and re-run `workers/extract/tests`.
