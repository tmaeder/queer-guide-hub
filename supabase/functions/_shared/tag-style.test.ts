import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import {
  buildDefinePrompt,
  buildProseReviewPrompt,
  extractSupportsQueerSense,
  isSenseCategory,
} from './tag-style.ts'

Deno.test('isSenseCategory answers for both the slug and the display-name mirror', () => {
  // The sweep's work list carries unified_tags.category (the NAME text), the
  // taxonomy tools carry slugs — the set must answer for both spellings.
  assertEquals(isSenseCategory('fetishes-interests'), true)
  assertEquals(isSenseCategory('Fetishes'), true)
  assertEquals(isSenseCategory('bdsm-power-exchange'), true)
  assertEquals(isSenseCategory('Dynamics & Roles'), true)
  // Positions is the sharpest sense category in the tree — its members are
  // named Arch, Crab, Lotus, Superman, Warrior, Butterfly, Screw and Jockey,
  // every one of which has a dominant generic English sense.
  assertEquals(isSenseCategory('sex-positions'), true)
  assertEquals(isSenseCategory('Positions'), true)
  // Generic-sense categories stay out: a Beer-Garden really is a beer garden.
  assertEquals(isSenseCategory('venues-nightlife'), false)
  assertEquals(isSenseCategory('Venue Types'), false)
  assertEquals(isSenseCategory('Substances & Recovery'), false)
  assertEquals(isSenseCategory(null), false)
})

Deno.test('extractSupportsQueerSense separates the measured wrong-sense extracts from right ones', () => {
  // Real prod prose from the 2026-08-29 audit — all published, all wrong sense.
  assertEquals(
    extractSupportsQueerSense(
      'Furniture refers to movable objects used to equip households, offices, or shops for various purposes.',
    ),
    false,
  )
  assertEquals(
    extractSupportsQueerSense(
      'A vacuum pump is a device that draws gas particles from a sealed volume to create a partial vacuum.',
    ),
    false,
  )
  assertEquals(
    extractSupportsQueerSense(
      'DJ Yung Vamp, also known as Vamp, is a Belgian DJ and record producer.',
    ),
    false,
  )
  // Correct community-sense prose corroborates.
  assertEquals(
    extractSupportsQueerSense(
      'Rubber fetishism is a type of fetish involving attraction to people wearing latex clothing.',
    ),
    true,
  )
  assertEquals(
    extractSupportsQueerSense(
      'The leather subculture emerged from post-war gay motorcycle clubs.',
    ),
    true,
  )
})

Deno.test('buildDefinePrompt anchors the sense and offers the UNKNOWN exit', () => {
  const p = buildDefinePrompt('Furniture', 'Gear')
  assertEquals(p.includes('"Furniture"'), true)
  assertEquals(p.includes('"Gear"'), true)
  assertEquals(p.includes('UNKNOWN'), true)
})

Deno.test('buildProseReviewPrompt demands strict JSON with both verdict branches', () => {
  const p = buildProseReviewPrompt({
    name: 'Vamp',
    categoryName: 'Dynamics & Roles',
    description: 'DJ Yung Vamp is a Belgian DJ.',
    shortDescription: 'Belgian music producer',
  })
  assertEquals(p.includes('wrong_subject'), true)
  assertEquals(p.includes('short_description'), true)
  assertEquals(p.includes('ONLY JSON'), true)
})
