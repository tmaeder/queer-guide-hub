# Folder Structure

Annotated top-level layout of the Queer Guide monorepo. For deeper architecture and the
pipeline topology, see [`../../CLAUDE.md`](../../CLAUDE.md); for entry points and hot/cold paths
see [`repo-map.md`](repo-map.md). Each major code directory has a `README.md` describing its
conventions.

```
queer-guide-hub/
├── src/                  # React 19 + Vite + TS SPA (frontend)        → src/README.md
│   ├── pages/            #   route-level screens
│   ├── components/       #   reusable UI (ui/ = shadcn primitives, design-locked)
│   ├── hooks/ lib/ utils/#   shared logic
│   ├── integrations/     #   Supabase client
│   └── i18n/ providers/ theme/ config/ routes.tsx
├── supabase/
│   ├── functions/        # Deno edge functions (canonical)            → supabase/functions/README.md
│   │   └── _shared/      #   cross-function helpers
│   ├── migrations/       # PostgreSQL migrations (immutable history)
│   └── config.toml       # per-function verify_jwt config
├── workers/              # Cloudflare Workers (8, deploy independently)→ workers/README.md
├── scraper/              # Node scraping pipeline (own package.json)   → scraper/README.md
├── extension/            # MV3 Chrome extension                        → extension/README.md
├── client-sdk/           # published client SDK surface
├── e2e/                  # Playwright specs
├── meilisearch/          # self-hosted search config                   → meilisearch/README.md
├── scripts/              # operator one-shots + CI helpers             → scripts/README.md
├── docs/                 # project docs (architecture/, a11y-audit/, design-system/, …)
├── infra/                # infrastructure config
└── functions/            # root-level functions (distinct from supabase/functions/)
```

## Conventions

- **One obvious home per concern:** frontend UI → `src/`; backend data plane → `supabase/functions/`;
  edge services → `workers/`; scraping → `scraper/`; one-shots → `scripts/`.
- **No junk-drawer folders.** There is no `misc/`, `tmp/`, or `helpers2/` — keep it that way; put
  new code in the matching feature/layer directory.
- **Tests co-locate** with the code they cover (`__tests__/` for frontend; `tests/` in `scraper/`;
  `e2e/` for end-to-end).
- **The live DB is authoritative** for what edge functions are scheduled/wired — repo migrations
  only seed cron + pipeline definitions.
