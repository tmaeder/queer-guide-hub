import { assertEquals, assert, assertFalse } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import {
  sanitizeArticle,
  stripJunkPhrases,
  detectTruncation,
  hasCriticalPaywall,
  cleanTitle,
  collapseDuplicateHeadings,
  normalizeWhitespace,
} from './sanitize.ts'

Deno.test('stripJunkPhrases removes paywall + share boilerplate', () => {
  const { text, removed } = stripJunkPhrases(
    'Real story.\n\nONLY AVAILABLE IN PAID PLANS\n\nShare on Facebook\nShare on Twitter',
  )
  assert(!text.includes('ONLY AVAILABLE IN PAID PLANS'))
  assert(!text.toLowerCase().includes('share on facebook'))
  assert(removed.length >= 2)
})

Deno.test('stripJunkPhrases removes [semi-satire] tag', () => {
  const { text, removed } = stripJunkPhrases('[semi-satire] something happened')
  assert(!text.includes('[semi-satire]'))
  assert(removed.includes('[semi-satire]'))
})

Deno.test('stripJunkPhrases ignores normal prose', () => {
  const input = 'Pride parade in Berlin drew record crowds.'
  const { text, removed } = stripJunkPhrases(input)
  assertEquals(text.trim(), input)
  assertEquals(removed.length, 0)
})

Deno.test('detectTruncation flags ellipsis ending', () => {
  assert(detectTruncation('A long enough article body that ends with ...'.padEnd(400, ' ') + '...'))
})

Deno.test('detectTruncation flags suspiciously short bodies', () => {
  assert(detectTruncation('Tiny body'))
})

Deno.test('detectTruncation accepts proper-length article', () => {
  const body = 'Lorem ipsum dolor sit amet. '.repeat(20) // ~540 chars, no marker
  assertFalse(detectTruncation(body))
})

Deno.test('hasCriticalPaywall detects paid-plan marker', () => {
  assert(hasCriticalPaywall('Some text. ONLY AVAILABLE IN PAID PLANS. More text.'))
})

Deno.test('hasCriticalPaywall is case-insensitive', () => {
  assert(hasCriticalPaywall('only available in paid plans'))
})

Deno.test('hasCriticalPaywall returns false on clean text', () => {
  assertFalse(hasCriticalPaywall('A clean article about queer activism in Berlin.'))
})

Deno.test('cleanTitle strips trailing source pipe', () => {
  assertEquals(cleanTitle('Pride march draws thousands | The Times'), 'Pride march draws thousands')
})

Deno.test('cleanTitle strips trailing em-dash source', () => {
  assertEquals(cleanTitle('Pride march draws thousands — Reuters'), 'Pride march draws thousands')
})

Deno.test('cleanTitle reformats all-caps headlines', () => {
  const out = cleanTitle('PRIDE MARCH DRAWS THOUSANDS IN NYC')
  assert(out.startsWith('Pride'))
  assert(out.includes('NYC'))
})

Deno.test('cleanTitle strips [semi-satire] prefix', () => {
  assertEquals(cleanTitle('[semi-satire] Pope joins drag race'), 'Pope joins drag race')
})

Deno.test('collapseDuplicateHeadings removes repeated title heading', () => {
  const out = collapseDuplicateHeadings('Pride wins\n\nPride wins\n\nReal body.', 'Pride wins')
  assertFalse(out.startsWith('Pride wins\n\nPride wins'))
  assert(out.includes('Real body.'))
})

Deno.test('collapseDuplicateHeadings collapses consecutive duplicate lines', () => {
  const out = collapseDuplicateHeadings('Headline here\nHeadline here\nBody.')
  assertEquals(out.split('Headline here').length - 1, 1)
})

Deno.test('normalizeWhitespace collapses excess blank lines + spaces', () => {
  assertEquals(normalizeWhitespace('A\n\n\n\nB   C'), 'A\n\nB C')
})

Deno.test('sanitizeArticle full pass', () => {
  const r = sanitizeArticle({
    title: '[satire] BREAKING: PRIDE WINS BIG | The Times',
    content:
      'BREAKING: PRIDE WINS BIG\nBREAKING: PRIDE WINS BIG\n\nThe parade was huge. '.repeat(10) +
      '\n\nONLY AVAILABLE IN PAID PLANS\n\nShare on Facebook',
  })
  assert(!r.title.toLowerCase().includes('satire'))
  assert(!r.content.includes('ONLY AVAILABLE IN PAID PLANS'))
  assert(r.removedArtifacts.length > 0)
  assert(r.changed)
  assert(r.criticalPaywall)
})

Deno.test('sanitizeArticle is idempotent (clean input)', () => {
  const input = {
    title: 'Berlin pride draws record crowds',
    content: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(10),
  }
  const r1 = sanitizeArticle(input)
  const r2 = sanitizeArticle({ title: r1.title, content: r1.content })
  assertEquals(r1.title, r2.title)
  assertEquals(r1.content, r2.content)
  assertFalse(r2.changed && r1.changed && r2.removedArtifacts.length > 0)
})
