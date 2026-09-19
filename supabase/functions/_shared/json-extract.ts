// Pulling a JSON object out of an LLM completion, best-first.
//
// WHY THIS IS SHARED RATHER THAN A REGEX AT EACH CALL SITE.
//
//   Every reachable model on the NVIDIA tier is a reasoning model (CLAUDE.md,
//   "LLM provider chain"). Left alone they narrate around the answer, and even
//   with `chat_template_kwargs.thinking = false` they still sometimes fence the
//   object in ```json ... ``` or precede it with a sentence. A bare greedy
//   `/\{[\s\S]*\}/` spans from the FIRST '{' to the LAST '}', so any prose that
//   contains a brace — or a fenced block followed by a closing remark — makes
//   the captured span unparseable and the whole call reads as "no answer".
//
//   `ai-enrichment.ts` learned that and grew a three-stage extractor;
//   `news-quality/schema.ts` did not, and kept the bare greedy match. Measured
//   on prod 2026-09-19: of 547 SUCCESSFUL quality-judge completions (avg ~900
//   output tokens, only 2 truncated at the ceiling) just 268 produced a
//   decision — ~279 answers were thrown away at the parse step, and the 78
//   articles left stuck in /admin/inbox are what that looks like from the
//   outside. They were never undecidable: they are ordinary LGBTQ+ journalism
//   whose bodies sit at or above the prompt's 4,000-char cap, i.e. exactly the
//   calls whose replies are longest and most likely to be wrapped.
//
//   So the stages live in ONE module. Two copies of a rule like this drift, and
//   the drift is invisible: the weaker copy just returns null and the caller
//   records "the model had no answer".
//
// THE ORDER IS THE WHOLE DESIGN, AND STAGE 3 IS DELIBERATELY KEPT.
//
//   1. a ```json fenced block — the most explicit thing the model can do;
//   2. the smallest BALANCED {...} from the first '{', string- and
//      escape-aware, so a brace inside a quoted value cannot end it early;
//   3. the legacy greedy span.
//
//   Stage 3 is last resort rather than deleted because it IS the behaviour
//   every current caller already has. Keeping it makes adopting this module
//   strictly additive: anything that parses today still parses, and the new
//   stages only recover answers that are being discarded. A fix that could
//   silently change an existing verdict would need a before/after measurement;
//   this one cannot, by construction.

/** Yield candidate JSON strings from raw LLM content, best-first. */
export function extractJsonCandidates(content: string): string[] {
  const out: string[] = []
  // 1. ```json ... ``` fenced block
  const fence = content.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) out.push(fence[1].trim())
  // 2. Smallest balanced {...} starting at the first '{'
  const balanced = extractBalancedObject(content)
  if (balanced) out.push(balanced)
  // 3. Last resort: greedy match (legacy behaviour)
  const greedy = content.match(/\{[\s\S]*\}/)
  if (greedy) out.push(greedy[0])
  return out
}

/** Walk the string and return the first balanced {...} substring, respecting strings. */
export function extractBalancedObject(s: string): string | null {
  const start = s.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let inStr = false
  let escaped = false
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (escaped) { escaped = false; continue }
    if (c === '\\') { escaped = true; continue }
    if (c === '"') { inStr = !inStr; continue }
    if (inStr) continue
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return s.slice(start, i + 1)
    }
  }
  return null
}
