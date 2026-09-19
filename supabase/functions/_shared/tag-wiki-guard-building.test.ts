import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { implausibleClassOf, mayAdoptWikiIdentity } from './tag-wiki-guard.ts'

/**
 * The building arm, added 2026-09-18.
 *
 * `/tags/friedrichstadt-palast` published Wikipedia's entry for a Berlin revue theatre under the
 * category "Drag & Performance", while the venue itself already existed at
 * /venues/friedrichstadt-palast. Its P31 label is `theatre building` — not settlement-shaped, so
 * the `place` arm missed it, and not an organisation, so the `org` arm missed it too.
 *
 * Every label below is the REAL English label of the REAL P31 class carried by the REAL QID that
 * was on that tag, fetched from Wikidata rather than invented.
 */

Deno.test('a specific built venue is refused — the five classes found on live tags', () => {
  assertEquals(implausibleClassOf(['theatre building']), 'building') // Friedrichstadt-Palast Q565670
  assertEquals(implausibleClassOf(['art museum']), 'building') // munch -> Munch Museum Q844926
  assertEquals(implausibleClassOf(['movie theater']), 'building') // power-exchange -> Q44633684
  assertEquals(implausibleClassOf(['building']), 'building') // city-center -> Q5122942
  // Hotel Barcelona Princess carries two; either alone must be enough.
  assertEquals(implausibleClassOf(['skyscraper', 'hotel building']), 'building') // hotel-bar Q5911239
  assertEquals(implausibleClassOf(['hotel building']), 'building')
  assertEquals(implausibleClassOf(['skyscraper']), 'building')
})

/**
 * THE COUNTERWEIGHT, and the reason the arm is written with a negative lookahead rather than a
 * word list. These labels all CONTAIN the trigger words and are all legitimate glossary terms —
 * every one of them is live on this corpus today. If the exclusion breaks, the arm refuses them.
 */
Deno.test('a TYPE of building is a concept and is still adopted', () => {
  assertEquals(implausibleClassOf(['type of building']), null) // bullring, church building, house
  assertEquals(implausibleClassOf(['class of building']), null)
  assertEquals(implausibleClassOf(['type of place']), null)
  // `concert hall` carries three classes, one of which is `type of building`. The arm must not
  // fire on ANY of them — the multi-label shape a per-label test gets wrong if the exclusion is
  // written as a separate pass instead of inside the pattern.
  assertEquals(implausibleClassOf(['musical concept', 'type of place', 'type of building']), null)
})

Deno.test('`classification of human settlements` belongs to the PLACE arm, not this one', () => {
  // Pinned because the first draft of this file asserted null here and was wrong. `town` (Q3957)
  // is classed `classification of human settlements`, which the pre-existing `place` arm already
  // matches on the substring "human settlement" — nothing to do with the building arm, and not
  // something this change introduced.
  //
  // Worth knowing rather than hiding: it means `town`'s identity would NOT be re-adoptable today.
  // The guard gates ADOPTION only, so the existing link is untouched and the tag stays indexable
  // as a genuine glossary term. Recorded so a future reader does not mistake it for a new defect.
  assertEquals(implausibleClassOf(['classification of human settlements']), 'place')
})

Deno.test('ordinary concept classes are untouched by the widening', () => {
  for (const label of [
    'human sexual behavior',
    'sexual orientation',
    'gender identity',
    'sexual practice',
    'subculture',
    'social group',
    'clothing',
    'medical specialty',
    'psychological concept',
    'form of art',
    'music genre',
  ]) {
    assertEquals(implausibleClassOf([label]), null, `${label} should still be adopted`)
  }
})

Deno.test('mayAdoptWikiIdentity refuses a building end to end', () => {
  // Title agreement is what this failure produces — the article really IS called
  // "Friedrichstadt-Palast" — so the class gate is the only thing standing between the sweep and
  // an indexable encyclopaedia page for a building we already publish as a venue.
  const verdict = mayAdoptWikiIdentity('Friedrichstadt-Palast', {
    title: 'Friedrichstadt-Palast',
    p31Labels: ['theatre building'],
  })
  assertEquals(verdict.adopt, false)
  assertEquals(verdict.reason, 'implausible-class')
  assertEquals(verdict.detail, 'building')
})

Deno.test('the namesake shape this arm actually caught most of', () => {
  // Four of the five live hits were not duplicates at all — the tag was about something else and
  // the sweep had linked it to a building that merely shares its name.
  assertEquals(
    mayAdoptWikiIdentity('Munch', { title: 'Munch Museum', p31Labels: ['art museum'] }).adopt,
    false,
  )
  assertEquals(
    mayAdoptWikiIdentity('Hotel Bar', {
      title: 'Hotel Barcelona Princess',
      p31Labels: ['skyscraper', 'hotel building'],
    }).adopt,
    false,
  )
})
