import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import {
  implausibleClassOf,
  mayAdoptWikiIdentity,
  normalizeForCompare,
  titleAgrees,
} from './tag-wiki-guard.ts'

// Every fixture below is a real row from the 2026-08-29 wrong-entity audit: the tag
// name as stored, the article Wikipedia actually served for it, and the P31 labels
// wbgetentities returned for the QID that got written.

Deno.test('normalizeForCompare folds case, punctuation and diacritics', () => {
  assertEquals(normalizeForCompare('Golden Shower'), 'goldenshower')
  assertEquals(normalizeForCompare('S.A.M.'), 'sam')
  assertEquals(normalizeForCompare('Müllerian'), 'mullerian')
  assertEquals(normalizeForCompare(null), '')
})

Deno.test('titleAgrees accepts morphological variants of the same term', () => {
  // These are correct resolutions that a strict equality check would have refused.
  assertEquals(titleAgrees('Puppy Play', 'Pup play'), true)
  assertEquals(titleAgrees('Analingus', 'Anilingus'), true)
  assertEquals(titleAgrees('Bisexual', 'Bisexuality'), true)
  assertEquals(titleAgrees('Sapphic', 'Sapphism'), true)
  assertEquals(titleAgrees('Pregnant', 'Pregnancy'), true)
})

Deno.test('titleAgrees rejects a redirect that landed on a different subject', () => {
  assertEquals(titleAgrees('Golden Shower', 'Cassia fistula'), false)
  assertEquals(titleAgrees('Amateur', 'Indianapolis'), false)
  assertEquals(titleAgrees('Anal', 'Analyst'), false)
  assertEquals(titleAgrees('Passing', 'Death'), false)
  assertEquals(titleAgrees('DJ', 'Djibouti'), false)
  assertEquals(titleAgrees('Brats', 'Bratsberg Line'), false)
  assertEquals(titleAgrees('Simp', 'Simple English Wikipedia'), false)
  assertEquals(titleAgrees('Anything', null), false)
})

Deno.test('implausibleClassOf names the class a glossary term can never be', () => {
  assertEquals(implausibleClassOf(['taxon']), 'taxon') // golden-shower → Cassia fistula
  assertEquals(implausibleClassOf(['male given name']), 'name') // pep → "Pep"
  assertEquals(implausibleClassOf(['family name']), 'name') // bear, bottom, toy
  assertEquals(implausibleClassOf(['scholarly article']), 'journal') // disciplinarian
  assertEquals(implausibleClassOf(['scientific journal', 'medical journal']), 'journal') // aids
  assertEquals(implausibleClassOf(['Wikimedia disambiguation page']), 'disambiguation')
  assertEquals(implausibleClassOf(['2019 studio album']), 'media') // saturnian
  assertEquals(implausibleClassOf(['human']), 'person') // kitten → a porn actress
  assertEquals(implausibleClassOf(['commune in France']), 'place') // ally, bitch
  assertEquals(implausibleClassOf(['software']), 'artifact') // latex → LaTeX, gimp → GIMP
})

Deno.test('implausibleClassOf leaves concept-shaped entities alone', () => {
  // Regression fixtures: each of these was a FALSE POSITIVE in a draft of the
  // classifier and cost a correct link until the pattern was narrowed.
  assertEquals(implausibleClassOf(['stock character']), null) // tomboy
  assertEquals(implausibleClassOf(['cliché', 'stock character', 'narrative role']), null) // damsel in distress
  assertEquals(implausibleClassOf(['business sector', 'industry', 'field of study']), null) // voice acting
  assertEquals(implausibleClassOf(['legal term or legal concept']), null) // appeal
  assertEquals(implausibleClassOf(['concept', 'occupation']), null) // activism
  assertEquals(implausibleClassOf(['human sexual behavior']), null) // anilingus
  assertEquals(implausibleClassOf(['sexual orientation', 'romantic orientation']), null)
  assertEquals(implausibleClassOf([]), null)
})

