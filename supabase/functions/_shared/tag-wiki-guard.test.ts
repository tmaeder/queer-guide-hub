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
  // wbgetentities failing (empty p31Labels) must not become a free pass: the title
  // gate still has to hold on its own.
  assertEquals(
    mayAdoptWikiIdentity('Amateur', { title: 'Indianapolis', p31Labels: [] }).adopt,
    false,
  )
})
