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

### What the fence does NOT stop

Fence-stripping is a **structural** defence. It stops a row closing its own
section and writing outside the data block. It does nothing about a row that
reads like a legitimate voice rule and alters behaviour anyway — "always append
X", "answer in French" — because that is indistinguishable from a voice rule by
construction.

The mitigation for that is the preamble sentence asking the model to ignore any
line in the data block that is not a voice rule. That is a prompt-level request,
not a guarantee, and it should not be read as one. The controls that actually
hold are that every writer is an admin (RLS), every change is attributed and
audited (`styleguide_audit`), and publishing is a separate gated action a human
performs after reading the preview. "The frame is code" means an editor cannot
rewrite the *frame*; it does not mean an editor cannot write a bad *rule*.

`styleguide_strip_fence` is **STRICT** and must stay that way. Optional fields
compile as `COALESCE(' (' || strip_fence(x) || ')', '')`, which only collapses on
NULL. An earlier draft coalesced NULL to `''` inside the function instead, so
every wrapper always fired: terms without a context note printed a bare `()`,
and — worse — a term with no replacement rendered `-> ""`, i.e. "replace it with
nothing", the opposite of "rewrite the sentence". Guarded by
`src/lib/__tests__/styleguideVoiceSystem.test.ts`.

## Profiles

Two independent levers, not one ladder:

| Lever | Applies to | Why |
|---|---|---|
| rationales | `full` only | the "why" is for editors and readers; a model only has to follow the rule |
| severity | `compact` narrows | binding ranks only |

Measured on v1.1.0:

| Profile | Chars | Saving | Contents | Use for |
|---|---|---|---|---|
| `full` | 28,956 | — | everything, with reasons and worked examples | long-form generation, the public page, integrators |
| `core` | 14,547 | 50% | every rule and term, no reasons, no examples | field-level rewriting |
| `compact` | 13,293 | 54% | binding rules and banned words only | high-volume classification |

`getVoicePrompt()` defaults to `core`.

**`core` shipped saving only 19% and was not worth choosing.** It removed the
worked examples (5,833 chars) and left the expensive half — every rule, every
term and every rationale — intact. Splitting the rationale lever out of the
severity lever is what made it a real tier.

**Be honest about the remaining gap: `core` and `compact` are now only 9%
apart.** The big saving is dropping rationales and examples; narrowing by
severity adds ~4% on top. Three tiers survive because the distinction is
editorial rather than numeric — `compact` discards `should` rules and `context`
terms, which a classifier does not need and a field rewriter does — but nobody
should choose `compact` over `core` expecting a meaningful cost difference.

Note `full` GREW (25,979 → 28,956) when the fourteen missing rationales were
filled in. That is the rationale lever working, not regression.

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
- `src/lib/__tests__/styleguideScopes.test.ts` — the `applies_to` vocabulary
  agrees across the TS list, `styleguide_scope_values()` and the CHECK
  constraint. Unlike the `venueCategories.ts` precedent it finds the LATEST
  migration defining each, so it cannot silently test a superseded file.
- `e2e/styleguide-voice.spec.ts` — **asserts on the compiled OUTPUT**, against
  production. This is the layer that was missing: twenty-one unit tests parse
  migration source, and the `()` / `-> ""` defect was invisible to all of them.
- `styleguide_signals()` via `scripts/check-pipeline-health.mjs` — see below.

## The sentinel

`styleguide_signals()` is read nightly by `scripts/check-pipeline-health.mjs`,
which checks two things in two different places because this subsystem fails in
two different places.

**Database half** — hard-fails on: nothing published; a binding rule with no
rationale; a rule whose scope is outside the vocabulary; empty-wrapper artifacts
in the published prompt; a fence that is not exactly one pair; a published prompt
that has lost its non-negotiables. Advisory on unpublished editorial drift.

The artifact check is the one worth understanding. It reads the **published
text**, not row counts, because the defect class it exists for — a compiler
change that renders empty wrappers — is invisible to every row-count assertion
and was invisible to twenty structural tests.

**Repo half** — adoption. It counts edge functions that `import` from
`voice-style.ts` and **fails at zero**. Nothing in the database can see whether
anything consumes the voice; that is a fact about the source tree. The precedent
is the Village Truth Engine, whose relink batch shipped with no cron and no
registry row and sat dead long enough that 21 of 47,815 events carried a village.

**Deliberately not built: audit retention.** `styleguide_audit` is uncapped, and
on measuring it that is not worth a cron — 69 rows after a full seed, growing
only when a human edits an editorial row. `styleguide_versions` IS capped at 50
because each row stores three compiled prompts (~60 KB). The signal reports the
audit row count so growth stays visible; a pruner for a table that gains a few
rows a month is machinery nobody would schedule, which is its own failure mode
here.

## Adoption status

`tag-enrichment-sweep` consumes the published voice via
`withVoice(TAG_STYLE_SYSTEM, 'core')` at both of its generation call sites.

