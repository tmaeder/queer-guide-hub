# queer-guide-assistant

Conversational concierge worker — **Phase 6 skeleton** of the search/assistant plan
(`docs/search-intelligence/meili-to-postgres-migration-plan.md`, §6).

A per-conversation **Durable Object** runs a **Claude tool-calling loop** (via the
`qg-search` **AI Gateway**) grounded in the `search_documents` Postgres RPCs. The
model can only reach real entities through tools, so the cards the UI renders come
from tool results — never from model prose (grounding by construction, plan §6.4).

## Endpoints

- `POST /assistant` — `{ message, conversation_id?, user_id?, session_id? }`
  → `{ conversation_id, reply, cards, grounding_ok, unverified_refs? }`
- `GET /health`

## Tools (grounded)

| Tool | RPC | Use |
|------|-----|-----|
| `search_entities` | `search_hybrid` | find / where / what-is |
| `get_recommendations` | `get_recommendations` | zero-query "what's good" |
| `find_related` | `related_entities` | "more like this" |

## Architecture

```
POST /assistant → Worker → Durable Object (Conversation, holds history)
                                │ Claude (ROUTER_MODEL) via AI Gateway
                                │ tool_use → executeTool → Supabase RPC → cards
                                └ loop (max 4 steps) → final text + grounded cards
```

## What's a skeleton here (follow-ups)

- **Non-streaming** tool loop. SSE streaming of tokens is a follow-up.
- **Single model** (`ROUTER_MODEL`, Haiku). The plan's tiered Haiku→Sonnet
  escalation for synthesis/trip-planning is wired in config (`SYNTH_MODEL`) but
  not yet used.
- **Keyword search only** in `search_entities` (`p_query_vec = null`); semantic
  blending needs a Workers-AI embedding round-trip.
- Personalization is a prompt hint only; deep bias-vector injection + `user_memory`
  (plan §6.3) are follow-ups.
- No `knowledge_search` tool yet (plan §7 / Phase 7, Cloudflare AI Search).

## Run / deploy

Needs secrets:

```
wrangler secret put ANTHROPIC_API_KEY     # proxied through the qg-search AI Gateway
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_KEY
```

```
npm install
npm run typecheck
npm test
wrangler deploy
```

Until deployed with those secrets the worker can't run end-to-end; the pure logic
(tools schema, grounding) is covered by unit tests.
