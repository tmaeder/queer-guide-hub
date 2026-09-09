// Regression guard for the `marineflieger` wrong-entity re-adoption (2026-09-05).
//
// A human cleared Q1898391 — the Marinefliegerkommando, the German Navy's naval air
// arm — off the kink glossary tag `Marineflieger` at 2026-09-04 22:54Z.
// `tag-enrichment-sweep` wrote it back at 2026-09-05 08:01Z, and
// `tag_wikidata_repair_regressions()` hard-failed `pipeline-health.yml` every day
// after.
//
// The inputs below are the REAL upstream responses, fetched 2026-09-09:
//   GET en.wikipedia.org/api/rest_v1/page/summary/Marineflieger
//        -> title "Marineflieger", wikibase_item Q1898391
//   GET wikidata.org/wiki/Special:EntityData/Q1898391.json
//        -> sole non-deprecated P31 = Q137515605, label "naval aviation command"
//
// Both guard holes are covered here, and each is asserted to refuse ON ITS OWN, so
// neither is load-bearing alone.

import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { implausibleClassOf, mayAdoptWikiIdentity } from './tag-wiki-guard.ts'
import { isSenseCategory } from './tag-style.ts'

const MARINEFLIEGER_EXTRACT =
  'The Marinefliegerkommando is the naval air arm of the German Navy. It is aircraft ' +
  'flown by the Navy of Germany, and mostly consists of helicopters and fixed-wing ' +
  'maritime patrol aircraft, as well as types of drones. Naval helicopters can operate ' +
  'from ships, and some of their roles include utility and supply tasks, search and ' +
  'rescue, and ASW or naval warfare.'

Deno.test('the class gate refuses a military unit even outside a sense category', () => {
  // This is the durable half: category-independent. Before the `institution` arm the
  // `org` pattern was a WORD LIST requiring the literal string
  // organization/organisation/company/..., so `naval aviation command` walked
  // through and implausibleClassOf returned null ("plausible").
  assertEquals(implausibleClassOf(['naval aviation command']), 'institution')

  // Asserted with senseCategory explicitly FALSE so this test cannot pass on the
  // sense gate's behalf.
  const v = mayAdoptWikiIdentity('Marineflieger', {
    title: 'Marineflieger',
    p31Labels: ['naval aviation command'],
    senseCategory: false,
    extract: MARINEFLIEGER_EXTRACT,
  })
  assertEquals(v.adopt, false)
  assertEquals(v.reason, 'implausible-class')
  assertEquals(v.detail, 'institution')
})

Deno.test('`Sex & Kink` is a sense category, by display name and by slug', () => {
  // The sweep passes `tag.category`, the denormalized display-name mirror; the slug
  // form is what a caller reading tag_categories would pass. Both must resolve or
  // the gate silently does not run for one of the two call shapes.
  assertEquals(isSenseCategory('Sex & Kink'), true)
  assertEquals(isSenseCategory('sex-kink'), true)
})

Deno.test('the sense gate refuses it too, with the class gate satisfied', () => {
  // Second, independent refusal. p31Labels is a plausible class here so the class
  // gate cannot be what fires — this proves the sense gate alone would have caught
  // it, which is what was missing on 2026-09-05.
  const v = mayAdoptWikiIdentity('Marineflieger', {
    title: 'Marineflieger',
    p31Labels: ['concept'],
    senseCategory: isSenseCategory('Sex & Kink'),
    extract: MARINEFLIEGER_EXTRACT,
  })
  assertEquals(v.adopt, false)
  assertEquals(v.reason, 'generic-sense')
})

Deno.test('the institution arm is not a blanket refusal', () => {
  // Measured over every distinct P31 label carried by the 1,518 QIDs on active tags
  // (743 labels): the arm matches exactly two the `org` arm misses — `naval aviation
  // command` and `government agency`. These are the classes it must NOT touch.
  //
  // Ranks and posts are deliberately excluded: `Captain` (Q19100, P31 `military
  // rank`) and `Commander` (Q11247470, P31 `military position`) are live under
  // Dynamics & Roles, and a leather/kink glossary really does contain rank words. A
  // wrong-sense role is the sense gate's problem, not the class gate's.
  for (const ok of [
    'military rank',
    'military position',
    'concept',
    'sexual practice',
    'social phenomenon',
    'profession',
    'subculture',
    'type of clothing',
  ]) {
    assertEquals(implausibleClassOf([ok]), null, `must not refuse the class "${ok}"`)
  }
  assertEquals(implausibleClassOf(['government agency']), 'institution')
})

Deno.test('legitimate Sex & Kink resolutions still adopt', () => {
  // Positive control: without this, deleting the extract check or hard-refusing the
  // whole category would pass every assertion above. These three are the real
  // en.wikipedia resolutions for tags in this category, verified 2026-09-09.
  const cases: Array<[string, string, string]> = [
    ['Erotic', 'Eroticism', 'Eroticism is a quality that causes sexual feelings.'],
    ['Sexshop', 'Sex shop', 'A sex shop is a retailer that sells products related to adult sexuality.'],
    ['Sextoy', 'Sex toy', 'A sex toy is an object or device that is primarily used to facilitate human sexual pleasure.'],
  ]
  for (const [name, title, extract] of cases) {
    const v = mayAdoptWikiIdentity(name, {
      title,
      p31Labels: ['concept'],
      senseCategory: isSenseCategory('Sex & Kink'),
      extract,
    })
    assertEquals(v.adopt, true, `${name} must still adopt (got ${v.reason})`)
  }
})
