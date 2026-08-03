import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { NEWS_CATEGORIES } from '../_shared/ai-enrichment.ts'

// The vocabulary is duplicated in three places that cannot import each other:
// this constant, the `news_categories` seed in migration 20260808120000, and the
// admin CMS select in src/config/contentTypes/news.ts. The DB trigger validates
// whatever the LLM sends against the table and falls back to the keyword
// classifier on a mismatch, so drift degrades quality SILENTLY rather than
// erroring — which is exactly the failure mode this whole change exists to fix.
const EXPECTED = [
  'rights-legal',
  'politics',
  'community',
  'health-wellness',
  'culture-arts',
  'sports',
  'education',
  'technology',
  'business-economy',
  'international',
]

Deno.test('NEWS_CATEGORIES matches the seeded news_categories vocabulary', () => {
  assertEquals([...NEWS_CATEGORIES].sort(), [...EXPECTED].sort())
})

Deno.test('NEWS_CATEGORIES does not contain the general sentinel', () => {
  // `general` means "unclassified". Offering it to the model would let it opt
  // out of classifying, which is the behaviour being removed.
  assert(!NEWS_CATEGORIES.includes('general' as never))
})

Deno.test('every category slug is a valid URL/DB slug', () => {
  for (const slug of NEWS_CATEGORIES) {
    assert(/^[a-z]+(-[a-z]+)*$/.test(slug), `not a clean slug: ${slug}`)
  }
})

Deno.test('the news system prompt enumerates every category', async () => {
  // The prompt is built at module load from NEWS_CATEGORIES; read the source to
  // assert the enum actually reaches the model rather than an "e.g." list. The
  // original prompt said `Topics covered (e.g., "rights", "culture", ...)`,
  // which is an example list, not a constraint, so the output was unusable.
  const src = await Deno.readTextFile(
    new URL('../_shared/ai-enrichment.ts', import.meta.url),
  )
  const promptBlock = src.slice(
    src.indexOf('const NEWS_SYSTEM_PROMPT'),
    src.indexOf('const SCRAPED_CONTENT_SYSTEM_PROMPT'),
  )
  assert(promptBlock.length > 0, 'NEWS_SYSTEM_PROMPT not found')
  assert(
    promptBlock.includes('${NEWS_CATEGORIES.join('),
    'prompt must interpolate the vocabulary, not hardcode examples',
  )
  assert(promptBlock.includes('MUST be exactly one of'), 'prompt must constrain the value')
  assert(!/e\.g\.,\s*"rights"/.test(promptBlock), 'prompt still offers an example list')
})

Deno.test('out-of-vocabulary categories are rejected by the guard', async () => {
  // Mirrors the guard in enrichNewsWithAI. Kept as a behavioural assertion so a
  // refactor that drops the guard fails here rather than silently writing a
  // slug the FK will later reject.
  const src = await Deno.readTextFile(
    new URL('../_shared/ai-enrichment.ts', import.meta.url),
  )
  assert(
    src.includes('!NEWS_CATEGORIES.includes(parsed.category)'),
    'enrichNewsWithAI must validate the model-supplied category',
  )
  assert(src.includes('delete parsed.category'), 'invalid categories must be dropped, not passed on')
})
