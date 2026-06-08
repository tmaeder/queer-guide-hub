import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { runConsensus } from './venue-consensus.ts'

Deno.test('amenities + accessibility are voted as array union across sources', () => {
  const decisions = runConsensus([
    { source: 'google', data: { amenities: ['wifi', 'outdoor-seating'], accessibility_attributes: ['wheelchair-accessible'] } },
    { source: 'tripadvisor', data: { amenities: ['wifi', 'full-bar'], accessibility_attributes: ['wheelchair-accessible', 'accessible-restroom'] } },
  ])

  const am = decisions.find((d) => d.field === 'amenities')
  const ac = decisions.find((d) => d.field === 'accessibility_attributes')

  assertEquals((am?.winner as string[]).slice().sort(), ['full-bar', 'outdoor-seating', 'wifi'])
  assertEquals((ac?.winner as string[]).slice().sort(), ['accessible-restroom', 'wheelchair-accessible'])
  // multiple agreeing sources on an array union -> auto-committable
  assertEquals(am?.action, 'auto_commit')
})
