// The translator must never machine-translate the NAME of a sense-category tag.
//
// Measured on prod before 20261211120200 deleted them: Stud -> es "Estudio" (a
// studio), Ussy -> es "Vagina", Trade -> es "Trueque" (barter), Cruising -> fr
// "Croisière" (a boat cruise), Missing Stair -> es "Escalera que falta". Machine
// translation takes queer slang literally and destroys the term.
//
// This pins the gate itself (isSenseCategory over the categories the translator
// sees) plus the source-level guarantee that it is wired in and scoped to
// `name`, so descriptions keep translating.

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { isSenseCategory } from '../_shared/tag-style.ts'

const SOURCE = await Deno.readTextFile(new URL('./index.ts', import.meta.url))

Deno.test('sense categories are recognised by their display-name spelling', () => {
  // unified_tags.category is the TEXT mirror, so these are the spellings the
  // translator's candidate rows actually carry.
  for (
    const c of [
      'Slang & Language',
      'Fetishes',
      'Dynamics & Roles',
      'Practices & Play',
      'Positions',
      'Gear',
      'Kink Community & Scenes',
      'Subcultures & Scenes',
      'Relationship Structures',
      'Expression & Style',
      'Consent & Negotiation',
      'Vibe & Crowd',
    ]
  ) {
    assert(isSenseCategory(c), `${c} should be a sense category`)
  }
})

Deno.test('non-sense categories still translate', () => {
  // Deliberately NOT sense categories: for a venue type or a destination the
  // generic dictionary sense is the correct one.
  for (const c of ['Venue Types', 'Destinations', 'Substances & Recovery', 'Sexual Health']) {
    assertEquals(isSenseCategory(c), false, `${c} should NOT be a sense category`)
  }
  assertEquals(isSenseCategory(null), false)
  assertEquals(isSenseCategory(''), false)
})

Deno.test('the gate is wired into the candidate filter', () => {
  assert(
    /senseGated\s*=\s*body\.table === 'unified_tags' && field === 'name'/.test(SOURCE),
    'senseGated must be scoped to unified_tags AND the name field',
  )
  assert(
    /if \(senseGated && isSenseCategory\(/.test(SOURCE),
    'the candidate filter must drop sense-category rows',
  )
})

Deno.test('the gate does not reach descriptions', () => {
  // The whole point of scoping to `name`: prose survives translation and
  // description_i18n has real readers, unlike name_i18n which has none.
  const gate = SOURCE.match(/const senseGated =.*/)?.[0] ?? ''
  assert(gate.includes("field === 'name'"), `senseGated must test the field, got: ${gate}`)
  assert(!gate.includes('description'), 'senseGated must not mention description')
})

Deno.test('category is selected when the gate is active, or the filter reads undefined', () => {
  // A filter that reads a column the query never selected is silently inert —
  // it would drop nothing and the wrong translations would keep being written.
  assert(
    /senseGated \? 'category' : null/.test(SOURCE),
    'category must be added to selectCols when senseGated',
  )
})
