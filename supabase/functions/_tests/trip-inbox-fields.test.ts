// Unit tests for the trip-inbox-chat ```fields fence parser + whitelist.
// Run with: cd supabase/functions/_tests && deno test trip-inbox-fields.test.ts
import { assertEquals } from 'jsr:@std/assert'
import { parseProposedFields } from '../_shared/trip-inbox-fields.ts'

Deno.test('no fence → prose only, no fields', () => {
  const { fields, reply } = parseProposedFields('Your check-in is on the 12th.')
  assertEquals(fields, null)
  assertEquals(reply, 'Your check-in is on the 12th.')
})

Deno.test('fence is stripped from the reply and fields validated', () => {
  const { fields, reply } = parseProposedFields(
    'Updated the check-in date.\n```fields\n{"type":"lodging","title":"Hotel Q","start":"2026-08-12","price":"120","currency":"eur"}\n```',
  )
  assertEquals(reply, 'Updated the check-in date.')
  assertEquals(fields?.type, 'lodging')
  assertEquals(fields?.title, 'Hotel Q')
  assertEquals(fields?.start, new Date('2026-08-12').toISOString())
  assertEquals(fields?.price, 120)
  assertEquals(fields?.currency, 'EUR')
})

Deno.test('malformed JSON in fence → prose kept, fields dropped', () => {
  const { fields, reply } = parseProposedFields('Sure.\n```fields\n{not json}\n```')
  assertEquals(fields, null)
  assertEquals(reply, 'Sure.')
})

Deno.test('unknown type and non-whitelisted keys are rejected', () => {
  const { fields } = parseProposedFields(
    '```fields\n{"type":"yacht","parse_status":"slotted","slotted_reservation_id":"x","title":"Boat"}\n```',
  )
  // type invalid → omitted; injected control keys never appear.
  assertEquals(fields?.type, undefined)
  assertEquals(fields?.title, 'Boat')
  assertEquals('parse_status' in (fields ?? {}), false)
  assertEquals('slotted_reservation_id' in (fields ?? {}), false)
})

Deno.test('invalid dates and currencies null out instead of passing through', () => {
  const { fields } = parseProposedFields(
    '```fields\n{"start":"not a date","currency":"EURO","vendor":"  "}\n```',
  )
  assertEquals(fields?.start, null)
  assertEquals(fields?.currency, null)
  assertEquals(fields?.vendor, null)
})

Deno.test('empty surviving object → fields null', () => {
  const { fields } = parseProposedFields('```fields\n{"bogus":1}\n```')
  assertEquals(fields, null)
})

Deno.test('long strings are clamped to 500 chars', () => {
  const long = 'x'.repeat(600)
  const { fields } = parseProposedFields(`\`\`\`fields\n{"title":"${long}"}\n\`\`\``)
  assertEquals(fields?.title?.length, 500)
})
