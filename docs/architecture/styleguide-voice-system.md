# Styleguide & Tone-of-Voice system

One editorial standard, two consumers.

| Audience | Surface | Reads |
|---|---|---|
| Contributors, readers | `/styleguide` | the active rows, rendered |
| Community editors | `/admin/styleguide` | the rows, editable + publish |
| Content pipelines | `_shared/voice-style.ts` | `styleguide_active_prompt(profile)` |
| External integrations | `GET /api/v1/styleguide/prompt` | the published version |

Migrations `20450210090000` (machinery) and `20450210090100` (v1.0.0 content).

## Why it exists

The platform already had a voice standard in two places — the `Copy` bullet in
`CLAUDE.md` and `TAG_STYLE_SYSTEM` in `supabase/functions/_shared/tag-style.ts` —
plus a third idea of it inside `MOAT_SYSTEM_PROMPT` and `CITY_MOAT_SYSTEM_PROMPT`
in `_shared/ai-enrichment.ts`. All three were prose in source files. Nobody
without commit access could change any of them, nothing reconciled them, and a
change to one never reached the others.

For a platform whose editorial stance is the product — non-pathologizing health
language, candour about criminalising jurisdictions, no laundering of racism as
safety advice — a voice standard that only engineers can edit is the wrong shape.
Community editors own this vocabulary; they should own the rows.

## Data model

```
styleguide_rules      one row per rule, grouped into six sections
styleguide_terms      preferred vs obsolete/harmful wording, with the reason
styleguide_examples   before/after calibration pairs
styleguide_versions   immutable semver snapshots (the machine contract)
styleguide_audit      append-only change log with the actor
```

Row-per-rule rather than one jsonb document (which is how `site_branding`
works, and the only place this deliberately diverges from it): the editing unit
is a single term that an editor adds on its own and that needs its own audit
row, its own active flag and its own rationale.

Three fields carry weight beyond their obvious use:

- **`styleguide_terms.preferred` is nullable.** Some language has no drop-in
  replacement — "sketchy neighbourhood" becomes a sourced risk or it becomes
  nothing. A CHECK requires a rationale when there is no replacement, so an
  unexplained ban is not storable.
- **`styleguide_rules.applies_to`** scopes a rule to a surface. Most rules are
  `all`; the exceptions are real (no second person in glossary copy, but guides
  may address the reader).
- **`severity`** is the compile-time lever, not decoration. `must`/`never`
  survive into the cheapest prompt profile; `should` does not.

## The frame is code, the content is data

`styleguide_compile()` hardcodes the preamble, the data fence and the six
non-negotiables. Editors own rules, terms and examples and nothing else.

This is a security boundary, not tidiness. The compiled text is sent verbatim as
a system prompt to third-party models, so a row that could rewrite the frame is
a row that could rewrite the model's instructions. Three things enforce it:

1. **Write-time gate.** `styleguide_assert_safe_text` rejects control characters
   and over-length text on every editor-authored string, via BEFORE triggers.
   `[:print:]` is locale-aware, so accented and non-Latin text passes.
2. **Fence stripping.** Every editor string is compiled through
   `styleguide_strip_fence`, which removes any line shaped like a fence marker.
   A row cannot close its own section and continue outside the data block.
3. **Ordering.** The non-negotiables are emitted *after* the fence closes, and
   the preamble tells the model that everything inside is data describing a
   voice, never an instruction.

`styleguide_strip_fence` is **STRICT** and must stay that way. Optional fields
compile as `COALESCE(' (' || strip_fence(x) || ')', '')`, which only collapses on
NULL. An earlier draft coalesced NULL to `''` inside the function instead, so
every wrapper always fired: terms without a context note printed a bare `()`,
and — worse — a term with no replacement rendered `-> ""`, i.e. "replace it with
nothing", the opposite of "rewrite the sentence". Guarded by
`src/lib/__tests__/styleguideVoiceSystem.test.ts`.

## Profiles

Measured on v1.0.0:

| Profile | Chars | Contents | Use for |
|---|---|---|---|
| `full` | ~26,000 | everything | long-form generation, the public page, integrators |
| `core` | ~21,000 | rules + terminology | field-level rewriting |
| `compact` | ~13,000 | `must`/`never` rules, `never`/`avoid` terms, no rationales, no examples | high-volume classification |

