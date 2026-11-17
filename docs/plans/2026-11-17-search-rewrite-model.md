# Faster search rewriting

Replace Gemma with `@cf/meta/llama-3.3-70b-instruct-fp8-fast` for search rewriting.
Cloudflare's live model catalog listed this exact model with no planned
deprecation date on 2026-11-17. It is distinct from the retiring Llama 3.1 FP8
and Llama 3.2 models. Submit and agentic-inbox keep their existing models.

## Matched evaluation

Six unchanged queries, five rounds each, randomized sequential model order:
`schwule bars in Zürich`, `bars lesbiens à Paris`, `eventos queer en Madrid`,
`Heldenbar`, `trans community in Berlin`, `queere Veranstaltungen in Basel`.
Both models received the same final prompt, temperature 0.1 and 120-token cap;
Gemma thinking was disabled. Direct Workers AI REST requests bypassed application
KV and AI Gateway caches. All 60 samples were retained; elapsed times include
client/network overhead.

| Model | Median | Mean | Sample p95 | Maximum | Over 5s |
| --- | ---: | ---: | ---: | ---: | ---: |
| Llama 3.3 Fast | 890.5ms | 1198.8ms | 2821.6ms | 3760.8ms | 0/30 |
| Gemma 4 | 1108.8ms | 1532.0ms | 3088.2ms | 10370.5ms | 1/30 |

Llama's aggregate median was 19.7% lower; it won 18/30 individual pairs and
five of six per-query medians. This is a bounded inference benchmark, not a
claim that every request or total search latency improves by that amount.
Both models passed 30/30 schema and semantic checks with the final prompt:
English translation, query intent, explicit city extraction (accent-insensitive),
unchanged `heldenbar` with no guessed city, and null community type hint.
Synonyms were reviewed for relevance. Six native Workers AI binding checks
through the actual `rewriteQuery` function also passed, taking 677–1007ms.

Screening rejected Qwen 3.8, Granite Micro and Scout for latency, and Mistral 7B
for incompatible output types; Mistral Small also inferred an unmentioned city.
Llama initially guessed a city for Heldenbar, so the final prompt explicitly
preserves names, forbids inferred locations and avoids classifying general
community searches as venues. Both finalists used those instructions in the
matched evaluation.

## Implementation and validation

Keep the existing dual response parser, literal keyword search arm, 120-token
cap, five-second hard deadline, and 300/1200ms response-path rewrite budgets.
Remove Gemma-specific thinking options. Include the model and prompt version
in rewrite KV keys so old cached output cannot mask this migration. Gateway
caching is already model-specific.

Validation: 180 search-proxy tests, TypeScript check, Wrangler dry-run, 30 matched
quality samples, and six native binding calls. The cache regression test proves
old unversioned entries cannot satisfy a new-model request.

Sources:
- https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/
- https://developers.cloudflare.com/changelog/post/2026-11-05-planned-model-deprecations/