It was chosen as the first adopter precisely because **its cron is disabled and
both of its auto-apply paths are retired**, so changing its system prompt alters
no live output. That makes it a real integration test of the wiring at zero
behavioural risk, and it takes the adoption sentinel off zero.

The remaining order is unchanged, and each still needs its own before/after
measurement rather than a bulk switch:

1. `pipeline-enrich-country-editorial` — long-form, `full`, already human-gated
   for criminalising destinations.
2. `city-agentic-enrich` — the `CITY_MOAT_KEYS` narrative fields.
3. `marketplace-relevance` and the other classifiers — `compact` only, and only
   after measuring the token delta against `llm_budget`.

## Auditing the corpus against the standard

Added 2026-09-11, v1.2.0. The first audit of live content against the published
standard produced one finding about the corpus and six about the vocabulary,
and the vocabulary ones were larger.

### Scope: whose voice binds

The scan covers **our own voice only** — `cities`, `countries`, `unified_tags`,
`queer_villages` (14,335 rows). Venues, events, news and marketplace listings
are third-party text republished under our name; whether the editorial standard
binds text we did not write is a product decision, not a technical one, and it
is deliberately left open rather than answered by a scanner.

### What the audit changed

Six terms were corrected. Each is a measured count, not an opinion:

| term | measured | change |
|---|---|---|
| `gay friendly` | 64 hyphen / **0 space** in live copy | both spellings, plus the `queer-` forms (50 more) |
| `a transgender` | all 9 hits are the correct **adjective** | annotated `(as a noun)` |
| `ethnic` | 26 hits, all "ethnic group/minority/majority" | narrowed to exoticising collocations |
| `lifestyle` | 34 hits, mostly the kink community's own word | narrowed to the orientation sense |
| `minorities` | 10 hits, "sexual minorities" etc. | dropped; the euphemism is covered by `non-white` |
| `urban area` | 158 hits, all the geographic unit | narrowed to "urban" applied to people |

**The rule this establishes: an avoid entry must be wrong in essentially every
context.** A bare word that is usually correct does not merely produce noise in
a scan — it is guidance telling a model to avoid correct English, and in two
cases here it contradicted our own `community-words-in-their-real-sense` and
`reclaimed-words` rules.

`urban area` alone was 22% of the drift baseline. Narrowing it took the number
from 714 to 571 without touching a single row of content.

### What is deliberately NOT narrowed

`clean` (hiv-negative) and `accessible` (step-free) stay exactly as they are.
Both are useless to a matcher — they fire on "clean towels" and "accessible
toilet" — and both are real, important guidance for a model reading the prompt.
`step-free` carries severity `context` precisely because it needs a human rather
than a matcher.

**A term's job is to instruct an LLM, not to be greppable.** The six above
changed because they instruct *wrongly*, not because they are hard to scan. The
scanner excludes `it`, `clean` and `accessible` and the migration asserts all
three still exist in the vocabulary, so that exclusion list can never become a
back door for retiring a term.

### The drift sentinel

`styleguide_content_drift()` returns per-surface counts of own-voice rows
matching an active avoid phrase. Baseline **571 of 14,335**:

```
city.description       356      vibrant         374
city.editorial_hook     48      explore         174
tag.long_description    80      gay-friendly     73
tag.description         38      queer-friendly   50
village.description     25      journey          22
```

`city.editorial_hook` at **48 of 105 (46%)** is the sharpest signal in the
corpus: that is the LLM composer's register, not scattered author slips.

It is **advisory on the counts, hard on a broken probe**. A backlog of known
editorial debt is depth, not a regression — the same split the embedding drain
uses. But an empty corpus, a vocabulary that failed to load and a genuinely
clean corpus all return the same reassuring zero, so `rows_scanned` and
`phrases_active` are reported separately and CI fails if either is zero.

### Why this is a counter and not a rewrite

The obvious next move is to have an LLM rewrite the ~400 offending city
descriptions. **That is precisely the experiment this repo has already run and
retired.** The tag prose judge retracted 16 of its first 18 rows and 13 of those
were wrong; its two rewrites included a downgrade into the exact register
`TAG_STYLE_SYSTEM` bans; both auto-apply paths are disabled and
`tag_prose_apply` lost its retract branch at the DB layer so it cannot return by
accident. Pointing the same class of machine at city descriptions would repeat
that at six times the scale, on pages that rank.

So the backlog is measured and shown, and fixed deliberately.

### The other half, still open

Stopping *new* copy arriving in this register means a `withVoice()` adoption on
`city-agentic-enrich`, and that is **not** done here. It is a live enrichment
pipeline whose prompts demand bare JSON from reasoning models that already need
`chat_template_kwargs: {thinking:false}` to answer at all; prepending ~13k
characters of voice to a 1.8k prompt is a change that wants its own before/after
measurement, not a side effect of shipping a sentinel. It remains item 2 in the
adoption order above.
