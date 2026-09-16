import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { implausibleClassOf, mayAdoptWikiIdentity } from './tag-wiki-guard.ts'

/**
 * The urban-subdivision half of the `place` arm, added 2026-09-15.
 *
 * A CITY DISTRICT is not settlement-shaped. The original word list tested for "city", "town",
 * "village" and "municipality"; Kreuzberg's P31 label is `locality of Berlin` and Mitte's is
 * `borough of Berlin`, which contain none of them. So the sweep adopted Q308928 and published
 * "Kreuzberg is a district of Berlin, Germany" as an indexable glossary page under the tag
 * category "Vibe & Crowd".
 *
 * Every label below is the REAL English label of the real P31 class carried by the real QID that
 * was on that tag, fetched from Wikidata rather than invented.
 */

Deno.test('a Berlin district is refused — the labels that reached prod', () => {
  // locality of Berlin: Q35034452 — Kreuzberg Q308928, Schöneberg Q313189,
  // Friedrichshain Q317056, Tempelhof Q363830, Steglitz Q700211.
  assertEquals(implausibleClassOf(['locality of Berlin']), 'place')
  // borough of Berlin: Q821435 — Mitte Q163966, Neukölln Q4071168, Spandau Q158083.
  assertEquals(implausibleClassOf(['borough of Berlin']), 'place')
  // Steglitz carries two classes; either one alone must be enough.
  assertEquals(implausibleClassOf(['locality of Berlin', 'Rural community (local government)']), 'place')
})

Deno.test('the other subdivision labels live in this corpus are refused', () => {
  // Measured over the 774 distinct P31 classes on the 1,570 QIDs of active tags: these are the
  // labels the widened words reach which the settlement words did not.
  assertEquals(implausibleClassOf(['locality of Mexico']), 'place') // Cuernavaca, Morelia
  assertEquals(implausibleClassOf(['district capital']), 'place')
  assertEquals(implausibleClassOf(['district of the Czech Republic']), 'place')
  assertEquals(implausibleClassOf(['urban district of Bavaria']), 'place')
  assertEquals(implausibleClassOf(['urban district of Lower Saxony']), 'place')
})

Deno.test('the vocabulary not yet seen on a live row is refused too', () => {
  // Present for the next import rather than for the current corpus. A district hashtag from any
  // other city has to fail the same way Kreuzberg now does.
  for (const label of [
    'quarter of Vienna',
    'ward of Tokyo',
    'suburb of Melbourne',
    'neighbourhood of Amsterdam',
    'Ortsteil',
    'Bezirk of Vienna',
    'arrondissement of Paris',
    'barrio of Puerto Rico',
    'subdistrict of Indonesia',
    'census-designated place',
    'civil parish of England',
  ]) {
    assertEquals(implausibleClassOf([label]), 'place', `${label} should be refused`)
  }
})

/**
 * The counterweight. A glossary is full of words that LOOK administrative, and the arm must not
 * reach them. These are the ones that would hurt: every label here is concept-shaped and several
 * are live on this corpus today.
 */
Deno.test('concept classes are still adopted — no collateral from the widening', () => {
  for (const label of [
    'human sexual behavior',
    'sexual orientation',
    'romantic orientation',
    'stock character',
    'legal term or legal concept',
    'gender identity',
    'medical specialty',
    'sexual practice',
    'social group',
    'subculture',
    'political ideology',
    'academic discipline',
    'clothing',
    'sex position',
    'psychological concept',
    'interpersonal relationship',
  ]) {
    assertEquals(implausibleClassOf([label]), null, `${label} should still be adopted`)
  }
})

Deno.test('mayAdoptWikiIdentity refuses a district end to end', () => {
  // Title agreement is exactly what this failure produces — the article really is called
  // "Kreuzberg" — so the class gate is the only thing standing between the sweep and an
  // indexable Wikipedia geography page. Asserting through the public entry point rather than
  // through implausibleClassOf proves the wiring, not just the regex.
  const verdict = mayAdoptWikiIdentity('Kreuzberg', {
    title: 'Kreuzberg',
    p31Labels: ['locality of Berlin'],
  })
  assertEquals(verdict.adopt, false)
  assertEquals(verdict.reason, 'implausible-class')
  assertEquals(verdict.detail, 'place')
})

Deno.test('a real glossary term with an agreeing title is still adopted', () => {
  const verdict = mayAdoptWikiIdentity('Anilingus', {
    title: 'Anilingus',
    p31Labels: ['human sexual behavior'],
  })
  assertEquals(verdict.adopt, true)
})