The full prompt is ~6,500 tokens. Putting that on a five-minute cron that scores
thousands of rows is a bill, not a style decision — which is why the tiers exist
and why `getVoicePrompt()` defaults to `core` rather than `full`.

**Every profile is compiled at publish time and frozen into the version row.**
Compiling on read would make `?profile=compact&v=1.0.0` silently follow live
edits, and following live edits is the one thing a pin promises not to do.
`compiled_prompt` duplicates `doc.prompts.full` so that every consumer path is a
uniform `doc.prompts[profile]` lookup with no special case for the default.

## Publishing

Editors change rows continuously; pipelines must not. `styleguide_publish(bump,
note)` freezes the current compilation as a new immutable semver row and flips
which one is active.

| Bump | Means |
|---|---|
| patch | wording, a typo, a rationale added to an existing rule |
| minor | a rule/term/example added, or an existing one relaxed |
| major | a rule reversed or removed — output validated against an earlier version needs re-checking |

Two postconditions worth knowing:

- **A publish with zero active rules is refused.** It would be a valid-looking
  200 carrying a prompt with no rules in it, and every pipeline would quietly
  lose its voice while reporting success.
- **Exactly one version is active**, enforced by a unique index on `((TRUE))
  WHERE is_active` rather than by every writer remembering to deactivate.

Rollback is `styleguide_activate_version(v)`. Versions are immutable, so
re-activating one returns pipelines to exactly the text they had. The newest 50
are kept (same cap and same disk-constrained reasoning as
`site_branding_versions`).

## The API

```
GET /api/v1/styleguide/prompt
      ?format=text|json      default json
      ?profile=full|core|compact   default full
      ?v=1.0.0               pin a version; default is the active one
```

Public, CORS-open, anon-key-backed (RLS already publishes exactly what this may
serve, so reaching for the service role would only widen what a bug could leak).
ETag is `"sg-<version>-<profile>"`; a pinned response is `immutable`.

**Failure is loud here, unlike branding.** A 5xx tells a caller to fall back to
its own copy. Serving 200 with an empty prompt would make "the styleguide was
unreachable" indistinguishable from "the styleguide says nothing", and the
second one is a voice silently switched off. For the same reason,
`getVoicePrompt()` treats a body under 500 characters as a failure rather than
as a terse styleguide.

## Adopting it in a pipeline

```ts
import { withVoice } from '../_shared/voice-style.ts'

const system = await withVoice(MY_TASK_PROMPT, 'core')
```

Order is load-bearing: the voice frame states that the task and output format
belong to what follows it, so the caller's own instructions must come second.

**No live pipeline has been switched over yet, deliberately.** Changing the
system prompt of a running enrichment function changes its output, and that is a
per-pipeline change that wants its own before/after measurement — not a side
effect of shipping the machinery. The adoption order that makes sense:

1. `tag-enrichment-sweep` — already prompt-shaped around a house voice
   (`TAG_STYLE_SYSTEM`), and currently disabled, so a change there is free.
2. `pipeline-enrich-country-editorial` — long-form, `full` profile, human-gated
   for criminalising destinations already.
3. `city-agentic-enrich` — the `CITY_MOAT_KEYS` narrative fields.
4. `marketplace-relevance` and the other classifiers — `compact` only, and only
   after measuring the token delta against `llm_budget`.

`TAG_STYLE_SYSTEM` and the `MOAT_SYSTEM_PROMPT` pair stay where they are until
their callers move. Two copies of the voice is the problem this system exists to
end, but deleting one before its consumer reads the other is how you get zero.

## Drift guards

- `src/lib/__tests__/styleguideVoiceSystem.test.ts` — the frame is hardcoded,
  every editor-authored column is fence-stripped, the compact profile actually
  filters, the publish gates hold. Mutation-tested: 13 mutations, all caught.
- `src/lib/__tests__/styleguideFallbackDrift.test.ts` — the frame in
  `voice-style.ts` still matches the SQL compiler. The fallback's **rule list**
  is a snapshot and is allowed to lag; its **frame** is not. A stale rule list is
  a fine thing to serve during an outage. A stale non-negotiable means that every
  time Supabase blips, the fleet quietly runs on a superseded safety rule — and
  both copies pass every other test, because each is individually valid.
- `supabase/functions/_shared/voice-style.test.ts` — fallback behaviour with no
  database, runs offline.