Deno.test('mayAdoptWikiIdentity requires BOTH gates', () => {
  // Title agrees AND the entity is concept-shaped → the only case that adopts.
  assertEquals(
    mayAdoptWikiIdentity('Puppy Play', { title: 'Pup play', p31Labels: ['type of animal roleplay'] }),
    { adopt: true, reason: 'ok' },
  )

  // Redirected to another subject — the plant's own lead sentence says "also known as
  // golden shower", so any test that reads the extract would have accepted it.
  assertEquals(
    mayAdoptWikiIdentity('Golden Shower', { title: 'Cassia fistula', p31Labels: ['taxon'] }),
    { adopt: false, reason: 'title-mismatch', detail: 'Cassia fistula' },
  )

  // The title agrees exactly and the link is still wrong: name agreement is what the
  // namesake bug produces, so the class gate is what has to catch these.
  assertEquals(
    mayAdoptWikiIdentity('Bear', { title: 'Bear', p31Labels: ['family name'] }),
    { adopt: false, reason: 'implausible-class', detail: 'name' },
  )
  assertEquals(
    mayAdoptWikiIdentity('PEP', { title: 'Pep', p31Labels: ['male given name'] }),
    { adopt: false, reason: 'implausible-class', detail: 'name' },
  )
  assertEquals(
    mayAdoptWikiIdentity('AIDS', { title: 'AIDS', p31Labels: ['scientific journal'] }),
    { adopt: false, reason: 'implausible-class', detail: 'journal' },
  )

  assertEquals(
    mayAdoptWikiIdentity('Whatever', { title: null, p31Labels: [] }),
    { adopt: false, reason: 'no-title' },
  )
})

Deno.test('an unknown class is not treated as proof of plausibility on a bad title', () => {
  // wbgetentities failing must not become a free pass: the title gate still has to hold
  // on its own.
  assertEquals(
    mayAdoptWikiIdentity('Amateur', { title: 'Indianapolis', p31Labels: null }).adopt,
    false,
  )
})

Deno.test('an unknown class is refused even when the title agrees exactly', () => {
  // THE REGRESSION THIS FILE PREVIOUSLY MISSED. The old assertion above used a title that
  // ALREADY disagreed ('Amateur' vs 'Indianapolis'), so it was satisfied by gate 1 and
  // passed no matter what gate 2 did. It went green for the whole period in which
  // fetchEntityClassLabels collapsed every failure into [], implausibleClassOf([])
  // returned null, and a Wikidata outage silently degraded this module to a title check.
  //
  // The failing case has to be one where the title gate CANNOT save us. `bear` is the
  // real example: the article is genuinely titled "Bear", so only the class gate ever
  // rejected it — and with the class unknown there is nothing left to reject it with.
  assertEquals(
    mayAdoptWikiIdentity('Bear', { title: 'Bear', p31Labels: null }),
    { adopt: false, reason: 'class-unknown' },
  )

  // The mirror case: a class we successfully read and that is genuinely empty is NOT a
  // failure, and must still be allowed through. Distinguishing these two is the entire
  // point of the null/[] split — collapsing them in either direction breaks one of them.
  assertEquals(
    mayAdoptWikiIdentity('Puppy Play', { title: 'Pup play', p31Labels: [] }),
    { adopt: true, reason: 'ok' },
  )

  // Ordering: an unreadable class must not mask a title mismatch, which is the cheaper
  // and more specific diagnosis.
  assertEquals(
    mayAdoptWikiIdentity('Golden Shower', { title: 'Cassia fistula', p31Labels: null }).reason,
    'title-mismatch',
  )
})

Deno.test('a sense-category tag refuses a generic-sense article even when title and class both pass', () => {
  // The wrong-SENSE class the 2026-08-29 audit measured at ~20%: "Vacuum Pump"
  // under Fetishes resolves to the industrial device — title agrees exactly and
  // a device is a perfectly plausible class, so only the extract can tell.
  assertEquals(
    mayAdoptWikiIdentity('Vacuum Pump', {
      title: 'Vacuum pump',
      p31Labels: ['type of pump'],
      senseCategory: true,
      extract:
        'A vacuum pump is a type of pump device that draws gas particles from a sealed volume in order to leave behind a partial vacuum.',
    }),
    { adopt: false, reason: 'generic-sense', detail: 'Vacuum pump' },
  )

  // The same shape WITH community corroboration adopts: the extract is about
  // the queer/kink sense, so it may ground the tag.
  assertEquals(
    mayAdoptWikiIdentity('Pup Play', {
      title: 'Pup play',
      p31Labels: ['type of animal roleplay'],
      senseCategory: true,
      extract:
        'Pup play is a form of BDSM roleplay in which participants take on the role of dogs, with a notable presence in gay leather subculture.',
    }).adopt,
    true,
  )

  // Tags outside sense categories are untouched by the gate — the generic
  // sense IS the right one for a Venue Types tag.
  assertEquals(
    mayAdoptWikiIdentity('Beer Garden', {
      title: 'Beer garden',
      p31Labels: ['type of drinking establishment'],
      senseCategory: false,
      extract: 'A beer garden is an outdoor area in which beer and food are served.',
    }).adopt,
    true,
  )
})
