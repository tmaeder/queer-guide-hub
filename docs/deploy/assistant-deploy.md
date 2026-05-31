# Assistant worker — deploy guide

How to deploy `workers/assistant` (the Phase 6 conversational concierge, running on
**Cloudflare Workers AI**). Companion to `docs/deploy/search-rollout.md`.

This must run from a **Cloudflare-authenticated environment** (your local machine
with cached `wrangler` auth, or any shell with a `CLOUDFLARE_API_TOKEN`). The
worker does inference on the `AI` binding — **no LLM API key needed**; the only
secrets are Supabase.

## Prerequisites

- A checkout of this repo, and `cd` into **`workers/assistant`** (running from the
  repo root or `~` gives `Required Worker name missing` — that error just means
  wrangler can't find this worker's `wrangler.toml`).
- Cloudflare auth: either cached (`wrangler login`, persists in `~/.wrangler`) or
  ```bash
  export CLOUDFLARE_API_TOKEN=<token>          # "Edit Cloudflare Workers" template
  export CLOUDFLARE_ACCOUNT_ID=7aa3765cc5f50f2b681b782eb4a8d296
  ```
  > `wrangler login` opens an interactive/browser flow and fails in shells that
  > can't spawn a pty (`forkpty: Device not configured`) — use a token instead.

## Deploy

```bash
cd workers/assistant
npm install                 # provides ./node_modules/.bin/wrangler (don't rely on a global one)
npx wrangler deploy
```

First deploy creates:
- the **`Conversation` Durable Object** (the `new_sqlite_classes` migration `v1`),
- the **`assistant.queer.guide`** custom-domain route.

> If the route fails (DNS/zone not set up), the Worker still uploads — add the
> custom domain in the Cloudflare dashboard (Workers → the worker → Settings →
> Domains & Routes), or temporarily comment out the `[[routes]]` block in
> `wrangler.toml` and test on the `*.workers.dev` URL.

## Secrets (non-interactive)

`wrangler secret put` reads the value from stdin; pipe it so it doesn't prompt:

```bash
printf '%s' 'https://xqeacpakadqfxjxjcewc.supabase.co' | npx wrangler secret put SUPABASE_URL
printf '%s' '<service-role-key>'                        | npx wrangler secret put SUPABASE_SERVICE_KEY
```

(`SUPABASE_SERVICE_KEY` is the **service-role** key — the tools call the
`search_documents` RPCs server-side.)

## Smoke test

```bash
curl -s -XPOST https://assistant.queer.guide/assistant \
  -H 'content-type: application/json' \
  -d '{"message":"wheelchair accessible gay bars in berlin"}' | jq .
```

Expected shape:
```json
{
  "conversation_id": "…",
  "reply": "…",
  "cards": [ { "objectID": "…", "type": "venue", "title": "…", "city": "Berlin", ... } ],
  "grounding_ok": true
}
```
- `cards` come **only** from tool results (grounding by construction). An empty
  `cards` with a vague `reply` usually means the model didn't call a tool — see tuning.
- `grounding_ok: false` (+ `unverified_refs`) means the prose mentioned a slug no
  tool returned — logged for monitoring; the cards remain authoritative.

Multi-turn: pass the returned `conversation_id` back to keep context.

## Model / prompt tuning

- `ROUTER_MODEL` (in `wrangler.toml`, default `@cf/meta/llama-3.3-70b-instruct-fp8-fast`)
  is the tool-calling model. Other tool-capable options:
  `@hf/nousresearch/hermes-2-pro-mistral-7b`, `@cf/meta/llama-3.1-8b-instruct-fast`.
  Override per-deploy: `npx wrangler deploy --var ROUTER_MODEL:@hf/nousresearch/hermes-2-pro-mistral-7b`.
- Open-model tool-calling is less disciplined than Claude's. If the model under-calls
  tools (answers from memory) or mis-formats `tool_calls`, try a different model first,
  then tighten `src/prompt.ts`. The grounding guard prevents invented entities
  regardless — worst case is a thin answer, not a wrong one.
- All `AI.run` calls route through the `qg-search` AI Gateway (`AI_GATEWAY_NAME`),
  so repeated prompts are cached and usage is observable there.

## Observe / debug

```bash
npx wrangler tail --format pretty        # live logs (tool errors, grounding warns)
```

## Cost

Workers AI is billed per "neuron"; the AI Gateway caches identical requests. The
Durable Object is per-conversation, lightweight (history only).
