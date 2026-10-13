import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { isSelfQuote } from './city-self-quote.ts'

// Every fixture below is a VERBATIM `citations[].quote` read off
// `entity_review_queue` on prod on 2026-10-13, paired with the
// `countries.equality_score` stored for that row's own country. The REFUSE set is
// our own number handed back; the KEEP set is genuine external legal fact.

const REFUSE: Array<[string, number, string]> = [
  ['Equality score: 96', 96, 'Estonia / Haapsalu linn'],
  [
    'France: Marriage equality; Anti-discrimination laws (employment, goods and services, hate speech, hate crime); Gender recognition by self-determination; No ban on conversion therapy; Equality score: 100',
    100,
    'France / Loriol-sur-Drome',
  ],
  [
    'France: 100/100 equality score, marriage equality, anti-discrimination laws in employment, goods and services, hate crime laws, gender recognition without surgery.',
    100,
    'France / Sion-les-Mines',
  ],
  ['India has an equality score of 77 and LGBTQ+ relationships are legal.', 77, 'India / Bangalore'],
  [
    'India: same-sex sexual activity legal since 2018 (Navtej Singh Johar v. Union of India); no nationwide anti-discrimination laws; equality score 77/100',
    77,
    'India / Khandwa',
  ],
  ['Italy has an equality score of 78', 78, 'Italy / Rimini'],
  ['equality score: 78', 78, 'Italy / Rome'],
  ['Japan has an equality score of 71', 71, 'Japan / Tokyo'],
  [
    'Netherlands: equality score 100; same-sex marriage legal since 2001; comprehensive anti-discrimination laws in employment, housing, and public accommodations.',
    100,
    'Netherlands / Giethoorn',
  ],
  // The sharpest one: 86 is the UNITED STATES score in our table. There is no
  // Alabama score anywhere in it, so our national number was relabelled as a
  // state's and then cited as though a state source had published it.
  [
    'Alabama has a state-level equality score of 86 out of 100. The state lacks statewide non-discrimination protections in employment, housing, and public',
    86,
    'United States / Centre, AL',
  ],
]

const KEEP: Array<[string, number, string]> = [
  [
    'Mississippi has no statewide non-discrimination law protecting LGBTQ people from discrimination in employment, housing, and public accommodations.',
    86,
    'real state-level fact',
  ],
  ['The Court now holds that same-sex couples may exercise the fundamental right to marry.', 86, 'Obergefell'],
  [
    'The Illinois Human Rights Act prohibits discrimination in employment, housing, financial credit, public accommodations',
    86,
    'state statute',
  ],
  [
    'Cyprus: homosexuality legal since 1998; anti-discrimination laws in employment since 2004; gender identity protections limited.',
    85,
    'dated legal facts, no score',
  ],
  [
    'Vermont: Sexual orientation and gender identity protected in employment, housing, public accommodations; same-sex marriage legal since 2009.',
    86,
    'state-level ILGA line',
  ],
  // A GENUINE external index figure must survive. ILGA-Europe's Rainbow Map really
  // does publish country percentages, which is why this guard keys on OUR value
  // rather than on any score-shaped number.
  ['Malta scored 89% on the ILGA-Europe Rainbow Index 2024', 100, 'real external index, different number'],
  // THIS is the fixture that isolates the value-keying, and the one above does not:
  // it carries the literal phrase "equality score" next to a number, so it is refused
  // the moment the guard stops comparing against OUR figure. Without it, widening the
  // regex to any digits is a mutation no test can see.
  [
    'ILGA-Europe rates Malta at an equality score of 89 for 2024',
    100,
    'phrase present, number is NOT ours',
  ],
  // Year-shaped numbers must not be mistaken for a score.
  ['Same-sex marriage legal since 2001; adoption since 2001.', 100, 'years, not a score'],
]

Deno.test('isSelfQuote refuses our own equality score, however it is spelled', () => {
  for (const [quote, score, label] of REFUSE) {
    assertEquals(isSelfQuote({ quote }, score), true, `should refuse (${label}): ${quote.slice(0, 60)}`);
  }
})

Deno.test('isSelfQuote keeps genuine external evidence', () => {
  for (const [quote, score, label] of KEEP) {
    assertEquals(isSelfQuote({ quote }, score), false, `should keep (${label}): ${quote.slice(0, 60)}`);
  }
})

Deno.test('isSelfQuote still catches the injected string and its exact spelling', () => {
  const ctx = 'Estonia: equality_score=96, legal_status=legal'
  // the whole injected line, quoted back verbatim
  assertEquals(isSelfQuote({ quote: ctx }, 96, ctx), true)
  // the spelling we inject it in, even with no score passed
  assertEquals(isSelfQuote({ quote: 'Vietnam: equality_score=73, legal_status=legal' }, null), true)

  // STATED RATHER THAN IMPLIED: the exact-match arm is BELT-AND-BRACES today, not
  // load-bearing. `city-agentic-enrich` builds the context as
  // `${name}: equality_score=${n}, legal_status=${legal}`, which always contains the
  // `=` spelling, so the arm below it would catch every real injected string on its
  // own. Deleting the exact-match arm therefore breaks no fixture above. It is kept
  // for the case where that format changes, and THIS is the assertion that would then
  // be load-bearing: same string, no `=`, no matching score.
  const future = 'Estonia equality rating: high'
  assertEquals(isSelfQuote({ quote: future }, 96, future), true)
  assertEquals(isSelfQuote({ quote: future }, 96), false)
})

Deno.test('isSelfQuote is inert on an empty or absent quote', () => {
  // An empty quote is NOT a self-quote: it carries no evidence either way, and the
  // caller's own `citeFor` is what drops a citation with nothing in it. Returning
  // true here would make "no quote" indistinguishable from "laundered quote".
  //
  // Also stated rather than implied: the `if (!q) return false` early return is
  // defensive. Removing it changes no result here, because neither remaining arm
  // matches the empty string. These assertions pin the CONTRACT, not that line.
  assertEquals(isSelfQuote({ quote: '' }, 100), false)
  assertEquals(isSelfQuote({ quote: '   ' }, 100), false)
  assertEquals(isSelfQuote({}, 100), false)
})

// Mutation-tested 2026-10-13: 9 of 10 applicable mutations caught, with a
// comment-only control that correctly SURVIVES. The one survivor is
// `Number.isFinite` and it is provably INERT rather than untested: drop it and
// `String(NaN)` builds the pattern `equality\s*score[^0-9]{0,20}NaN\b`, which no
// real quote can match, so no result changes. Recorded so the next reader does not
// mistake a redundant guard for a gap in these fixtures.
Deno.test('a null or non-finite score disables only the prose arm', () => {
  assertEquals(isSelfQuote({ quote: 'Italy has an equality score of 78' }, null), false)
  assertEquals(isSelfQuote({ quote: 'Italy has an equality score of 78' }, undefined), false)
  assertEquals(isSelfQuote({ quote: 'Italy has an equality score of 78' }, NaN), false)
  // ...but never the two arms that do not depend on it
  assertEquals(isSelfQuote({ quote: 'x equality_score=78 y' }, NaN), true)
})
