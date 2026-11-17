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
| Llama 3.3 Fast | 946.5ms | 1203.6ms | 2514.1ms | 4187.1ms | 0/30 |
| Gemma 4 | 1041.7ms | ≥3094.1ms | ≥16704.8ms | ≥30026.9ms | 3/30 |

Llama's aggregate median was 9.1% lower; it won 17/30 individual pairs and
five of six per-query medians. This is a bounded inference benchmark, not a
claim that every request or total search latency improves by that amount.
Llama passed 30/30 schema and semantic checks with the final prompt; Gemma
passed 29/30, with one request timing out after 30 seconds. All attempts were
retained; Gemma tail/mean values include the censored timeout lower bound. Checks:
English translation, query intent, explicit city extraction (accent-insensitive),
unchanged `heldenbar` with no guessed city, city retained in q_en, and null community type hint.
Synonyms were reviewed for relevance. Six native Workers AI binding checks
through the actual `rewriteQuery` function also passed, taking 701–2144ms.

Screening rejected Qwen 3.8, Granite Micro and Scout for latency, and Mistral 7B
for incompatible output types; Mistral Small also inferred an unmentioned city.
Llama initially guessed a city for Heldenbar, so the final prompt explicitly
preserves names, forbids inferred locations, retains explicit cities in q_en, and avoids classifying general
community searches as venues. Both finalists used those instructions in the
matched evaluation.

Production validation caught a geography omission in the first prompt: a city
field alone was insufficient to preserve Madrid vector recall. The final prompt
keeps it in q_en too, and the full matched benchmark was rerun with that prompt.

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
