// Mirror of src/lib/__tests__/entityClassifier.test.ts so the Deno-side
// copy of the classifier stays in sync with the browser/Vite copy. Run with:
//   cd supabase/functions && deno test _tests/entity-classifier.test.ts
import { assertEquals } from 'jsr:@std/assert'
import {
  classifyEntity,
  expectedKindForTargetTable,
  isEntityTypeMismatch,
} from '../_shared/entity-classifier.ts'

Deno.test('classifies real persons with structured fields as person', () => {
  const r = classifyEntity({
    name: 'Lytton Strachey',
    birth_date: '1880-03-01',
    death_date: '1932-01-21',
    profession: 'biographer',
  })
  assertEquals(r.classified_as, 'person')
})

Deno.test('classifies "Sauna Tres Chic" as venue, not person', () => {
  const r = classifyEntity({ name: 'Sauna Tres Chic' })
  assertEquals(r.classified_as, 'venue')
})

Deno.test('classifies glossary slang ("DILF") as glossary_term', () => {
  const r = classifyEntity({
    name: 'DILF',
    description: 'A slang term for an attractive father.',
  })
  assertEquals(r.classified_as, 'glossary_term')
})

Deno.test('classifies UK postcode as unknown', () => {
  const r = classifyEntity({ name: 'BN2 1TH' })
  assertEquals(r.classified_as, 'unknown')
})

Deno.test('expectedKindForTargetTable maps known tables', () => {
  assertEquals(expectedKindForTargetTable('personalities'), 'person')
  assertEquals(expectedKindForTargetTable('venues'),        'venue')
  assertEquals(expectedKindForTargetTable('events'),        'event')
  assertEquals(expectedKindForTargetTable('countries'),     null)
})

Deno.test('isEntityTypeMismatch flags venue routed to personalities', () => {
  const cls = classifyEntity({ name: 'Sauna Tres Chic' })
  assertEquals(isEntityTypeMismatch(cls, 'personalities'), true)
})

Deno.test('isEntityTypeMismatch passes a real person', () => {
  const cls = classifyEntity({
    name: 'Lytton Strachey',
    birth_date: '1880-03-01',
    profession: 'biographer',
  })
  assertEquals(isEntityTypeMismatch(cls, 'personalities'), false)
})
